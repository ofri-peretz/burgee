/** R5 vectors, shared with burgee's own contrast tests: the copy must agree with its origin. */
import { describe, expect, it } from 'vitest';

import { AA, channels, contrast, luminance, mix } from './contrast.js';

describe('WCAG 2.2 maths', () => {
  it('black on white is 21:1, a colour against itself is 1:1', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#ffffff', '#000000')).toBeCloseTo(21, 5);
    expect(contrast('#a84c17', '#a84c17')).toBe(1);
  });

  it('relative luminance of pure white is 1 and of pure black is 0', () => {
    expect(luminance('#ffffff')).toBeCloseTo(1, 5);
    expect(luminance('#000000')).toBe(0);
  });

  it('short hex parses like long hex', () => {
    expect(channels('#abc')).toEqual(channels('#aabbcc'));
    expect(() => channels('rgb(1,2,3)')).toThrow(/not a hex colour/);
  });

  it('rock on the dark ground is below AA text and juniper lifted 20% is above it', () => {
    expect(contrast('#a84c17', '#0a0a0a')).toBeLessThan(AA.TEXT);
    expect(contrast(mix('#0a6b47', '#ffffff', 0.2), '#0a0a0a')).toBeGreaterThan(AA.TEXT);
  });

  it('mix at 0 and 1 is each endpoint', () => {
    expect(mix('#a84c17', '#ffffff', 0)).toBe('#a84c17');
    expect(mix('#a84c17', '#ffffff', 1)).toBe('#ffffff');
  });
});
