# closeout

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
from an orchestrator, SIGHUP when the terminal closes. A handler registered on `'exit'`
alone catches one of them.

That is why Ctrl-C so often leaves a hidden cursor in your shell, a half-written file, or a
lock nobody released. Registering on all the doors is easy. Registering on all of them and
running the handlers **exactly once** when two fire at the same moment is where the bugs
are, and that is what this package is.

## Use

```js
import { onExit } from 'closeout';

const off = onExit(({ code, signal }) => {
  // Runs once. On a normal exit, on Ctrl-C, on SIGTERM, on SIGHUP.
  releaseTheLock();
});

// Cleaned up early? Take the handler back out.
off();
```

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
one is SIGKILL, which runs no handlers at all. Abandoning a slow handler is the better
trade. Default is two seconds.

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

## Testing it

Everything interesting is in a registry with no process attached:

```js
import { createRegistry } from 'closeout';

const registry = createRegistry({ deadline: 10 });
registry.add(handler);
await registry.run({ code: null, signal: 'SIGINT' });
```

And `install({ process: fake })` wires one to something that is not the global process, for
a test or for a runner hosting other programs.

## API

| | |
| :-- | :-- |
| `onExit(handler, phase?)` | register; returns the unregister function |
| `hideCursor(stream)` | hide and register the restore (in `restore`); returns the show function |
| `showCursor(stream)` | show now — idempotent, no-op on a non-TTY |
| `install(options)` | wire a registry to a process; `{ deadline, onError, process }` |
| `createRegistry(options)` | the registry alone, with no process |
| `SIGNALS` | `['SIGINT', 'SIGTERM', 'SIGHUP']` |
| `DEFAULT_DEADLINE` | `2000` |
| `PHASES` | `['flush', 'release', 'restore']` |
| `DEFAULT_PHASE` | `'release'` |

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

**Still to come:** raw mode and alternate-screen restore, and the `signal-exit` path. That
last one is not written because it cannot yet be *graded*: `signal-exit`'s suite runs under
`tap` with a `ts-node/esm` loader and reaches into its own `dist/`, none of which the
compatibility harness supports today. Shipping an ungraded drop-in for the package with
198.9 M weekly downloads is exactly the claim this project refuses to make.

## Licence

MIT
