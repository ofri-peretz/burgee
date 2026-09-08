/**
 * R5 — the WCAG maths, a deliberate copy of `burgee/contrast` (U1: no arrow from roundel to
 * burgee). This test holds roundel's copy to `contrast-vectors.json`; burgee's copy is not
 * yet held to the same file, so a drift there would not fail here. Follow-up: burgee contrast
 * test to read roundel's contrast-vectors.json.
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { AA, channels, contrast, luminance } from './contrast.js';

const VECTORS = JSON.parse(readFileSync(new URL('./contrast-vectors.json', import.meta.url), 'utf8')) as ReadonlyArray<{
  a: string;
  b: string;
  ratio: number;
}>;

describe('contrast', () => {
  it('matches the WCAG reference values', () => {
    // Black on white is exactly 21:1 by definition — if this drifts, the luminance
    // curve is wrong and every other number here is fiction.
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(luminance('#ffffff')).toBeCloseTo(1, 5);
    expect(luminance('#000000')).toBeCloseTo(0, 5);
  });

  it.each(VECTORS)('$a on $b is $ratio:1 — the shared vectors', ({ a, b, ratio }) => {
    expect(contrast(a, b)).toBeCloseTo(ratio, 2);
    expect(contrast(b, a)).toBeCloseTo(ratio, 2);
  });

  it('accepts short hex and rejects nonsense', () => {
    expect(channels('#fff')).toEqual([1, 1, 1]);
    expect(channels('#a84c17')).toEqual([168 / 255, 76 / 255, 23 / 255]);
    expect(() => contrast('red', '#000')).toThrow(/not a hex colour/);
    expect(() => contrast('#12345', '#000')).toThrow(/not a hex colour/);
  });

  it('carries the two floors WCAG 2.2 sets', () => {
    expect(AA).toEqual({ TEXT: 4.5, GRAPHIC: 3 });
  });
});
