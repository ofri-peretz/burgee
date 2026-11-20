import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { expect, it } from 'vitest';

import { add, sub, tick } from './calc.js';

// A test whose coverage changes from one dry run to the next, so oxmutate's two dry runs disagree on
// it and call it flaky: it reaches `tick` in every dry-run execution but the first. Those are counted
// (OXMUTATE_MODE, child.ts) in the file OXMUTATE_FLAKY_COUNTER names (e2e.test.ts); the second dry run
// runs beside the warm phase, so only dry runs count. Without the variable the test is steady. Its
// verdicts are not flaky: it always checks `sub` and never `add`.
const counter = process.env['OXMUTATE_FLAKY_COUNTER'];
const dry = process.env['OXMUTATE_MODE'] === 'dry';

it('subtracts, and reaches tick in a later dry run', () => {
  const runs = counter && existsSync(counter) ? Number(readFileSync(counter, 'utf8')) : 0;
  if (counter && dry) writeFileSync(counter, String(runs + 1));
  if (dry && runs > 0) tick(runs);
  add(1, 1);
  expect(sub(2, 1)).toBe(1);
});
