/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * The shutdown matrix (design R1, R3, R10): every door out of a program, crossed with a
 * handler that never returns.
 *
 * The design calls this "the product, not a check on it", and that is the literal truth of
 * it. `signal-exit` has 198.9 M weekly downloads and no notion of time, so the cell that
 * matters most here — a registered handler of `() => new Promise(() => {})` — has no
 * counterpart in any incumbent's suite: run against `signal-exit` the process simply never
 * ends, which is not a failing assertion but a test run that has to be killed. Every cell
 * below asserts two things about that case: the process leaves anyway, **and** the report
 * names the handler that did not come back.
 *
 * No real signals are sent. `install({ process })` takes the process as an argument (R7), so
 * a signal here is a function call and a hang is a promise nobody resolves.
 */
import { describe, expect, it } from 'vitest';

import { install, SIGNALS, type ProcessLike } from './index.js';
import { type ShutdownReport } from './report.js';

type Listener = (...args: never[]) => void;

interface FakeProcess extends ProcessLike {
  /** Deliver an event the way Node would, with whatever arguments it carries. */
  raise(event: string, ...args: unknown[]): void;
  /** The code passed to `exit()`, or `undefined` if the process was never told to leave. */
  readonly exited: number | undefined;
  exitCode: number | undefined;
}

function fakeProcess(): FakeProcess {
  const listeners = new Map<string, Listener[]>();
  const self: FakeProcess = {
    exited: undefined,
    exitCode: undefined,
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
      // Recorded rather than thrown: `leave` runs inside a promise chain, and a throw there
      // would surface as an unhandled rejection rather than as this assertion.
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

/** Long enough for a 10 ms deadline to fire and for the promise chain behind it to settle. */
const pastTheDeadline = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 40));
};

/** A handler that never comes back. A socket that will not close, spelled in one line. */
const neverReturns = (): Promise<void> => new Promise<void>(() => undefined);

/** A listener that does nothing but exist, which is the whole point of it. */
const ignore: Listener = () => undefined;

/** A named handler that hangs: the report has to find this name without being told it. */
function closeTheDatabase(): Promise<void> {
  return neverReturns();
}

/**
 * POSIX: a signal's exit code is 128 plus its number, and this table is written out rather
 * than imported so that a change to the implementation's own table has to be made twice.
 *
 * Neither `exit` nor `beforeExit` appears here, because neither is a door this package
 * pushes a program through: `'exit'` means Node is already leaving and `'beforeExit'` means
 * it chose to, so calling `exit()` on either would be closeout overwriting a code somebody
 * else set — precisely what R10 forbids.
 */
const SIGNAL_CODES: Record<string, number> = { SIGINT: 130, SIGTERM: 143, SIGHUP: 129, SIGQUIT: 131, SIGBREAK: 149 };

describe('every signal runs the handlers exactly once and leaves with the signal’s own code', () => {
  it.each([...SIGNALS])('%s', async (signal) => {
    const proc = fakeProcess();
    const closeout = install({ process: proc });
    let ran = 0;
    closeout.onExit(() => {
      ran += 1;
    });

    proc.raise(signal);
    proc.raise(signal);
    await pastTheDeadline();

    expect(ran, 'two arrivals of the same signal are one shutdown').toBe(1);
    expect(proc.exited).toBe(SIGNAL_CODES[signal]);
  });
});

describe('a handler that never returns', () => {
  /**
   * The cell the package exists for. Each case registers a handler that never settles and
   * asserts the process leaves anyway, inside the deadline, naming the handler.
   */
  const hangingInstall = (proc: FakeProcess): ShutdownReport[] => {
    const reports: ShutdownReport[] = [];
    const closeout = install({
      process: proc,
      deadline: 10,
      onTimeout: (report) => reports.push(report),
    });
    closeout.onExit(neverReturns, { label: 'the-socket-that-will-not-close' });
    return reports;
  };

  it('does not stop a signal from ending the process, and is named in the report', async () => {
    const proc = fakeProcess();
    const reports = hangingInstall(proc);

    proc.raise('SIGINT');
    await pastTheDeadline();

    expect(proc.exited, 'Ctrl-C must not need a second Ctrl-C').toBe(130);
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ path: 'signal', signal: 'SIGINT', timedOut: true, unfinished: ['the-socket-that-will-not-close'] });
  });

  it('does not stop an uncaught exception from ending the process', async () => {
    const proc = fakeProcess();
    const reports = hangingInstall(proc);
    const boom = new Error('mid-render');

    proc.raise('uncaughtException', boom);
    await pastTheDeadline();

    expect(proc.exited).toBe(1);
    expect(reports[0]).toMatchObject({ path: 'uncaught', error: boom, timedOut: true, unfinished: ['the-socket-that-will-not-close'] });
  });

  it('does not stop an unhandled rejection from ending the process', async () => {
    const proc = fakeProcess();
    const reports = hangingInstall(proc);

    proc.raise('unhandledRejection', 'a string nobody caught');
    await pastTheDeadline();

    expect(proc.exited).toBe(1);
    expect(reports[0]).toMatchObject({ path: 'rejection', error: 'a string nobody caught', timedOut: true });
  });

  it('does not hold the process open on beforeExit, and does not invent a code for it', async () => {
    const proc = fakeProcess();
    const reports = hangingInstall(proc);

    proc.raise('beforeExit', 0);
    await pastTheDeadline();

    expect(reports[0]).toMatchObject({ path: 'beforeExit', timedOut: true });
    expect(proc.exited, 'the program was already leaving; closeout does not push it').toBeUndefined();
  });

  it('is reported on the exit path too, where Node gives it no time at all', () => {
    const proc = fakeProcess();
    const closeout = install({ process: proc, deadline: 10 });
    closeout.onExit(neverReturns, { label: 'the-socket-that-will-not-close' });

    proc.raise('exit', 7);

    // `'exit'` cannot await, so the handler is invoked and abandoned. Saying so is the
    // honest answer: a caller who asked for asynchronous work on this path needs to know it
    // could not happen, rather than reading a silent success.
    expect(closeout.registry.report).toMatchObject({ path: 'exit', code: 7, unfinished: ['the-socket-that-will-not-close'] });
  });
});

describe('the exit code is the program’s, on every path (R10)', () => {
  it('a handler running after process.exit(3) cannot change the observed code', () => {
    const proc = fakeProcess();
    proc.exitCode = 3;
    const closeout = install({ process: proc });
    closeout.onExit((report) => {
      // The sort of thing a handler does on its way past, and the reason this is a
      // requirement rather than an assumption.
      proc.exitCode = 0;
      expect(report.code).toBe(3);
    });

    proc.raise('exit', 3);

    expect(closeout.registry.report?.code, 'the report carries the code the process is leaving with').toBe(3);
    expect(proc.exited, 'nothing on the exit path calls exit(): the process is already going').toBeUndefined();
  });

  it('a breached deadline exits with the signal’s code, not with one a handler set on its way past', async () => {
    const proc = fakeProcess();
    const closeout = install({ process: proc, deadline: 10, onTimeout: () => undefined });
    // The plausible wrong implementation reads `proc.exitCode` when it leaves rather than
    // capturing the code at the trigger — so a handler that tidies `exitCode` to 0 turns a
    // SIGTERM into a success, and nothing downstream can tell the difference.
    closeout.onExit(() => {
      proc.exitCode = 0;
    });
    closeout.onExit(neverReturns);

    proc.raise('SIGTERM');
    await pastTheDeadline();

    expect(proc.exited).toBe(143);
  });

  it('leaves a program that owns the signal to decide, hung handler or not', async () => {
    const proc = fakeProcess();
    const closeout = install({ process: proc, deadline: 10, onTimeout: () => undefined });
    closeout.onExit(neverReturns);
    proc.on('SIGINT', ignore);

    proc.raise('SIGINT');
    await pastTheDeadline();

    expect(proc.exited, 'the program installed its own handler; the exit is its call').toBeUndefined();
  });
});

describe('the handler is named however little the caller said', () => {
  it('falls back to the function’s own name, then to (anonymous)', async () => {
    const proc = fakeProcess();
    const reports: ShutdownReport[] = [];
    const closeout = install({ process: proc, deadline: 10, onTimeout: (r) => reports.push(r) });
    closeout.onExit(closeTheDatabase);
    closeout.onExit(() => neverReturns());

    proc.raise('SIGINT');
    await pastTheDeadline();

    expect(reports[0]?.unfinished).toEqual(['closeTheDatabase', '(anonymous)']);
  });
});
