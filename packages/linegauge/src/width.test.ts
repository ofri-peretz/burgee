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

/**
 * The twenty-eight cases that took the `string-width` row from 201 / 229 to 229, in the four
 * categories `spec.md` § R10 names. They are reproduced here rather than left to the
 * vendored suite for the reason the block above gives — the loop is a second, not a full
 * grading run — and each is asserted against a literal *and* against the installed
 * incumbent, so a wrong answer cannot pass by agreeing with a moved dependency.
 *
 * Every one of the four was `linegauge` being wrong and `string-width` right. None of them
 * is a judgement call, which is why they are closed rather than argued with.
 */
describe('the twenty-eight string-width cases (spec.md R10, categories A–D)', () => {
  /**
   * A — `Intl.Segmenter` joins a run of conjoining jamo into one cluster (GB6/GB7/GB8), and
   * measuring the cluster by its first code point answered 2 where a terminal draws 12.
   * Modern Hangul composes L + V (+ T) into one two-column syllable; jamo that do not
   * compose stay additive at their own East Asian Width — L is Wide, V and T are not.
   */
  it.each([
    // The literals are spelled in escapes on purpose. Hand-writing `가` is the trap here:
    // the suite's `가` is the *decomposed* U+1100 U+1161, and a reduction written with the
    // precomposed U+AC00 measures a different string from the one being graded — which is
    // how a fix gets verified against a case the gate never runs.
    ['\u1100\u1100', 4],
    ['\u1100\u1100\u1100\u1100\u1100\u1100', 12],
    ['\u1100\u1100\u1161', 4],
    ['\u1100\u1161\u1161', 3],
    ['\u1100\u1161\u11A8\u11A8', 3],
    ['\u1100\u1100\uFE0F', 4],
    ['\u1100\u1100\u200D', 4],
    ['\u1161\u1161\u1161', 3],
    ['\u11A8\u11A8', 2],
    ['\u1100\uAC00', 4],
    // The shapes that must not move: a lone jamo, the compositions that do collapse, the
    // orders that do not, and the compatibility jamo that are plain wide characters.
    ['\u1100', 2],
    ['\u1161', 1],
    ['\u11A8', 1],
    ['\uAC00', 2],
    ['\u1100\u1161', 2],
    ['\u1100\u1161\u11A8', 2],
    ['\uA960\u1161', 2],
    ['\u1100\uD7B0', 2],
    ['\u1161\u1100', 3],
    ['\u1100\u11A8', 3],
    ['\u3131', 2],
    ['\u3131\u3131', 4],
  ])('A — Hangul jamo %j is %i columns', (input, columns) => {
    expect(width(input)).toBe(columns);
    expect(width(input)).toBe(stringWidth(input));
  });

  /**
   * B — the zero-width class matched `\p{Mark}`, which is `Mn` and `Mc` and `Me`. Only `Mn`
   * and `Me` are non-spacing; a spacing combining mark is drawn in its own column.
   */
  it.each([
    ['\u093E', 1],
    ['\u0915\u093E', 2],
    ['\u0915\u093F', 2],
    // The non-spacing neighbours, which must stay at zero.
    ['\u0301\u0302', 0],
    ['e\u0301\u0302', 1],
    ['a\u20DD', 1],
    ['\u0F5F\u0FB3', 1],
  ])('B — mark %j is %i columns', (input, columns) => {
    expect(width(input)).toBe(columns);
    expect(width(input)).toBe(stringWidth(input));
  });

  /**
   * C — prepended concatenation marks are `Format` but not `Default_Ignorable`, so the
   * zero-width class missed them; `measure` then stripped them as leading non-printing,
   * found an empty remainder, read code point 0 and charged a column for it. A character a
   * terminal does not advance the cursor for must not cost one.
   */
  it.each([
    ['\u0600', 0],
    ['\u06DD', 0],
    ['\u070F', 0],
  ])('C — format character %j is %i columns', (input, columns) => {
    expect(width(input)).toBe(columns);
    expect(width(input)).toBe(stringWidth(input));
  });

  /**
   * D — `\p{RGI_Emoji}` matches only the fully-qualified form, the one carrying `U+FE0F`.
   * Drop the variation selector and the same sequence is still a two-column emoji in every
   * terminal, but the regex stops matching. The rule that covers both shapes without
   * widening anything else: a cluster holding `U+200D` and two or more
   * `\p{Extended_Pictographic}` scalars, or a keycap over an ASCII digit, `#` or `*`.
   */
  it.each([
    ['\u2764\u200D\u{1F525}', 2],
    ['\u{1F3F3}\u200D\u{1F308}', 2],
    ['\u{1F3F3}\u200D\u26A7', 2],
    ['\u26D3\u200D\u{1F4A5}', 2],
    ['\u{1F441}\u200D\u{1F5E8}', 2],
    ['\u26F9\u200D\u2642', 2],
    ['\u26F9\u200D\u2640', 2],
    ['\u{1F575}\u200D\u2642', 2],
    ['\u{1F575}\u200D\u2640', 2],
    ['#\u20E3', 2],
    ['0\u20E3', 2],
    ['*\u20E3', 2],
    // The two the rule must not catch: an Indic conjunct joined by the same ZWJ, and a
    // keycap over a base that is not one. Both pass today and must keep passing.
    ['\u0915\u094D\u200D\u0937', 1],
    ['\u260E\uFE0F\u20E3', 1],
  ])('D — unqualified emoji %j is %i columns', (input, columns) => {
    expect(width(input)).toBe(columns);
    expect(width(input)).toBe(stringWidth(input));
  });
});

describe('ambiguousIsNarrow', () => {
  it('is narrow by default and wide when the caller says the terminal is CJK', () => {
    expect(width('±')).toBe(1);
    expect(width('±', { ambiguousIsNarrow: false })).toBe(2);
    expect(width('±×÷')).toBe(3);
    expect(width('±×÷', { ambiguousIsNarrow: false })).toBe(6);
    // A genuinely wide character is wide either way; only the ambiguous one moves.
    expect(width('±你')).toBe(3);
    expect(width('±你', { ambiguousIsNarrow: false })).toBe(4);
  });
});

/**
 * The five `\p{…}` classes are built from source strings (see `width.ts`), which trades the
 * syntax checking a literal gets at build time for ~10 ms of import cost nobody was using.
 * This is the other half of that trade: a typo in any of the five fails here rather than in
 * a user's terminal.
 *
 * Each case is chosen so that **only the class under test can produce the number**. The
 * first draft compared an emoji against `'ab'` and both measured 2, so it passed whatever
 * the regex did — a test that could not fail is the thing this file exists to catch.
 */
describe('the Unicode classes survive being built from strings', () => {
  it('zero-width cluster: an invisible character occupies no column', () => {
    expect(width('\u200B')).toBe(0);
  });

  it('leading non-printing: an invisible prefix does not add to its cluster', () => {
    expect(width('\u200B\u0915')).toBe(width('\u0915'));
  });

  it('RGI emoji: a ZWJ sequence is one two-column cluster, not four', () => {
    expect(width('\u{1F469}\u200D\u{1F4BB}')).toBe(2);
  });

  it('spacing mark: it takes a column of its own, unlike a nonspacing mark', () => {
    expect(width('\u0915\u0903')).toBe(width('\u0915') + 1);
  });

  it('extended pictographic: a lone pictograph is two columns', () => {
    expect(width('\u{1F600}')).toBe(2);
  });
});
