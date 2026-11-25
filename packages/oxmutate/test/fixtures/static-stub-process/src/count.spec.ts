import { expect, it } from 'vitest';

import { EXTS } from './exts.js';

// Reads the value, but only its length: alone, it kills the array's mutant and not the strings'.
it('lists two extensions', () => {
  expect(EXTS).toHaveLength(2);
});
