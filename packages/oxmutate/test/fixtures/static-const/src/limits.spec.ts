import { expect, it } from 'vitest';

import { clamp, describe as label } from './limits.js';

const ABOVE_LIMIT = 9;
const LIMIT = 3;

it('clamps to three', () => {
  expect(clamp(ABOVE_LIMIT)).toBe(LIMIT);
});

it('labels the count', () => {
  expect(label(1)).toBe('1 items');
});
