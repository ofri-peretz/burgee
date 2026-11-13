import { expect, it } from 'vitest';

import { shout, twice } from './pair.js';

// Reaches most of the module and never asks whether the pair matches, so it is the file each
// static mutant runs in first, alone, and survives.
it('shouts', () => {
  expect(shout('a')).toBe('A');
});

it('doubles', () => {
  expect(twice('ab')).toBe('abab');
});
