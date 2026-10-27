import { expect, it } from 'vitest';

import { one } from './spin.js';

// Spins for ever once oxmutate runs it, so a server is mid-runaway when its coordinator dies.
it('spins under oxmutate', () => {
  if (process.env['OXMUTATE_MODE']) for (;;);
  expect(one()).toBe(1);
});
