import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { it } from 'vitest';

import { one } from './one.js';

// Asserts nothing, so the mutant survives. The first time the mutant is armed through the
// environment — the survivor-confirmation run, not the warm one — the test stalls for 6 s, past
// that run's budget: a slow machine, not a kill, so the mutant must stay a survivor.
it('calls one', () => {
  if (process.env['__OXMUTATE_ACTIVE_MUTANT__']) {
    const marker = new URL('../reports/stall-count', import.meta.url);
    const count = existsSync(marker) ? Number(readFileSync(marker, 'utf8')) : 0;
    if (count < 1) {
      writeFileSync(marker, String(count + 1));
      const until = Date.now() + 6000;
      while (Date.now() < until);
    }
  }
  one();
});
