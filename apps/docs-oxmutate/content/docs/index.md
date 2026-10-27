---
title: oxmutate
description: "Mutation testing for JavaScript and TypeScript on the oxc engine, run warm inside the project's own Vitest, with CI lanes, SARIF and an agent surface. No dependency outside the burgee family. A Stryker migration path."
---

**oxmutate** changes your code one small step at a time (`a < b` becomes `a <= b`, a block
becomes empty, `true` becomes `false`) and runs the tests that cover each change. A change no
test notices is a **survivor**: a line your suite runs but does not check. Each one is reported
with its file, its line, the change and a `fix:` line that says what to assert, the same record
for a person, for `--json` and for a coding agent.

Coming from **Stryker**, nothing in the project changes but the command: oxmutate reads
`stryker.config.*` as it stands, writes Stryker's JSON report (schema 2, so
`mutation-testing-elements` renders it), and runs Stryker's 17 mutator families. Where you ran
`npx stryker run`, run `npx oxmutate run`.

**Built on oxc.** The instrumentation is Rust: [oxc](https://oxc.rs) parses every file in
parallel and each mutant is a span edit. A community project, not affiliated with the oxc project.

## Install

```bash
npm install oxmutate
pnpm add oxmutate
yarn add oxmutate
bun add oxmutate
```

Install it as a dev dependency (`-D`) of the project whose tests it grades. The prebuilt native
core for your platform arrives as an optional dependency; nothing runs at install time. Vitest
4.1 or later is an optional peer: oxmutate runs the project's own Vitest and never brings a second
one.

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

That is the config `npx oxmutate run` reads in that directory: the same file Stryker reads, with
each key oxmutate does not use listed and the reason beside it, never dropped in silence. In a
project with Vitest installed, `npx oxmutate run` then scores every mutant and writes
`reports/mutation/mutation.json`.

## What it does

```bash
npx oxmutate run                                     # every mutant, with stryker.config.* if there is one
npx oxmutate run --since origin/main --reporter sarif  # PR lane: lines the change touched, in code scanning
npx oxmutate run --shard 2/8                         # one cell of a CI matrix; shards partition exactly
npx oxmutate run --incremental                       # reuse verdicts whose source and tests did not change
npx oxmutate run --frozen-oracle origin/main         # exit 1 when the change weakened its tests
npx oxmutate run --break 80                          # exit 1 below this mutation score
npx oxmutate survivors --json                        # the list a coding agent writes tests from
```

- **Warm runs inside your Vitest.** Each covering test is re-run per mutant inside a live Vitest
  worker, with its hooks, `vi.mock` and environment, instead of a Vitest start per mutant.
- **Stryker's mutant set.** All 17 of Stryker 10.0.0's mutator families. The Regex family
  produces the same mutants as weapon-regex on 928 of 932 real patterns.
- **Reports a CI already reads.** Stryker's JSON report (schema 2), its HTML report, and SARIF
  for GitHub code scanning (`--reporter sarif`).
- **CI lanes.** `--since <ref>` scores only the lines a change touched, `--shard i/n` splits a run
  across a matrix, `--incremental` reuses verdicts that cannot have changed, and
  `--frozen-oracle <ref>` also scores the change against the base's tests and fails when a
  mutant those tests killed now survives: a change that weakened its own tests.
- **Any test command.** `testRunner: 'command'` with `commandRunner: { command: 'npm test' }` runs a
  command per mutant, for a suite that is not Vitest.
- **Type-checked survivors.** `checkers: ['typescript']` compiles each survivor with the project's
  own compiler, and a mutant that does not type-check is not counted against the tests.
- **Ignore rules as data.** `ignore: [{ call: 'console.*', reason: 'log text is not behaviour' }]`
  leaves those call subtrees unmutated, Stryker's ignorer plugins as a list in the config.
- **Spec oracles.** `specOracles` replays a formal model's traces against each mutant, `quint run
  --mbt` traces or any directory of ITF files, through a test that imports `oxmutate/spec`. The
  report lists each test-spec gap: a mutant the model's traces kill and the tests let survive.

## How it stays correct

| Guard | What it catches |
| :-- | :-- |
| Dry run must pass | A suite that fails with no mutant active scores nothing (exit 3) |
| Canary after every mutant | The same test, unmutated, must still pass; if a mutant left a cache, registry or fixture behind, the context restarts fresh |
| Watchdog | A synchronous runaway is stopped and counted as a timeout |
| Flaky detector | Tests that behave differently across two dry runs have their mutants re-run, and a verdict that changes is reported `flaky` |
| Static mutants | Code that runs at import is re-run with the mutant armed from process start |
| Instrument re-parse | Emitted code that does not parse stops the run (exit 3) instead of scoring a broken file |

## Migrating

The config stays where it is, unchanged. The command changes:

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

`// Stryker disable next-line <Mutator>: <reason>` comments are honoured as written. Three
differences are on purpose:

- Code inside TypeScript `as` casts and enums **is** mutated; Stryker 10.0.0 skips it.
  `--stryker-compat` gives Stryker's mutant set.
- The default per-mutant slack is 500 ms, not 5,000 ms: a warm in-process run has no process
  start-up to absorb. `timeoutMS` in your config wins.
- Static mutants are scored, not skipped.

[Coming from Stryker](https://github.com/ofri-peretz/burgee/blob/main/apps/docs-oxmutate/content/docs/coming-from/stryker.mdx)
maps every config key.

## Compatibility

**Not graded.** No suite is graded through `compat-oracle` for oxmutate, so it has no
compatibility row. That oracle grades an import path by running the incumbent's own test suite
against it, and a mutation tester's output is not a passing test but a verdict per mutant. So the
comparison is verdict agreement: the same project, scored by Stryker 10.0.0 and by oxmutate, each
mutant's verdict compared against Stryker's own JSON report. Measured on 2026-10-27
([`m1-results.md`](https://github.com/ofri-peretz/burgee/blob/main/.sdlc/intents/oxmutate/m1-results.md)):

| Subject | Mutants | Same verdict as Stryker |
| :-- | --: | --: |
| es-toolkit `src/array` | 720 | 99.58–100% ¹ |
| burgee/paratext | 1,332 | 99.92% |
| burgee/controlroom | 997 | 99.90% |

¹ From an earlier build of the same day, before that document's fixes; it is re-measured on the
CI lane before it is quoted as a result.

Of the two disagreements left, one is a Stryker timeout on a loop that ends (its hit limit
stops it; the covering tests pass). The other is a mutant Stryker scored as a runtime error, so it
has no Stryker verdict to compare; it has not been checked by hand yet.

**Speed is not yet a published number.** On a shared laptop, paratext took 180.0 s under oxmutate
and 427.4 s under Stryker, at 0.375 and 0.620 CPU-seconds a mutant; on controlroom oxmutate used
less CPU (0.092 against 0.171 CPU-seconds a mutant) and was slower by the wall clock (107.2 s
against 94.3 s). The laptop's load moved a run by more than the difference, so the wall-clock
figures to publish will come from the `oxmutate-bench.yml` lane on a runner nothing else shares.

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
- **The docs are machine-readable** at
  [burgee.interlace.tools/llms.txt](https://burgee.interlace.tools/llms.txt) and
  [llms-full.txt](https://burgee.interlace.tools/llms-full.txt), which carry this page.

## Configuration

oxmutate reads `stryker.config.{mjs,js,cjs,json}` and `oxmutate.config.*`, which wins where both
set a key. Keys Stryker documents and oxmutate does not use are listed in the report with the
reason. The keys only oxmutate reads (`ignore`, `specOracles`, `strykerCompat`, `flakyReruns`,
`sarifReport`, `typeChecker`) belong in `oxmutate.config.*`, where Stryker never sees them.

## API

| Import | What it gives you |
| :-- | :-- |
| `oxmutate` | `run()` and `loadOptions()`, the run's result types, `strykerReport()`, `sarifReport()` and `textSummary()`, and the CI-lane helpers `changedLines()`, `parseShard()` and `shardOf()` |
| `oxmutate/spec` | `loadTraces()`, `readTrace()` and `decode()`: what a spec-oracle replay test imports to drive the code through a model's ITF traces |
| `oxmutate/runner` | the Vitest runner oxmutate starts inside each Vitest worker; Vitest loads it, a program does not |

The `oxmutate` bin is that API, declared once on burgee.

## Requirements

Node 20.19 or later on the 20 line, or 22.13 or later. Vitest 4.1 or later in the project, for
the default runner. A prebuilt native core for darwin-arm64, darwin-x64, linux-arm64-gnu,
linux-x64-gnu, linux-x64-musl or win32-x64-msvc.

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
