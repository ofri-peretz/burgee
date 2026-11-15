import { describe, expect, it } from 'vitest';

import { LOOP_CPU } from './heartbeat.js';
import { graceOnce } from './scheduler.js';

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
