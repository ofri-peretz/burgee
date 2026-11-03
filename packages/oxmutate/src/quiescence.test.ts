import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { DeadlockError, isDeadlock, MIN_CONFIRM_MS, pendingTimerCount, quiet, QUIET_OTHER_SHARE, QUIET_SELF_SHARE, takeFloor, trackTimers, watch } from './quiescence.js';

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
  beforeAll(async () => {
    await trackTimers();
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

  it('calls a promise nothing can settle a deadlock, and promptly (a prompt awaiting a keypress)', async () => {
    const r = await timed(() => new Promise(() => undefined));
    expect(r.deadlock).toBe(true);
    // The old path waited its wall-clock budget, 10–12 s on caique.
    expect(r.ms).toBeLessThan(MIN_CONFIRM_MS + 1500);
  });

  it('never calls a wait on a real timer a deadlock, however long the timer', async () => {
    expect(await timed(() => sleep(1500))).toMatchObject({ deadlock: false });
  });

  it('never calls a wait on an unref’d timer a deadlock: Node does not list it, the count does', async () => {
    const r = await timed(() => new Promise((resolve) => setTimeout(resolve, 1200).unref()));
    expect(r.deadlock).toBe(false);
    expect(pendingTimerCount()).toBe(0);
  });

  it('never calls a wait on a child process a deadlock', async () => {
    expect(await timed(() => new Promise((resolve) => spawn(process.execPath, ['-e', 'setTimeout(() => {}, 1200)']).on('exit', resolve)))).toMatchObject({ deadlock: false });
  });

  it('never calls a run that keeps its loop busy a deadlock', async () => {
    const spin = async (): Promise<void> => {
      const end = performance.now() + 1200;
      while (performance.now() < end) await new Promise<void>((r) => setImmediate(r));
    };
    expect(await timed(spin)).toMatchObject({ deadlock: false });
  });

  it('calls a wait on fake timers nobody advances a deadlock: nothing will move that clock', async () => {
    vi.useFakeTimers();
    try {
      const r = await timed(() => new Promise((resolve) => setTimeout(resolve, 50)));
      expect(r.deadlock).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('holds a deadlock until its confirm window has passed: a longer window, a later call', async () => {
    const r = await timed(() => new Promise(() => undefined), 1500);
    expect(r.deadlock).toBe(true);
    expect(r.ms).toBeGreaterThanOrEqual(1500);
  });

  it('passes a settled value and a thrown error through unchanged', async () => {
    await expect(deadlocks.guard(() => 7, 0)).resolves.toBe(7);
    await expect(deadlocks.guard(() => Promise.reject(new Error('killed')), 0)).rejects.toThrow('killed');
    expect(new DeadlockError(600).message).toMatch(/deadlocked for 600 ms/);
  });
});
