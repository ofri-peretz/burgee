import { expect, it } from 'vitest';

import { isAdult } from './age.js';

it('an adult is an adult', () => {
  expect(isAdult(30)).toBe(true);
});

it('a child is not', () => {
  expect(isAdult(5)).toBe(false);
});
