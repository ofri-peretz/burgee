/**
 * R7 — the width function replaces `string-width`, so `string-width` grades it: every case
 * below is checked against the installed package as well as against a literal, and the
 * literal is there so a wrong answer names itself rather than agreeing with a moved
 * dependency. (The one deliberate divergence is the `ambiguousIsNarrow` option, which we
 * do not have; every case here is unambiguous.)
 */
import stringWidth from 'string-width';
import { describe, expect, it } from 'vitest';

import { lineCount, width } from './width.js';

const ESC = '\u001B';
const ZWSP = '\u200B';
const COMBINING_ACUTE = '\u0301';

describe('width()', () => {
  it.each([
    ['', 0],
    ['abc', 3],
    ['0'.repeat(50), 50],
    // East Asian Wide and Fullwidth.
    ['古池や', 6],
    ['ｶﾞ', 2],
    ['Ａ', 2],
    // Emoji, including a ZWJ sequence and a flag: one cluster, two columns each.
    ['🦄', 2],
    [`\u{1F469}\u200D\u{1F469}\u200D\u{1F466}`, 2],
    ['🇸🇪', 2],
    ['a🦄b', 4],
    // Combining marks and zero-width characters occupy nothing of their own.
    [`e${COMBINING_ACUTE}`, 1],
    [ZWSP, 0],
    // Escapes are not printed.
    [`${ESC}[31mred${ESC}[39m`, 3],
  ])('%j is %i columns, and string-width agrees', (input, columns) => {
    expect(width(input)).toBe(columns);
    expect(width(input)).toBe(stringWidth(input));
  });
});

describe('lineCount()', () => {
  it('an empty line still occupies one, and a wrapped line occupies its wraps', () => {
    expect(lineCount('', 80)).toBe(1);
    expect(lineCount('a\nb', 80)).toBe(2);
    expect(lineCount('0'.repeat(90), 80)).toBe(2);
    expect(lineCount('🦄'.repeat(50), 80)).toBe(2);
    expect(lineCount(`${ESC}[31m${'0'.repeat(90)}${ESC}[39m`, 80)).toBe(2);
  });
});

/**
 * The four cases that took the `string-width` row from 194 / 229 to 198. The vendored suite
 * is the gate; these are here so the loop is a second rather than a full grading run, and so
 * a reader sees the contract without going to `vendor/`.
 */
describe('the contract string-width has always kept', () => {
  it('measures a non-string as 0 rather than throwing', () => {
    // A width function is usually reached with whatever a template produced, so the
    // incumbent answers 0 instead of making every caller guard. `typeof`, not truthiness:
    // `0` and `false` are not empty strings.
    expect(width(123 as unknown as string)).toBe(0);
    expect(width(null as unknown as string)).toBe(0);
    expect(width(undefined as unknown as string)).toBe(0);
  });

  it('counts escape sequences as characters when asked, minus the escape byte itself', () => {
    // `[31m` is what a terminal would have swallowed; ESC stays non-printing either way.
    expect(width(`${ESC}[31m`, { countAnsiEscapeCodes: true })).toBe(4);
    expect(width(`${ESC}[31m`)).toBe(0);
  });
});
