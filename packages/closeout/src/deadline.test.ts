/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * The bound, and the two values it refuses (design R3).
 *
 * Both refusals happen at **registration** — `install()` / `createRegistry()` — rather than
 * at the shutdown they would have ruined. That is the difference between a caller seeing
 * their mistake on the line they wrote and seeing it once, at three in the morning, in the
 * one shutdown that mattered.
 */
import { describe, expect, it, vi } from 'vitest';

import { assertDeadline, DeadlineError, DEFAULT_DEADLINE, startDeadline } from './deadline.js';
import { createRegistry, install } from './index.js';

/** Timers that keep this process alive — an unref'd one is not listed. */
const holding = (): number => process.getActiveResourcesInfo().filter((r) => r === 'Timeout').length;

describe('a deadline that cannot bound anything is refused where it is written', () => {
  it.each([
    ['Infinity', Number.POSITIVE_INFINITY],
    ['zero', 0],
    ['a negative number', -1],
    ['NaN', Number.NaN],
  ])('%s', (_name, value) => {
    expect(() => createRegistry({ deadline: value })).toThrow(DeadlineError);
    // Called the way a user calls it — no injected process — because the refusal has to
    // reach the person who wrote the number, and `install()` is where they wrote it. The
    // registry is built before a single listener is attached, so this throws without ever
    // touching the real process.
    expect(() => install({ deadline: value })).toThrow(DeadlineError);
  });

  it('classifies the refusal and says what to do instead', () => {
    try {
      assertDeadline(Number.POSITIVE_INFINITY);
      expect.unreachable('Infinity must not be accepted');
    } catch (error) {
      const refusal = error as DeadlineError;
      // The family's one error vocabulary: a code that classifies, a fix that is actionable.
      expect(refusal.code).toBe('USAGE');
      expect(refusal.fix).toContain('finite');
      expect(refusal.message).toContain('Infinity');
    }
  });

  // Each refusal whole — class name, message and fix — because that sentence is what the caller
  // reads at the line they wrote. A string is not a number even when it reads as one.
  it.each([
    [Number.NaN, 'closeout: a deadline must be a number of milliseconds; got NaN', 'pass a finite positive number — the default is 2000'],
    ['100', 'closeout: a deadline must be a number of milliseconds; got 100', 'pass a finite positive number — the default is 2000'],
    [0, 'closeout: a deadline of 0 leaves no time for any handler to run', 'pass a positive number of milliseconds; to skip the handlers, do not register them'],
  ])('refuses %s with its own message and fix', (value, message, fix) => {
    try {
      assertDeadline(value as number);
      expect.unreachable('the value must be refused');
    } catch (error) {
      const { name, message: said, fix: told } = error as DeadlineError;
      expect({ name, said, told }).toEqual({ name: 'DeadlineError', said: message, told: fix });
    }
  });

  it('defaults to two seconds', () => {
    expect(DEFAULT_DEADLINE).toBe(2000);
  });

  it('accepts every finite positive value, however large — the rule is "it ends", not "it is short"', () => {
    expect(assertDeadline(1)).toBe(1);
    expect(assertDeadline(600_000)).toBe(600_000);
    expect(assertDeadline(DEFAULT_DEADLINE)).toBe(DEFAULT_DEADLINE);
  });
});

describe('the clock itself', () => {
  it('reports expiry and resolves when it does', async () => {
    const clock = startDeadline(5, false);
    expect(clock.expired).toBe(false);
    await clock.reached;
    expect(clock.expired).toBe(true);
    clock.cancel();
  });

  it('holds the event loop open only when asked to, and lets go on cancel', () => {
    const before = holding();
    const held = startDeadline(60_000, true);
    expect(holding()).toBe(before + 1);
    held.cancel();
    expect(holding()).toBe(before);
    const loose = startDeadline(60_000, false);
    expect(holding()).toBe(before);
    loose.cancel();
  });

  it('starts where a timer is a bare number with no unref, as in a browser or Deno', async () => {
    vi.stubGlobal('setTimeout', () => 1);
    vi.stubGlobal('clearTimeout', () => undefined);
    try {
      const clock = startDeadline(5, false);
      // `reached` never rejects: a missing unref is not a reason for the clock to break.
      let broke: unknown;
      clock.reached.catch((error: unknown) => {
        broke = error;
      });
      await Promise.resolve();
      expect(broke).toBeUndefined();
      expect(() => clock.cancel()).not.toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('cancels without firing, so a clean shutdown pays nothing for the bound', async () => {
    const clock = startDeadline(5, false);
    clock.cancel();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(clock.expired).toBe(false);
  });
});

describe('the deadline stops waiting for a phase; it never skips one', () => {
  it('still runs restore after a handler hung in flush', async () => {
    const order: string[] = [];
    const registry = createRegistry({ deadline: 10, onTimeout: () => undefined });
    registry.add(() => {
      order.push('flush-started');
      return new Promise<void>(() => undefined);
    }, 'flush');
    registry.add(() => {
      order.push('restore');
    }, 'restore');

    const report = await registry.run({ code: 0, signal: null });

    // A handler that hangs in `flush` must not get to decide that the cursor stays hidden —
    // this package producing its own headline failure through the machinery meant to
    // prevent it.
    expect(order).toEqual(['flush-started', 'restore']);
    expect(report.timedOut).toBe(true);
  });
});
