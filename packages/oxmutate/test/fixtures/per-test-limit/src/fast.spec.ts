import { expect, it } from 'vitest';

import { hang } from './hang.js';

const HANG_MS = 60_000;

// A 1 ms test over the line. While its mutant is armed it never returns: a busy loop.
it('reads it', () => {
  if ((globalThis as { __oxmutate__?: { activeMutant?: string } }).__oxmutate__?.activeMutant ?? process.env['__OXMUTATE_ACTIVE_MUTANT__']) {
    const until = Date.now() + HANG_MS;
    while (Date.now() < until);
  }
  expect(hang(0)).toBe(1);
});
