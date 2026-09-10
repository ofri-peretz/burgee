/**
 * Lock — the shim can actually read the 29 locale files it ships.
 *
 * `shim.ts` resolved its locale directory relative to its own file, and when this directory
 * was created the file moved one level deeper while the `../locales` beside it did not. From
 * `dist/yargs/shim.js` that resolves to `dist/locales`, which does not exist, so y18n
 * silently returns the key for every string and **14 of yargs' own 804 tests failed** — a
 * regression no reader of a file move would have seen, and one burgee's own suite could not
 * see either, because the same relative path has never resolved from `src/` at all.
 *
 * So the directory is found from the package root rather than from this file's depth, and
 * this test reads a string back through it. A path that walks up to `package.json` resolves
 * the same from `src/`, from `dist/`, and from `node_modules/burgee/dist/` once published.
 */
import { describe, expect, it } from 'vitest';

import { shim } from './shim.js';

describe('the yargs shim locale table', () => {
  it('translates through a locale file rather than returning the key', () => {
    shim.y18n.setLocale('de');
    expect(shim.y18n.__('Commands:')).toBe('Kommandos:');
  });

  it('still falls back to the key for a locale it does not ship', () => {
    shim.y18n.setLocale('qq-XX');
    expect(shim.y18n.__('Commands:')).toBe('Commands:');
  });
});
