/**
 * The two things about the CSI half that `ansi-escapes.test.ts`'s byte-for-byte table cannot
 * reach from its own process: an argument check, and a constant decided once, at load.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { cursorLeft, cursorMove, cursorUp, eraseLine, eraseLines } from './csi.js';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('cursorMove', () => {
  it('refuses a missing `x` with upstream’s TypeError, rather than printing `NaN`', () => {
    expect(() => cursorMove(undefined as unknown as number)).toThrow(new TypeError('The `x` argument is required'));
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
