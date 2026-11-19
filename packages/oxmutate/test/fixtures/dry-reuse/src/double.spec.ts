import { expect, it } from 'vitest';

import { double } from './double.js';

it('doubles', () => {
  expect(double(2)).toBe(2 + 2);
});
