/**
 * What boxen's own suite does not cover.
 *
 * `flagstaff/boxen` is graded 84 / 84 by boxen's 84 `t.snapshot(box)` cases, and that is
 * the gate. This file exists because two mutations of the port left that gate **green**:
 *
 *   - deleting the invalid-colour `throw` entirely;
 *   - breaking the odd-remainder branch of centred title placement.
 *
 * A mutation that does not turn the suite red is behaviour the suite does not test, and
 * porting behaviour nobody checks is how a façade drifts. Every expectation below was taken
 * from **real boxen 8.0.1** rather than written by hand, so these are still boxen's answers
 * and not ours — the package itself is not imported here, because flagstaff depends on
 * nothing.
 */
import { describe, expect, it } from 'vitest';

import boxen, { _borderStyles } from './boxen.js';

describe('a colour that is not a colour is refused', () => {
  it('throws on an unknown borderColor, naming it', () => {
    expect(() => boxen('x', { borderColor: 'nope' })).toThrow('nope is not a valid borderColor');
  });

  it('throws on an unknown backgroundColor, naming it', () => {
    expect(() => boxen('x', { backgroundColor: 'nope' })).toThrow('nope is not a valid backgroundColor');
  });

  it('accepts a hex, which is the other half of the rule', () => {
    expect(() => boxen('x', { borderColor: '#ff0000', backgroundColor: '#00ff00' })).not.toThrow();
  });

  it('accepts a three-digit hex too', () => {
    expect(() => boxen('x', { borderColor: '#f00' })).not.toThrow();
  });

  /**
   * boxen's hex test is `/^#(?:[0-f]{3}){1,2}$/i`, and `[0-f]` is not hex — it is the range
   * from `0` to `f`, which takes in `:;<=>?@`, `A-Z` and, with the `i` flag, `a-z`. So boxen
   * draws a box for these, and a façade that refused them would diverge on the one thing it
   * exists to preserve. Pinned so nobody "fixes" it into a divergence: verified against real
   * boxen 8.0.1, which accepts all three.
   */
  it.each(['#:::', '#ZZZ', '#GGG'])('accepts %s, because boxen does — its range is not hex', (color) => {
    expect(() => boxen('x', { borderColor: color })).not.toThrow();
  });
});

describe('a centred title', () => {
  /**
   * The branch the suite misses. When the run left over is an odd number of characters it
   * cannot split evenly, so boxen takes one character off the left — otherwise the bar runs
   * past its own corner. Both expectations are real boxen 8.0.1's output.
   */
  it('takes one character off the left when the remainder is odd', () => {
    expect(boxen('x', { title: 'ab', titleAlignment: 'center', width: 11 })).toBe('┌── ab ───┐\n│x        │\n└─────────┘');
  });

  it('splits evenly when it can', () => {
    expect(boxen('x', { title: 'ab', titleAlignment: 'center', width: 12 })).toBe('┌─── ab ───┐\n│x         │\n└──────────┘');
  });
});

describe('borderStyle', () => {
  it('none draws no border at all, not an empty one', () => {
    expect(boxen('hi', { borderStyle: 'none' })).toBe('hi');
  });

  it('honours the retro `vertical` and `horizontal` keys, which override the sides', () => {
    const style = { vertical: '|', horizontal: '-', topLeft: '+', topRight: '+', bottomLeft: '+', bottomRight: '+', left: '?', right: '?', top: '?', bottom: '?' };
    expect(boxen('hi', { borderStyle: style })).toBe('+--+\n|hi|\n+--+');
  });

  it('refuses a name it does not know', () => {
    expect(() => boxen('x', { borderStyle: 'hexagon' })).toThrow('Invalid border style: hexagon');
  });

  it('refuses an object missing a side', () => {
    expect(() => boxen('x', { borderStyle: { topLeft: '+' } as never })).toThrow(/Invalid border style/);
  });
});

describe('_borderStyles', () => {
  it('carries cli-boxes 4 whole, because boxen re-exports it as public surface', () => {
    expect(Object.keys(_borderStyles).sort()).toEqual(['arrow', 'bold', 'classic', 'double', 'doubleSingle', 'round', 'single', 'singleDouble']);
  });

  it('is the same data the drawing uses — a style from it draws that style', () => {
    expect(boxen('x', { borderStyle: 'arrow' }).startsWith(_borderStyles['arrow']?.topLeft ?? '')).toBe(true);
  });
});
