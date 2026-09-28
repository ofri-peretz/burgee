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
import { truncate } from './truncate.js';
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

/**
 * Wide characters, a ZWJ family, a combining mark, a hyperlink. Each of the first three was
 * a place slice-ansi 7 and this module disagreed, argued at the bottom of this file under
 * slice-ansi 7; slice-ansi 9 changed its answer on all three, and on the first this module
 * moved to meet it (see `rounds inward`). They are graded for equality now.
 */
const WIDE = 'ab\u4F60\u597Dcd';
const FAMILY = 'a\u{1F468}\u200D\u{1F469}\u200D\u{1F467}b';
const COMBINING = 'cafe\u0301 latte';
const LINK = `x${ESC}]8;;https://example.com${ESC}\\link${ESC}]8;;${ESC}\\y`;
CORPUS.push(['wide', WIDE], ['family', FAMILY], ['combining', COMBINING], ['styled wide', red(WIDE)], ['hyperlink', LINK]);

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

const resets = (value: string): number => value.split(`${ESC}[39m`).length - 1;

/**
 * An empty range is empty — and now the incumbent agrees.
 *
 * slice-ansi 7 answered zero columns of a styled string with the *closing* sequence for
 * whatever was open, `ESC[39m` alone, which reset the caller's own colour when printed. This
 * was the one deliberate incompatibility and it was argued here at length. slice-ansi 9
 * returns the empty string too, so it is asserted as agreement rather than as a divergence.
 */
describe('an empty range', () => {
  it('is empty here and in slice-ansi 9', () => {
    expect(slice(red('hello world'), 2, 2)).toBe('');
    expect(sliceAnsi(red('hello world'), 2, 2)).toBe('');
  });

  it('agrees when there was no style to close', () => {
    expect(slice('hello', 2, 2)).toBe(sliceAnsi('hello', 2, 2));
  });

  it('adds no sequence the caller did not write', () => {
    // Counted, not pattern-matched: `red('a') + red('b')` already contains a reset next to
    // an opener, so "does not contain ESC[39mESC[31m" would pass whatever the slice returned.
    // The discriminating question is how many resets the joined string ends up with.
    const baseline = resets(`${red('a')}${red('b')}`);
    expect(resets(`${red('a')}${slice(red('hi'), 2, 2)}${red('b')}`)).toBe(baseline);
    expect(resets(`${red('a')}${sliceAnsi(red('hi'), 2, 2)}${red('b')}`)).toBe(baseline);
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

  it('rounds inward at a wide character, never outward', () => {
    // The cluster occupies columns 0 and 1. Half a wide character is not a thing a terminal
    // can print, so asked for one column it is left out rather than returned whole: a slice
    // is how a caller makes text fit, and one column too many is the overflow it came to avoid.
    expect(slice('\u4F60x', 0, 1)).toBe('');
    expect(slice('\u4F60x', 0, 2)).toBe('\u4F60');
    expect(slice('x\u4F60', 2)).toBe('');
  });

  it('is empty for an empty or reversed range rather than throwing', () => {
    expect(slice('hello', 3, 3)).toBe('');
    expect(slice('hello', 4, 2)).toBe('');
    expect(slice('', 0, 5)).toBe('');
  });
});

/**
 * `spec.md` § R10 category E — the one failure on the `slice-ansi` row that was ours.
 *
 * The style stack tracked only the SGR parameters in its own close-code table and dropped
 * the rest, so `ESC[1001m` vanished across a cut and the slice came back bare. `slice-ansi`
 * re-emits **any** parameter it saw and closes with `ESC[0m`, and it is right to: the
 * sequence is the caller's, not the library's to vet. A style stack that silently discards
 * what it cannot name is a filter nobody asked for, and it fails in the worst direction —
 * the text is still there, only unstyled, so nothing throws and no test of `width` moves.
 *
 * `ESC[0m` is the close, because it is the only closer that is correct for a parameter
 * whose meaning is unknown: there is no way to derive a narrower one.
 */
describe('an SGR parameter the stack does not recognise', () => {
  it.each([
    [`${ESC}[20mTEST${ESC}[49m`, 0, 4, `${ESC}[20mTEST${ESC}[0m`],
    [`${ESC}[1001mTEST${ESC}[49m`, 0, 3, `${ESC}[1001mTES${ESC}[0m`],
    [`${ESC}[1001mTEST${ESC}[49m`, 0, 2, `${ESC}[1001mTE${ESC}[0m`],
  ])('carries %j through a cut, and slice-ansi agrees', (input, start, end, expected) => {
    expect(slice(input, start, end)).toBe(expected);
    expect(slice(input, start, end)).toBe(sliceAnsi(input, start, end));
  });

  it('reopens it on the far side of a cut, like any other style', () => {
    // The property that makes it a style rather than a passenger: taken from the middle,
    // the unknown parameter is re-emitted at the start of the piece it applies to.
    expect(slice(`${ESC}[1001mTEST${ESC}[0m`, 1, 3)).toBe(`${ESC}[1001mES${ESC}[0m`);
  });

  it('counts nothing towards the width, so the columns are unchanged', () => {
    expect(width(`${ESC}[1001mTEST${ESC}[0m`)).toBe(4);
  });
});

/**
 * Where slice-ansi 7 and this module disagreed, and what became of it.
 *
 * Three divergences were argued here under slice-ansi 7. slice-ansi 9 moved on all three:
 * it keeps a ZWJ family and a combining mark whole, which is what this module already did,
 * and it rounds inward at a wide character, which is what this module did *not* do. That one
 * was ours to move, and the reason is `truncate`: a slice plus an ellipsis, it returned
 * `あい…` — five columns — for a budget of four, because the slice under it rounded outward.
 */
describe('where slice-ansi 7 was not the specification, and 9 is', () => {
  it('keeps a ZWJ family whole, and so does slice-ansi 9', () => {
    expect(slice(FAMILY, 1, 3)).toBe('\u{1F468}\u200D\u{1F469}\u200D\u{1F467}');
    expect(sliceAnsi(FAMILY, 1, 3)).toBe(slice(FAMILY, 1, 3));
  });

  it('keeps a combining mark with its base letter, and so does slice-ansi 9', () => {
    expect(slice(COMBINING, 0, 4)).toBe('cafe\u0301');
    expect(sliceAnsi(COMBINING, 0, 4)).toBe(slice(COMBINING, 0, 4));
  });

  it('drops a wide character the range only half covers, as slice-ansi does', () => {
    // `\u4F60` occupies columns 2 and 3. Asked for column 3 alone, both return nothing.
    expect(slice(WIDE, 3, 4)).toBe('');
    expect(sliceAnsi(WIDE, 3, 4)).toBe('');
  });

  it('and so never returns more columns than were asked for', () => {
    for (let start = 0; start <= width(WIDE); start++) {
      for (let end = start; end <= width(WIDE); end++) {
        expect(width(slice(WIDE, start, end)), `[${String(start)}, ${String(end)})`).toBeLessThanOrEqual(end - start);
      }
    }
  });
});

/**
 * Two clusters `width` and `slice` count differently, and why.
 *
 * `width` gives string-width's answer: CRLF is no column and a lone regional indicator is
 * one. A cut needs somewhere to land, though, so `slice` gives every cluster at least one
 * position and a lone indicator two, as slice-ansi does. An earlier cut of this module used
 * `width`'s numbers for both and failed exactly these two cases of slice-ansi 9's suite
 * (102 / 104), which also took slice-ansi out of `burgee migrate`, since only a level
 * drop-in is rewritten.
 */
describe('where slice counts positions, not rendered columns', () => {
  it('gives CRLF a position of its own, as slice-ansi does', () => {
    expect(width('\r\n')).toBe(0);
    expect(slice('A\r\nB', 1, 2)).toBe('\r\n');
    expect(sliceAnsi('A\r\nB', 1, 2)).toBe(slice('A\r\nB', 1, 2));
  });

  it('gives a lone regional indicator two positions, as slice-ansi does', () => {
    expect(width('\u{1F1E6}')).toBe(1);
    expect(slice('A\u{1F1E6}B', 1, 3)).toBe('\u{1F1E6}');
    expect(sliceAnsi('A\u{1F1E6}B', 1, 3)).toBe(slice('A\u{1F1E6}B', 1, 3));
  });

  it('keeps truncate inside its budget, which positions alone did not', () => {
    // `truncate` measures with `width` and cuts with `slice`. Cutting a tail at `total - keep`
    // positions returned `ef` plus the ellipsis — three columns — for `a` CRLF `bcdef` at two,
    // because the CRLF before the cut is a position and not a column. `truncate.ts` searches
    // for the widest cut that fits instead.
    for (const value of ['a\r\nbcdef', 'a\u{1F1E6}bcdef', '\u200Babcdef']) {
      for (let columns = 1; columns <= 6; columns++) {
        for (const position of ['start', 'middle', 'end'] as const) {
          expect(width(truncate(value, columns, { position })), `${JSON.stringify(value)} ${position} @ ${String(columns)}`).toBeLessThanOrEqual(columns);
        }
      }
    }
  });
});
