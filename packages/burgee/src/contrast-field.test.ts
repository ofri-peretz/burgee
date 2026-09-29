/**
 * `fieldColorAt` — the colour under a point of the gradient, which every contrast finding
 * about a burgee is measured against. Past the second of three stops, before the first, after
 * the last, and a field with no stops at all.
 */
import { describe, expect, it } from 'vitest';

import { fieldColorAt } from './contrast.js';

const THREE = [
  { offset: 1, color: '#0000ff' },
  { offset: 0, color: '#ff0000' },
  { offset: 0.5, color: '#00ff00' },
];

describe('fieldColorAt', () => {
  it('reads stops in offset order, whatever order they were given in', () => {
    expect(fieldColorAt(THREE, 0.5)).toBe('#00ff00');
  });
  it('mixes between the two stops either side of the point, past the second stop too', () => {
    expect(fieldColorAt(THREE, 0.25)).toBe('#808000');
    expect(fieldColorAt(THREE, 0.75)).toBe('#008080');
  });
  it('holds the end colours outside the stops', () => {
    expect(fieldColorAt(THREE, -1)).toBe('#ff0000');
    expect(fieldColorAt(THREE, 2)).toBe('#0000ff');
  });
  it('reads a point that is not a number as the last stop, rather than mixing towards NaN', () => {
    expect(fieldColorAt(THREE, Number.NaN)).toBe('#0000ff');
  });
  it('refuses a field with no stops', () => {
    expect(() => fieldColorAt([], 0.5)).toThrow('burgee: a field needs at least one stop');
  });
});
