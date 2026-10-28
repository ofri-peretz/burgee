import { describe, expect, it } from 'vitest';

import { defineMutate } from './vite.js';

describe('defineMutate', () => {
  it('returns the block it was given', () => {
    const block = { mutate: ['src/a.ts'], thresholds: { break: 80 } };
    expect(defineMutate(block)).toBe(block);
  });
});
