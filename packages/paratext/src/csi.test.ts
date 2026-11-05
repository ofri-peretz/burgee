/**
 * The two things about the CSI half that `ansi-escapes.test.ts`'s byte-for-byte table cannot
 * reach from its own process: an argument check, and a constant decided once, at load.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { cursorBackward, cursorDown, cursorForward, cursorLeft, cursorMove, cursorTo, cursorUp, eraseLine, eraseLines, kittyKeyboardPop, kittyKeyboardPush, kittyKeyboardQuery } from './csi.js';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('cursorMove', () => {
  it('refuses a missing `x` with upstream’s TypeError, rather than printing `NaN`', () => {
    expect(() => cursorMove(undefined as unknown as number)).toThrow(new TypeError('The `x` argument is required'));
  });

  // `ansi-escapes.test.ts` grades these against the incumbent too; spelled out here so a count of
  // one on either axis, and each axis on its own, is pinned to its bytes.
  it.each([
    [1, undefined, '\u001B[1C'],
    [-1, undefined, '\u001B[1D'],
    [0, 1, '\u001B[1B'],
    [0, 2, '\u001B[2B'],
    [0, -2, '\u001B[2A'],
    [0, 0, ''],
    [0, undefined, ''],
  ] as const)('cursorMove(%s, %s) is %j', (x, y, bytes) => {
    expect(cursorMove(x, y)).toBe(bytes);
  });
});

describe('cursorTo', () => {
  it('refuses a missing `x` with upstream’s TypeError', () => {
    expect(() => cursorTo(undefined as unknown as number)).toThrow(new TypeError('The `x` argument is required'));
  });
});

describe('the counted moves', () => {
  it('default to one cell, as upstream', () => {
    expect([cursorUp(), cursorDown(), cursorForward(), cursorBackward()]).toEqual(['\u001B[1A', '\u001B[1B', '\u001B[1C', '\u001B[1D']);
  });
});

/** A fresh copy of the module, loaded with `TERM_PROGRAM` set to `program`. */
async function load(program: string): Promise<typeof import('./csi.js')> {
  vi.stubEnv('TERM_PROGRAM', program);
  vi.resetModules();
  return import('./csi.js');
}

/**
 * Terminal.app does not understand `ESC[s` / `ESC[u`, so `ansi-escapes` saves and restores the
 * cursor with the DEC pair there instead, deciding once from `TERM_PROGRAM` at import. The
 * same decision is checked the only way it can be: a fresh copy of the module, loaded under
 * each environment.
 */
describe('cursor save and restore, decided at load', () => {
  it('is the DEC pair in Terminal.app', async () => {
    const csi = await load('Apple_Terminal');
    expect([csi.cursorSavePosition, csi.cursorRestorePosition]).toEqual(['\u001B7', '\u001B8']);
  });

  it('is the CSI pair everywhere else', async () => {
    const csi = await load('iTerm.app');
    expect([csi.cursorSavePosition, csi.cursorRestorePosition]).toEqual(['\u001B[s', '\u001B[u']);
  });
});

/** `ansi-escapes`' own loop, the bytes a cached `eraseLines` must keep returning. */
const upstream = (count: number): string => {
  let clear = '';
  for (let i = 0; i < count; i += 1) clear += eraseLine + (i < count - 1 ? cursorUp() : '');
  return count ? clear + cursorLeft : clear;
};

/**
 * `log-update` erases the previous frame on every frame, so `eraseLines` keeps the strings for
 * the small counts a redraw uses (B5). A cache is only an optimisation if it never answers
 * differently: the second call must equal the first, and every count it refuses to keep — a
 * fraction, a negative, a large one — still takes upstream's loop.
 */
describe('eraseLines, kept per count', () => {
  it.each([0, 1, 3, 5, 63])('returns the same bytes for %i the first time and every time after', (count) => {
    expect(eraseLines(count)).toBe(upstream(count));
    expect(eraseLines(count)).toBe(upstream(count));
  });

  it.each([2.5, -1, 64, 200])('computes %d afresh rather than keeping it', (count) => {
    expect(eraseLines(count)).toBe(upstream(count));
    expect(eraseLines(count)).toBe(upstream(count));
  });
});

describe('the kitty keyboard protocol', () => {
  it('spells the push, the pop and the query', () => {
    expect(kittyKeyboardPush(1)).toBe('\u001B[>1u');
    expect(kittyKeyboardPush(31)).toBe('\u001B[>31u');
    expect(kittyKeyboardPop).toBe('\u001B[<u');
    expect(kittyKeyboardQuery).toBe('\u001B[?u');
  });
});
