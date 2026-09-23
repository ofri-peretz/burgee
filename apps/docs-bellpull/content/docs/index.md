---
title: bellpull
description: "The cord you pull to ring a bell in another room. Subprocesses with executable resolution and a structured result every caller can read — human, JSON envelope or agent event. Drop-in paths for execa, cross-spawn and which. Zero dependencies."
---

A **bellpull** is the cord in one room wired to a bell in another. You pull it here; a bell rings there; someone comes back to you.

That is a subprocess. Request work at a distance, work happens elsewhere, a result returns. **That last clause is the package.**

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

One result, three readers: `format()` for a person, `toJson()` for `--json`, `toEvent()` for
an agent — so a `--json` flag cannot report something the human output did not.

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
| `bellpull/which` | resolution alone, and the `PATH` entry that answered | `which`, `isexe`, `path-key`, `npm-run-path` |
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
program runs from somewhere else, including one somebody else can write to.

## Measured on this branch, 2026-09-15

The generated section below reads `packages/compat-oracle/baseline/cross-spawn.json` and
`.sdlc/bands/foundation-ceilings.json`, and **both still hold the numbers from before this
package was built** — they are owned by other lanes (`.sdlc/LANES.md`). What this branch
measures:

| | control (`cross-spawn` itself) | `bellpull/cross-spawn` |
| :-- | --: | --: |
| `cross-spawn` suite, macOS | 68 / 68 | **68 / 68** |

Installed, tree-inclusive: **82,270 bytes**, against a ceiling of 714,984 — a ratio of
**0.1151**, up from 0.0067 when this package was seven lines and did nothing. The rise is the
honest direction.

**What the 68 / 68 does not cover.** On POSIX `cross-spawn` is a pass-through, so its suite
never reaches the escaping or the `cmd.exe` branch at all. Measured: replacing `escapeArgument`
with `` arg => `"${arg}"` `` — the injection bug in its purest form — leaves the row at 68 / 68.
The Windows behaviour is covered by this package's own tests and by nothing else until a
Windows runner exists.

## Benchmarks

Every number here is produced by `npm run bench` and published at [/docs/benchmarks](https://burgee.interlace.tools/docs/benchmarks).

Graded by the incumbent's own test suite:

| suite | passing |
| :-- | --: |
| `cross-spawn` | 68 / 68 |

Weight, installed and tree-inclusive: **97,881 bytes** against **714,984** for the incumbents it replaces — a ratio of **0.1369**.
## Where it sits

Plugins register under the `resolvers` key, against the one schema the whole family shares.

`burgee` builds on it, and it builds on nothing in this family.
## Licence

MIT
