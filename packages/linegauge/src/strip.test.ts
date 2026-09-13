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
 * The measurement, pinned. `util.stripVTControlCharacters` is exact on fifteen of the sixteen
 * shapes above and wrong on one, and this records which — so the next person to ask "why not
 * just use Node's?" reads the answer instead of re-deriving it, and so the day Node fixes it
 * the row that says otherwise goes red.
 */
describe('where Node\u2019s own stripper diverges', () => {
  const COLON = `${ESC}[38:2::255:0:0mred${ESC}[39m`;

  it('agrees with Node on fifteen of the sixteen shapes', () => {
    const differ = SHAPES.filter(([, input]) => nodeStrip(input) !== stripAnsi(input)).map(([name]) => name);
    expect(differ, 'if this list changed, Node changed — update the note in strip.ts').toEqual(['RGB colon form']);
  });

  it('leaves the sub-parameters of a colon-form colour in the output as text', () => {
    // Node's scanner stops at the first `:`. This is not an exotic dialect — it is how a
    // truecolor SGR is written in the ITU T.416 sub-parameter form, which chalk and
    // wrap-ansi both emit and which `style.ts` has always parsed.
    expect(nodeStrip(COLON)).toBe(':2::255:0:0mred');
    expect(strip(COLON)).toBe('red');
  });

  /**
   * The live consequence, which is why this was worth fixing rather than noting. `width.ts`
   * called `stripVTControlCharacters`, so every measurement of a colon-form string was wrong
   * by the length of the leftover parameters — and `wrap`, `slice`, `truncate`, `widest` and
   * flagstaff's box, table and spinner all measure through it.
   */
  it('and that made width() answer 15 for a three-column string', () => {
    expect(width(COLON)).toBe(3);
    // The number the old implementation produced, stated so the regression has a shape.
    expect(nodeStrip(COLON).length).toBe(15);
  });
});
