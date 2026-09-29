/**
 * `caique/inquirer`'s tick falls back to ASCII exactly where `figures` does — where
 * is-unicode-supported says no, which is roundel's `unicode()`. The copy this file used to
 * carry checked four conditions, and drew `✔` on the Linux console, whose font has none.
 *
 * `TICK` is read at import, as `figures` reads it, so each case imports a fresh module.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const saved = process.env['TERM'];

afterEach(() => {
  if (saved === undefined) delete process.env['TERM'];
  else process.env['TERM'] = saved;
  vi.resetModules();
});

async function tickUnder(term: string): Promise<string> {
  process.env['TERM'] = term;
  vi.resetModules();
  return (await import('./inquirer-theme.js')).TICK;
}

describe.skipIf(process.platform === 'win32')('the tick, off Windows', () => {
  it('is ✔ on an ordinary terminal', async () => {
    expect(await tickUnder('xterm-256color')).toBe('✔');
  });

  it('is √ on the Linux console, as figures draws it there', async () => {
    expect(await tickUnder('linux')).toBe('√');
  });
});
