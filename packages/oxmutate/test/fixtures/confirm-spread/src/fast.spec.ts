import { expect, it } from 'vitest';

import { first, second, seen, third } from './fast.js';

it('runs every function', () => {
  first();
  second();
  third();
  expect(typeof seen()).toBe('number');
});

it('runs every function again', () => {
  third();
  second();
  first();
  expect(typeof seen()).toBe('number');
});
