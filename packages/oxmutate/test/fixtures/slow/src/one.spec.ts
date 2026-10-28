import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { expect, it } from 'vitest';

import { one } from './one.js';

// The first two times a mutant is armed, the test stalls for 8 s, as on a loaded machine: past
// the warm watchdog and the first isolated budget (~5.5 s with this fixture's 4 s timeoutMS),
// well inside 3x that (~16.5 s), so even a machine at load 150 cannot flip it. A
// machine that is slow is not a mutant that runs away, so the verdict must be Killed.
it('returns one', () => {
  const ns = (globalThis as { __oxmutate__?: { activeMutant?: string } }).__oxmutate__;
  if (ns?.activeMutant ?? process.env['__OXMUTATE_ACTIVE_MUTANT__']) {
    const marker = new URL('../reports/slow-count', import.meta.url);
    const count = existsSync(marker) ? Number(readFileSync(marker, 'utf8')) : 0;
    if (count < 2) {
      writeFileSync(marker, String(count + 1));
      const until = Date.now() + 8000;
      while (Date.now() < until);
    }
  }
  expect(one()).toBe(1);
});
