import { describe, expect, it } from 'vitest';

import { LOOP_CPU } from './heartbeat.js';
import { graceOnce, limitOf, stopMs } from './scheduler.js';

const base = { id: 'm1', ran: 1000, stall: 'busy' as const, share: 0.02, limit: 3000 };

describe('graceOnce', () => {
  it('gives a blocked run, busy under LOOP_CPU and inside its limit, that limit once', () => {
    const graced = new Map<string, number>();
    expect(graceOnce(graced, base)).toBe(true);
    expect(graced.get('m1')).toBe(3000);
    expect(graceOnce(graced, base)).toBe(false);
  });
  it('never graces a loop: half a core or more is one', () => {
    expect(LOOP_CPU).toBe(0.5);
    expect(graceOnce(new Map(), { ...base, share: 0.6 })).toBe(false);
    expect(graceOnce(new Map(), { ...base, share: 0.49 })).toBe(true);
  });
  it('never graces an idle stall, an unread CPU share, no limit, or a limit already passed', () => {
    expect(graceOnce(new Map(), { ...base, stall: 'idle' })).toBe(false);
    expect(graceOnce(new Map(), { ...base, share: undefined })).toBe(false);
    expect(graceOnce(new Map(), { ...base, limit: undefined })).toBe(false);
    expect(graceOnce(new Map(), { ...base, limit: 1000 })).toBe(false);
    expect(graceOnce(new Map(), { ...base, limit: 1001 })).toBe(true);
  });
});

describe('limitOf', () => {
  it('is the budget, or the grace a mutant was given when that is more', () => {
    expect(limitOf(undefined, 750)).toBe(750);
    expect(limitOf(2300, 750)).toBe(2300);
    // Graced in a short test, then in a test with the larger budget: the budget holds.
    expect(limitOf(2300, 5000)).toBe(5000);
  });
});

describe('stopMs', () => {
  it('lists a stopped run’s time in whole ms, and nothing for a unit that was not stopped', () => {
    expect(stopMs({ killedFor: 'm1', ranMs: 2291.6 })).toEqual([2292]);
    expect(stopMs({ killedFor: 'm1' })).toEqual([0]);
    expect(stopMs({ ranMs: 900 })).toEqual([]);
    expect(stopMs({})).toEqual([]);
  });
});
