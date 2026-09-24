/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * S4 / D-113 — a `type: 'file'` argument given `-` hands the handler standard input as
 * `ctx.stdin`; the positional still reads `-`. The yargs #1312 request, as a declaration.
 */
import { Readable } from 'node:stream';
import { text } from 'node:stream/consumers';

import { describe, expect, it } from 'vitest';

import { defineCommand, defineProgram, runCommand } from './index.js';

const program = defineProgram({
  name: 'app',
  version: '1.0.0',
  commands: [
    defineCommand({
      name: 'count',
      arguments: [{ name: 'file', type: 'file' }],
      effects: 'read_only',
      run: async ({ positionals, stdin }) => ({ from: positionals[0], chars: stdin === undefined ? null : (await text(stdin)).length }),
    }),
    defineCommand({
      name: 'diff',
      arguments: [{ name: 'files', type: 'file', variadic: true }],
      effects: 'read_only',
      run: ({ stdin }) => ({ stdin: stdin !== undefined }),
    }),
    defineCommand({ name: 'echo', arguments: [{ name: 'word' }], effects: 'read_only', run: ({ positionals, stdin }) => ({ word: positionals[0], stdin: stdin !== undefined }) }),
  ],
});

const data = (stdout: string): unknown => (JSON.parse(stdout) as { data: unknown }).data;

describe('`-` on a file argument means stdin (S4)', () => {
  it('hands the handler the injected stdin, and the positional still reads `-`', async () => {
    const r = await runCommand(program, ['count', '-', '--json'], { stdin: Readable.from(['hello']) });
    expect(r.code).toBe(0);
    expect(data(r.stdout)).toEqual({ from: '-', chars: 5 });
  });

  it('hands nothing for a path', async () => {
    const r = await runCommand(program, ['count', 'notes.txt', '--json'], { stdin: Readable.from(['hello']) });
    expect(data(r.stdout)).toEqual({ from: 'notes.txt', chars: null });
  });

  it('a variadic file argument covers every position it takes', async () => {
    const r = await runCommand(program, ['diff', 'a.txt', '-', '--json'], { stdin: Readable.from(['x']) });
    expect(data(r.stdout)).toEqual({ stdin: true });
  });

  it('refuses `-` for two file arguments, since stdin can be read once', async () => {
    const r = await runCommand(program, ['diff', '-', '-'], { stdin: Readable.from(['x']) });
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('standard input can be read once');
  });

  it('leaves `-` alone on an argument that is not a file', async () => {
    const r = await runCommand(program, ['echo', '-', '--json'], { stdin: Readable.from(['x']) });
    expect(data(r.stdout)).toEqual({ word: '-', stdin: false });
  });
});
