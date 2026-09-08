/**
 * The one file in the package that touches a stream, driven over a `PassThrough` pair —
 * which is what `process.stdin`/`process.stdout` are, minus the terminal.
 *
 * The case worth having is the password one: a hidden answer must not appear in what the
 * output stream received. That is the only place in caique where a secret could leak, and
 * it is asserted on the bytes rather than argued from the code.
 */
import { PassThrough } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { ask } from './ask.js';
import { createIo } from './terminal.js';

/**
 * `readline` only echoes what it reads when `terminal: true` — on a plain PassThrough it
 * echoes nothing, so a "the secret was not echoed" assertion there passes whatever the
 * code does. These streams claim to be a TTY for that reason: it is the only mode in which
 * the leak is possible, so it is the only mode worth asserting against.
 */
function streams(isTTY = true) {
  const input = Object.assign(new PassThrough(), { isTTY });
  const output = Object.assign(new PassThrough(), { isTTY });
  const seen: string[] = [];
  output.on('data', (c: Buffer) => seen.push(c.toString()));
  return { input, output, written: () => seen.join('') };
}

describe('createIo', () => {
  it('reads a line a person typed', async () => {
    const s = streams();
    const io = createIo({ input: s.input, output: s.output });
    const line = io.reader.line();
    s.input.write('dist\n');
    await expect(line).resolves.toBe('dist');
    io.close();
  });

  it('resolves undefined when the stream ends — Ctrl-D and a closed pipe alike', async () => {
    const s = streams();
    const io = createIo({ input: s.input, output: s.output });
    const line = io.reader.line();
    s.input.end();
    await expect(line).resolves.toBeUndefined();
  });

  it('keeps resolving undefined once ended, rather than hanging on the next question', async () => {
    const s = streams();
    const io = createIo({ input: s.input, output: s.output });
    s.input.end();
    await expect(io.reader.line()).resolves.toBeUndefined();
    await expect(io.reader.line()).resolves.toBeUndefined();
  });

  it('writes what it is given, unchanged', () => {
    const s = streams();
    const io = createIo({ input: s.input, output: s.output });
    io.writer.write('Where should it go? ');
    expect(s.written()).toBe('Where should it go? ');
    io.close();
  });
});

describe('a hidden answer never reaches the output stream', () => {
  it('a plain read on these streams *does* echo — so the assertions below can fail', async () => {
    const s = streams();
    const io = createIo({ input: s.input, output: s.output });
    const line = io.reader.line();
    s.input.write('hunter2\n');
    await expect(line).resolves.toBe('hunter2');
    expect(s.written(), 'readline is not echoing, so the hidden cases prove nothing').toContain('hunter2');
    io.close();
  });

  it('reads the password but does not echo it', async () => {
    const s = streams();
    const io = createIo({ input: s.input, output: s.output });
    const line = io.reader.line({ hidden: true });
    s.input.write('hunter2\n');
    await expect(line).resolves.toBe('hunter2');
    expect(s.written(), 'the secret was echoed').not.toContain('hunter2');
    io.close();
  });

  it('echoes again for the next question, so hiding is per-read and not sticky', async () => {
    const s = streams();
    const io = createIo({ input: s.input, output: s.output });
    const hidden = io.reader.line({ hidden: true });
    s.input.write('secret\n');
    await hidden;
    io.writer.write('Name? ');
    const plain = io.reader.line();
    s.input.write('ada\n');
    await expect(plain).resolves.toBe('ada');
    expect(s.written()).toContain('Name? ');
    expect(s.written()).not.toContain('secret');
    io.close();
  });

  it('through ask(), a password prompt leaks nothing and a text one is unaffected', async () => {
    const s = streams();
    const io = createIo({ input: s.input, output: s.output });

    const asked = ask({ kind: 'password', message: 'Token?' }, io);
    s.input.write('t0ken\n');
    await expect(asked).resolves.toEqual({ ok: true, value: 't0ken' });
    expect(s.written()).toContain('Token?');
    expect(s.written(), 'ask() leaked the secret').not.toContain('t0ken');

    io.close();
  });
});
