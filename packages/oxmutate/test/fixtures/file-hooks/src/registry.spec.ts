import { beforeEach, describe, expect, it } from 'vitest';

import { list, register, reset } from './registry.js';

// File-level, outside the describe: Vitest 5 does not link the describe back to the file.
beforeEach(() => {
  reset();
});

describe('registry', () => {
  it('registers a name once', () => {
    register('a');
    register('a');
    expect(list()).toEqual(['a']);
  });
});
