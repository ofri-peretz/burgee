import { expect, it } from 'vitest';

import { list, register, reset } from './registry.js';

it('registers a name once', () => {
  register('a');
  register('a');
  expect(list()).toEqual(['a']);
  reset();
});
