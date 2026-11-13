import { expect, it } from 'vitest';

import { clamp, isEven, join, shout, twice } from './pair.js';

const ABOVE = 9;
const BELOW = 2;
const LIMIT = 3;

// Reaches most of the module and never asks whether the pair matches, so it is the file each
// static mutant runs in first, alone, and survives.
it('shouts', () => {
  expect(shout('a')).toBe('A');
});

it('doubles', () => {
  expect(twice('ab')).toBe('abab');
});

it('clamps', () => {
  expect(clamp(ABOVE)).toBe(LIMIT);
  expect(clamp(BELOW)).toBe(BELOW);
});

it('joins the words that are there', () => {
  expect(join(['a', '', 'b'])).toBe('a-b');
});

it('tells even from odd', () => {
  expect(isEven(BELOW)).toBe(true);
  expect(isEven(LIMIT)).toBe(false);
});
