import { expect, it } from 'vitest';

import { LIMIT, add, clamp } from './heavy.js';

/** A test that takes long (120 ms of the dry run): a mutant it covers costs more armed warm than in a fresh worker. */
const SLOW_MS = 120;
const BIG = 500;
const SMALL = 5;
const LIMIT_VALUE = 100;
const SUM = 3;
const spin = (ms: number): void => {
  const until = Date.now() + ms;
  while (Date.now() < until);
};

it('adds, slowly', () => {
  spin(SLOW_MS);
  expect(add(1, 2)).toBe(SUM);
});

it('reads its limit, slowly', () => {
  spin(SLOW_MS);
  expect(LIMIT).toBe(LIMIT_VALUE);
});

it('clamps, slowly', () => {
  spin(SLOW_MS);
  expect(clamp(BIG)).toBe(LIMIT_VALUE);
  expect(clamp(SMALL)).toBe(SMALL);
});
