import { expect, it } from 'vitest';

import { mode } from './mode.js';

it('runs in strict mode', () => {
  expect(mode()).toBe('strict');
});
