import { expect, it } from 'vitest';

import { flag, twice } from './flags.js';

const TWO = 2;
const FOUR = 4;

it('flags and doubles', () => {
  expect(flag(true)).toBe('on');
  expect(twice(TWO)).toBe(FOUR);
});
