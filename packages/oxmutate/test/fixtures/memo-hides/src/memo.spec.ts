import { expect, it } from 'vitest';

import { triple } from './memo.js';

it('triples and adds one', () => {
  expect(triple(2)).toBe(7);
  expect(triple(5)).toBe(16);
});
