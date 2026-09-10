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
