import { expect, it } from 'vitest';

import { parity, sign } from './parity.js';

// As ESLint's RuleTester: each case is recorded as its test runs, and a case seen before fails.
const seen = new Set<string>();
const once = (name: string, body: () => void): void => {
  it(name, () => {
    if (seen.has(name)) throw new Error(`detected duplicate test case: ${name}`);
    seen.add(name);
    body();
  });
};

once('parity', () => {
  expect(parity(2)).toBe('even');
  expect(parity(3)).toBe('odd');
});
// Zero is never checked, so `n < 0` → `n <= 0` survives: a survivor shows a run after the first was
// decided on the mutant, not on the duplicate-case failure.
once('sign', () => {
  expect(sign(1)).toBe('positive');
  expect(sign(-1)).toBe('negative');
});
