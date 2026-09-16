/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * R2 (Y11) — the lock the requirement names, which did not exist until now.
 *
 * `width()` has two implementations of one answer. `asciiColumns` returns `s.length` when
 * every code point sits between 0x20 and 0x7E; everything else walks `Intl.Segmenter`
 * through `measure`. The design has said since 2026-09-09 that "the two are locked equal by
 * `differential.test.ts`", and `index.ts` said the fast path was still at the Design→Build
 * gate. Both were wrong in opposite directions: the fast path shipped, and nothing compared
 * it with the path it short-circuits.
 *
 * That is the dangerous shape of an unproven optimisation. A fast path that is wrong is not
 * a slow program, it is a **silently wrong measurement** — a box a column short, a help
 * column that does not line up — and every existing test either exercises inputs the fast
 * path rejects (the emoji and CJK cases) or inputs where both paths happen to be trivially
 * right (`'abc'`). Widening the fast path's range by one byte, or reaching for `charCodeAt`,
 * would have passed the whole suite.
 *
 * So the assertion here is the identity itself, over a corpus, rather than a list of
 * expected numbers: for every input, `width(s)` — which may take either path — equals
 * `measure(strip(s))`, which always takes the slow one. A number written down here would be
 * a third answer to check against two, and the thing that must not drift is the two.
 *
 * The corpus is the three the requirement asks for: the six-row grapheme table from the
 * intent, the shapes the incumbents' own suites grade, and a generator seeded from
 * `SEED` — recorded, so a failure is reproducible rather than a story about a run.
 */
import { describe, expect, it } from 'vitest';

import { strip } from './strip.js';
import { measure, width } from './width.js';

/**
 * The intent's table, as assertions rather than as a document.
 *
 * `codeUnits` is what `.length` answers and `graphemes` is what a terminal draws. Every row
 * is a case where the two disagree except the last, which is there because CJK is the
 * opposite trap: three graphemes, three code units, and **six** columns.
 */
const GRAPHEME_TABLE = [
  { name: 'family ZWJ', text: '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466}', codeUnits: 11, graphemes: 1, columns: 2 },
  { name: 'regional flag', text: '\u{1F1EE}\u{1F1F1}', codeUnits: 4, graphemes: 1, columns: 2 },
  { name: 'skin tone', text: '\u{1F44B}\u{1F3FD}', codeUnits: 4, graphemes: 1, columns: 2 },
  { name: 'keycap', text: '1\uFE0F\u20E3', codeUnits: 3, graphemes: 1, columns: 2 },
  { name: 'combining', text: 'e\u0301', codeUnits: 2, graphemes: 1, columns: 1 },
  { name: 'CJK', text: '\uD55C\uAD6D\uC5B4', codeUnits: 3, graphemes: 3, columns: 6 },
] as const;

const graphemes = (text: string): number => [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(text)].length;

describe('the six-row grapheme table (intent.md), as a passing test rather than a document', () => {
  it.each(GRAPHEME_TABLE)('$name: $codeUnits code units, $graphemes grapheme(s), $columns column(s)', ({ text, codeUnits, graphemes: clusters, columns }) => {
    expect(text.length).toBe(codeUnits);
    expect(graphemes(text)).toBe(clusters);
    expect(width(text)).toBe(columns);
  });
});

/**
 * Shapes the four vendored suites grade, plus the ones that sit on the fast path's edge.
 *
 * 0x1F, 0x20, 0x7E and 0x7F are the boundary: the first and last are outside the range
 * `asciiColumns` accepts and must fall through, the middle two are inside it. A mutation
 * that moves either bound by one shows up here and nowhere else in the suite.
 */
const FIXTURES: string[] = [
  '',
  ' ',
  'abc',
  '0'.repeat(50),
  'a b\tc',
  '\u001B[31mred\u001B[39m',
  '\u001B[38:2::255:0:0mtruecolour\u001B[39m',
  '\u001B]8;;https://example.com\u0007link\u001B]8;;\u0007',
  '\u001F',
  '\u0020',
  '\u007E',
  '\u007F',
  '\u0000abc',
  'a\nb',
  '\u53E4\u6C60\u3084',
  '\uFF76\uFF9E',
  '\uFF21',
  '\u{1F984}',
  'a\u{1F984}b',
  '\u200B',
  '\u0915\u093E',
  '\u0600',
  '\u1100\u1100\u1100\u1100\u1100\u1100',
  '\u2764\u200D\u{1F525}',
];

/**
 * A 32-bit PRNG written out rather than imported: this package has no dependencies and a
 * corpus generator is not a reason to acquire one. `SEED` is recorded so the corpus is the
 * same on every machine and in every run — a randomised test whose seed is the clock reports
 * a failure nobody can reproduce, which is worse than no randomised test.
 */
const SEED = 0x5EED_1_5A;
const mulberry32 = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B_79F5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
};

/**
 * The alphabet the generator draws from, chosen so a string can land on either path and on
 * the seam between them: printable ASCII (the fast path), a control character and an escape
 * sequence (which force the slow one), and the four cluster shapes the width table gets
 * wrong when it is read per code point instead of per cluster.
 */
const ALPHABET = ['a', 'Z', '0', ' ', '~', '\u001F', '\u007F', '\u001B[1m', '\u001B[0m', '\u53E4', '\uFF21', '\u{1F984}', '\u200D', '\u0301', '\u1100', '\u20E3', '\n'];

const CORPUS_SIZE = 2_000;
const MAX_LENGTH = 24;

function corpus(): string[] {
  const random = mulberry32(SEED);
  const out: string[] = [];
  for (let i = 0; i < CORPUS_SIZE; i += 1) {
    const length = Math.floor(random() * MAX_LENGTH);
    let text = '';
    for (let j = 0; j < length; j += 1) text += ALPHABET[Math.floor(random() * ALPHABET.length)] ?? '';
    out.push(text);
  }
  return out;
}

/**
 * The lock.
 *
 * `width` picks a path; `measure(strip(s))` is the path it may skip. Equality is the whole
 * requirement, and it is asserted for every input rather than only for the ASCII ones,
 * because a change that moves the fast path's *entry condition* — not its arithmetic — is
 * caught only by an input that used to be rejected and now is not.
 */
const slowPath = (text: string): number => measure(strip(text));

describe('R2 — the ASCII fast path answers what the Segmenter path answers', () => {
  it.each(GRAPHEME_TABLE)('$name', ({ text }) => {
    expect(width(text)).toBe(slowPath(text));
  });

  it.each(FIXTURES)('%j', (text) => {
    expect(width(text)).toBe(slowPath(text));
  });

  it(`agrees on all ${String(CORPUS_SIZE)} generated inputs (seed ${String(SEED)})`, () => {
    const disagreements = corpus().filter((text) => width(text) !== slowPath(text));
    expect(disagreements.map((text) => ({ text, fast: width(text), slow: slowPath(text) }))).toEqual([]);
  });

  /**
   * The corpus has to reach both paths or the identity above is vacuous. Asserted rather
   * than assumed: an alphabet edit that dropped every ASCII character would leave the
   * lock green while locking nothing.
   */
  it('the generated corpus reaches both paths', () => {
    const inputs = corpus().filter((text) => text !== '');
    const ascii = inputs.filter((text) => [...text].every((c) => (c.codePointAt(0) ?? 0) >= 0x20 && (c.codePointAt(0) ?? 0) <= 0x7e));
    expect(ascii.length).toBeGreaterThan(0);
    expect(inputs.length - ascii.length).toBeGreaterThan(0);
  });
});
