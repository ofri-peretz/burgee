import { expect, it } from 'vitest';

import { add, list, reset } from './shelf.js';

it('lists what was added', () => {
  add('a');
  expect(list()).toEqual(['a']);
  reset();
});
