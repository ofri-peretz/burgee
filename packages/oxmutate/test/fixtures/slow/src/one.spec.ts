import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { expect, it } from 'vitest';

import { one } from './one.js';

// The first time each mutant is armed, the test stalls for 8 s, as on a loaded machine: past
// the warm watchdog and the first isolated budget (~5.5 s with this fixture's 4 s timeoutMS),
// well inside 3x that (~16.5 s), so even a machine at load 150 cannot flip it. A
// machine that is slow is not a mutant that runs away, so the verdict must be Killed.
it('returns one', () => {
  const ns = (globalThis as { __oxmutate__?: { activeMutant?: string } }).__oxmutate__;
  const active = ns?.activeMutant ?? process.env['__OXMUTATE_ACTIVE_MUTANT__'];
  if (active) {
    // One marker per mutant: a re-run may start before the other mutant's first run, and must not stall for it.
    const marker = new URL(`../reports/slow-count-${active.replace(/\W/gu, '_')}`, import.meta.url);
    const count = existsSync(marker) ? Number(readFileSync(marker, 'utf8')) : 0;
    if (count < 1) {
      writeFileSync(marker, String(count + 1));
      const until = Date.now() + 8000;
      while (Date.now() < until);
    }
  }
  expect(one()).toBe(1);
});
