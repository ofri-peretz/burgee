import { expect, it } from 'vitest';

import { add, label, reset, spare, total, unit } from './registry.js';

it('adds', () => {
  try {
    expect(label()).toBe('counter');
    expect(unit()).toBe('points');
    spare();
    add(5);
    expect(total()).toBe(5);
  } finally {
    reset();
  }
});
