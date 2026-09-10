import sliceAnsi from 'slice-ansi';
/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * R4 — graded the way `width` and `wrap` are: the incumbent is the specification.
 *
 * `slice-ansi` is what a caller reaches for today, so every case below runs through both and
 * the assertion is that they agree. Where they do not, the divergence is named and argued
 * rather than smoothed over — a compatibility suite that quietly excludes its
 * disagreements is a suite that has stopped grading.
 */
import { describe, expect, it } from 'vitest';

import { slice } from './slice.js';
import { width } from './width.js';

const ESC = String.fromCodePoint(27);
const red = (s: string) => `${ESC}[31m${s}${ESC}[39m`;
const bold = (s: string) => `${ESC}[1m${s}${ESC}[22m`;

/**
 * Every shape where `slice-ansi` is the specification: plain text, and styles nested and
 * leading. Every case is graded for exact equality.
 */
const CORPUS: [name: string, value: string][] = [
  ['plain', 'hello world'],
  ['red', red('hello world')],
  ['nested', bold(`bold ${red('and red')} again`)],
  ['leading escape', `${ESC}[32mgreen`],
  ['ascii only', 'the quick brown fox'],
];

/** The three shapes where we deliberately differ, each argued at the bottom of this file. */
const WIDE = 'ab\u4F60\u597Dcd';
const FAMILY = 'a\u{1F468}\u200D\u{1F469}\u200D\u{1F467}b';
const COMBINING = 'cafe\u0301 latte';

describe('slice agrees with slice-ansi', () => {
  for (const [name, value] of CORPUS) {
    const columns = width(value);
    for (let start = 0; start <= columns; start++) {
      // `end === start` is excluded here and graded on its own below: the two disagree, on
      // purpose, and burying that in a skipped index would be the dishonest way to pass.
      for (let end = start + 1; end <= columns; end++) {
        it(`${name} [${String(start)}, ${String(end)})`, () => {
          expect(slice(value, start, end)).toBe(sliceAnsi(value, start, end));
        });
      }
    }
  }
});

/**
 * The one divergence, argued rather than smoothed.
 *
 * Asked for zero columns of a styled string, `slice-ansi` returns the *closing* sequence for
 * whatever was open — `ESC[39m` with no opener and no text — because it closes the stack
 * unconditionally on the way out. Printing that is not neutral: it resets the caller's own
 * foreground colour, so `red('a' + sliceAnsi(red('hi'), 2, 2) + 'b')` prints `b` uncoloured.
 *
 * An empty slice has nothing to style, so ours is the empty string. This is a deliberate
 * incompatibility and the only one; every non-empty range above is graded for equality.
 */
describe('an empty range', () => {
  it('is empty here and a bare reset in slice-ansi', () => {
    expect(slice(red('hello world'), 2, 2)).toBe('');
    expect(sliceAnsi(red('hello world'), 2, 2)).toBe(`${ESC}[39m`);
  });

  it('agrees when there was no style to close', () => {
    expect(slice('hello', 2, 2)).toBe(sliceAnsi('hello', 2, 2));
  });

  it('adds no sequence the caller did not write; slice-ansi adds one', () => {
    // Counted, not pattern-matched: `red('a') + red('b')` already contains a reset next to
    // an opener, so "does not contain ESC[39mESC[31m" would pass whatever the slice returned.
    // The discriminating question is how many resets the joined string ends up with.
    const resets = (value: string): number => value.split(`${ESC}[39m`).length - 1;
    const baseline = resets(`${red('a')}${red('b')}`);
    expect(resets(`${red('a')}${slice(red('hi'), 2, 2)}${red('b')}`)).toBe(baseline);
    expect(resets(`${red('a')}${sliceAnsi(red('hi'), 2, 2)}${red('b')}`)).toBe(baseline + 1);
  });
});

describe('the rules a code-unit slice cannot honour', () => {
  it('returns the style, not three bytes of an escape sequence', () => {
    // The bug the module exists to remove, stated as the test that would have caught it.
    const naive = red('hello').slice(0, 3);
    expect(naive).not.toContain('hello'.slice(0, 3));
    expect(slice(red('hello'), 0, 3)).toContain('hel');
    expect(slice(red('hello'), 0, 3)).toContain(`${ESC}[31m`);
  });

  it('closes what it opened, so the fragment is self-contained', () => {
    const out = slice(red('hello world'), 2, 5);
    expect(out.startsWith(`${ESC}[31m`)).toBe(true);
    expect(out.endsWith(`${ESC}[39m`)).toBe(true);
  });

  it('reopens a style that was opened before the cut', () => {
    // `start` lands inside the red run: the opener is behind us and has to be re-emitted,
    // or the caller prints an unstyled fragment.
    expect(slice(red('hello'), 2, 4)).toBe(`${ESC}[31mll${ESC}[39m`);
  });

  it('never returns half a grapheme cluster', () => {
    for (let end = 0; end <= width(FAMILY); end++) {
      const out = slice(FAMILY, 0, end);
      // Either the whole cluster or none of it — never a lone ZWJ or a bare man emoji.
      const zwjOnly = out.includes('\u200D') && !out.includes('\u{1F467}');
      expect(zwjOnly, `end=${String(end)} split the cluster`).toBe(false);
    }
  });

  it('rounds outward at a wide character, never inward', () => {
    // The cluster occupies columns 0 and 1; asking for one column gets both, because half a
    // wide character is not a thing a terminal can print.
    expect(slice('\u4F60x', 0, 1)).toBe('\u4F60');
  });

  it('is empty for an empty or reversed range rather than throwing', () => {
    expect(slice('hello', 3, 3)).toBe('');
    expect(slice('hello', 4, 2)).toBe('');
    expect(slice('', 0, 5)).toBe('');
  });
});

/**
 * The two places `slice-ansi` and this module disagree, each stated with the case that
 * decides it. Neither is an oversight in the corpus above: they are the reason R4 says
 * "never splits a grapheme cluster" and "rounds outward, never inward", and a suite that
 * dropped these inputs would be grading only the easy half.
 */
describe('where slice-ansi is not the specification', () => {
  it('keeps a ZWJ family whole where slice-ansi returns the man alone', () => {
    // The severed grapheme, which is the original problem this package exists for: the
    // terminal receives half a cluster and prints whatever it makes of the pieces.
    expect(sliceAnsi(FAMILY, 1, 2)).toBe('\u{1F468}');
    expect(slice(FAMILY, 1, 2)).toBe('\u{1F468}\u200D\u{1F469}\u200D\u{1F467}');
  });

  it('keeps a combining mark with its base letter, where slice-ansi loses it', () => {
    // Not a cosmetic split: `slice-ansi` returns `cafe` for the first four columns of
    // `cafe` + U+0301, so the acute is *gone* from the output. A caller truncating a name
    // for a table has silently changed it.
    expect(sliceAnsi(COMBINING, 0, 4)).toBe('cafe');
    expect(slice(COMBINING, 0, 4)).toBe('cafe\u0301');
    expect([...slice(COMBINING, 0, 4)]).toHaveLength(5);
  });

  it('rounds outward at a wide character where slice-ansi drops it', () => {
    // `\u4F60` occupies columns 2 and 3. Asked for column 3 alone, slice-ansi returns
    // nothing at all; half a wide character is not printable, so the whole one is the only
    // answer that keeps the caller's column arithmetic true.
    expect(sliceAnsi(WIDE, 3, 4)).toBe('');
    expect(slice(WIDE, 3, 4)).toBe('\u4F60');
  });

  it('and so never loses a column the caller counted', () => {
    // The consequence, which is why the direction was chosen: a table cell built from
    // `slice` is never narrower than the width it was asked for.
    for (let start = 0; start < width(WIDE); start++) {
      expect(width(slice(WIDE, start, start + 1)), `column ${String(start)} vanished`).toBeGreaterThan(0);
    }
  });
});
