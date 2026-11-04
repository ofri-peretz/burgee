import { expect, it } from 'vitest';

import { isTarget, TARGET } from './check.js';
import { sum } from './sum.js';

it('adds', () => {
  expect(isTarget(sum(2, TARGET - 2))).toBe(true);
});
