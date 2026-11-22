import { expect, it } from 'vitest';

import { two } from './two.js';

// Two tests of 3.5 s each, armed or not: this mutant's run (7 s, inside its own budget) outlasts the
// stop of the other, whose re-run is queued while this one is still running.
const wait = (ms: number): void => {
  const until = Date.now() + ms;
  while (Date.now() < until);
};
it('returns two', () => {
  wait(3500);
  expect(two).toBe(2);
});
it('returns two again', () => {
  wait(3500);
  expect(two).toBe(2);
});
