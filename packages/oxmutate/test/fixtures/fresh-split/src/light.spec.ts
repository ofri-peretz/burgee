import { expect, it } from 'vitest';

import { label, triple } from './light.js';

const FOUR = 4;
const TWELVE = 12;

it('triples', () => {
  expect(triple(FOUR)).toBe(TWELVE);
});

it('labels', () => {
  expect(label('abcd')).toBe('ABCD');
  expect(label('ab')).toBe('ab!');
});
