import { expect, it } from 'vitest';

import { hog } from './hog.js';

it('does nothing unarmed', () => {
  expect(hog(false)).toBeUndefined();
});
