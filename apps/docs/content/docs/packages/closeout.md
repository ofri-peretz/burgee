---
title: closeout
description: "Close everything out. Exit handlers that run exactly once on every path, terminal restore, and a bounded deadline so shutdown cannot hang. Drop-in paths for signal-exit, exit-hook and restore-cursor. Zero dependencies."
---

**Close everything out.**

Exit handlers that run exactly once on every path, terminal restore, and a bounded deadline
so shutdown cannot hang.

To *close out* is to settle and finish — an account, a position, a shift. Everything
outstanding is resolved and nothing is left open. That is what a process should do on the
way out, and mostly does not.

Zero dependencies. Node builtins only.

```bash
npm i closeout
```

## The problem

A program leaves by several doors: returning from `main`, `process.exit`, Ctrl-C, SIGTERM
from an orchestrator, SIGHUP when the terminal closes, an uncaught throw, a rejected
promise nobody awaited. A handler registered on `'exit'` alone catches one of them.

That is why Ctrl-C so often leaves a hidden cursor in your shell, a half-written file, or a
lock nobody released. Registering on all the doors is easy. Registering on all of them and
running the handlers **exactly once** when two fire at the same moment is where the bugs
are, and that is what this package is.

## Use

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
closeout: shutdown deadline of 2000ms expired; exiting anyway.
Handlers that had not returned: acme:unlock, closeTheDatabase
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
// `restore` is closeout's own: cursor shown, raw mode off, last, always
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

**The exit code is yours.** A handler running after `process.exit(3)` cannot turn it into a 0:
the code is captured at the trigger, before a single handler runs, and a breached deadline
exits with that same code rather than one invented by the fact that something hung.

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

## API

| | |
| :-- | :-- |
| `onExit(handler, phase \| { phase, label }?)` | register; returns the unregister function |
| `once(fn)` | run at most once, first result thereafter — `name`, `length` and `this` kept |
| `hideCursor(stream)` | hide and register the restore (in `restore`); returns the show function |
| `showCursor(stream)` | show now — idempotent, no-op on a non-TTY |
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
| `closeout/cursor` | `showCursor`, `hideCursor`, `HIDE_CURSOR`, `SHOW_CURSOR` — 666 B, no registry |

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

## Replaces

What `signal-exit`, `exit-hook`, `restore-cursor`, `cli-cursor`, `onetime` and `mimic-fn` do
between them is one problem — leaving cleanly — and this is one package with no dependencies
rather than six with a tree.

Two of those paths are built and **graded by the incumbent's own test suite**, unedited apart
from the import specifier, through `compat-oracle`. The control column is that suite run
against the incumbent itself, which is what says the gate works before it grades us:

| subpath | replaces | control | closeout |
| :-- | :-- | --: | --: |
| `closeout/exit-hook` | `exit-hook@5.1.0` (8.8 M/wk) | 21 / 21 | 21 / 21 |
| `closeout/restore-cursor` | `restore-cursor@5.1.0` (107.5 M/wk) | 6 / 6 | 6 / 6 |

```js
import exitHook, {asyncExitHook, gracefulExit} from 'closeout/exit-hook';
import restoreCursor from 'closeout/restore-cursor';
```

or, without touching the source at all:

```json
{ "overrides": { "exit-hook": "npm:closeout@^0.1", "restore-cursor": "npm:closeout@^0.1" } }
```

One thing to know before you swap `exit-hook`: its bound is per hook (`{ wait }`) and the
façade keeps that bound rather than imposing closeout's own 2 000 ms deadline, because a
drop-in that silently tightens your timeout is not a drop-in. `onExit()` — closeout's own
API — is where the bounded shutdown lives.

**Weight, measured rather than claimed.** The whole package is 20,417 B of published
JavaScript and reaches no other package. `closeout/exit-hook` is 11,841 B of that, against
`exit-hook@5.1.0`'s 4,458 B in one file — *over*, because the drop-in shares the phase
ordering, the bounded runner and the report with the rest of the package, and those are the
product. Startup cost is the half that matches: p50 over 21 spawns, importing
`closeout/exit-hook` costs **4.5 ms** over a bare `node`, and importing `exit-hook` itself
costs **4.6 ms**.

**Still to come:** raw mode and alternate-screen restore, and the `signal-exit` path. That
last one is not written because it cannot yet be *graded*: `signal-exit`'s suite runs under
`tap` with a `ts-node/esm` loader and reaches into its own `dist/`, none of which the
compatibility harness supports today. Shipping an ungraded drop-in for the package with
198.9 M weekly downloads is exactly the claim this project refuses to make.

## Benchmarks

Every number here is produced by `npm run bench` and published at [/docs/benchmarks](/docs/benchmarks).

Graded by the incumbent's own test suite:

| suite | passing |
| :-- | --: |
| `exit-hook` | 21 / 21 |
| `restore-cursor` | 6 / 6 |

Weight, installed and tree-inclusive: **95,911 bytes** against **170,604** for the incumbents it replaces — a ratio of **0.5622** (exit-hook not installed here, so the ceiling is understated).
## Where it sits

Plugins register under the `handlers` key, against the one schema the whole family shares.

`burgee`, `caique`, `flagstaff` build on it, and it builds on nothing in this family.
## Licence

MIT
