import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { it } from 'vitest';

import { one } from './one.js';

const STALL_MS = 6000;

// Two tests call `one` and assert nothing, so its mutants survive, and with two covering tests each
// survivor is confirmed by an isolated run (a survivor with one covering test is not: confirm.qnt).
// The first time a mutant is armed through the environment, in that confirmation run, the test
// stalls for 6 s in a loop, past the run's budget: a slow machine, not a kill, so the mutant is
// re-run with 3x the budget and stays a survivor.
it('calls one', () => {
  if (process.env['__OXMUTATE_ACTIVE_MUTANT__']) {
    const marker = new URL('../reports/stall-count', import.meta.url);
    const count = existsSync(marker) ? Number(readFileSync(marker, 'utf8')) : 0;
    if (count < 1) {
      writeFileSync(marker, String(count + 1));
      const until = Date.now() + STALL_MS;
      while (Date.now() < until);
    }
  }
  one();
});

it('calls one again', () => {
  one();
});
