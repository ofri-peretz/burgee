/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * The root follows string-width 9.0.0 (D-20261113-string-width-9). Every case below is one
 * string-width 9.0.0 and 8.3.0 answer differently, with 9's answer as the literal — measured
 * against both packages on 2026-11-13 — so each fails on the root as it was before the port,
 * which measured by 8's rules. `linegauge/v8` keeps 8's answers, and the last block holds it
 * to them: `slice`, `wrap`, `truncate` and `widest` measure with it.
 */
import { afterEach, describe, expect, it } from 'vitest';

import width, { lineCount, measure } from './index.js';
import { overrides, register, setOverrides } from './plugin.js';
import { slice } from './slice.js';
import widthV8 from './v8.js';

afterEach(() => {
  for (const name of [...overrides().keys()]) setOverrides(name, {});
});

/** `[case, input, string-width 9.0.0, string-width 8.3.0]`. */
const MOVED: readonly (readonly [string, string, number, number])[] = [
  // A lone surrogate is written out as U+FFFD, which a terminal draws.
  ['a lone high surrogate', '\uD83D', 1, 0],
  ['a lone low surrogate in text', 'a\uDE00b', 3, 2],
  // A spacing prepended concatenation mark is a visible column, unless a wide glyph takes it in.
  ['ARABIC NUMBER SIGN before digits', '\u0600123', 4, 3],
  ['ARABIC NUMBER SIGN alone', '\u0600', 1, 0],
  ['two prepended marks before a letter', '\u0600\u0600a', 3, 1],
  ['two prepended marks and nothing after them', '\u0600\u0600', 2, 0],
  ['a prepended mark before a flag', '\u0600\u{1F1FA}\u{1F1F8}', 2, 1],
  ['an astral prepended mark before a letter', '\u{110BD}a', 2, 1],
  // A cluster opening with Hangul is one syllable block, the width of its first code point.
  ['a leading jamo and a syllable in one cluster', '\u1100\uAC00', 2, 4],
  ['two vowel jamo', '\u1161\u1161', 1, 2],
  ['a choseong filler and a vowel', '\u115F\u1161', 2, 1],
  ['a skin-tone swatch after a syllable', '\uAC00\u{1F3FB}', 4, 2],
  // A cluster opening with an emoji is two columns, whatever trails it.
  ['a lone regional indicator', '\u{1F1E6}', 2, 1],
  ['a pair naming no flag', '\u{1F1E6}\u{1F1E6}', 2, 1],
  ['a flag and a lone indicator', '\u{1F1FA}\u{1F1F8}\u{1F1E6}', 4, 3],
  ['a digit with VS16', '1\uFE0F', 2, 1],
  ['a flag with a dangling joiner', '\u{1F1FA}\u{1F1F8}\u200D', 2, 1],
  ['a text-default heart with VS16 and a dangling joiner', '\u2764\uFE0F\u200D', 2, 1],
  // An unqualified keycap is text: the width of its base.
  ['an unqualified keycap', '1\u20E3', 1, 2],
  // A wide BMP emoji with VS15 asks for its one-column text style.
  ['a watch with VS15', '\u231A\uFE0E', 1, 2],
  ['a watch with VS15 in text', 'a\u231A\uFE0Eb', 3, 4],
  // A skin-tone modifier with no base before it is a two-column swatch.
  ['a letter and a skin tone', 'a\u{1F3FB}', 3, 1],
  ['an emoji and two stray skin tones', '\u{1F600}\u{1F3FB}\u{1F3FB}', 6, 2],
  ['a minimally-qualified ZWJ sequence and a stray skin tone', '\u2764\u200D\u{1F525}\u{1F3FB}', 4, 2],
  // Otherwise every visible code point counts: an Indic conjunct, Thai and Lao AM.
  ['a Devanagari conjunct', '\u0915\u094D\u0937', 2, 1],
  ['a Thai consonant and SARA AM', '\u0E01\u0E33', 2, 1],
  ['a Lao consonant and AM', '\u0E81\u0EB3', 2, 1],
];

describe('the root measures by string-width 9.0.0', () => {
  it.each(MOVED)('%s', (_name, input, nine) => {
    expect(width(input)).toBe(nine);
  });

  it('measures a lone surrogate as U+FFFD, which is ambiguous, under ambiguousIsNarrow: false', () => {
    expect(width('\uD83D', { ambiguousIsNarrow: false })).toBe(2);
  });

  it('lets a wide glyph after a prepended mark take it in, and not a narrow one or nothing', () => {
    expect(width('\u0600\u4E00'), 'East Asian Wide').toBe(2);
    expect(width('\u0600\u{1F600}'), 'an emoji').toBe(2);
    expect(width('\u0600\u2764\u200D\u{1F525}'), 'a minimally-qualified ZWJ sequence').toBe(2);
    expect(width('\u0600\u231A\uFE0E'), 'an emoji asked for in text style is narrow').toBe(2);
    expect(width('\u0600\u0301'), 'a mark that draws nothing').toBe(1);
    expect(width('\u0600\u{1F3FB}'), 'a skin tone alone is an RGI emoji').toBe(2);
    expect(width('\u0600a\u{1F3FB}'), 'two columns, but not one wide glyph').toBe(4);
  });

  it('leaves the zero-width Syriac abbreviation mark out of the prepended marks', () => {
    expect(width('\u070Fa')).toBe(1);
  });

  it('counts nothing after a joiner, and a joiner-broken conjunct whole', () => {
    expect(width('\u0915\u094D\u200D\u0937')).toBe(1);
    expect(width('\u0915\u094D\u200C\u0937')).toBe(2);
  });

  it('collapses a run of Kirat Rai vowel signs into one glyph', () => {
    expect(width('\u{16D45}\u{16D63}\u{16D67}')).toBe(2);
    expect(width('\u{16D45}\u{16D63}\u{16D63}\u{16D63}')).toBe(2);
  });

  it('keeps an astral emoji wide under VS15, as string-width 9 does', () => {
    expect(width('\u{1F44D}\uFE0E')).toBe(2);
  });

  it('keeps what both majors agree on', () => {
    expect(width('')).toBe(0);
    expect(width('abc')).toBe(3);
    expect(width('\u0001')).toBe(0);
    expect(width('\u200B')).toBe(0);
    expect(width('\u0301\u0301'), 'a cluster of marks with no base').toBe(0);
    expect(width('\u{1F468}\u200D\u{1F469}\u200D\u{1F467}')).toBe(2);
    expect(width('\u{1F44B}\u{1F3FD}')).toBe(2);
    expect(width('\uFF76\uFF9E')).toBe(2);
    expect(width('\u001B[31m\u4E00\u001B[39m')).toBe(2);
    expect(width('\u001B[31mab', { countAnsiEscapeCodes: true })).toBe(6);
    expect(width(123 as unknown as string)).toBe(0);
  });

  it('measures and counts lines by the same rules', () => {
    expect(measure('\u{1F1E6}')).toBe(2);
    expect(measure('a\u{1F1E6}')).toBe(3);
    expect(measure('abc')).toBe(3);
    expect(lineCount('\u{1F1E6}\u{1F1E6}\n', 1)).toBe(3);
  });

  it('asks a plugin first, before the emoji rules', () => {
    register({ name: 'indicators', widths: { lone: { ranges: [[0x1f_1e_6, 0x1f_1f_f]] as const, columns: 1, why: 'a test terminal draws a lone indicator narrow' } } });
    expect(width('\u{1F1E6}')).toBe(1);
    expect(width('a\u{1F1E6}')).toBe(2);
  });
});

describe('linegauge/v8 keeps string-width 8.3.0, which slice and wrap measure with', () => {
  it.each(MOVED)('%s', (_name, input, _nine, eight) => {
    expect(widthV8(input)).toBe(eight);
  });

  it('cuts by 8.3.0 columns, as slice-ansi 10.0.1 does', () => {
    expect(slice('A\u{1F1E6}B', 1, 2)).toBe('\u{1F1E6}');
    expect(slice('\u1100\uAC00B', 0, 4)).toBe('\u1100\uAC00');
  });
});
