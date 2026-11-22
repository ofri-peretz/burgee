import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { expect, it } from 'vitest';

import { one } from './one.js';

// The first time its mutant is armed the test stalls for 8 s, past the first isolated budget, so the
// stop is re-run; the re-run does not stall, and the verdict is Killed.
it('returns one', () => {
  const ns = (globalThis as { __oxmutate__?: { activeMutant?: string } }).__oxmutate__;
  if (ns?.activeMutant ?? process.env['__OXMUTATE_ACTIVE_MUTANT__']) {
    const marker = new URL('../reports/chase-count', import.meta.url);
    const count = existsSync(marker) ? Number(readFileSync(marker, 'utf8')) : 0;
    if (count < 1) {
      writeFileSync(marker, String(count + 1));
      const until = Date.now() + 8000;
      while (Date.now() < until);
    }
  }
  expect(one).toBe(1);
});
