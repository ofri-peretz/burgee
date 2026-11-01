import { expect, it } from 'vitest';

import { add, label, reset, spare, total, unit } from './registry.js';

const AMOUNT = 5;

it('adds', () => {
  try {
    expect(label()).toBe('counter');
    expect(unit()).toBe('points');
    spare();
    add(AMOUNT);
    expect(total()).toBe(AMOUNT);
  } finally {
    reset();
  }
});
