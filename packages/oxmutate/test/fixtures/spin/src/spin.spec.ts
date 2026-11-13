import { writeFileSync } from 'node:fs';

import { expect, it } from 'vitest';

import { one } from './spin.js';

// Spins for ever once oxmutate runs it, so a server is mid-runaway when its coordinator dies.
// It says so first, in a file under the path the e2e test hands it (T6 in e2e.test.ts), so the
// test kills the coordinator on that event rather than after a guess at how long a busy machine
// takes to get this far.
it('spins under oxmutate', () => {
  if (process.env['OXMUTATE_MODE']) {
    const marker = process.env['OXMUTATE_E2E_MARKER'];
    if (marker) writeFileSync(`${marker}.spinning-${String(process.pid)}`, '');
    for (;;);
  }
  expect(one()).toBe(1);
});
