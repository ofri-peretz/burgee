import { expect, it } from 'vitest';

import { NAMES } from './table.js';

it('starts with alpha', () => {
  expect(NAMES[0]).toBe('alpha');
});
