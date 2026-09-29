/**
 * `caique/inquirer`'s cursor moves come from `paratext/csi`, the family's byte-exact port of
 * `ansi-escapes` — with one difference kept on purpose. `@inquirer/ansi` writes nothing for a
 * zero-row move; `ansi-escapes` writes `ESC[0A`, which a terminal reads as one row. The screen
 * manager asks for zero whenever a prompt has no content below it, so an unguarded call would
 * move the cursor a row the incumbent never moves.
 */
import { cursorDown as ansiDown, cursorTo as ansiTo, cursorUp as ansiUp, eraseLines as ansiErase } from 'paratext/csi';
import { describe, expect, it } from 'vitest';

import { cursorDown, cursorLeft, cursorTo, cursorUp, eraseLines } from './inquirer-screen.js';

describe('the zero-row moves @inquirer/ansi writes as nothing', () => {
  it('writes nothing for zero rows, where ansi-escapes would move a row', () => {
    expect(ansiUp(0)).toBe('\u001B[0A');
    expect(cursorUp(0)).toBe('');
    expect(cursorDown(0)).toBe('');
    expect(eraseLines(0)).toBe('');
    expect(eraseLines(-1)).toBe('');
  });

  it('is ansi-escapes byte for byte everywhere else', () => {
    for (const n of [1, 2, 7]) {
      expect(cursorUp(n)).toBe(ansiUp(n));
      expect(cursorDown(n)).toBe(ansiDown(n));
      expect(eraseLines(n)).toBe(ansiErase(n));
    }
    expect(cursorUp()).toBe('\u001B[1A');
    expect(cursorLeft).toBe('\u001B[G');
    expect(cursorTo(3)).toBe(ansiTo(3));
    expect(cursorTo(3, 4)).toBe(ansiTo(3, 4));
  });

  it('treats a NaN row as no row, as @inquirer/ansi does', () => {
    expect(cursorTo(3, Number.NaN)).toBe('\u001B[4G');
  });
});
