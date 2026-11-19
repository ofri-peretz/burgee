import { expect, it } from 'vitest';

import { double } from './double.js';

it('doubles', () => {
  expect(double(3)).toBe(6);
});
