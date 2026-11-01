import { expect, it } from 'vitest';

import { flag, twice } from './flags.js';

it('flags and doubles', () => {
  expect(flag(true)).toBe('on');
  expect(twice(2)).toBe(4);
});
