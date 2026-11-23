import { expect, it } from 'vitest';

import { sibling } from './sibling.js';

const TEST_MS = 4000;

// Long enough that the hog's first strike lands while this test is running.
it('is one, slowly', () => {
  const until = Date.now() + TEST_MS;
  while (Date.now() < until);
  expect(sibling()).toBe(1);
});
