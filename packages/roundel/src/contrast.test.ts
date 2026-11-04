/**
 * R5 — the WCAG maths, a deliberate copy of `burgee/contrast` (U1: no arrow from roundel to
 * burgee). This test holds roundel's copy to `contrast-vectors.json`; burgee's copy is not
 * yet held to the same file, so a drift there would not fail here. Follow-up: burgee contrast
 * test to read roundel's contrast-vectors.json.
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { AA, channels, contrast, floors, luminance, reportTheme } from './contrast.js';

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

  it('reads each digit of a short hex as its own channel, doubled', () => {
    expect(channels('#abc')).toEqual([0xaa / 255, 0xbb / 255, 0xcc / 255]);
  });

  it.each(['x#aabbcc', '#aabbccdd'])('refuses %j: the colour is the whole string', (hex) => {
    expect(() => channels(hex)).toThrow(/not a hex colour/);
  });

  it('carries the two floors WCAG 2.2 sets, and AAA’s when asked for', () => {
    expect(AA).toEqual({ TEXT: 4.5, GRAPHIC: 3 });
    expect(floors('AAA')).toEqual({ TEXT: 7, GRAPHIC: 4.5 });
    expect(floors()).toBe(AA);
  });

  it('reports one aligned line per finding, the columns as wide as their widest entry', () => {
    const row = { colour: '#000000', ground: '#ffffff', ratio: 21, required: 4.5 };
    expect(reportTheme([
      { ...row, token: 'ok', at: 'truecolor', passes: true },
      { ...row, token: 'error', at: '256', passes: false },
    ])).toBe(['pass  ok     truecolor  #000000 on #ffffff  21.00:1 (needs 4.5:1)', 'FAIL  error  256        #000000 on #ffffff  21.00:1 (needs 4.5:1)'].join('\n'));
  });
});
