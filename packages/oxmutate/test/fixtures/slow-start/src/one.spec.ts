import { expect, it } from 'vitest';

import { one } from './one.js';

it('is one', () => {
  expect(one()).toBe(1);
});
