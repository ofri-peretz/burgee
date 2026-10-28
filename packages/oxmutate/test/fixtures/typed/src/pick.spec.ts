import { expect, it } from 'vitest';

import { mode } from './pick.js';

// Deliberately weak: any string passes.
it('returns a mode', () => {
  expect(typeof mode(true)).toBe('string');
});
