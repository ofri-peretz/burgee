/**
 * The two things about the CSI half that `ansi-escapes.test.ts`'s byte-for-byte table cannot
 * reach from its own process: an argument check, and a constant decided once, at load.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { cursorMove } from './csi.js';

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
