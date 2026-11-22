import { expect, it } from 'vitest';

import { triple } from './memo.js';

it('triples', () => {
  expect(triple(2)).toBe(6);
  expect(triple(5)).toBe(15);
});
