import { expect, it } from 'vitest';

import { add, configure, list, memo, reset } from './gate.js';

it('lists what was added', () => {
  add('a');
  configure(false);
  expect(list()).toEqual(['a']);
  reset();
});

it('computes six', () => {
  expect(memo()).toBe(6); // eslint-disable-line conventions/no-magic-numbers -- the literal is what the fixture mutates
});
