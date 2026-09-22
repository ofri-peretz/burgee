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
 * not move: linegauge declares `engines.node >= 24`, which admits every Node 24 that still has
 * the bug, so its own scanner is still needed and still correct on all of them. What each case
 * asserts is linegauge's behaviour unconditionally, and Node's behaviour as one of the two shapes
 * it has been measured to take — a third shape is a new Node and a new note, which is the
 * property this canary was always for.
 */
const NODE_FIXED_COLON_FORM = nodeStripHandlesColon();

function nodeStripHandlesColon(): boolean {
  return nodeStrip(`${ESC}[38:2::255:0:0mred${ESC}[39m`) === 'red';
}

describe('where Node\u2019s own stripper diverges, on the Node versions where it still does', () => {
  const COLON = `${ESC}[38:2::255:0:0mred${ESC}[39m`;

  it('agrees with Node everywhere except the colon form, and there only on an older Node 24', () => {
    const differ = SHAPES.filter(([, input]) => nodeStrip(input) !== stripAnsi(input)).map(([name]) => name);
    expect(differ, 'a shape outside the two measured states — Node changed again; update the note in strip.ts').toEqual(
      NODE_FIXED_COLON_FORM ? [] : ['RGB colon form'],
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
