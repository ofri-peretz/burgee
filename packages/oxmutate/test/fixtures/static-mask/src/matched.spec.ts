import { expect, it } from 'vitest';

import { matched } from './pair.js';

it('the pair matches', () => {
  expect(matched()).toBe(true);
});
