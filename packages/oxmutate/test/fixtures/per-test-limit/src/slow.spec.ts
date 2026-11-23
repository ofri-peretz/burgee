import { expect, it } from 'vitest';

import { hang } from './hang.js';

const SLOW_MS = 800;

// A second test over the same line, 0.8 s long: it sizes the budget of the whole mutant (about 3.5 s), and
// makes a mutant here cost more armed warm than in a fresh worker, so that is where it goes first.
it('reads it after a long setup', () => {
  const until = Date.now() + SLOW_MS;
  while (Date.now() < until);
  expect(hang(0)).toBe(1);
});
