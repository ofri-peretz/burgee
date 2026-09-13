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
| `onExit(handler)` | register; returns the unregister function |
| `hideCursor(stream)` | hide and register the restore; returns the show function |
| `showCursor(stream)` | show now — idempotent, no-op on a non-TTY |
| `install(options)` | wire a registry to a process; `{ deadline, onError, process }` |
| `createRegistry(options)` | the registry alone, with no process |
| `SIGNALS` | `['SIGINT', 'SIGTERM', 'SIGHUP']` |
| `DEFAULT_DEADLINE` | `2000` |

Importing this package attaches nothing. The process-wide instance installs on first use,
so a library that imports `closeout` for its types pays nothing.

## Replaces

Drop-in paths are planned for `signal-exit`, `exit-hook` and `restore-cursor`. What they do
between them is one problem — leaving cleanly — and this is one package with no
dependencies rather than three with a tree.

**Still to come:** raw mode and alternate-screen restore, and the graded drop-in paths.

## Licence

MIT
