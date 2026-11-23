import { expect, it } from 'vitest';

import { LIMIT, add, clamp } from './heavy.js';

// A test that takes long (120 ms of the dry run): a mutant it covers costs more armed warm than in a fresh worker.
const spin = (ms: number): void => {
  const until = Date.now() + ms;
  while (Date.now() < until);
};

it('adds, slowly', () => {
  spin(120);
  expect(add(1, 2)).toBe(3);
});

it('reads its limit, slowly', () => {
  spin(120);
  expect(LIMIT).toBe(100);
});

it('clamps, slowly', () => {
  spin(120);
  expect(clamp(500)).toBe(100);
  expect(clamp(5)).toBe(5);
});
