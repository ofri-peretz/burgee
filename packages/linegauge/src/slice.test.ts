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
 * Two clusters `width` and `slice` used to count differently, and no longer do.
 *
 * `width` gives string-width's answer: CRLF is no column and a lone regional indicator is
 * one. slice-ansi 9 gave every cluster at least one position and a lone indicator two, and
 * `slice` followed it with a `positions()` rule of its own (102 / 104 against 9's suite
 * without it). slice-ansi 10 takes its columns from string-width (`counts CRLF as zero width`,
 * `counts columns the same way as string-width`), so `slice` now cuts by `width`'s numbers and
 * the two agree (burgee#1392).
 */
describe('slice counts the columns width counts, as slice-ansi 10 does', () => {
  it('gives CRLF no column, so it rides with the cluster after it', () => {
    expect(width('\r\n')).toBe(0);
    expect(slice('A\r\nB', 1, 2)).toBe('\r\nB');
    expect(sliceAnsi('A\r\nB', 1, 2)).toBe(slice('A\r\nB', 1, 2));
  });

  it('gives a lone regional indicator one column, as string-width does', () => {
    expect(width('\u{1F1E6}')).toBe(1);
    expect(slice('A\u{1F1E6}B', 1, 3)).toBe('\u{1F1E6}B');
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

/**
 * The escape grammar — every sequence `slice` carries without interpreting it.
 *
 * The corpus above sends SGR and one `ST`-terminated link; slice-ansi 10's suite, which grades
 * this file in `compat-oracle`, sends the rest, but in another process. These are the shapes
 * that decide where a sequence *ends*: which terminator closes which introducer, what a
 * malformed or unterminated one swallows, and when an introducer is only a character. A
 * sequence that ends one byte late eats text; one byte early prints half an escape. Each
 * case is graded against slice-ansi and against a literal, so a wrong answer names itself
 * rather than agreeing with a moved dependency.
 */
const BEL = '\u0007';
const ST = `${ESC}\\`;
const C1_ST = '\u009C';
const OPEN_A = `${ESC}]8;;https://a.example${BEL}`;
const OPEN_B = `${ESC}]8;;https://b.example${BEL}`;
const CLOSE = `${ESC}]8;;${BEL}`;
const RED = `${ESC}[31m`;

describe('an escape slice does not interpret is carried whole, and ends where slice-ansi ends it', () => {
  // Each sequence sits between `a` and `bc`. Cut at [0, 2) it is carried whole between the two
  // letters; cut at [1, 2) it is dropped with the `a` before it and occupies no column, so the
  // cut is exactly `b`. A sequence that ended late would have eaten the `b`; one that ended early
  // would leave its tail as text, and the tail would be what [1, 2) returned.
  it.each([
    ['a lone ST', ST],
    ['a lone C1 ST', C1_ST],
    ['an OSC ended by BEL', `${ESC}]0;title${BEL}`],
    ['an OSC ended by ST', `${ESC}]0;title${ST}`],
    ['an OSC ended by the C1 ST', `${ESC}]0;title${C1_ST}`],
    ['a DCS, which BEL does not end', `${ESC}Pq${BEL}x${ST}`],
    ['a C1 OSC ended by BEL', `\u009D0;t${BEL}`],
    ['a C1 DCS ended by the C1 ST', `\u0090q${C1_ST}`],
    ['a C1 DCS, which BEL does not end', `\u0090q${BEL}x${C1_ST}`],
    ['a CSI with another final byte', `${ESC}[2K`],
    ['a private CSI ending in m, which is not an SGR', `${ESC}[?25m`],
    // xterm's modifyOtherKeys. Read as an SGR its `1` would be bold, and the cut would reopen it.
    ['a CSI with a private parameter byte ending in m, which is not an SGR', `${ESC}[>4;1m`],
    ['a CSI with an intermediate byte', `${ESC}[1 q`],
    ['a CSI ending in m after an intermediate, which is not an SGR', `${ESC}[1 m`],
    // slice-ansi 10.0.1 (burgee#1515): a link's URI separator is looked for before its
    // terminator, never past it, so a link with none is an OSC like any other. 10.0.0 read on
    // past the BEL to the next `;` and took the rest of the string.
    ['a link with no URI separator before its BEL', `${ESC}]8;params${BEL}`],
    ['a link with no URI separator before its ST', `${ESC}]8;id=x${ST}`],
    ['a C1 link with no URI separator before its C1 ST', `\u009D8;id=x${C1_ST}`],
  ])('%s', (_name, sequence) => {
    const input = `a${sequence}bc`;
    for (const [start, end, expected] of [[0, 2, `a${sequence}b`], [1, 2, 'b']] as const) {
      expect(slice(input, start, end), `[${String(start)}, ${String(end)})`).toBe(expected);
      expect(sliceAnsi(input, start, end), `slice-ansi [${String(start)}, ${String(end)})`).toBe(expected);
    }
  });

  // With no terminator where one is needed, the rest of the string is the sequence: [0, 2) is
  // the whole input, and there is no column 1 left to cut.
  it.each([
    ['a link with no terminator', `${ESC}]8;;https://x.example`],
    ['an unterminated OSC', `${ESC}]0;title`],
    ['an unterminated DCS', `${ESC}Pqx`],
  ])('%s', (_name, sequence) => {
    const input = `a${sequence}bc`;
    for (const [start, end, expected] of [[0, 2, input], [1, 2, '']] as const) {
      expect(slice(input, start, end), `[${String(start)}, ${String(end)})`).toBe(expected);
      expect(sliceAnsi(input, start, end), `slice-ansi [${String(start)}, ${String(end)})`).toBe(expected);
    }
  });

  it.each([
    ['a link ended by the C1 ST, which closes with its own terminator', `a${ESC}]8;;https://x.example${C1_ST}bc`, [1, 2], `${ESC}]8;;https://x.example${C1_ST}b${ESC}]8;;${C1_ST}`],
    ['a CSI broken by a byte no CSI contains ends before that byte', `a${ESC}[31\u0100bc`, [1, 3], '\u0100b'],
    ['an unterminated CSI at the end is the rest of the string', `ab${ESC}[31`, [0, 5], `ab${ESC}[31`],
    ['… and occupies no column', `ab${ESC}[31`, [2, 3], ''],
    // An introducer that starts nothing this reads is a character of no column, so it rides
    // with the text after it.
    ['ESC before a byte that introduces nothing', `a${ESC}7b`, [1, 2], `${ESC}7`],
    ['… and the byte after it is text', `a${ESC}7b`, [2, 3], 'b'],
    ['ESC as the last character', `ab${ESC}`, [2, 3], ESC],
  ])('%s', (_name, input, [start = 0, end], expected) => {
    expect(slice(input, start, end)).toBe(expected);
    expect(sliceAnsi(input, start, end)).toBe(expected);
  });

  it('drops an opaque sequence before the range starts and after it ends', () => {
    const input = `a${ESC}[2Kb${ESC}[2Kc`;
    expect(slice(input, 1, 2)).toBe('b');
    expect(sliceAnsi(input, 1, 2)).toBe('b');
  });

  it('reads a C1 CSI as an SGR, and reopens it with the introducer it came with', () => {
    const input = `\u009B31mabc\u009B39m`;
    expect(slice(input, 1, 2)).toBe(`\u009B31mb${ESC}[39m`);
    expect(sliceAnsi(input, 1, 2)).toBe(slice(input, 1, 2));
  });

  it('gives the C1 introducer only to what that sequence opened, not to a style already open', () => {
    const input = `${ESC}[31m\u009B1mabc`;
    expect(slice(input, 1, 2)).toBe(`${ESC}[31m\u009B1mb${ESC}[22m${ESC}[39m`);
    expect(sliceAnsi(input, 1, 2)).toBe(slice(input, 1, 2));
  });
});

describe('a link or a style that ends up around no text is taken back out', () => {
  it.each([
    ['a link closed before any text', `a${OPEN_A}${CLOSE}b`, [0, 2], 'ab'],
    ['a link the cut leaves empty', `a${OPEN_A}古`, [0, 2], 'a'],
    ['an opener the cut leaves empty', `a${RED}古`, [0, 2], 'a'],
    ['a link at the very end', `ab${OPEN_A}`, [0, undefined], 'ab'],
    ['a link replaced by another before any text', `a${OPEN_A}${OPEN_B}b${CLOSE}`, [0, undefined], `a${OPEN_B}b${CLOSE}`],
    // The opener is recorded after the link; taking the link out has to move that record back
    // by the link's length, or the cut lands inside the SGR and prints half of it.
    ['a link removed from in front of an opener the cut then removes', `a${OPEN_A}${RED}${CLOSE}古`, [0, 2], 'a'],
  ])('%s', (_name, input, [start = 0, end], expected) => {
    expect(slice(input, start, end)).toBe(expected);
    expect(sliceAnsi(input, start, end)).toBe(expected);
  });

  it('closes a link that wrapped text before the next one opens, since OSC 8 does not nest', () => {
    const input = `${OPEN_A}a${OPEN_B}b${CLOSE}`;
    expect(slice(input)).toBe(`${OPEN_A}a${CLOSE}${OPEN_B}b${CLOSE}`);
    expect(sliceAnsi(input, 0)).toBe(slice(input));
  });
});

describe('slice-ansi 10.0.1 at its edges', () => {
  const BELL = String.fromCodePoint(7);
  const open = `${ESC}]8;;https://one.test${BELL}`;
  const close = `${ESC}]8;;${BELL}`;

  // A cut that takes back an opener with no text after it takes back the link moves after it
  // too: the link that wrapped `A` is still the one to close, whatever replaced or closed it
  // between the opener and the wide character the cut stopped at.
  it.each([
    ['another link opened', `${ESC}]8;;https://two.test${BELL}`],
    ['the link closed', close],
    ['another link opened and closed', `${ESC}]8;;https://two.test${BELL}${close}`],
  ])('rolls back the link with the styles when %s after the last text', (_name, transition) => {
    const input = `${open}A${ESC}[31m${transition}\u{1F600}`;
    expect(slice(input, 0, 2)).toBe(`${open}A${close}`);
    expect(sliceAnsi(input, 0, 2)).toBe(`${open}A${close}`);
  });

  // A link the cut took back out before the rollback stays out: the rollback must not restore it
  // and then remove its opener's length a second time from what is left.
  it('does not restore a link that was already taken back out', () => {
    const input = `A${open}${ESC}[2K${ESC}[31m${close}\u{1F600}`;
    expect(slice(input, 0, 2)).toBe(`A${ESC}[2K`);
    expect(sliceAnsi(input, 0, 2)).toBe(`A${ESC}[2K`);
  });

  // The URI starts after the first `;` past the parameters, so a URI may itself end in `;`.
  it('opens a link whose URI ends in a semicolon', () => {
    const input = `a${ESC}]8;;x;${BELL}b${close}c`;
    for (const [start, end] of [[1, 2], [0, 3]] as const) {
      expect(slice(input, start, end), `[${String(start)}, ${String(end)})`).toBe(sliceAnsi(input, start, end));
    }
    expect(slice(input, 1, 2)).toBe(`${ESC}]8;;x;${BELL}b${close}`);
  });

  // A style between the two halves of a surrogate pair rides inside the one code point they make.
  it('keeps a surrogate pair whole when a style separates its halves', () => {
    const input = `\uD800${ESC}[31m\uDC00ABC`;
    for (const [start, end] of [[0, 1], [1, 2], [0, 4]] as const) {
      expect(slice(input, start, end), `[${String(start)}, ${String(end)})`).toBe(sliceAnsi(input, start, end));
    }
    expect(slice(input, 0, 1)).toBe(`\uD800${ESC}[31m\uDC00${ESC}[39m`);
    expect(slice(input, 1, 2)).toBe(`${ESC}[31mA${ESC}[39m`);
  });
});

describe('an escape inside a cluster belongs to the cluster', () => {
  it('keeps a style written between a base and its mark, even at the end of the range', () => {
    // `e` fills the one column asked for; the SGR after it is past the end by position, but the
    // mark that follows is still `é`, so the style rides with it rather than being dropped.
    const input = `e${RED}\u0301x`;
    expect(slice(input, 0, 1)).toBe(`e${RED}\u0301${ESC}[39m`);
    expect(sliceAnsi(input, 0, 1)).toBe(slice(input, 0, 1));
  });
});

describe('every style family closes with its own code', () => {
  // Each modifier and each end of each colour range, cut inside the text: the fragment closes
  // what it opened with the closer that family uses, not a full reset.
  it.each([
    [1, 22],
    [2, 22],
    [3, 23],
    [4, 24],
    [7, 27],
    [8, 28],
    [9, 29],
    [53, 55],
    [30, 39],
    [37, 39],
    [90, 39],
    [97, 39],
    [40, 49],
    [47, 49],
    [100, 49],
    [107, 49],
  ])('opens with %i and closes with %i', (open, close) => {
    expect(slice(`${ESC}[${String(open)}mabc${ESC}[${String(close)}m`, 0, 2)).toBe(`${ESC}[${String(open)}mab${ESC}[${String(close)}m`);
  });

  it.each([
    ['blink, which has no closer of its own', `${ESC}[5mabc`, `${ESC}[5mab${ESC}[0m`],
    ['98, one past the bright foregrounds, unknown and closed by a reset', `${ESC}[98mabc`, `${ESC}[98mab${ESC}[0m`],
    ['108, one past the bright backgrounds, unknown and closed by a reset', `${ESC}[108mabc`, `${ESC}[108mab${ESC}[0m`],
    ['the code just past the background range', `${ESC}[48;5;20mabc`, `${ESC}[48;5;20mab${ESC}[49m`],
  ])('%s', (_name, input, expected) => {
    expect(slice(input, 0, 2)).toBe(expected);
  });
});

describe('extended colours are read to their last argument and no further', () => {
  it.each([
    ['a truecolour foreground, then bold', `${ESC}[38;2;255;128;64;1mab${ESC}[0m`, `${ESC}[38;2;255;128;64m${ESC}[1ma${ESC}[22m${ESC}[39m`],
    ['a 256-colour foreground, then bold', `${ESC}[38;5;208;1mab${ESC}[0m`, `${ESC}[38;5;208m${ESC}[1ma${ESC}[22m${ESC}[39m`],
    ['a truecolour background', `${ESC}[48;2;1;2;3mab`, `${ESC}[48;2;1;2;3ma${ESC}[49m`],
    ['a truecolour underline', `${ESC}[58;2;1;2;3mab`, `${ESC}[58;2;1;2;3ma${ESC}[59m`],
    ['a colon 256-colour foreground', `${ESC}[38:5:208mab`, `${ESC}[38:5:208ma${ESC}[39m`],
    ['a truecolour missing its blue, which opens nothing', `${ESC}[38;2;1;2mab`, 'a'],
    ['a 256-colour missing its index, which opens nothing', `${ESC}[38;5mab`, 'a'],
    ['a truecolour whose arguments read differently in another base', `${ESC}[38;2;10;20;30mab`, `${ESC}[38;2;10;20;30ma${ESC}[39m`],
    ['a truecolour missing its green and blue', `${ESC}[38;2;1mab`, 'a'],
    ['a truecolour with no arguments', `${ESC}[38;2mab`, 'a'],
    ['an extended colour in a mode that is neither 2 nor 5', `${ESC}[38;9;1;2;3mab`, 'a'],
    ['a colon truecolour missing its blue', `${ESC}[38:2:1:2mab`, 'a'],
    ['a colon colour in a mode that is neither 2 nor 5', `${ESC}[38:9:1mab`, 'a'],
  ])('%s', (_name, input, expected) => {
    expect(slice(input, 0, 1)).toBe(expected);
  });
});

describe('a closer met past the cut is kept as written', () => {
  it.each([
    ['an underline colour closed by 59', `${ESC}[58;5;9mab${ESC}[59mcd`, 3, `${ESC}[58;5;9mab${ESC}[59mc`],
    ['a colon underline colour closed by 59', `${ESC}[58:5:9mab${ESC}[59mcd`, 3, `${ESC}[58:5:9mab${ESC}[59mc`],
    ['a full reset right after the range', `${ESC}[31mab${ESC}[0mcd`, 2, `${ESC}[31mab${ESC}[0m`],
    ['a foreground reset, then the bold still open', `${ESC}[31m${ESC}[1mab${ESC}[39mcd`, 2, `${ESC}[31m${ESC}[1mab${ESC}[39m${ESC}[22m`],
    ['an opener rolled back when a wide character overruns', `${ESC}[31ma${ESC}[1m古`, 2, `${ESC}[31ma${ESC}[39m`],
    ['one plain character', 'a', 1, 'a'],
    ['a link closed before any link opened', `ab${ESC}]8;;${ESC}\\cd`, 3, `ab${ESC}]8;;${ESC}\\c`],
  ])('%s', (_name, input, end, expected) => {
    expect(slice(input, 0, end)).toBe(expected);
  });
});

describe('a close code ends only what it closes', () => {
  it.each([
    ['22 ends bold', `${ESC}[1mab${ESC}[22mcd`, [0, 3], `${ESC}[1mab${ESC}[22mc`],
    ['22 ends bold and leaves italic open', `${ESC}[1m${ESC}[3mab${ESC}[22mcd`, [0, 3], `${ESC}[1m${ESC}[3mab${ESC}[22mc${ESC}[23m`],
    ['two unknown parameters are two styles', `${ESC}[20m${ESC}[21mabc`, [1, 2], `${ESC}[20m${ESC}[21mb${ESC}[0m${ESC}[0m`],
    ['one unknown parameter written twice is one style', `${ESC}[20m${ESC}[20mabc`, [1, 2], `${ESC}[20mb${ESC}[0m`],
  ])('%s', (_name, input, [start, end], expected) => {
    expect(slice(input, start, end)).toBe(expected);
  });
});

describe('the less common sequences and the bookkeeping around them', () => {
  const ST = `${ESC}\\`;
  it.each([
    ['a C1 SOS string, zero columns to its ST', 'a\u0098xyz\u009Cbc', [0, 2], 'a\u0098xyz\u009Cb'],
    ['a C1 PM string, zero columns to its ST', 'a\u009Exyz\u009Cbc', [0, 2], 'a\u009Exyz\u009Cb'],
    ['a C1 APC string, zero columns to its ST', 'a\u009Fxyz\u009Cbc', [0, 2], 'a\u009Fxyz\u009Cb'],
    ['an OSC ended by the BEL straight after its introducer', `${ESC}]${BEL}ab`, [0, 1], 'a'],
    ['an OSC after a BEL two characters before it', `${BEL}z${ESC}]0;t${BEL}ab`, [0, 3], `${BEL}z${ESC}]0;t${BEL}ab`],
    ['a C1 OSC right after a BEL', `a${BEL}\u009D0;t${BEL}bc`, [0, 3], `a${BEL}\u009D0;t${BEL}bc`],
    // Since slice-ansi 10.0.1 the BEL ends it: `ESC]8;BEL` is an OSC with no URI, and the `;` is
    // text (burgee#1515). It read on to the second BEL before, as one link.
    ['a link whose parameters hold a BEL, which ends it', `${ESC}]8;${BEL};u${BEL}ab`, [0, 1], ';'],
    ['a reset that opens a colour past the end, which is dropped', `${ESC}[1mab${ESC}[0;31mcd`, [0, 2], `${ESC}[1mab${ESC}[22m`],
    ['a link taken back out with no opener pending', `a${OPEN_A}${CLOSE}古`, [0, 2], 'a'],
    ['a link taken back out after an opener it does not move', `a${RED}${OPEN_A}${CLOSE}古`, [0, 2], 'a'],
    ['a reset kept when a wide character then overruns', `${RED}a${ESC}[0m古`, [0, 2], `${RED}a${ESC}[0m`],
    ['two openers the cut leaves empty, both taken out', `a${RED}${ESC}[1m古`, [0, 2], 'a'],
    ['an opener taken out, leaving the style open before it', `${RED}a${ESC}[1m古`, [0, 2], `${RED}a${ESC}[39m`],
    ['a link closer past the end kept with its own terminator', `${ESC}]8;;u${BEL}ab${ESC}]8;;${ST}cd`, [0, 2], `${ESC}]8;;u${BEL}ab${ESC}]8;;${ST}`],
    ['a link closer past the end with no link open, dropped', `ab${ESC}]8;;${ST}cd`, [0, 2], 'ab'],
    ['a combining mark past the end, kept with its base', 'e\u0301x', [0, 1], 'e\u0301'],
    ['a range that starts past the text, with a style open', `${RED}ab`, [5, 9], ''],
    ['a range that ends before it starts, with a style open', `${RED}ab`, [1, 0], ''],
  ])('%s', (_name, input, [start, end], expected) => {
    expect(slice(input, start, end)).toBe(expected);
  });
});
