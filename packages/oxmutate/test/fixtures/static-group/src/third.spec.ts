import { expect, it } from 'vitest';

import { NAMES } from './table.js';

it('ends with delta', () => {
  expect(NAMES.at(-1)).toBe('delta');
});
