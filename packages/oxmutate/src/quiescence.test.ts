import { spawn } from 'node:child_process';
import { clearTimeout as namedClearTimeout, setTimeout as namedSetTimeout } from 'node:timers';
import { setTimeout as sleep } from 'node:timers/promises';
import { promisify } from 'node:util';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { confirmStep, DeadlockError, floorTaken, isDeadlock, MIN_CONFIRM_MS, pendingTimerCount, quiet, QUIET_OTHER_SHARE, QUIET_SELF_SHARE, rpcInFlightCount, takeFloor, trackRpc, trackTimers, watch, withinFloor } from './quiescence.js';

// The global setTimeout before any test tracks timers: a wait that the count never sees.
const { setTimeout: untracked } = globalThis;

/** Turn the event loop with immediates for `ms`: busy, every step settled, nothing pending between them. */
const spin = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    const end = performance.now() + ms;
    const step = (): void => {
      if (performance.now() >= end) resolve();
      else setImmediate(step);
    };
    step();
  });

/** Each wait that can end lasts this long: past MIN_CONFIRM_MS, so a detector that misfires calls it a deadlock. */
const WAIT_MS = MIN_CONFIRM_MS * 2;
/** A confirm window past the shortest, to show the call waits for it. */
const LONG_WINDOW_MS = MIN_CONFIRM_MS * 2;
/**
 * The cases that expect a deadlock wait on something that never ends. Bounded here, so a mutant of
 * quiescence.ts that stops the detector fails its case in seconds instead of holding the mutation
 * run until the package's 90 s test timeout (the PR lane ran 354 minutes on it, 2026-11-03).
 */
const DEADLOCK_CASE_MS = 5000;

/** A reading every condition of a deadlock holds for; each case below breaks one. */
const still = { selfShare: 0, otherShare: 0, rpcInFlight: 0, pendingTimers: 0, withinFloor: true };

describe('quiet: a sample is quiet only when every condition of a deadlock holds', () => {
  it('reads a worker with nothing to do as quiet', () => {
    expect(quiet(still)).toBe(true);
  });
  it.each([
    ['its own thread burned CPU', { selfShare: QUIET_SELF_SHARE }],
    ["Vitest's main thread worked (a module transform)", { otherShare: QUIET_OTHER_SHARE }],
    ['a call to the main thread is in flight', { rpcInFlight: 1 }],
    ['a timer will still fire, ref’d or not', { pendingTimers: 1 }],
    ['it holds a resource beyond its floor (a child, a socket, a ref’d timer)', { withinFloor: false }],
  ])('reads it as busy when %s', (_, change) => {
    expect(quiet({ ...still, ...change })).toBe(false);
  });
});

// The waits a mutant leaves behind, run in this test's own worker thread, as the runner runs them.
describe('watch().guard: a deadlock is called within its confirm window; a wait that can end is never called one', () => {
  const deadlocks = watch();
  beforeAll(() => {
    trackTimers();
    takeFloor();
  });
  afterAll(() => deadlocks.stop());
  /** How long `fn` took under the guard, and whether it was called a deadlock. */
  const timed = async (fn: () => Promise<unknown>, confirmMs = MIN_CONFIRM_MS): Promise<{ ms: number; deadlock: boolean }> => {
    const t0 = performance.now();
    try {
      await deadlocks.guard(fn, confirmMs);
      return { ms: performance.now() - t0, deadlock: false };
    } catch (e) {
      if (!isDeadlock(e)) throw e;
      return { ms: performance.now() - t0, deadlock: true };
    }
  };

  it('calls a promise nothing can settle a deadlock, and promptly (a prompt awaiting a keypress)', { timeout: DEADLOCK_CASE_MS }, async () => {
    const r = await timed(() => new Promise(() => undefined));
    expect(r.deadlock).toBe(true);
    // The old path waited its wall-clock budget, 10–12 s on caique.
    expect(r.ms).toBeLessThan(MIN_CONFIRM_MS + 1500);
  });

  it('never calls a wait on a real timer a deadlock, however long the timer', async () => {
    expect(await timed(() => sleep(WAIT_MS))).toMatchObject({ deadlock: false });
  });

  it('never calls a wait on an unref’d timer a deadlock: Node does not list it, the count does', async () => {
    const r = await timed(() => new Promise((resolve) => setTimeout(resolve, WAIT_MS).unref()));
    expect(r.deadlock).toBe(false);
    expect(pendingTimerCount()).toBe(0);
  });

  it('never calls a wait on a child process a deadlock', async () => {
    expect(await timed(() => new Promise((resolve) => spawn(process.execPath, ['-e', `setTimeout(() => {}, ${String(WAIT_MS)})`]).on('exit', resolve)))).toMatchObject({ deadlock: false });
  });

  it('never calls a run that keeps its loop busy a deadlock', async () => {
    expect(await timed(() => spin(WAIT_MS))).toMatchObject({ deadlock: false });
  });

  it('calls a wait on fake timers nobody advances a deadlock: nothing will move that clock', { timeout: DEADLOCK_CASE_MS }, async () => {
    vi.useFakeTimers();
    try {
      const r = await timed(() => new Promise((resolve) => setTimeout(resolve, 50)));
      expect(r.deadlock).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('holds a deadlock until its confirm window has passed: a longer window, a later call', { timeout: DEADLOCK_CASE_MS }, async () => {
    const r = await timed(() => new Promise(() => undefined), LONG_WINDOW_MS);
    expect(r.deadlock).toBe(true);
    expect(r.ms).toBeGreaterThanOrEqual(LONG_WINDOW_MS);
  });

  it('passes a settled value and a thrown error through unchanged', async () => {
    await expect(deadlocks.guard(() => 7, 0)).resolves.toBe(7);
    await expect(deadlocks.guard(() => Promise.reject(new Error('killed')), 0)).rejects.toThrow('killed');
    expect(new DeadlockError(600).message).toMatch(/deadlocked for 600 ms/);
  });
});

describe('confirmStep: a deadlock is called once the wait has been quiet for the whole confirm window', () => {
  it('opens the window at the start of the first quiet span, and calls nothing before it is full', () => {
    expect(confirmStep({ quietSince: undefined, quiet: true, now: 1000, span: 100, confirmMs: 500 })).toEqual({ quietSince: 900 });
    expect(confirmStep({ quietSince: 900, quiet: true, now: 1399, span: 100, confirmMs: 500 })).toEqual({ quietSince: 900 });
  });
  it('calls a deadlock the moment the window is full, with the age of the wait', () => {
    expect(confirmStep({ quietSince: 900, quiet: true, now: 1400, span: 100, confirmMs: 500 })).toEqual({ quietSince: 900, deadlockMs: 500 });
  });
  it('closes the window on a loud sample', () => {
    expect(confirmStep({ quietSince: 900, quiet: false, now: 1400, span: 100, confirmMs: 500 })).toEqual({ quietSince: undefined });
  });
});

describe('withinFloor: a reading is within its floor only when no kind of resource grew', () => {
  it('reads a kind the floor never held, even once, as over it', () => {
    expect(withinFloor(new Map([['Timeout', 1]]), new Map())).toBe(false);
    expect(withinFloor(new Map([['Timeout', 1]]), new Map([['Timeout', 1]]))).toBe(true);
  });
});

describe('trackTimers: every timer that will still fire is counted until it does, ref’d or not', () => {
  beforeAll(() => trackTimers());

  it('counts a global timeout until it fires, and hands it its arguments', async () => {
    const before = pendingTimerCount();
    const got = await new Promise((resolve) => {
      setTimeout((a: unknown, b: unknown) => resolve([a, b]), 20, 'x', 'y');
      expect(pendingTimerCount()).toBe(before + 1);
    });
    expect(got).toEqual(['x', 'y']);
    expect(pendingTimerCount()).toBe(before);
  });

  it('counts an immediate until it runs', async () => {
    const before = pendingTimerCount();
    const ran = new Promise<string>((resolve) => {
      setImmediate((v: string) => resolve(v), 'ran');
      expect(pendingTimerCount()).toBe(before + 1);
    });
    expect(await ran).toBe('ran');
    expect(pendingTimerCount()).toBe(before);
  });

  it('uncounts a cleared timeout, immediate and interval, and ignores a clear of nothing', () => {
    const before = pendingTimerCount();
    const t = setTimeout(() => undefined, 60_000);
    const i = setImmediate(() => undefined);
    const v = setInterval(() => undefined, 60_000);
    expect(pendingTimerCount()).toBe(before + 3);
    clearTimeout(t);
    clearImmediate(i);
    clearInterval(v);
    clearTimeout(undefined);
    expect(pendingTimerCount()).toBe(before);
  });

  it('counts the timers of node:timers, named in an import that ran before tracking began', () => {
    const before = pendingTimerCount();
    const t = namedSetTimeout(() => undefined, 60_000);
    expect(pendingTimerCount()).toBe(before + 1);
    namedClearTimeout(t);
    expect(pendingTimerCount()).toBe(before);
  });

  it('counts an awaited node:timers/promises timer until it settles', async () => {
    const before = pendingTimerCount();
    const waiting = sleep(20);
    expect(pendingTimerCount()).toBe(before + 1);
    await waiting;
    expect(pendingTimerCount()).toBe(before);
  });

  it('keeps util.promisify(setTimeout) the promise it was', async () => {
    await expect(promisify(setTimeout)(10, 'v')).resolves.toBe('v');
  });

  it('wraps once, however often it is called: one timer counts once', async () => {
    trackTimers();
    trackTimers();
    const before = pendingTimerCount();
    const t = setTimeout(() => undefined, 60_000);
    const waiting = sleep(10);
    expect(pendingTimerCount()).toBe(before + 2);
    clearTimeout(t);
    await waiting;
    expect(pendingTimerCount()).toBe(before);
  });
});

describe('trackRpc: a call to Vitest’s main thread counts while it is in flight', () => {
  it('counts a call that returns a promise until it settles, and passes everything else through as it was', async () => {
    let release: (() => void) | undefined;
    const sym = Symbol('raw');
    const fire = Object.assign(() => 'sent', { asEvent: 'kept' });
    const raw = {
      fetch: () =>
        new Promise<void>((r) => {
          release = r;
        }),
      now: () => 5,
      $close: () => 'raw',
      [sym]: () => 'symbol',
      version: '5',
      fire,
    };
    const state: { rpc?: object } = { rpc: raw };
    trackRpc(state);
    const rpc = state.rpc as typeof raw;
    const call = rpc.fetch();
    expect(rpcInFlightCount()).toBe(1);
    expect(rpc.now()).toBe(5);
    expect(rpcInFlightCount()).toBe(1);
    release?.();
    await call;
    expect(rpcInFlightCount()).toBe(0);
    expect(rpc.$close).toBe(raw.$close);
    expect(rpc[sym]).toBe(raw[sym]);
    expect(rpc.version).toBe('5');
    expect((rpc.fire as unknown as { asEvent: string }).asEvent).toBe('kept');
  });

  it('wraps once, and does nothing without an rpc', () => {
    const state: { rpc?: object } = { rpc: { now: () => 1 } };
    trackRpc(state);
    const first = state.rpc;
    trackRpc(state);
    expect(state.rpc).toBe(first);
    expect(() => trackRpc(undefined)).not.toThrow();
    expect(() => trackRpc({})).not.toThrow();
  });
});

describe('takeFloor and stop', () => {
  it('takes the floor once: a later call keeps the first', () => {
    takeFloor();
    const first = floorTaken();
    expect(first).toBeDefined();
    takeFloor();
    expect(floorTaken()).toBe(first);
  });

  it('calls nothing a deadlock once stopped', { timeout: DEADLOCK_CASE_MS }, async () => {
    trackTimers();
    takeFloor();
    const w = watch();
    w.stop();
    const outcome = await Promise.race([
      w.guard(() => new Promise(() => undefined), MIN_CONFIRM_MS).then(
        () => 'settled',
        (e: unknown) => (isDeadlock(e) ? 'deadlock' : 'error'),
      ),
      new Promise((resolve) => untracked(() => resolve('still waiting'), MIN_CONFIRM_MS * 3)),
    ]);
    expect(outcome).toBe('still waiting');
  });
});
