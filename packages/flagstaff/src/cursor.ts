/**
 * cli-cursor and restore-cursor, without onetime and signal-exit — the four packages both
 * render façades would otherwise each drag in (R10, U6).
 *
 * `flagstaff/ora` and `flagstaff/log-update` are two ports of two incumbents that happen
 * to share one dependency chain: ora reaches it through `cli-cursor`, log-update reaches
 * it through `cli-cursor` too, and underneath both is `restore-cursor` → `signal-exit`.
 * There is exactly one correct implementation of "put the cursor back however the process
 * dies", it is subtle, and a second copy of it is a second place to get it wrong — so it
 * lives here and both façades import it. It is the only module either façade shares that
 * is not the width function.
 *
 * It reaches the process because the thing being restored *is* the process's terminal:
 * cursor state is global to the terminal, not to whichever stream a caller passed in, and
 * both incumbents restore the process's cursor for exactly that reason. It reaches it
 * through `./runtime.js` (Y9), which is the one file in the package that names the global;
 * burgee's process-reference lock names that file, and this one takes a `Runtime`.
 */
import { constants } from 'node:os';

import { processRuntime } from './runtime.js';

/**
 * The process, through the seam (Y9). Nothing is read at import: `processRuntime()` hands
 * back the live process narrowed to `Runtime`, so `rt.stderr.isTTY` below is still answered
 * the moment `restoreCursorOnExit()` asks, and `rt.kill` is still looked up when the handler
 * fires — which is what lets a suite swap it.
 */
const rt = processRuntime();

export const HIDE_CURSOR = '\u001B[?25l';
export const SHOW_CURSOR = '\u001B[?25h';

/**
 * `'exit'` alone is not enough, and that is the whole reason this is more than one line:
 * node does not run `'exit'` listeners for a process terminated by a signal with no
 * listener, and Ctrl+C is the commonest way a frame dies. So the three termination signals
 * get a listener too — which is what `signal-exit` is for in both incumbents' trees.
 *
 * The trap that makes this subtle: installing a signal listener SUPPRESSES node's default
 * termination, so a naive handler turns Ctrl+C into a no-op. The handler therefore
 * restores, removes its own listeners, and **re-raises** the signal so the default action
 * still happens — but only when no other listener remains, because a program that
 * installed its own `SIGINT` handler asked not to be killed and a spinner does not get to
 * overrule it. Both halves are asserted, for each façade, against its built `dist/` entry
 * in a child process that is really signalled: `ora.test.ts` and `log-update.test.ts`.
 */
type TerminationSignal = 'SIGHUP' | 'SIGINT' | 'SIGTERM' | 'SIGBREAK';

/**
 * `SIGBREAK` is Windows' Ctrl+Break and is defined nowhere else, so the list is filtered by
 * what this platform actually defines rather than by a hard-coded platform name.
 * `os.constants.signals` is that set, and it is the same set `process.kill` accepts.
 *
 * It has to be a filter and not a `try`/`catch` around the registration, because
 * `process.on()` does not reject a signal the platform does not know: it accepts the
 * listener, which then never fires. There is no exception here to swallow.
 */
const TERMINATION_SIGNALS: TerminationSignal[] = (['SIGHUP', 'SIGINT', 'SIGTERM', 'SIGBREAK'] as const).filter(
  (signal) => signal in constants.signals,
);

/** stderr if it is a terminal, else stdout if it is, else there is no cursor to restore. */
function terminalStream(): NodeJS.WriteStream | undefined {
  if (rt.stderr.isTTY) return rt.stderr;
  if (rt.stdout.isTTY) return rt.stdout;
  return undefined;
}

let cursorRestoreInstalled = false;

/**
 * What a caller gets back when there was nothing to install — no terminal, or a net already
 * standing. Callers that keep the net for the life of the process (the façades, matching
 * their incumbents) ignore the return; `hoist()` calls it when its own frame closes, so a
 * program that spins once and then runs for an hour is not left holding signal handlers.
 */
const NOTHING_TO_UNDO = (): void => undefined;

/**
 * Installed once, the first time a cursor is hidden; puts it back however the process dies.
 *
 * `write` is how the caller's own surface reaches the terminal, and passing it is what makes
 * this usable from the core. `hoist()` already knows its stream — the Runtime gave it one and
 * the output mode was decided from it once (R1/U2) — so it must not be re-detected here: a
 * second detector is precisely what the policy exists to prevent. The façades pass nothing
 * and get the detection below, because that is their incumbents' contract — ora and
 * log-update restore *the process's* cursor whichever stream the caller handed them.
 */
export function restoreCursorOnExit(write?: (s: string) => void): () => void {
  if (cursorRestoreInstalled) return NOTHING_TO_UNDO;
  cursorRestoreInstalled = true;
  const terminal = write === undefined ? terminalStream() : { write };
  if (terminal === undefined) return NOTHING_TO_UNDO;

  // onetime, in three lines: the cursor is put back once, whichever path gets there first.
  let restored = false;
  const restore = (): void => {
    if (restored) return;
    restored = true;
    terminal.write(SHOW_CURSOR);
  };

  const installed = new Map<TerminationSignal, () => void>();
  const uninstall = (): void => {
    for (const [name, fn] of installed) rt.removeListener(name, fn);
    installed.clear();
    rt.removeListener('exit', restore);
    cursorRestoreInstalled = false;
  };

  for (const signal of TERMINATION_SIGNALS) {
    const handler = (): void => {
      restore();
      uninstall();
      if (rt.listenerCount(signal) === 0) rt.kill(rt.pid, signal);
    };
    rt.on(signal, handler);
    installed.set(signal, handler);
  }

  rt.once('exit', restore);
  return uninstall;
}
