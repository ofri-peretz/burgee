import { beforeEach, describe, expect, it } from 'vitest';

import { seed } from './seed.js';

let rows: string[] = [];

beforeEach(() => {
  rows = seed();
});

describe('seeded rows', () => {
  it('starts with alpha and beta', () => {
    expect(rows).toEqual(['alpha', 'beta']);
  });
});
