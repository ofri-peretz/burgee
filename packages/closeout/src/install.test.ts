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
function fakeProcess(options: { canRaise?: boolean } = {}): ProcessLike & {
  raise(event: string): void;
  exited: number | undefined;
  raised: Array<{ pid: number; signal: string }>;
  written: string;
} {
  const { canRaise = true } = options;
  const listeners = new Map<string, Listener[]>();
  const self = {
    exited: undefined as number | undefined,
    raised: [] as Array<{ pid: number; signal: string }>,
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
    /*
     * A fake cannot die of a signal, so this records the attempt and lets the caller decide
     * whether the runtime would even have accepted it. `canRaise: false` is Windows asked to
     * raise SIGHUP, or any runtime whose `kill` rejects the signal — the case the fallback
     * exit exists for, and the only way to reach it without a second operating system.
     */
    kill(pid: number, signal: string): boolean {
      if (!canRaise) throw new Error(`ENOSYS: ${signal} cannot be raised here`);
      self.raised.push({ pid, signal });
      return true;
    },
    pid: 4242,
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

/** A listener that does nothing but exist, which is the whole point of it. */
const ignore: Listener = () => undefined;

/** The handlers run on a promise, so a signal's consequences land a tick later. */
const settle = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('a signal, when the program has not asked for it', () => {
  it('runs the handlers and re-raises the signal at this process', async () => {
    const proc = fakeProcess();
    const closeout = install({ process: proc });
    let ran = 0;
    closeout.onExit(() => {
      ran += 1;
    });

    proc.raise('SIGINT');
    await settle();

    expect(ran).toBe(1);
    // `exit(130)` and a real SIGINT are different events to the parent, and only one of
    // them sets `WIFSIGNALED`. This case is what the fake can see; `signal.test.ts` grades
    // the consequence on a child that is really killed.
    expect(proc.raised, 'the signal goes back to this pid under its own name').toEqual([{ pid: 4242, signal: 'SIGINT' }]);
  });

  it('comes off the event before raising, so the raise cannot re-enter it', async () => {
    const proc = fakeProcess();
    install({ process: proc });

    expect(proc.listenerCount('SIGINT')).toBe(1);
    proc.raise('SIGINT');
    await settle();

    // This is the half closeout already had and the half that makes the other half safe:
    // `signal-exit` spells it `this.unload()`, and it is why "re-raising re-enters this
    // listener" — the argument this package used to make — was never true.
    expect(proc.listenerCount('SIGINT'), 'nothing is left to catch the re-raise').toBe(0);
  });

  it('falls back to the POSIX code on a runtime that cannot raise the signal', async () => {
    // Windows asked to raise SIGHUP: `ENOSYS`. closeout does not read `process.platform`
    // (R7), so it tries and takes the refusal as the answer — where `signal-exit` branches
    // on the platform and substitutes SIGINT.
    const proc = fakeProcess({ canRaise: false });
    install({ process: proc });

    proc.raise('SIGHUP');
    await settle();

    expect(proc.raised, 'the raise was refused').toEqual([]);
    expect(proc.exited, 'and a process that will not go is the one failure this package is named for').toBe(129);
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
    // The guard the re-raise must not cost. An unconditional raise would deliver one Ctrl-C
    // to the program twice — its own handler catching what we sent — which reads as a
    // double SIGINT to a program that debounces one.
    expect(proc.raised, 'and nothing is re-raised into the handler it belongs to').toEqual([]);
  });

  it('leaves the program’s handler installed, having removed only its own', async () => {
    const proc = fakeProcess();
    install({ process: proc });
    proc.on('SIGINT', ignore);

    expect(proc.listenerCount('SIGINT')).toBe(2);
    proc.raise('SIGINT');
    await settle();

    // One listener left, and it is the program's: ours comes off so a second Ctrl-C reaches
    // the program directly rather than replaying a shutdown that already happened.
    expect(proc.listenerCount('SIGINT')).toBe(1);
  });
});
