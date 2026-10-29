import { expect, it } from 'vitest';

import { sign } from './sign.js';

it('names the sign', () => {
  expect(sign(-1)).toBe('negative');
  expect(sign(1)).toBe('positive');
});
