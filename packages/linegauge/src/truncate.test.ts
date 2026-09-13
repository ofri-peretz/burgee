import cliTruncate from 'cli-truncate';
/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * R6 and R7, graded where an incumbent exists.
 *
 * `cli-truncate` is the incumbent for `truncate`; `widest` has none, because everybody
 * writes `Math.max(...lines.map(width))` inline, which is the reason it is here.
 */
import { describe, expect, it } from 'vitest';

import { truncate } from './truncate.js';
import { widest } from './widest.js';
import { width } from './width.js';

const ESC = String.fromCodePoint(27);
const red = (s: string) => `${ESC}[31m${s}${ESC}[39m`;
const count = (haystack: string, needle: string): number => haystack.split(needle).length - 1;

describe('truncate keeps the ellipsis inside the budget', () => {
  // The off-by-one the module exists for, stated first and checked over every budget.
  it.each([1, 2, 3, 5, 8, 13, 20])('is never wider than %i columns', (columns) => {
    for (const value of ['the quick brown fox jumps', red('the quick brown fox jumps'), 'ab\u4F60\u597Dcd efgh']) {
      for (const position of ['start', 'middle', 'end'] as const) {
        expect(width(truncate(value, columns, { position })), `${position} @ ${String(columns)}`).toBeLessThanOrEqual(columns);
      }
    }
  });

  it('measures the ellipsis rather than assuming one column', () => {
    // Three dots cost three columns, so only seven characters of text survive a budget of ten.
    expect(truncate('abcdefghijklm', 10, { ellipsis: '...' })).toBe('abcdefg...');
    expect(width(truncate('abcdefghijklm', 10, { ellipsis: '...' }))).toBe(10);
  });

  it('returns the string untouched when it already fits', () => {
    expect(truncate('short', 20)).toBe('short');
    expect(truncate(red('short'), 20)).toBe(red('short'));
  });

  it('gives back the ellipsis alone when only it fits, and nothing when it does not', () => {
    expect(truncate('abcdef', 1, { ellipsis: '\u2026' })).toBe('\u2026');
    expect(truncate('abcdef', 1, { ellipsis: '...' })).toBe('');
    expect(truncate('abcdef', 0)).toBe('');
  });

  it('cuts from the end, the start and the middle', () => {
    expect(truncate('abcdefghij', 6, { position: 'end' })).toBe('abcde\u2026');
    expect(truncate('abcdefghij', 6, { position: 'start' })).toBe('\u2026fghij');
    expect(truncate('abcdefghij', 6, { position: 'middle' })).toBe('abc\u2026ij');
  });

  it('keeps the style closed, because it cuts through slice', () => {
    const out = truncate(red('the quick brown fox'), 10);
    expect(out.startsWith(`${ESC}[31m`)).toBe(true);
    expect(out).toContain(`${ESC}[39m`);
  });
});

describe('truncate agrees with cli-truncate', () => {
  // Unstyled inputs only; the styled case is graded on its own below, because the two
  // disagree about one thing and it is not the truncation.
  const CASES = ['the quick brown fox jumps over', 'hello world'];
  for (const value of CASES) {
    for (const position of ['start', 'middle', 'end'] as const) {
      for (const columns of [4, 7, 11, 16]) {
        it(`${position} @ ${String(columns)} of ${JSON.stringify(value).slice(0, 24)}`, () => {
          expect(truncate(value, columns, { position })).toBe(cliTruncate(value, columns, { position }));
        });
      }
    }
  }
});

/**
 * The one divergence, and the reason it goes our way.
 *
 * `cli-truncate` puts the ellipsis *inside* the style run for `start` and `end` — the mark
 * comes out red — and *outside* it for `middle`, where it closes the run, emits the mark
 * and reopens. It disagrees with itself, so there is no behaviour here to be compatible
 * with; what there is, is a choice.
 *
 * Ours: **the ellipsis is never styled.** It is not the caller's text. It stands in for
 * text that is gone, and giving it that text's colour tells the reader something is red
 * when what was red is exactly what got removed.
 */
describe('the ellipsis is not the caller\u2019s text', () => {
  it('is unstyled at every position, where cli-truncate styles two of three', () => {
    const value = red('the quick brown fox jumps over');
    for (const position of ['start', 'middle', 'end'] as const) {
      const out = truncate(value, 7, { position });
      const mark = out.indexOf('\u2026');
      const before = out.slice(0, mark);
      // The mark is outside any open run: whatever was opened before it is closed before it.
      const opens = before.split(`${ESC}[31m`).length - 1;
      const closes = before.split(`${ESC}[39m`).length - 1;
      expect(opens, `${position}: the ellipsis sits inside an open style`).toBe(closes);
    }
  });

  it('cli-truncate really does disagree with itself, which is the argument', () => {
    const value = red('the quick brown fox jumps over');
    // Styled at the end...
    expect(cliTruncate(value, 7, { position: 'end' })).toContain(`${ESC}[31mthe qu\u2026`);
    // ...and closed before the mark in the middle.
    expect(cliTruncate(value, 7, { position: 'middle' })).toContain(`${ESC}[39m\u2026`);
  });
});

/**
 * Comfortably past any spread limit, and not a million: the number only has to exceed what
 * `Math.max(...xs)` could accept, which is around 125,000 on V8 today.
 */
const BEYOND_SPREAD = 200_000;

/**
 * The failure `widest` exists to avoid, as a generator.
 *
 * This was written as `expect(() => Math.max(...many.map(...))).toThrow(RangeError)`. It does
 * throw here. On a CI runner it took 6.9 seconds and did not, so the assertion failed — **a
 * test of the host engine dressed as a test of this function**, and the argument limit is a
 * property of the stack rather than of the language. Now it asserts what is ours: a generator
 * is measured in one pass with nothing spread and nothing held, and if `widest` ever grows a
 * spread this stops finishing.
 */
function* manyLines(): Generator<string> {
  for (let i = 0; i < BEYOND_SPREAD; i++) yield i === BEYOND_SPREAD - 1 ? 'wide enough' : 'x';
}

/** A generator rather than an array: the point of `Iterable` is that nothing is held. */
function* threeLines(): Generator<string> {
  yield 'a';
  yield 'abcdef';
  yield 'abc';
}

describe('widest', () => {
  it('is the largest display width, not the largest length', () => {
    // `\u4F60\u597D` is two characters and four columns: a length-based max picks the wrong line.
    expect(widest(['abc', '\u4F60\u597D', 'de'])).toBe(4);
  });

  it('ignores escape sequences', () => {
    expect(widest([red('abcd'), 'ab'])).toBe(4);
  });

  it('is zero for nothing', () => {
    expect(widest([])).toBe(0);
  });

  it('takes any iterable, so a generator never has to be spread', () => {
    expect(widest(threeLines())).toBe(6);
  });

  it('measures far more lines than a spread could pass, in one pass', () => {
    expect(widest(manyLines())).toBe(11);
  });
});
