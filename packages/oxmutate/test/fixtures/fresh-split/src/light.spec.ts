import { expect, it } from 'vitest';

import { label, triple } from './light.js';

it('triples', () => {
  expect(triple(4)).toBe(12);
});

it('labels', () => {
  expect(label('abcd')).toBe('ABCD');
  expect(label('ab')).toBe('ab!');
});
