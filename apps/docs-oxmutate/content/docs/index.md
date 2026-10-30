---
title: oxmutate
description: "Mutation testing for JavaScript and TypeScript on the oxc engine, run warm inside the project's own Vitest, with CI lanes, SARIF and an agent surface. No dependency outside the burgee family. A Stryker migration path."
---

**oxmutate** is mutation testing for JavaScript and TypeScript, on the [oxc](https://oxc.rs)
engine. It changes your code one small step at a time (`a < b` becomes `a <= b`, a block becomes
empty, `true` becomes `false`), runs the tests that cover each change, and reports every change no
test notices: a **survivor**, a line your suite runs but does not check. Each survivor comes with
its file, its line, the change and a `fix:` line that says what to assert, as the same record for
a person, for `--json` and for a coding agent.

It reads your **Stryker** config as it stands and writes Stryker's report, so moving over is one
command: where you ran `npx stryker run`, run `npx oxmutate run`. A community project built on
oxc, not affiliated with the oxc project.

## Why oxmutate

| | Stryker 10 | oxmutate 1.0 |
| :-- | :-- | :-- |
| Mutant set | 17 mutator families | the same 17, the same mutants (720 of 720 on es-toolkit), plus `NumericLiteral` (0 → 1, 1 → 0, n → n + 1): +6.6% mutants on burgee/paratext, 19 of them survivors Stryker cannot report. `--stryker-compat` gives Stryker's set exactly |
| Verdicts | — | the same as Stryker's on 99.9% of mutants ([measured](#compatibility)) |
| Instrumentation | Babel, file by file | Rust on oxc, every file in parallel: 720 mutants in 35 ms |
| Test runs | a Vitest run per mutant | each covering test re-run per mutant inside a warm Vitest worker |
| Config | `stryker.config.*` | your `stryker.config.*` unchanged, or a `mutate` block in `vite.config.ts` |
| A mutant that leaves state behind | judges the next mutants by it | canary; the context restarts clean |
| A slow machine | timeouts read as kills | a stop is re-run at 3x before it is a timeout |
| Static mutants | skipped with `ignoreStatic`, else the whole suite per mutant | scored, against the files that load them |
| Pull requests | your own script | `--since <ref>`, SARIF annotations, `--frozen-oracle` |
| A change that weakens its tests | not seen | `--frozen-oracle` exits 1 and names each mutant |
| Coding agents | read the JSON report | `survivors --json` (326 bytes a survivor against 4,094), `--mcp` |
| Formal methods | — | spec oracles: Quint or any ITF traces as a second verdict |

## Install

```bash
npm install oxmutate
pnpm add oxmutate
yarn add oxmutate
bun add oxmutate
```

Install it as a dev dependency (`-D`) of the project whose tests it grades. The native core for
macOS (arm64, x64), Linux (glibc x64 and arm64, musl x64) and Windows (x64) is inside the package;
nothing runs at install time. Vitest 4.1 or later is an optional peer: oxmutate runs the project's
own Vitest, with its config, and never brings a second one.

## Quick start

```bash
npm install oxmutate
```

```js
import { writeFileSync } from 'node:fs';
import { loadOptions } from 'oxmutate';

// The Stryker config a project already has, written here so the program runs anywhere.
writeFileSync('stryker.config.json', JSON.stringify({
  mutate: ['src/**/*.ts', '!src/**/*.test.ts'],
  thresholds: { high: 90, low: 70, break: 80 },
  coverageAnalysis: 'perTest',
}));

const options = await loadOptions(process.cwd());
console.log(options.mutate);
console.log(options.thresholds);
for (const { key, why } of options.unused) console.log(`${key}: ${why}`);
```

```text
[ 'src/**/*.ts', '!src/**/*.test.ts' ]
{ high: 90, low: 70, break: 80 }
coverageAnalysis: always perTest
```

That is the config `npx oxmutate run` reads in that directory: the same file Stryker reads, each
key oxmutate does not use listed with its reason, never dropped in silence. In a project with
Vitest installed, `npx oxmutate run` then scores every mutant and writes
`reports/mutation/mutation.json`.

## One config file, the Vite+ way

A Vite or [Vite+](https://viteplus.dev) project keeps its toolchain in one `vite.config.ts`. oxmutate
reads its settings from a `mutate` block there, beside `test`:

```ts
// vite.config.ts
/// <reference types="vitest/config" />
/// <reference types="oxmutate/vite" /> // adds `mutate` to the config's type
import { defineConfig } from 'vite'; // or 'vite-plus'

export default defineConfig({
  test: { include: ['src/**/*.test.ts'] },
  mutate: {
    include: ['src/**/*.ts', '!src/**/*.test.ts'],
    thresholds: { high: 90, low: 70, break: 80 },
    reporters: ['clear-text', 'html', 'sarif'],
    ignore: [{ call: 'console.*', reason: 'log text is not behaviour' }],
  },
});
```

The block is loaded through the project's own Vite, so a TypeScript config and its imports work as
Vite sees them. Its keys are Stryker's (`include` is the file list, Vitest's name for Stryker's
`mutate`). Where more than one source sets a key, the nearest wins: a flag, then `--config` or
`oxmutate.config.*`, then the `mutate` block of `vite.config.*` (or `vitest.config.*`), then
`stryker.config.*`.

## In CI

The pull-request lane mutates only the lines a change touched, annotates the survivors in code
scanning, and fails when the change weakened its own tests:

```yaml
# .github/workflows/mutation.yml
on: pull_request
permissions: { contents: read, security-events: write }
jobs:
  mutation:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
        with: { fetch-depth: 0 }
      - uses: actions/setup-node@v5
        with: { node-version: 22 }
      - run: npm ci
      - run: npx oxmutate run --since origin/${{ github.base_ref }} --frozen-oracle origin/${{ github.base_ref }} --reporter sarif,html
      - uses: github/codeql-action/upload-sarif@v3
        if: always()
        with: { sarif_file: reports/mutation/mutation.sarif }
```

For the full run, `--shard i/n` splits the mutants across a matrix (a mutant's shard is a hash of
its stable id, so the shards partition the run exactly and do not move when unrelated code does),
and `--incremental` reuses every verdict whose source and covering tests did not change.

## How it works

```text
 source ──► oxc (Rust, parallel) ──► every mutant compiled in, each behind a switch
                                              │
 dry run ──► which test reaches which mutant ─┤
                                              ▼
 warm Vitest servers (work-stealing) ──► per mutant: arm it, re-run its covering tests, bail at
                                          the first failure, canary, disarm
                                              │
 isolated runs ──► static mutants, stragglers, survivor and timeout confirmation
                                              │
 reports ──► Stryker JSON · HTML · SARIF · survivors --json · exit code
```

Every mutant is compiled into one instrumented copy of each file, served to Vitest from memory, so
the project is never copied or rewritten. A mutant is a switch, not a rebuild: arming one is
setting a value inside the worker that already has the tests loaded.

## How it stays correct

| Guard | What it catches |
| :-- | :-- |
| The dry run must pass | A suite that fails with no mutant armed scores nothing (exit 3) |
| Re-parse | Every instrumented file is parsed again before it runs; one that does not parse stops the run (exit 3) instead of scoring a broken file |
| Canary | The unmutated test must still pass after mutants run in a context, with its `beforeEach`/`afterEach` hooks re-run around every run, file-level ones included; if a mutant left a cache, a registry or a fixture behind, the context restarts and the suspect verdicts run again. A kill that follows unchecked runs is checked at once and decided again from clean state, so no kill rests on another mutant's leftovers |
| Survivor confirmation | A survivor is re-run with the mutant armed across its covering tests in one file, as Stryker arms it, so a mutant that only fails across tests is killed |
| Watchdog | A synchronous runaway is stopped and its server replaced; the stop is re-run at 3x the budget before it is reported as a timeout |
| Static mutants | Code that runs at import is decided in a live worker: the mutant is armed, the module registry reset and the test file collected again, against the files that load it. A file whose collection changes globals, `process.env` or a built-in prototype, or a mutant that leaves a trace, goes back to a fresh worker per mutant (`OXMUTATE_ISOLATE_STATIC=1` sends all of them there) |
| Flaky tests | Tests that behave differently across two dry runs have their mutants re-run; a verdict that changes is reported `flaky` |
| No orphans | Every Vitest server exits when its run does, killed or not |

## Migrating

The config stays where it is. The command changes:

```diff
- npx stryker run
+ npx oxmutate run
```

```diff
  "scripts": {
-   "test:mutation": "stryker run"
+   "test:mutation": "oxmutate run"
  }
```

`// Stryker disable next-line <Mutator>: <reason>` comments are honoured as written, and every
Stryker option oxmutate reads keeps its name and meaning. Three differences are on purpose:

- Code inside TypeScript `as` casts and enums **is** mutated; Stryker 10.0.0 skips it.
  `--stryker-compat` gives Stryker's mutant set.
- The default per-mutant slack is 500 ms, not 5,000 ms: a warm in-process run has no process
  start-up to absorb. `timeoutMS` in your config wins.
- Static mutants are scored, not skipped.

[Coming from Stryker](https://oxmutate.interlace.tools/docs/coming-from/stryker) maps every config
key.

## Compatibility

**Mutants: graded by Stryker's own specs.** Stryker 10.0.0's 17 mutator spec files, vendored
unedited, run against oxmutate's native core (`npm run compat:mutation`): **236 of
236** pass. Four that test Stryker's internals (a private `filter()`, Svelte template context, a
log message) are listed with their reasons in `compat/not-applicable.ts`.

**Verdicts: not graded by `compat-oracle`.** That oracle grades an import path by running the
incumbent's own test suite against it, and a mutation tester's output is not a passing test but a
verdict per mutant. So the comparison is verdict agreement: the same project, scored by Stryker
10.0.0 and by oxmutate, each mutant's verdict compared against Stryker's own JSON report.
Measured on 2026-10-27
([`m1-results.md`](https://github.com/ofri-peretz/burgee/blob/main/.sdlc/intents/oxmutate/m1-results.md)):

| Subject | Mutants | Same verdict as Stryker |
| :-- | --: | --: |
| es-toolkit `src/array` | 720 | 99.58–100% ¹ |
| burgee/paratext | 1,332 | 99.92% |
| burgee/controlroom | 997 | 99.90% |

¹ From an earlier build of the same day, before that document's fixes; it is re-measured on the
CI lane before it is quoted as a result.

Of the two disagreements left, one is a Stryker timeout on a loop that ends (its hit limit stops
it; the covering tests pass). The other is a mutant Stryker scored as a runtime error, so it has
no Stryker verdict to compare.

**Speed, measured on a laptop, not yet a published number** (the published ones live at
[burgee.interlace.tools/docs/benchmarks](https://burgee.interlace.tools/docs/benchmarks)). Medians of 3
head-to-head runs (`bench/burgee-pair.mts`, concurrency 4, one tool after the other, load 6–19, 2026-10-30):

| Subject | Stryker 10 | oxmutate | Wall | CPU | Tests a mutant |
| :-- | --: | --: | --: | --: | --: |
| burgee/paratext | 108.3 s | 19.0 s | 5.70x | 5.92x | 31.7 → 16.8 |
| burgee/controlroom | 63.4 s | 45.6 s | 1.39x | 2.55x | 7.3 → 9.2 |
| oxmutate itself (Stryker's mutant set) | 508 s | 334 s | 1.52x | — | — |

The ceiling depends on the suite as much as the tool: controlroom's own `vitest run` takes ~8 s and
every fresh worker imports React and Ink, so even zero overhead would make it ~6x. The figures to
publish will come from the `oxmutate-bench.yml` lane on a runner nothing else shares.

## Benchmarks

Every number here is produced by `npm run bench` and published at [burgee.interlace.tools/docs/benchmarks](https://burgee.interlace.tools/docs/benchmarks).

No suite is graded against this package yet, so there is no compatibility number to quote.

## For agents

- **`oxmutate survivors --json`** prints one record per survivor: file, line, column, mutator,
  replacement, how many tests cover it, whether it is flaky, and a `fix:` line. On paratext an
  agent read 326 bytes per survivor from it, and 4,094 from Stryker's report for the same
  survivor (`A5` in
  [`m1-results.md`](https://github.com/ofri-peretz/burgee/blob/main/.sdlc/intents/oxmutate/m1-results.md)).
- **`--json`, `--schema` and an MCP server** come from one declaration on burgee:
  `oxmutate --mcp` serves `run` and `survivors` as tools, and `oxmutate --schema` prints every
  option, default and exit code as data.
- **Exit codes are the contract.** `0` ok; `1` it ran and the result failed (below `--break`, or
  the change weakened its tests); `2` a usage error, so rewrite the command; `3` the config or
  the suite did not load (a dry run that fails, an instrumented file that does not parse).
- **The frozen oracle is a reward-hacking check.** An agent asked to make a mutation gate pass can
  weaken the tests instead of strengthening them; `--frozen-oracle <ref>` scores the same mutants
  against the base's tests and fails the change that did.
- **The docs are machine-readable** at
  [oxmutate.interlace.tools/llms.txt](https://oxmutate.interlace.tools/llms.txt) and
  [llms-full.txt](https://oxmutate.interlace.tools/llms-full.txt).

## Spec oracles

A test asserts what someone thought to check; a formal model states what the code must do. A spec
oracle replays a model's traces against every mutant, as a verdict beside the tests':

```ts
// vite.config.ts, inside `mutate`
specOracles: [
  {
    name: 'save-restore',
    backend: 'quint', // `quint run --mbt`; or 'itf' for a directory of traces any tool wrote
    model: 'specs/save-restore.qnt',
    replay: ['src/save-restore.replay.test.ts'],
    files: ['src/cursor.ts'],
  },
],
```

The replay test imports `loadTraces` from `oxmutate/spec`, performs each step's action on the real
code and asserts the model's state. The report then lists every **test-spec gap**: a mutant the
model's traces kill while the tests let it survive, each with the trace that caught it, which is a
test someone should write. [Spec oracles](https://oxmutate.interlace.tools/docs/spec-oracles) walks
through one.

## Configuration

Every key, Stryker's and oxmutate's own, is on
[oxmutate.interlace.tools/docs/configuration](https://oxmutate.interlace.tools/docs/configuration).
Keys Stryker documents and oxmutate does not use are listed in the report with the reason. Beyond
Stryker's options: `ignore` (calls whose subtrees are not mutated), `specOracles`, `flakyReruns`,
`sarifReport`, `typeChecker` and `strykerCompat`.

## API

| Import | What it gives you |
| :-- | :-- |
| `oxmutate` | `run()` and `loadOptions()`, the run's result types and `MutateConfig`, `strykerReport()`, `sarifReport()` and `textSummary()`, and the CI-lane helpers `changedLines()`, `parseShard()` and `shardOf()` |
| `oxmutate/vite` | types only: the `mutate` block on Vite's `UserConfig` |
| `oxmutate/spec` | `loadTraces()`, `readTrace()` and `decode()`: what a spec-oracle replay test imports |
| `oxmutate/runner` | the Vitest runner oxmutate starts inside each Vitest worker; Vitest loads it, a program does not |

The `oxmutate` bin is that API, declared once on burgee.

## Requirements

Node 20.19 or later on the 20 line, or 22.13 or later. Vitest 4.1 or later in the project, for the
default runner. macOS (arm64, x64), Linux (glibc x64 and arm64, musl x64) or Windows (x64).

## Where it sits

It hosts no plugin key of its own.

Nothing in this family builds on it yet, and it builds on `bellpull` and `burgee`.

## The family

Eleven packages, one repository, one release pipeline. Each installs and works on its own, and each
owns one job. Six of them — `bellpull`, `closeout`, `linegauge`, `paratext`, `roundel`, `seniority`
— depend on nothing; the others depend only on packages in this table, and every dependency points
one way, down the [layers](https://burgee.interlace.tools/docs/concepts/family).

No package declares a dependency from outside the family; `react` and `react-reconciler` are
optional peers of `controlroom`, which npm does not install; `vitest` is an optional peer of
`oxmutate`, which npm does not install.
[`package-shape-lock`](https://github.com/ofri-peretz/burgee/blob/main/scripts/package-shape-lock.test.ts)
holds that for every manifest, and
[`independence-install-lock`](https://github.com/ofri-peretz/burgee/blob/main/scripts/independence-install-lock.test.ts)
installs each package alone and finds nothing but the family packages it declares.

Releases are published by one workflow through npm trusted publishing: no npm token is used, and
each release carries SLSA provenance, which `npm view <package> dist.attestations` shows.
[`trusted-publishing-lock`](https://github.com/ofri-peretz/burgee/blob/main/scripts/trusted-publishing-lock.test.ts)
keeps both true.

| Package | What it is | Migrates from |
| :-- | :-- | :-- |
| [burgee](https://burgee.interlace.tools/docs/packages/burgee) | The CLI framework: one declaration, every surface | commander, yargs and meow |
| [roundel](https://roundel.interlace.tools/docs) | Colour: one output policy, semantic tokens, a theme | chalk, colorette, kleur, picocolors, supports-color and yoctocolors |
| [flagstaff](https://flagstaff.interlace.tools/docs) | The frame loop: spinners, progress, boxes and tables | ora, log-update, boxen and cli-table3 |
| [caique](https://caique.interlace.tools/docs) | Prompts that are flags first, and never hang | @inquirer/core |
| [linegauge](https://linegauge.interlace.tools/docs) | Measuring, wrapping, truncating and slicing styled text | string-width, wrap-ansi, strip-ansi, slice-ansi, cli-truncate and widest-line |
| [paratext](https://paratext.interlace.tools/docs) | Hyperlinks, images, title, clipboard and notifications | ansi-escapes, terminal-link and term-img |
| [seniority](https://seniority.interlace.tools/docs) | Configuration precedence and discovery, with provenance | cosmiconfig, lilconfig, dotenv and rc |
| [closeout](https://closeout.interlace.tools/docs) | Exit handlers, terminal restore and a bounded shutdown | signal-exit, exit-hook, restore-cursor, cli-cursor and onetime |
| [bellpull](https://bellpull.interlace.tools/docs) | Subprocesses, and which executable actually ran | cross-spawn and which |
| [controlroom](https://controlroom.interlace.tools/docs) | Keyboard-driven terminal screens, inline or full-screen | ink |
| **oxmutate** (this package) | Mutation testing on the oxc engine, inside your own Vitest | Stryker |

Every migration guide, and the family-wide [compatibility](https://burgee.interlace.tools/docs/compatibility)
and [benchmarks](https://burgee.interlace.tools/docs/benchmarks) pages, are on
[burgee.interlace.tools](https://burgee.interlace.tools/docs/packages).

## Contributing

Issues and pull requests are welcome at [ofri-peretz/burgee](https://github.com/ofri-peretz/burgee/issues); read
[CONTRIBUTING.md](https://github.com/ofri-peretz/burgee/blob/main/CONTRIBUTING.md) first. Report a vulnerability privately, as
[SECURITY.md](https://github.com/ofri-peretz/burgee/blob/main/SECURITY.md) describes — never in a public issue.

## Licence

MIT © Ofri Peretz — see [LICENSE](https://github.com/ofri-peretz/burgee/blob/main/packages/oxmutate/LICENSE).
