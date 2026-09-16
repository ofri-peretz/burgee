/**
 * E5 and O5 — the two requirements burgee's design marks `R` and which nothing delivered.
 *
 * `exit-code.ts` has declared `SIGINT: 130` with the comment *"SIGINT after the terminal
 * was restored (E5)"* since the contract was written, and `exit-code-lock.test.ts` grades
 * that no other literal reaches an exit. Neither of them can see the thing that was
 * actually missing: **no code path produced 130, and nothing restored anything.** A
 * constant is not an implementation, and `grep -rn SIGINT packages/burgee/src` returned
 * the declaration and nothing else.
 *
 * O5 is the same shape one line down — *"stdout is flushed before any exit path"*, evidence
 * yargs #1519 and #2118, *"No truncated JSON"* — against `host.exit(code)`, which is
 * `process.exit` and truncates a pipe by definition.
 *
 * Both are `closeout`'s job, stated in closeout's own words: bound every exit path, run the
 * handlers exactly once, hand the terminal back last. So these assert the composition rather
 * than a reimplementation of it, and the first two would fail against a burgee that wrote
 * its own SIGINT listener just as loudly as against the one that wrote none.
 *
 * No real signals. `install({ process })` is closeout's seam (its design R7), so a signal
 * here is a function call — the same fake-process shape `closeout/src/matrix.test.ts` uses.
 */
import { type ProcessLike } from 'closeout';
import { describe, expect, it } from 'vitest';

import { defineCommand, defineProgram, runCommand } from './execute.js';
import { ExitCode } from './exit-code.js';
import { detachedTeardown, processTeardown, type Drainable } from './shutdown.js';

type Listener = (...args: never[]) => void;

/** A listener that does nothing but exist, which is the whole point of it. */
const ignore: Listener = () => undefined;

interface FakeProcess extends ProcessLike {
  raise(event: string, ...args: unknown[]): void;
  readonly exited: number | undefined;
}

/** A process that records rather than leaves, so a SIGINT is a call and an exit is a number. */
function fakeProcess(): FakeProcess {
  const listeners = new Map<string, Listener[]>();
  const self: FakeProcess = {
    exited: undefined,
    on(event: string, listener: Listener) {
      listeners.set(event, [...(listeners.get(event) ?? []), listener]);
      return self;
    },
    removeListener(event: string, listener: Listener) {
      listeners.set(
        event,
        (listeners.get(event) ?? []).filter((known) => known !== listener),
      );
      return self;
    },
    listenerCount(event: string): number {
      return (listeners.get(event) ?? []).length;
    },
    exit(code?: number): never {
      (self as { exited: number | undefined }).exited = code;
      return undefined as never;
    },
    stderr: { write: () => true, isTTY: false },
    raise(event: string, ...args: unknown[]): void {
      for (const listener of [...(listeners.get(event) ?? [])]) (listener as (...a: unknown[]) => void)(...args);
    },
  };
  return self;
}

/** A stream with bytes in it that only come out when somebody waits for the drain. */
function backedUpStream(): Drainable & { readonly flushed: boolean } {
  let waiting: (() => void) | undefined;
  const self = {
    writableLength: 8,
    flushed: false,
    write(_chunk: string, callback?: () => void): boolean {
      waiting = callback;
      // The drain is not synchronous — a stream that called back in the same tick would
      // pass this suite whether or not anybody awaited it, which is the failure mode the
      // control case below exists to rule out.
      setTimeout(() => {
        self.writableLength = 0;
        (self as { flushed: boolean }).flushed = true;
        waiting?.();
      }, 0);
      return false;
    },
  };
  return self as Drainable & { readonly flushed: boolean };
}

/** Long enough for closeout's own promise chain to settle after a raised signal. */
const settle = async (): Promise<void> => {
  await new Promise((done) => setTimeout(done, 20));
};

describe('E5 — a signal runs the program’s cleanup and leaves with 130', () => {
  it('runs a handler registered by the run, on a signal the run never sees', async () => {
    const proc = fakeProcess();
    const teardown = processTeardown([], proc);
    const ran: string[] = [];
    teardown.add(() => void ran.push('released the lock'), 'the lock');

    proc.raise('SIGINT');
    await settle();

    expect(ran).toEqual(['released the lock']);
  });

  it('leaves with the code E1 declares for SIGINT, and does not invent one of its own', async () => {
    const proc = fakeProcess();
    processTeardown([], proc);

    proc.raise('SIGINT');
    await settle();

    // Read from the contract, not written as 130: this is the assertion that catches
    // closeout changing its POSIX table out from under the E1 constant, which is the only
    // way the two packages can drift now that burgee no longer owns the listener.
    expect(proc.exited).toBe(ExitCode.SIGINT);
  });

  it('stands down when the program installed its own SIGINT listener', async () => {
    const proc = fakeProcess();
    const teardown = processTeardown([], proc);
    const ran: string[] = [];
    teardown.add(() => void ran.push('cleanup'));
    // A program that listens for SIGINT has asked to own it. Cleanup still runs; the
    // decision about what happens next stays with the program.
    proc.on('SIGINT', ignore);

    proc.raise('SIGINT');
    await settle();

    expect(ran).toEqual(['cleanup']);
    expect(proc.exited).toBeUndefined();
  });

  it('runs a handler exactly once when the run and a signal both end it', async () => {
    const proc = fakeProcess();
    const teardown = processTeardown([], proc);
    let runs = 0;
    teardown.add(() => void (runs += 1));

    await teardown.run(ExitCode.OK);
    proc.raise('SIGINT');
    await settle();

    expect(runs).toBe(1);
  });
});

describe('O5 — the streams are drained before the exit, not after it', () => {
  it('waits for a backed-up stream before the run is allowed to leave', async () => {
    const stream = backedUpStream();
    const teardown = detachedTeardown([stream]);

    await teardown.run(ExitCode.OK);

    expect(stream.flushed).toBe(true);
  });

  it('control: the stream is not flushed by the act of registering it', () => {
    const stream = backedUpStream();
    detachedTeardown([stream]);
    // If this ever reads `true`, the assertion above passes for a reason that has nothing
    // to do with anybody awaiting a drain.
    expect(stream.flushed).toBe(false);
  });

  it('drains ahead of the terminal restore, because the phase says so and not the order', () => {
    const teardown = detachedTeardown([backedUpStream()]);
    // `flush` before `release` before `restore` is closeout's ordering, and burgee's drain
    // is in the first of them. Registered *after* a caller's cleanup and still ahead of it.
    teardown.add(() => undefined);
    expect(teardown.registry.count('flush')).toBe(1);
    expect(teardown.registry.count('release')).toBe(1);
  });
});

describe('the harness owns no process', () => {
  it('runs a command’s cleanup without attaching a listener to anything', async () => {
    const before = process.listenerCount('SIGINT');
    const ran: string[] = [];
    const program = defineProgram({
      name: 'demo',
      commands: [
        defineCommand({
          name: 'tidy',
          run: (ctx) => {
            ctx.onExit(() => void ran.push('cleaned up'), 'the temp directory');
            return { ok: true };
          },
        }),
      ],
    });

    const result = await runCommand(program, ['tidy']);

    expect(result.code).toBe(ExitCode.OK);
    expect(ran).toEqual(['cleaned up']);
    // The harness injects an exit, so burgee owns no process here and must attach nothing
    // to the one the test runner is itself using.
    expect(process.listenerCount('SIGINT')).toBe(before);
  });

  it('runs cleanup when the command exits itself, which is the path that could not before', async () => {
    const ran: string[] = [];
    const program = defineProgram({
      name: 'demo',
      commands: [
        defineCommand({
          name: 'bail',
          run: (ctx) => {
            ctx.onExit(() => void ran.push('cleaned up'), 'the temp directory');
            return ctx.exit(ExitCode.CONFIG);
          },
        }),
      ],
    });

    const result = await runCommand(program, ['bail']);

    // `ctx.exit` used to call the injected exit and *then* throw. On a run that owns the
    // process that first half is `process.exit`, so the handler above was registered and
    // never ran — the exit left before anything could be cleaned up. It throws only now.
    expect(result.code).toBe(ExitCode.CONFIG);
    expect(result.stderr).toBe('');
    expect(ran).toEqual(['cleaned up']);
  });
});
