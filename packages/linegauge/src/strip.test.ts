/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * R3. Two questions, and the file is in two halves because they are different questions:
 * does `strip` agree with `strip-ansi` (the incumbent, 464 M/wk), and **where does
 * `util.stripVTControlCharacters` not** — which is the measurement the design asked for and
 * the reason this module exists rather than a one-line re-export of Node's.
 */
import { stripVTControlCharacters as nodeStrip } from 'node:util';

import stripAnsi from 'strip-ansi';
import { describe, expect, it } from 'vitest';

import { strip } from './strip.js';
import { width } from './width.js';

const ESC = String.fromCodePoint(27);
const BEL = String.fromCodePoint(7);
const C1 = String.fromCodePoint(0x9B);

/**
 * Sixteen sequence shapes: SGR in three parameter dialects, cursor and erase CSI, OSC under
 * both terminators, a window title, the C1 single-byte introducer, the single-character and
 * charset escapes, DCS, and three malformed inputs. Named so a failure says which shape.
 */
const SHAPES: [name: string, input: string][] = [
  ['SGR colour', `${ESC}[31mred${ESC}[39m`],
  ['SGR reset', `${ESC}[0mplain`],
  ['256 colour', `${ESC}[38;5;9mx${ESC}[39m`],
  ['RGB semicolon form', `${ESC}[38;2;255;0;0mx${ESC}[39m`],
  ['RGB colon form', `${ESC}[38:2::255:0:0mx${ESC}[39m`],
  ['cursor up', `${ESC}[2Aup`],
  ['erase line', `${ESC}[2Kline`],
  ['OSC 8 hyperlink, BEL', `${ESC}]8;;https://x.com${BEL}link${ESC}]8;;${BEL}`],
  ['OSC 8 hyperlink, ST', `${ESC}]8;;https://x.com${ESC}\\link${ESC}]8;;${ESC}\\`],
  ['OSC 0 window title', `${ESC}]0;title${BEL}after`],
  ['C1 CSI introducer', `${C1}31mred`],
  ['single-character escape', `${ESC}creset`],
  ['charset selection', `${ESC}(Bplain`],
  ['incomplete CSI', `${ESC}[31`],
  ['lone ESC', `${ESC}x`],
  ['nothing to strip', 'plain text'],
];

describe('strip agrees with strip-ansi', () => {
  it.each(SHAPES)('%s', (_name, input) => {
    expect(strip(input)).toBe(stripAnsi(input));
  });

  it('is empty for empty, and never throws on a malformed tail', () => {
    expect(strip('')).toBe('');
    expect(strip(ESC)).toBe(stripAnsi(ESC));
    expect(strip(`${ESC}[`)).toBe(stripAnsi(`${ESC}[`));
  });
});

/**
 * The measurement, pinned — and it went red on 2026-09-22 exactly as it was written to.
 *
 * `util.stripVTControlCharacters` was exact on fifteen of the sixteen shapes above and wrong on
 * one, the RGB colon form (`ESC[38:2::255:0:0m`): its scanner stopped at the first `:` and left
 * `:2::255:0:0m` in the output as text. This block recorded which, *"so the day Node fixes it the
 * row that says otherwise goes red"*. That day was the CI runner moving to **Node v24.21.0**,
 * where the colon form strips cleanly. **v24.13.0 and v24.18.0 still leave the parameters
 * behind**, measured on both.
 *
 * So the block is now about the version rather than about Node, and the part that matters did
 * not move: linegauge's `engines` admits every Node 24 before v24.21 — and, since D-132, Node
 * 20.19+ and 22.13+, which have the same bug (both measured, and graded by `compat.yml`'s `floor`
 * cells) — so its own scanner is still needed and still correct on all of them. What each case
 * asserts is linegauge's behaviour unconditionally, and Node's behaviour as one of the two shapes
 * it has been measured to take — a third shape is a new Node and a new note, which is the
 * property this canary was always for.
 */
const NODE_FIXED_COLON_FORM = nodeStripHandlesColon();

function nodeStripHandlesColon(): boolean {
  return nodeStrip(`${ESC}[38:2::255:0:0mred${ESC}[39m`) === 'red';
}

describe('where Node\u2019s own stripper diverges', () => {
  const COLON = `${ESC}[38:2::255:0:0mred${ESC}[39m`;

  it('agrees with Node everywhere except an unterminated CSI, and the colon form on an older Node 24', () => {
    const differ = SHAPES.filter(([, input]) => nodeStrip(input) !== stripAnsi(input)).map(([name]) => name);
    // `incomplete CSI` differs since ansi-regex 6.5.0, whose final byte is never a digit: Node
    // still takes `ESC[31` as `ESC[3` ended by `1`, and strip-ansi keeps it as text.
    expect(differ, 'a shape outside the two measured states — Node changed again; update the note in strip.ts').toEqual(
      NODE_FIXED_COLON_FORM ? ['incomplete CSI'] : ['RGB colon form', 'incomplete CSI'],
    );
  });

  it('strips a colon-form colour correctly on every Node, which is why it has its own scanner', () => {
    // Node's scanner stopped at the first `:` before v24.21. This is not an exotic dialect — it
    // is how a truecolor SGR is written in the ITU T.416 sub-parameter form, which chalk and
    // wrap-ansi both emit and which `style.ts` has always parsed.
    expect(strip(COLON)).toBe('red');
    expect(nodeStrip(COLON)).toBe(NODE_FIXED_COLON_FORM ? 'red' : ':2::255:0:0mred');
  });

  /**
   * The live consequence, which is why this was worth fixing rather than noting. `width.ts`
   * called `stripVTControlCharacters`, so every measurement of a colon-form string was wrong by
   * the length of the leftover parameters — and `wrap`, `slice`, `truncate`, `widest` and
   * flagstaff's box, table and spinner all measure through it. On a Node that still has the bug,
   * that is 15 for a three-column string.
   */
  it('measures a colon-form string at its real width on every Node', () => {
    expect(width(COLON)).toBe(3);
    expect(nodeStrip(COLON).length).toBe(NODE_FIXED_COLON_FORM ? 3 : 15);
  });
});

/**
 * One pass, strip-ansi's grammar — so its edges are the incumbent's too, including the ones the
 * two-pass version answered differently (2026-09-30, B5): a C1 OSC is removed when an `ESC` or
 * `0x9B` is also present and kept when not, as strip-ansi's fast path does, and `ESC [` before a
 * byte that is no final is text.
 *
 * The literals below are ansi-regex 6.6.0's, held here to a literal as well as to the incumbent,
 * so a strip-ansi that resolved an older ansi-regex would name itself rather than pass.
 */
describe('strip is strip-ansi at the edges too', () => {
  it.each([
    // ansi-regex 6.5.0 (2026-10-29), which every fresh strip-ansi 7.2.0 install now resolves:
    // a CSI's final byte is no longer a digit, so `ESC[5d`, whose `d` is outside the final-byte
    // class, is no longer cut after the `5` with a bare `d` left behind — it is not a match at
    // all, and stays as written — and a private-parameter CSI (`ESC[>0;276;0c`, the device
    // attributes reply) is one sequence rather than `ESC[>` and visible text (burgee#1382).
    ['a CSI whose final byte is outside the class', 'a\u001B[5db'],
    ['a CSI with two parameters and a final past the digit class', 'a\u001B[12;40Hb'],
    ['the device attributes reply, a private-parameter CSI', 'a\u001B[>0;276;0cb'],
    ['a C1 private-parameter CSI', 'a\u009B<1;2Mb'],
    ['a DEC private mode set, which was always one sequence', 'a\u001B[?25lb'],
    ['C1 OSC beside a CSI', '\u009D0;title\u009C\u001B[31mred'],
    ['C1 OSC alone, which strip-ansi returns as it is', '\u009D0;title\u009Cplain'],
    ['ESC [ before a non-final byte', 'a\u001B[aa'],
    ['a CSI with no final byte before a link', '\u001B[\u001B]8;;x\u0007t'],
    // ansi-regex 6.6.0 (2026-11-08): the CSI is ECMA-48's own shape — parameter bytes, then
    // intermediates, then any final from `@` to `~` — and DCS, SOS, PM, APC, the escapes whose
    // final byte is a digit, the Linux palette and a cancelled control string are new
    // (burgee#1501–#1509).
    ['a DCS, sixel', 'a\u001BPq#0;2;0;0;0\u001B\\b'],
    ['an APC, the kitty graphics protocol', 'a\u001B_Gf=24;x\u001B\\b'],
    ['a C1 DCS beside a CSI', 'a\u001B[1m\u0090x\u009Cb'],
    ['a BEL inside a DCS, which only an OSC ends on', 'a\u001BPx\u0007y\u001B\\b'],
    ['save cursor', 'a\u001B7b'],
    ['restore cursor, then text', 'a\u001B8lb'],
    ['the line-drawing character set', 'a\u001B(0b'],
    ['screen alignment', 'a\u001B#8b'],
    ['a CSI with an intermediate byte', 'a\u001B[2 qb'],
    ['the Linux console palette', 'a\u001B]P0ff0000b'],
    ['an OSC cancelled by CAN', 'a\u001B]0;t\u0018b\u0007c'],
    ['a two-byte escape ending in |', 'a\u001B|b'],
  ])('%s', (_name, input) => {
    expect(strip(input)).toBe(stripAnsi(input));
  });

  it.each([
    ['a\u001B[5db', 'ab'],
    ['a\u001B[aa', 'aa'],
    ['a\u001B[12;40Hb', 'ab'],
    ['a\u001B[>0;276;0cb', 'ab'],
    ['a\u009B<1;2Mb', 'ab'],
    ['a\u001BPq#0;2;0;0;0\u001B\\b', 'ab'],
    ['a\u001B7lb', 'alb'],
    ['a\u001B]P0ff0000b', 'ab'],
    ['a\u001B]0;t\u0018b\u0007c', 'a\u001B]0;t\u0018b\u0007c'],
    ['\u001B[31', '\u001B[31'],
  ])('turns %j into %j, as ansi-regex 6.6.0 does', (input, expected) => {
    expect(strip(input)).toBe(expected);
  });
});
