<p align="center">
  <a href="https://github.com/ofri-peretz/burgee/tree/main/packages/closeout" target="blank">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/ofri-peretz/burgee/main/brand-assets/closeout-lockup.svg" />
      <img src="https://raw.githubusercontent.com/ofri-peretz/burgee/main/brand-assets/closeout-lockup-light.svg" alt="closeout" width="360" />
    </picture>
  </a>
</p>

<p align="center">
  Exit handlers that run exactly once on every path, terminal restore, and a bounded deadline so shutdown cannot hang.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/closeout"><img src="https://img.shields.io/npm/v/closeout?style=flat-square&color=0a6b47" alt="closeout on npm: the latest version" /></a>
  <a href="https://www.npmjs.com/package/closeout"><img src="https://img.shields.io/npm/dm/closeout?style=flat-square" alt="closeout downloads per month on npm" /></a>
  <a href="https://github.com/ofri-peretz/burgee/actions/workflows/quality.yml?query=branch%3Amain"><img src="https://img.shields.io/github/actions/workflow/status/ofri-peretz/burgee/quality.yml?branch=main&style=flat-square&label=Quality%20Gate" alt="Quality Gate: the CI status of main" /></a>
  <a href="https://app.codecov.io/gh/ofri-peretz/burgee/components"><img src="https://img.shields.io/codecov/c/github/ofri-peretz/burgee/main?component=closeout&style=flat-square" alt="closeout line coverage: its Codecov component" /></a>
  <a href="https://scorecard.dev/viewer/?uri=github.com/ofri-peretz/burgee"><img src="https://img.shields.io/ossf-scorecard/github.com/ofri-peretz/burgee?style=flat-square&label=OpenSSF%20Scorecard" alt="OpenSSF Scorecard for the repository" /></a>
  <a href="https://www.npmjs.com/package/closeout?activeTab=code"><img src="https://img.shields.io/npm/unpacked-size/closeout?style=flat-square" alt="Unpacked size of the latest closeout release on npm" /></a>
  <a href="https://github.com/ofri-peretz/burgee/blob/main/packages/closeout/package.json"><img src="https://img.shields.io/badge/dependencies-0-0a6b47?style=flat-square" alt="Zero dependencies" /></a>
  <a href="https://github.com/ofri-peretz/burgee/blob/main/packages/closeout/package.json"><img src="https://img.shields.io/badge/types-included-blue?style=flat-square" alt="TypeScript types included for every entry point" /></a>
  <a href="https://github.com/ofri-peretz/burgee/blob/main/packages/closeout/package.json"><img src="https://img.shields.io/badge/Node.js-20.19%2B%20%7C%2022.13%2B-green?style=flat-square" alt="Node.js 20.19+ or 22.13+" /></a>
  <a href="https://github.com/ofri-peretz/burgee/blob/main/packages/closeout/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue?style=flat-square" alt="License: MIT" /></a>
  <a href="https://www.npmjs.com/package/closeout#provenance"><img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fregistry.npmjs.org%2Fcloseout%2Flatest&query=%24.dist.attestations.provenance~&label=npm&style=flat-square&color=0a6b47" alt="npm provenance of the latest release, read live from its registry attestation" /></a>
</p>

<p align="center">
  <a href="https://burgee.interlace.tools/docs/compatibility"><img src="https://img.shields.io/badge/exit--hook%20suite-21%2F21-0a6b47?style=flat-square" alt="closeout passes 21 of 21 cases of the exit-hook test suite" /></a>
  <a href="https://burgee.interlace.tools/docs/compatibility"><img src="https://img.shields.io/badge/restore--cursor%20suite-6%2F6-0a6b47?style=flat-square" alt="closeout passes 6 of 6 cases of the restore-cursor test suite" /></a>
  <a href="https://burgee.interlace.tools/docs/compatibility"><img src="https://img.shields.io/badge/signal--exit%20suite-134%2F135-b45309?style=flat-square" alt="closeout passes 134 of 135 cases of the signal-exit test suite" /></a>
</p>

<p align="center">
  Docs: <a href="https://closeout.interlace.tools">https://closeout.interlace.tools</a><br />
  Migrating from: <a href="https://closeout.interlace.tools/docs/coming-from/signal-exit">signal-exit</a> · <a href="https://closeout.interlace.tools/docs/coming-from/exit-hook">exit-hook</a> · <a href="https://closeout.interlace.tools/docs/coming-from/restore-cursor">restore-cursor</a>
</p>

**Close everything out.**

It replaces **signal-exit**, **exit-hook** and **restore-cursor**, each through a drop-in
subpath graded by the incumbent's own suite. Every handler gets one record, and `reportToJson()` and `reportToEvent()` project
that record as a `--json` line or an agent event.

To *close out* is to settle and finish — an account, a position, a shift. Everything
outstanding is resolved and nothing is left open. That is what a process should do on the
way out, and mostly does not.

Zero dependencies. Node builtins only.

## Install

```bash
npm install closeout
pnpm add closeout
yarn add closeout
bun add closeout
```

## Quick start

```js
import { onExit } from 'closeout';

const off = onExit(({ path, code, signal, error }) => {
  // Runs once, whichever door the program left by: a normal exit, an emptied event loop,
  // Ctrl-C, SIGTERM, SIGHUP, SIGQUIT, an uncaught throw, an unhandled rejection.
  releaseTheLock();
});

// Cleaned up early? Take the handler back out.
off();
```

Your handler is handed one record — `{ path, signal, code, error }` — and the same record is
what `reportToJson()` and `reportToEvent()` project, so a `--json` line and an agent event
cannot disagree with what the handler was told.

`path` is `'exit' | 'beforeExit' | 'signal' | 'uncaught' | 'rejection'`. `error` is what was
thrown or rejected on the two paths that have one, and `null` on the others.

**SIGKILL is not in that list and cannot be.** It is not deliverable to a listener by design.
Any package that claims it is claiming something no program can do.

### The cursor, which is the common case

```js
import { hideCursor } from 'closeout';

const restore = hideCursor(process.stdout);
try {
  await drawTheSpinner();
} finally {
  restore();
}
```

`hideCursor` registers the restore **at the same moment it hides**. That pairing is the
whole reason it lives here rather than in each renderer: the two cannot drift apart, and a
process that dies between them still shows the cursor again.

Call `restore()` and the handler unregisters itself, so a program that cleans up normally
leaves nothing behind for exit to do. Call it twice, or call it and then die — the cursor is
shown once either way.

Nothing is written to a non-TTY. Escape sequences in a pipe corrupt the output the pipe
exists to carry.

### The alternate screen and raw mode, the same way

```js
import { alternateScreen, hideCursor, rawMode } from 'closeout';

const undo = [rawMode(process.stdin), alternateScreen(process.stdout), hideCursor(process.stdout)];
try {
  await runTheFullScreenApp();
} finally {
  for (const back of undo) back();
}
```

Each call makes the change and registers its undo in the `restore` phase, so a full-screen
program that dies — Ctrl-C, SIGTERM, SIGHUP, a throw, a handler that threw, a deadline that
fired — still hands back a terminal with raw mode off, the alternate screen left and the
cursor shown, after every other handler has run. Each undo runs once, whoever asks first.

Both register on the process-wide instance; pass the object `install()` returned as a second
argument to register on that one instead. They are functions rather than methods on that
object so that a program which never enters a screen does not bundle them.

`rawMode(input)` turns off only what it turned on. If the input is already raw, somebody else
owns that state and the call changes nothing, now or at exit. An input that is not a terminal
gets no mode change, and a stream that is not a terminal gets no escape, in either direction.

## The problem

A program leaves by several doors: returning from `main`, `process.exit`, Ctrl-C, SIGTERM
from an orchestrator, SIGHUP when the terminal closes, an uncaught throw, a rejected
promise nobody awaited. A handler registered on `'exit'` alone catches one of them.

That is why Ctrl-C so often leaves a hidden cursor in your shell, a half-written file, or a
lock nobody released. Registering on all the doors is easy. Registering on all of them and
running the handlers **exactly once** when two fire at the same moment is where the bugs
are, and that is what this package is.

## The deadline

```js
import { install } from 'closeout';

const { onExit } = install({ deadline: 5000 });
```

A handler that awaits something which never resolves — a socket that will not close, a lock
nobody releases — turns Ctrl-C into a process the user has to kill **twice**, and the second
one is SIGKILL, which runs no handlers at all. Abandoning a slow handler is the better trade.

**On a breach the process leaves with the code it was already leaving with, and says which
handler did not come back:**

```text
closeout: shutdown deadline of 2000ms expired; exiting anyway. Handlers that had not returned: acme:unlock, closeTheDatabase
```

Names come from the function's own `name`, or from a label you give it —
`onExit(fn, { label: 'flush-the-audit-log' })` — which is worth doing for the arrow
functions, since an anonymous arrow is exactly the shape that hangs. A plugin's handlers are
named `"<plugin>:<handler>"` for free.

`Infinity` and `0` are both **refused at registration**, with a `USAGE`-class error that says
what to pass instead. Both reintroduce the failure the package exists to remove: one waits
forever, the other gives no asynchronous handler a turn. A caller who genuinely wants either
wants a different package.

**The default is 2 000 ms, and it is provisional.** Measured 2026-09-14 on darwin arm64 /
node 24.13, 100 runs of each of the five cleanup shapes this layer sees: flushing a write
stream p99 67.1 ms, closing a server 1.5 ms, killing a child 1.3 ms, restoring the terminal
0.2 ms — and removing a temp directory of 100 files p99 17 818 ms, on a machine at load
average 19–22 across 14 cores (p50 161 ms / p99 2 166 ms when re-run alone). Four shapes
inside 70 ms, one that is entirely the disk it is queued behind. The number stays 2 000 ms
and stays labelled provisional rather than being rounded off a p99 with somebody else's I/O
inside it.

## Phases, so the order is not an accident

```js
onExit(flushTheLog, 'flush');    // get the data out
onExit(releaseTheLock);          // let go — the default, `release`
// `restore` is closeout's own: raw mode off, alternate screen left, cursor shown — last, always
```

Registration order is the wrong order for a shutdown, and it is the order every incumbent
gives you. The handler that hands the terminal back is registered by whichever renderer hid
the cursor, at whatever moment it first drew — so anything registered a line later runs
*after* the cursor is back, which is to say it cleans up nothing it was registered to clean
up. An order that depends on import order is not an order.

Three phases, and the names are the sequence: **`flush`** (write the file, drain the log),
**`release`** (locks, sockets, children — the default), **`restore`** (the terminal). Phases
run *in sequence*: an async handler in `flush` settles before `release` starts. Handlers
inside one phase run together, in registration order.

Past the deadline the later phases are still **run** — they are only no longer waited for. A
handler that hung in `flush` does not get to decide that the cursor stays hidden.

## Plugins

```js
import { register, attach } from 'closeout/plugin';

register({
  name: 'acme',
  handlers: [{ name: 'unlock', phase: 'release', run: async () => { await release(); } }],
});

attach(closeout.registry);
```

A plugin is one plain object shared by the whole family; closeout keeps `handlers` and
ignores every other layer's keys without complaining, so the same object works on whatever
subset of the family you have installed. `contributions()` projects the whole shutdown
sequence as data — readable without running any of it.

A plugin handler may declare `flush` or `release`, and **not** `restore`. Terminal restore is
closeout's own last phase; a handler admitted to it could land after the terminal was handed
back depending on nothing but which registered first, which is the coincidence phases exist
to replace.

## Three guarantees, and what each one costs to get wrong

**Exactly once.** Two signals, or a signal and the `'exit'` behind it, are one shutdown.
Handlers that run twice release a lock someone else has since taken.

**One handler's failure is its own.** A throw is reported and the remaining handlers still
run. Shutdown is the worst possible place for an exception to short-circuit a loop, because
the handler that restores the terminal is usually registered last.

**Bounded.** Shutdown returns on the handlers or on the clock, whichever comes first — and
on the handlers when they are all synchronous, not on the clock.

**The exit code is yours.** On a signal, a throw or a rejection, how the process leaves is
decided at the trigger, before a single handler runs: a handler that sets `process.exitCode = 0`
on its way past cannot turn a crash into a success, and a breached deadline leaves the same way
rather than with a code invented by the fact that something hung. Every handler is told the
code in `report.code`. On `process.exit()` and a normal finish the process is leaving on its
own, and Node reads `process.exitCode` *after* the handlers, so a handler must not assign it
there.

**A signalled process dies of the signal.** Once the handlers have run, closeout removes its
own listener and re-raises — so a program killed by Ctrl-C really dies of SIGINT rather than
exiting 130. The two are different events to everything upstream of you: `WIFSIGNALED` is
true for one and false for the other, so a shell knows to print `^C`, `make` stops a parallel
build, a CI runner marks a job cancelled rather than failed, and a supervisor decides whether
to restart. 128 + n is the number a shell reports *afterwards*; it is not a status a process
can set for itself, and closeout only falls back to it on a runtime that refuses to raise the
signal at all (SIGHUP on Windows).

**A program that owns the signal keeps it.** The re-raise happens only when no other listener
remains, counted after closeout's own comes off. A program with its own `SIGINT` handler gets
the cleanup and still decides what happens next — and gets exactly one delivery for one
Ctrl-C.

> `closeout/exit-hook` is the one place this does not apply. `exit-hook` exits `128 + n` and
> listens on SIGINT and SIGTERM only — no SIGHUP — and its own suite grades both, so the
> drop-in keeps them. Use closeout's `onExit` rather than the drop-in when a closing terminal
> has to reach your cleanup.

## Testing it

Everything interesting is in a registry with no process attached:

```js
import { createRegistry } from 'closeout';

const registry = createRegistry({ deadline: 10 });
registry.add(handler);
await registry.run({ code: null, signal: 'SIGINT' });
```

And `install({ process: fake })` wires one to something that is not the global process, for
a test or for a runner hosting other programs. A `ProcessLike` owes `kill` and `pid` as well
as the listener methods, because re-raising a signal is part of the contract above and a fake
that could quietly skip it is how the missing re-raise survived two incumbent suites.

## Migrating

One import per incumbent:

```diff
- import exitHook, { asyncExitHook, gracefulExit } from 'exit-hook';
+ import exitHook, { asyncExitHook, gracefulExit } from 'closeout/exit-hook';
```

```diff
- import restoreCursor from 'restore-cursor';
+ import restoreCursor from 'closeout/restore-cursor';
```

```diff
- import { onExit } from 'signal-exit';
+ import { onExit } from 'closeout/signal-exit';
```

The swap is an import change, not an `overrides` entry. An override points the incumbent's
name at closeout's *root*, and the root is closeout's own API — it has one default to give,
and three incumbents would each need it. An override for a transitive copy has nowhere to
land, so this package does not print one.

One thing to know before you swap `exit-hook`: its bound is per hook (`{ wait }`) and the
façade keeps that bound rather than imposing closeout's own 2 000 ms deadline, because a
drop-in that silently tightens your timeout is not a drop-in. `onExit()` — closeout's own
API — is where the bounded shutdown lives.

Or let the codemod make the change: `npx burgee migrate --dry-run` lists every import it would
rewrite — only drop-ins graded level with their incumbent — and `npx burgee migrate` makes it
([Migrate](https://burgee.interlace.tools/docs/migrate)).

## Compatibility

What `signal-exit`, `exit-hook`, `restore-cursor`, `cli-cursor`, `onetime` and `mimic-fn` do
between them is one problem — leaving cleanly — and this is one package with no dependencies
rather than six with a tree.

Three of those paths are built and **graded by the incumbent's own test suite**, unedited apart
from the import specifier, through `compat-oracle`. The control column is that suite run
against the incumbent itself, which is what says the gate works before it grades us:

| subpath | replaces | control | closeout |
| :-- | :-- | --: | --: |
| `closeout/exit-hook` | `exit-hook@5.1.0` (8.8 M/wk) | 21 / 21 | 21 / 21 |
| `closeout/restore-cursor` | `restore-cursor@5.1.0` (107.5 M/wk) | 6 / 6 | 6 / 6 |
| `closeout/signal-exit` | `signal-exit@4` (198.9 M/wk) | 134 / 135 | 134 / 135 |

The one `signal-exit` case short fails against `signal-exit` itself as well, which is what the
control column is for.

## Weight

Measured rather than claimed. The whole package is 20,417 B of published
JavaScript and reaches no other package. `closeout/exit-hook` is 11,841 B of that, against
`exit-hook@5.1.0`'s 4,458 B in one file — *over*, because the drop-in shares the phase
ordering, the bounded runner and the report with the rest of the package, and those are the
product. Startup cost is the half that matches: p50 over 21 spawns, importing
`closeout/exit-hook` costs **4.5 ms** over a bare `node`, and importing `exit-hook` itself
costs **4.6 ms**.

## Benchmarks

Every number here is produced by `npm run bench` and published at [burgee.interlace.tools/docs/benchmarks](https://burgee.interlace.tools/docs/benchmarks).

Graded by the incumbent's own test suite:

| suite | passing |
| :-- | --: |
| `exit-hook` | 21 / 21 |
| `restore-cursor` | 6 / 6 |
| `signal-exit` | 134 / 135 |

Weight, installed and tree-inclusive: **117,768 bytes** against **183,804** for the incumbents it replaces — a ratio of **0.6407**.

## For agents

- **One record, two projections.** Every handler is handed `{ path, signal, code, error }`, and
  `reportToJson()` and `reportToEvent()` project that same record as a `--json` line or an agent
  event — they cannot disagree with what the handler was told.
- **A hang names itself.** A breached deadline prints which handlers had not returned, and exits
  with the code the process was already leaving with.
- **The shutdown is readable as data.** `contributions()` from `closeout/plugin` lists every
  contributed handler in the order it will run, without running any of it.
- **A plugin can be checked before it ships.** `npx closeout check ./unlock.mjs` validates it
  against the family schema and exits 0, 1 with a code and a fix, or 2 on a usage error.
- **The docs are machine-readable** at
  [closeout.interlace.tools/llms.txt](https://closeout.interlace.tools/llms.txt) and
  [llms-full.txt](https://closeout.interlace.tools/llms-full.txt).

## API

| | |
| :-- | :-- |
| `onExit(handler, phase \| { phase, label }?)` | register; returns the unregister function |
| `once(fn)` | run at most once, first result thereafter — `name`, `length` and `this` kept |
| `hideCursor(stream)` | hide and register the restore (in `restore`); returns the show function |
| `showCursor(stream)` | show now — idempotent, no-op on a non-TTY |
| `alternateScreen(stream, closeout?)` | enter the alternate screen and register leaving it (in `restore`); returns the leave function |
| `rawMode(input, closeout?)` | turn raw mode on and register turning it off (in `restore`); an input already raw is left alone |
| `install(options)` | wire a registry to a process; `{ deadline, onError, onTimeout, process }` |
| `createRegistry(options)` | the registry alone, with no process |
| `reportToJson(report)` / `reportToEvent(report)` | the two projections of the one record |
| `SIGNALS` | `['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGQUIT', 'SIGBREAK']` |
| `DEFAULT_DEADLINE` | `2000` |
| `PHASES` | `['flush', 'release', 'restore']` |
| `DEFAULT_PHASE` | `'release'` |
| `EXIT_PATHS` | `['exit', 'beforeExit', 'signal', 'uncaught', 'rejection']` |

`run()` resolves with the shutdown's own record: the four fields above plus `timedOut` and
`unfinished`, the handlers that had not returned.

And the two leaves, for a program that wants one of them and none of the rest:

| | |
| :-- | :-- |
| `closeout/once` | `once(fn)` — 441 B, reaching nothing |
| `closeout/cursor` | `showCursor`, `hideCursor`, `alternateScreen`, `rawMode` (each taking the registrar as a second argument), `HIDE_CURSOR`, `SHOW_CURSOR`, `ENTER_ALTERNATE_SCREEN`, `LEAVE_ALTERNATE_SCREEN` — 1,458 B, no registry |

And from `closeout/plugin`:

| | |
| :-- | :-- |
| `register(plugin)` | validate and keep a plugin's `handlers`; other layers' keys are ignored |
| `attach(registry)` | wire every contributed handler into its phase; returns the undo |
| `contributions()` | the shutdown sequence as data, in the order it will run |
| `registered()` / `reset()` | the plugins, and forgetting them |
| `CONTRACT` / `PLUGIN_PHASES` | `1` · `['flush', 'release']` |

And the drop-in subpaths, which reproduce their incumbent's API rather than this one:

| | |
| :-- | :-- |
| `closeout/exit-hook` | `exitHook(fn)` (default), `asyncExitHook(fn, { wait })`, `gracefulExit(code?)` |
| `closeout/restore-cursor` | `restoreCursor()` (default) |

Importing this package attaches nothing. The process-wide instance installs on first use,
so a library that imports `closeout` for its types pays nothing.

Every export, with its types, is on [closeout.interlace.tools](https://closeout.interlace.tools/docs).

## Where it sits

Plugins register under the `handlers` key, against the one schema the whole family shares.

`burgee`, `caique`, `flagstaff` build on it, and it builds on nothing in this family.

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
| **closeout** (this package) | Exit handlers, terminal restore and a bounded shutdown | signal-exit, exit-hook and restore-cursor |
| [bellpull](https://bellpull.interlace.tools/docs) | Subprocesses, and which executable actually ran | cross-spawn and which |
| [controlroom](https://burgee.interlace.tools/docs/packages/controlroom) | Reserved, not usable yet — planned: full-screen, keyboard-driven terminal screens | ink, planned |

Every migration guide, and the family-wide [compatibility](https://burgee.interlace.tools/docs/compatibility)
and [benchmarks](https://burgee.interlace.tools/docs/benchmarks) pages, are on
[burgee.interlace.tools](https://burgee.interlace.tools/docs/packages).

## Contributing

Issues and pull requests are welcome at [ofri-peretz/burgee](https://github.com/ofri-peretz/burgee/issues); read
[CONTRIBUTING.md](https://github.com/ofri-peretz/burgee/blob/main/CONTRIBUTING.md) first. Report a vulnerability privately, as
[SECURITY.md](https://github.com/ofri-peretz/burgee/blob/main/SECURITY.md) describes — never in a public issue.

## Licence

MIT © Ofri Peretz — see [LICENSE](https://github.com/ofri-peretz/burgee/blob/main/packages/closeout/LICENSE).
