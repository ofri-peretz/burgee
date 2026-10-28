import { expect, it } from 'vitest';

import { makeCounter } from './counter.js';

// Deliberately weak: nothing here calls dec(), so its mutants survive the tests.
it('counts up', () => {
  const c = makeCounter();
  c.inc();
  expect(c.value()).toBe(1);
});
