/**
 * The SGR reader every cutting operation shares — graded where the incumbent suites do not
 * reach.
 *
 * `wrap-ansi` and `slice-ansi` grade `wrap` and `slice` end to end, and between them they send
 * semicolon colours, resets and the common modifiers. They send almost none of the colon form
 * (`38:5:n`, `38:2::r:g:b`, ITU T.416), no malformed extended colour, and no parameter too
 * large to be a number — and each of those decides what a cut reopens. A reader that got one
 * wrong would reopen a colour the caller never wrote, or drop one they did, and no incumbent
 * test would say so. So they are pinned here, token by token, and once end to end through
 * `slice`, where the reader's answer becomes bytes on a terminal.
 */
import sliceAnsi from 'slice-ansi';
import { describe, expect, it } from 'vitest';

import { slice } from './slice.js';
import { applyParameters, sgrTokens, type ActiveStyle } from './style.js';

const ESC = '\u001B';
const plain = (code: number) => ({ code, open: String(code), hasArguments: false });
const colour = (code: number, open: string) => ({ code, open, hasArguments: true });

describe('a parameter list is read one parameter at a time', () => {
  it('reads an empty parameter as a reset, as a terminal does', () => {
    expect(sgrTokens('')).toEqual([plain(0)]);
    expect(sgrTokens(';1')).toEqual([plain(0), plain(1)]);
  });

  it('skips a parameter too large to be a number, and keeps reading after it', () => {
    // 400 digits parse to Infinity: it is not a code, and it must not become `ESC[Infinitym`.
    expect(sgrTokens(`${'9'.repeat(400)};1`)).toEqual([plain(1)]);
  });
});

describe('the colon form carries its arguments in one parameter', () => {
  it.each([
    ['38:5:196', 38],
    ['48:5:21', 48],
    ['38:2:10:20:30', 38],
    ['48:2::10:20:30', 48],
    ['58:2:1:10:20:30', 58],
  ])('reads %s as one colour, written back exactly as it came', (parameter, code) => {
    expect(sgrTokens(parameter)).toEqual([colour(code, parameter)]);
  });

  it('keeps reading the parameters around it', () => {
    expect(sgrTokens('1;38:5:196;4')).toEqual([plain(1), colour(38, '38:5:196'), plain(4)]);
  });

  it.each([
    ['4:3', 'a colon parameter that is not a colour'],
    ['1:5:196', 'a colon parameter shaped like a colour whose code is not one'],
    ['38:5', '256 colours with no index'],
    ['38:5:1:2', '256 colours with two indexes'],
    ['38:5:', '256 colours with an empty index'],
    ['38:3:1:2:3', 'a colour mode that is neither 2 nor 5'],
    ['38:2:10:20', 'RGB with two components'],
    ['38:2:10::30', 'RGB with an empty component'],
    ['38:2:x:10:20:30', 'RGB with a colour space that is not a number'],
  ])('drops %s — %s — rather than guessing at it', (parameter) => {
    expect(sgrTokens(parameter)).toEqual([]);
  });
});

describe('the semicolon form reads ahead, and stops at the first malformed colour', () => {
  it.each(['38', '38;5', '38;2;1;2', '48;9;1'])('drops %s, which has no complete colour in it', (parameters) => {
    expect(sgrTokens(parameters)).toEqual([]);
  });

  it('keeps what came before a malformed colour and nothing after it, since its arguments cannot be told from codes', () => {
    expect(sgrTokens('1;38;9;4')).toEqual([plain(1)]);
  });

  it('files an extended background under the background, so 49 closes it', () => {
    const active: ActiveStyle[] = [];
    applyParameters('48;5;21', active);
    expect(active).toEqual([{ family: 'background', open: '48;5;21', close: 49 }]);
    applyParameters('48;2;1;2;3', active);
    expect(active, 'a second background replaces the first').toEqual([{ family: 'background', open: '48;2;1;2;3', close: 49 }]);
    applyParameters('49', active);
    expect(active).toEqual([]);
  });
});

describe('what a cut reopens', () => {
  it('reopens a colon colour as it was written, and slice-ansi agrees', () => {
    const input = `${ESC}[38:5:196mhello${ESC}[39m`;
    expect(slice(input, 1, 3)).toBe(`${ESC}[38:5:196mel${ESC}[39m`);
    expect(slice(input, 1, 3)).toBe(sliceAnsi(input, 1, 3));
  });
});
