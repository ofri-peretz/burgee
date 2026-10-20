/**
 * The list prompts' glyphs fall back to ASCII exactly where `@inquirer/figures` does: where
 * roundel's `unicode()` says no. Read at import, so each case imports fresh modules.
 */
import { PassThrough, Writable } from 'node:stream';
import { stripVTControlCharacters } from 'node:util';

import { afterEach, describe, expect, it, vi } from 'vitest';

const saved = process.env['TERM'];

afterEach(() => {
  if (saved === undefined) delete process.env['TERM'];
  else process.env['TERM'] = saved;
  vi.resetModules();
});

/** The first frame of a checkbox with one checked, one unchecked and one disabled checked choice. */
async function frameUnder(term: string): Promise<string> {
  process.env['TERM'] = term;
  vi.resetModules();
  const { checkbox } = await import('./inquirer-prompts.js');
  const chunks: string[] = [];
  const output = new Writable({
    write(chunk: Buffer | string, _encoding, callback) {
      chunks.push(String(chunk));
      callback();
    },
  });
  const answer = checkbox({ message: 'Pick', choices: [{ value: 'a', checked: true }, 'b', { value: 'c', checked: true, disabled: true }] }, { input: new PassThrough(), output });
  await new Promise((resolve) => setImmediate(resolve));
  answer.cancel();
  await answer.catch(() => undefined);
  return stripVTControlCharacters(chunks.join(''));
}

describe.skipIf(process.platform === 'win32')('the list glyphs, off Windows', () => {
  it('are figures’ unicode set on an ordinary terminal', async () => {
    const frame = await frameUnder('xterm-256color');
    expect(frame).toContain('❯◉ a');
    expect(frame).toContain(' ◯ b');
    expect(frame).toContain(' ◎ c (disabled)');
  });

  it('are figures’ fallbacks on the Linux console', async () => {
    const frame = await frameUnder('linux');
    expect(frame).toContain('>(*) a');
    expect(frame).toContain(' ( ) b');
    expect(frame).toContain(' ( ) c (disabled)');
  });
});
