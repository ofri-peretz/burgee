/**
 * The signal wiring, which had no test at all.
 *
 * `cursor.test.ts` and `registry.test.ts` cover the two halves either side of it, so all
 * nineteen passed while `install()` decided — unconditionally — that a signal ends the
 * process. That decision is invisible from inside this package and very visible from
 * outside it: `flagstaff`'s spinner suite asserts that a program which installed its own
 * SIGINT handler keeps it, and every one of those cases failed the moment flagstaff tried
 * to consume us.
 */
import { describe, expect, it } from 'vitest';

import { install, type ProcessLike } from './index.js';

type Listener = (...args: never[]) => void;

/** A process that records rather than acts, so a signal is a function call. */
function fakeProcess(): ProcessLike & {
  raise(event: string): void;
  exited: number | undefined;
  written: string;
} {
  const listeners = new Map<string, Listener[]>();
  const self = {
    exited: undefined as number | undefined,
    written: '',
    on(event: string, listener: Listener) {
      listeners.set(event, [...(listeners.get(event) ?? []), listener]);
      return self;
    },
    removeListener(event: string, listener: Listener) {
      listeners.set(event, (listeners.get(event) ?? []).filter((known) => known !== listener));
      return self;
    },
    listenerCount(event: string): number {
      return (listeners.get(event) ?? []).length;
    },
    exit(code?: number): never {
      self.exited = code;
      // Recording rather than throwing: `leave` runs inside a promise chain, and a throw
      // there would surface as an unhandled rejection rather than as this assertion.
      return undefined as never;
    },
    stderr: {
      write(chunk: string): boolean {
        self.written += chunk;
        return true;
      },
      isTTY: true,
    },
    raise(event: string): void {
      for (const listener of [...(listeners.get(event) ?? [])]) (listener as () => void)();
    },
  };
  return self;
}

/** The handlers run on a promise, so a signal's consequences land a tick later. */
const settle = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('a signal, when the program has not asked for it', () => {
  it('runs the handlers and leaves with the signal’s own code', async () => {
    const proc = fakeProcess();
    const closeout = install({ process: proc });
    let ran = 0;
    closeout.onExit(() => {
      ran += 1;
    });

    proc.raise('SIGINT');
    await settle();

    expect(ran).toBe(1);
    expect(proc.exited).toBe(130);
  });
});

describe('a signal the program installed its own handler for', () => {
  it('runs the handlers and then stands down, leaving the exit to the program', async () => {
    // The contract flagstaff's suite pins: a hidden cursor comes back on SIGINT *and* the
    // program's own handler still decides what happens next. Without the listener-count
    // guard this exits 130 and the program never gets to choose.
    const proc = fakeProcess();
    const closeout = install({ process: proc });
    let cleanup = 0;
    closeout.onExit(() => {
      cleanup += 1;
    });

    let ownHandlerRuns = 0;
    proc.on('SIGINT', (() => {
      ownHandlerRuns += 1;
    }) as Listener);

    proc.raise('SIGINT');
    await settle();

    expect(cleanup, 'cleanup still runs — that is not what is being deferred').toBe(1);
    expect(ownHandlerRuns, 'the program’s handler is delivered once').toBe(1);
    expect(proc.exited, 'a program that owns the signal decides whether to leave').toBeUndefined();
  });

  it('leaves the program’s handler installed, having removed only its own', async () => {
    const proc = fakeProcess();
    install({ process: proc });
    proc.on('SIGINT', (() => undefined) as Listener);

    expect(proc.listenerCount('SIGINT')).toBe(2);
    proc.raise('SIGINT');
    await settle();

    // One listener left, and it is the program's: ours comes off so a second Ctrl-C reaches
    // the program directly rather than replaying a shutdown that already happened.
    expect(proc.listenerCount('SIGINT')).toBe(1);
  });
});
