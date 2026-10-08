<p align="center">
  <a href="https://github.com/ofri-peretz/burgee/tree/main/packages/bellpull" target="blank">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/ofri-peretz/burgee/main/brand-assets/bellpull-lockup.svg" />
      <img src="https://raw.githubusercontent.com/ofri-peretz/burgee/main/brand-assets/bellpull-lockup-light.svg" alt="bellpull" width="360" />
    </picture>
  </a>
</p>

<p align="center">
  Subprocesses with executable resolution and a structured result every caller can read — human, JSON envelope or agent event.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/bellpull"><img src="https://img.shields.io/npm/v/bellpull?style=flat-square&color=0a6b47" alt="bellpull on npm: the latest version" /></a>
  <a href="https://www.npmjs.com/package/bellpull"><img src="https://img.shields.io/npm/dm/bellpull?style=flat-square" alt="bellpull downloads per month on npm" /></a>
  <a href="https://github.com/ofri-peretz/burgee/actions/workflows/quality.yml?query=branch%3Amain"><img src="https://img.shields.io/github/actions/workflow/status/ofri-peretz/burgee/quality.yml?branch=main&style=flat-square&label=Quality%20Gate" alt="Quality Gate: the CI status of main" /></a>
  <a href="https://app.codecov.io/gh/ofri-peretz/burgee/components"><img src="https://img.shields.io/codecov/c/github/ofri-peretz/burgee/main?component=bellpull&style=flat-square" alt="bellpull line coverage: its Codecov component" /></a>
  <a href="https://scorecard.dev/viewer/?uri=github.com/ofri-peretz/burgee"><img src="https://img.shields.io/ossf-scorecard/github.com/ofri-peretz/burgee?style=flat-square&label=OpenSSF%20Scorecard" alt="OpenSSF Scorecard for the repository" /></a>
  <a href="https://www.npmjs.com/package/bellpull?activeTab=code"><img src="https://img.shields.io/npm/unpacked-size/bellpull?style=flat-square" alt="Unpacked size of the latest bellpull release on npm" /></a>
  <a href="https://github.com/ofri-peretz/burgee/blob/main/packages/bellpull/package.json"><img src="https://img.shields.io/badge/dependencies-0-0a6b47?style=flat-square" alt="Zero dependencies" /></a>
  <a href="https://github.com/ofri-peretz/burgee/blob/main/packages/bellpull/package.json"><img src="https://img.shields.io/badge/types-included-blue?style=flat-square" alt="TypeScript types included for every entry point" /></a>
  <a href="https://github.com/ofri-peretz/burgee/blob/main/packages/bellpull/package.json"><img src="https://img.shields.io/badge/Node.js-20.19%2B%20%7C%2022.13%2B-green?style=flat-square" alt="Node.js 20.19+ or 22.13+" /></a>
  <a href="https://github.com/ofri-peretz/burgee/blob/main/packages/bellpull/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue?style=flat-square" alt="License: MIT" /></a>
  <a href="https://www.npmjs.com/package/bellpull#provenance"><img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fregistry.npmjs.org%2Fbellpull%2Flatest&query=%24.dist.attestations.provenance~&label=npm&style=flat-square&color=0a6b47" alt="npm provenance of the latest release, read live from its registry attestation" /></a>
</p>

<p align="center">
  <a href="https://burgee.interlace.tools/docs/compatibility"><img src="https://img.shields.io/badge/cross--spawn%20suite-68%2F68-0a6b47?style=flat-square" alt="bellpull/cross-spawn passes 68 of 68 cases of the cross-spawn test suite" /></a>
  <a href="https://burgee.interlace.tools/docs/compatibility"><img src="https://img.shields.io/badge/execa%20suite-0%2F1180-b45309?style=flat-square" alt="bellpull passes 0 of 1180 cases of the execa test suite" /></a>
  <a href="https://burgee.interlace.tools/docs/compatibility"><img src="https://img.shields.io/badge/which%20suite-5%2F5-0a6b47?style=flat-square" alt="bellpull passes 5 of 5 cases of the which test suite" /></a>
</p>

<p align="center">
  Docs: <a href="https://bellpull.interlace.tools">https://bellpull.interlace.tools</a><br />
  Migrating from: <a href="https://bellpull.interlace.tools/docs/coming-from/execa">execa</a> · <a href="https://bellpull.interlace.tools/docs/coming-from/cross-spawn">cross-spawn</a> · <a href="https://bellpull.interlace.tools/docs/coming-from/which">which</a>
</p>

A **bellpull** is the cord in one room wired to a bell in another. You pull it here; a bell rings there; someone comes back to you.

That is a subprocess. Request work at a distance, work happens elsewhere, a result returns. **That last clause is the package.**

Coming from **cross-spawn** or npm's **which**? Change one import: `bellpull/cross-spawn` and
`bellpull/node-which` are drop-ins, each graded by the incumbent's own test suite. Coming from
**execa**? There is no drop-in — `run()` below is the alternative.

One result, three readers: `format()` for a person, `toJson()` for `--json`, `toEvent()` for
an agent — so a `--json` flag cannot report something the human output did not.

## Install

```bash
npm install bellpull
pnpm add bellpull
yarn add bellpull
bun add bellpull
```

## Quick start

```ts
import { run, format } from 'bellpull';

const runtime = { platform: process.platform, env: process.env, cwd: process.cwd() };
const result = await run('git', ['rev-parse', 'HEAD'], { runtime });

result.ok; // false when it exited non-zero — no exception, no try/catch
result.code; // 128
result.executable; // { path: '/opt/homebrew/bin/git', from: '/opt/homebrew/bin' }
```

`execa` throws when a child exits non-zero, so every caller wraps every call and every wrapper
rebuilds the same fields out of the error. Here a non-zero exit is a value. The promise rejects
only when **no process ran**: the executable did not resolve, or the spawn failed.

## What it does that the alternatives do not

- **Tells you which binary ran.** `whichSync` returns the path *and* the `PATH` entry it came
  from. "Which `node` was that" is the first question of every build-differs-between-machines
  investigation and no resolver in the layer answers it.
- **Bounds the run by default.** `timeout` is finite, the kill is a ladder (`SIGTERM`, then
  `SIGKILL`), and **the output written before the kill is kept** — a CI timeout with the output
  discarded is undiagnosable. `execa` and `tinyexec` both default to no timeout at all.
- **Renders the same result three ways.** `format()` for a person, `toJson()` for `--json`,
  `toEvent()` for an agent stream, all derived from one record — so a `--json` flag cannot
  report something the human output did not.
- **Zero dependencies.** `cross-spawn` pulls three packages; `execa` pulls sixteen.

**What it is not.** `execa`'s streaming API and its `` $`cmd` `` form are a different product
and are out of scope — see [`spec.md`](https://github.com/ofri-peretz/burgee/blob/main/.sdlc/intents/bellpull/spec.md).
And the weight pitch in this layer is already taken: `tinyexec` is zero-dependency, has
119.5 M downloads a week, and was published 2026-09-03. The claim here is resolution and
shape, not bytes.

## Entry points

| Import | What it gives you | Replaces |
| :-- | :-- | :-- |
| `bellpull` | `run()` and the `Result`, plus resolution and the three projections | `execa`, `tinyexec`, `nano-spawn` |
| `bellpull/which` | bellpull's own resolver, not a drop-in: resolution alone, and the `PATH` entry that answered | `isexe`, `path-key`, `npm-run-path` |
| `bellpull/node-which` | the drop-in for npm's `which` — same `which()` and `.sync`, same options; graded 5 / 5 by node-which's own suite | `which` |
| `bellpull/cross-spawn` | the drop-in — same callable default, same `.sync` | `cross-spawn` |
| `bellpull/plugin` | the `resolvers` plugin host | *nothing in the ecosystem* |

`bellpull/which` is a leaf: it loads two files and nothing that has ever heard of `process`.
A program that only needs to find a binary does not pay for a spawner.

## No shell, ever, to solve a Windows problem

`npm` on Windows is `npm.cmd`, and a `.cmd` is a script `CreateProcess` will not run. The
tempting fix is `{ shell: true }`, and it re-opens command injection: with a shell, an argument
is text in a command line, so a `&` in caller-supplied data is another command.

`bellpull` does what `cross-spawn` does — it invokes `cmd.exe` itself, having quoted every
argument for `CommandLineToArgvW` and escaped every `cmd.exe` metacharacter, with
`windowsVerbatimArguments` so Node does not quote them a second time. `shell: true` is
available, off by default, and documented as the injection surface it is.

`src/escape.test.ts` checks that by round-tripping a 37-vector injection corpus through
simulations of both parsers, and by asserting the naive fix fails on the dangerous half of it
first.

## The `resolvers` plugin host

`which` is the part every environment does differently — `nvm`, `asdf`, `pnpm`, a devcontainer.
A plugin contributes a search order as **data**, with no function anywhere in it:

```ts
register({
  name: 'asdf',
  contract: 1,
  resolvers: {
    asdf: { rank: -10, paths: ['{ASDF_DATA_DIR}/shims'], when: { envAny: ['ASDF_DATA_DIR'] } },
  },
});
```

A negative `rank` searches before `PATH`. A path must be absolute after `{VAR}` substitution,
or it is refused at `register()` — a relative entry means a different directory every time the
program runs from somewhere else, including one somebody else can write to. `{VAR}` is the only
substitution: `$VAR` and `~` are not expanded, and are refused as relative.

- **`rank`** — a number: negative searches before `PATH`, positive after it.
- **`paths`** — one or more directories, each absolute or starting with a `{VAR}` that holds an
  absolute path.
- **`when`** — optional. `envAny: ['VAR', …]` applies the resolver only while one of those
  variables is set; `platform: ['linux', …]` only on those `process.platform` values. Leave it
  out and the resolver always applies.
- **`extensions`** — optional, Windows only: what to try in place of `PATHEXT`.

The same plugin as a file of its own — one module whose default export is a plain object, with
no import, which is the shape `check` loads:

```js
// asdf-plugin.mjs
export default {
  name: 'asdf',
  contract: 1,
  resolvers: {
    asdf: { rank: -10, paths: ['{ASDF_DATA_DIR}/shims'], when: { envAny: ['ASDF_DATA_DIR'] } },
  },
};
```

Check it before it ships:

```bash
npx bellpull check ./asdf-plugin.mjs
# in a clone of this repository, where dist/ is not committed:
npx turbo run build --filter=bellpull && node packages/bellpull/dist/cli.js check ./asdf-plugin.mjs
```

```text
asdf — 1 resolvers
  asdf
asdf: ok
```

The census comes first and `ok` last; the resolvers are listed in the order they are searched.
A refusal exits 1 with a code and the edit to make — `E_PLUGIN_SCHEMA` for a missing `rank`, a
relative path, or a `resolvers` that is not an object keyed by name.

## Migrating

From **cross-spawn** or npm's **which**, one import:

```diff
- import spawn from 'cross-spawn';
+ import spawn from 'bellpull/cross-spawn';
```

```diff
- import which from 'which';
+ import which from 'bellpull/node-which';
```

`require('bellpull/cross-spawn')` works too. Or let the codemod make the change:
`npx burgee migrate --dry-run` lists every import it would rewrite — only drop-ins graded level
with their incumbent — and `npx burgee migrate` makes it
([Migrate](https://burgee.interlace.tools/docs/migrate)).

From **execa** there is no drop-in: `run()` is the alternative, and
[Coming from execa](https://bellpull.interlace.tools/docs/coming-from/execa) walks the change.

## Compatibility

Both drop-ins are graded by the incumbent's own suite, run unedited through `compat-oracle`
beside a control run against the incumbent itself. Measured on 2026-09-15:

| | control (`cross-spawn` itself) | `bellpull/cross-spawn` |
| :-- | --: | --: |
| `cross-spawn` suite, macOS | 68 / 68 | **68 / 68** |

**What the 68 / 68 does not cover.** On POSIX `cross-spawn` is a pass-through, so its suite
never reaches the escaping or the `cmd.exe` branch at all. Measured: replacing `escapeArgument`
with `` arg => `"${arg}"` `` — the injection bug in its purest form — leaves the row at 68 / 68.
The Windows behaviour is covered by this package's own tests and by nothing else until a
Windows runner exists.

## Benchmarks

Every number here is produced by `npm run bench` and published at [burgee.interlace.tools/docs/benchmarks](https://burgee.interlace.tools/docs/benchmarks).

Graded by the incumbent's own test suite:

| suite | passing |
| :-- | --: |
| `cross-spawn` | 68 / 68 |
| `execa` | 0 / 1180 |
| `which` | 5 / 5 |

Weight, installed and tree-inclusive: **115,963 bytes** against **765,553** for the incumbents it replaces — a ratio of **0.1515**.

## For agents

- **One result, three readers.** `format()` renders it for a person, `toJson()` for `--json`,
  `toEvent()` for an agent stream — one record, so the three cannot disagree.
- **A non-zero exit is a value, not an exception**: `result.ok` is `false`, and the promise
  rejects only when no process ran at all.
- **`result.executable` says which binary ran**, and from which `PATH` entry.
- **A resolver plugin can be checked before it ships.** `npx bellpull check ./asdf.mjs`
  validates it against the family schema and exits 0, 1 with a code and a fix, or 2 on a usage
  error. The whole plugin and the report are under
  [The `resolvers` plugin host](#the-resolvers-plugin-host).
- **The docs are machine-readable** at
  [bellpull.interlace.tools/llms.txt](https://bellpull.interlace.tools/llms.txt) and
  [llms-full.txt](https://bellpull.interlace.tools/llms-full.txt).

## API

The entry points are under [Entry points](#entry-points); every export, with its types, is on
[bellpull.interlace.tools](https://bellpull.interlace.tools/docs).

## Where it sits

Plugins register under the `resolvers` key, against the one schema the whole family shares.

`burgee` builds on it, and it builds on nothing in this family.

## The family

Ten packages, one repository, one release pipeline. A CLI on burgee declares what it is, roundel
carries its colours, flagstaff flies it and caique answers back; each installs on its own, and none
takes a dependency from outside the family.

| Package | What it is | Replaces |
| :-- | :-- | :-- |
| [burgee](https://burgee.interlace.tools/docs/packages/burgee) | The CLI framework: one declaration, every surface | commander and yargs |
| [roundel](https://roundel.interlace.tools/docs) | Colour: one output policy, semantic tokens, a theme | chalk |
| [flagstaff](https://flagstaff.interlace.tools/docs) | The frame loop: spinners, progress, boxes and tables | ora, log-update, boxen and cli-table3 |
| [caique](https://caique.interlace.tools/docs) | Prompts that are flags first, and never hang | inquirer and clack |
| [linegauge](https://linegauge.interlace.tools/docs) | Measuring, wrapping, truncating and slicing styled text | string-width, wrap-ansi, strip-ansi and slice-ansi |
| [paratext](https://paratext.interlace.tools/docs) | Hyperlinks, images, title, clipboard and notifications | ansi-escapes, terminal-link and term-img |
| [seniority](https://seniority.interlace.tools/docs) | Configuration precedence and discovery, with provenance | cosmiconfig, dotenv and rc |
| [closeout](https://closeout.interlace.tools/docs) | Exit handlers, terminal restore and a bounded shutdown | signal-exit, exit-hook and restore-cursor |
| **bellpull** (this package) | Subprocesses, and which executable actually ran | cross-spawn and which |
| [controlroom](https://burgee.interlace.tools/docs/packages/controlroom) | Full-screen, keyboard-driven terminal screens | ink, graded by ink's own suite |

Every migration guide, and the family-wide [compatibility](https://burgee.interlace.tools/docs/compatibility)
and [benchmarks](https://burgee.interlace.tools/docs/benchmarks) pages, are on
[burgee.interlace.tools](https://burgee.interlace.tools/docs/packages).

## Contributing

Issues and pull requests are welcome at [ofri-peretz/burgee](https://github.com/ofri-peretz/burgee/issues); read
[CONTRIBUTING.md](https://github.com/ofri-peretz/burgee/blob/main/CONTRIBUTING.md) first. Report a vulnerability privately, as
[SECURITY.md](https://github.com/ofri-peretz/burgee/blob/main/SECURITY.md) describes — never in a public issue.

## Licence

MIT © Ofri Peretz — see [LICENSE](https://github.com/ofri-peretz/burgee/blob/main/packages/bellpull/LICENSE).
