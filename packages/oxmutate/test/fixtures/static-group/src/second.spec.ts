import { expect, it } from 'vitest';

import { NAMES } from './table.js';

const COUNT = 4;

it('has four names', () => {
  expect(NAMES).toHaveLength(COUNT);
});
