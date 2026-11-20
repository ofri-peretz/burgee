import { expect, it } from 'vitest';

import { add } from './calc.js';

it('adds', () => {
  expect(add(1, 1)).toBe(2);
});
