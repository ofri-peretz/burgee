import { expect, it } from 'vitest';

import { triple } from './memo.js';

it('triples and adds one', () => {
  expect(triple(2)).toBe(7); // eslint-disable-line conventions/no-magic-numbers -- the literal is what the fixture mutates
  expect(triple(5)).toBe(16); // eslint-disable-line conventions/no-magic-numbers -- the literal is what the fixture mutates
});
