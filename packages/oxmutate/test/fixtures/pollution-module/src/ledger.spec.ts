import { expect, it } from 'vitest';

import { add, list, reset, spare } from './ledger.js';

it('lists what was added', () => {
  add('a');
  expect(list()).toEqual(['a']);
  reset();
});

it('starts from empty', () => {
  expect(list()).toEqual([]);
  expect(typeof spare()).toBe('number');
});
