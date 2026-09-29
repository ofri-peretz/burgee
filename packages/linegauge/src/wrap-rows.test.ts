/**
 * `wrap()` at the edges of its row bookkeeping — the cases `wrap.test.ts`'s corpus and sweep do
 * not generate.
 *
 * A separate file from `wrap.test.ts` on purpose: that file and `wrap.ts` are being rewritten
 * in another branch, and these cases hold for both the code on `main` and the code there.
 * Every case is graded against wrap-ansi and against a literal, so a wrong answer names itself
 * rather than agreeing with a moved dependency.
 */
import { describe, expect, it } from 'vitest';
import wrapAnsi from 'wrap-ansi';

import { wrap, type WrapOptions } from './wrap.js';

const ESC = '\u001B';
const BEL = '\u0007';
const RED = `${ESC}[31m`;
const RESET_FG = `${ESC}[39m`;
const OPEN = `${ESC}]8;;https://a.example${BEL}`;
const CLOSE = `${ESC}]8;;${BEL}`;

function graded(input: string, columns: number, options: WrapOptions, expected: string): void {
  expect(wrap(input, columns, options)).toBe(expected);
  expect(wrapAnsi(input, columns, options)).toBe(expected);
}

describe('an escape that is neither a style nor a link changes nothing that crosses a row break', () => {
  // The sequence sits *before* the break, inside the link, which is where reading it as a link
  // close would lose the link: the next row would not reopen it.
  it('keeps a link open across the break when a CSI it does not read sits in the row', () => {
    graded(`${OPEN}a${ESC}[2Ka bb${CLOSE}`, 2, {}, `${OPEN}a${ESC}[2Ka${CLOSE}\n${OPEN}bb${CLOSE}`);
  });

  it('keeps a link and a colour open across the break when an OSC title sits in the row', () => {
    graded(`${RED}${OPEN}a${ESC}]0;t${BEL}a bb${CLOSE}${RESET_FG}`, 2, {}, `${RED}${OPEN}a${ESC}]0;t${BEL}a${CLOSE}${RESET_FG}\n${RED}${OPEN}bb${CLOSE}${RESET_FG}`);
  });
});

describe('trimming a row start that is whitespace but not a space', () => {
  it('drops it from the row', () => {
    graded('\u2003x y', 80, {}, 'x y');
  });

  it('and measures the row again, so what fits after it still fits', () => {
    // Two no-break spaces and `x` are three columns before the trim and one after. Measured
    // before, `y` would not fit in three and would start a row of its own.
    graded('\u00A0\u00A0x y', 3, {}, 'x y');
  });
});

describe('an empty row', () => {
  it('closes nothing and reopens nothing, because it never styled anything', () => {
    // Zero columns is the one width at which a line can wrap to a row with nothing in it: each
    // space after `a` is a row of its own, and trimming empties it. The rows either side of it
    // close and reopen the colour; the empty one must not, or it prints a reset for no text.
    graded(`${RED}a  b`, 0, { wordWrap: false }, `${RED}${RESET_FG}\n${RED}a${RESET_FG}\n\n${RED}b`);
  });
});
