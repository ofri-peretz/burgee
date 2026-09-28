/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * D-151 / GAPS B22 — `schema` is `--schema` spelled as a subcommand, and a program's own
 * meaning of the word wins. clispec.dev discovers a schema by running `<tool> schema`; before
 * this, the demo answered it with `unknown command "schema"` and exit 2.
 */
import { describe, expect, it } from 'vitest';

import { defineCommand, defineProgram, run } from './index.js';
import { runBurgee } from './testing.js';

const deploy = defineCommand({
  name: 'deploy',
  description: 'Ship a build',
  effects: 'non_idempotent',
  arguments: [{ name: 'target', required: true }],
  options: { region: { type: 'string', choices: ['eu', 'us'], description: 'where to' } },
  run: () => 'shipped',
});

const program = defineProgram({
  name: 'app',
  version: '1.0.0',
  commands: [deploy, defineCommand({ name: 'status', effects: 'read_only', run: () => 'fine' })],
});

describe('`schema` is an alias of `--schema` (D-151)', () => {
  it.each([
    [['schema'], ['--schema']],
    [['schema', 'deploy'], ['--schema', 'deploy']],
    [['schema', 'deploy', '--field', 'options.region'], ['--schema', 'deploy', '--field', 'options.region']],
    [['schema', 'deploy', '--field=description'], ['deploy', '--schema', '--field=description']],
    [['schema', '--json=name'], ['--schema', '--json=name']],
  ])('%j prints exactly what %j prints', async (alias, flag) => {
    const viaAlias = await runBurgee(program, { argv: alias, env: {} });
    const viaFlag = await runBurgee(program, { argv: flag, env: {} });
    expect(viaFlag.code).toBe(0);
    expect(viaAlias.code).toBe(0);
    expect(viaAlias.stderr).toBe('');
    expect(viaAlias.stdout).toBe(viaFlag.stdout);
  });

  it('refuses a missing field exactly as `--schema` does', async () => {
    const viaAlias = await runBurgee(program, { argv: ['schema', 'deploy', '--field', 'nope'], env: {} });
    const viaFlag = await runBurgee(program, { argv: ['--schema', 'deploy', '--field', 'nope'], env: {} });
    expect(viaAlias.code).toBe(2);
    expect(viaAlias).toMatchObject({ code: viaFlag.code, stdout: viaFlag.stdout, stderr: viaFlag.stderr });
  });

  it('is named in the root help, and only the root', async () => {
    expect((await runBurgee(program, { argv: ['--help'], env: {} })).stdout).toMatch(/^ {2}--schema +the program as data$/m);
    expect((await runBurgee(program, { argv: ['deploy', '--help'], env: {} })).stdout).not.toContain('--schema');
  });
});

describe('the program’s own `schema` wins (D-151)', () => {
  it('runs a declared `schema` command, and burgee answers nothing', async () => {
    const own = defineProgram({
      name: 'db',
      version: '1.0.0',
      commands: [
        defineCommand({
          name: 'schema',
          description: 'Print the database schema',
          effects: 'read_only',
          arguments: [{ name: 'table', required: false }],
          run: ({ positionals }) => `table ${positionals[0] ?? 'all'}`,
        }),
      ],
    });
    expect(await runBurgee(own, { argv: ['schema'], env: {} })).toMatchObject({ code: 0, stdout: 'table all\n' });
    expect(await runBurgee(own, { argv: ['schema', 'users'], env: {} })).toMatchObject({ code: 0, stdout: 'table users\n' });
    // The flag is still burgee's: only the word belongs to the program.
    expect(JSON.parse((await runBurgee(own, { argv: ['--schema'], env: {} })).stdout)).toMatchObject({ name: 'db' });
  });

  it('passes `schema` to a single-command program that takes positionals, as the argument it is', async () => {
    const echo = defineCommand({
      name: 'echo',
      effects: 'read_only',
      arguments: [{ name: 'words', variadic: true, required: false }],
      run: ({ positionals }) => positionals.join(' '),
    });
    const out: string[] = [];
    let code = -1;
    await run(echo, { argv: ['schema', 'draft'], env: {}, stdout: { write: (s) => out.push(s) }, stderr: { write: () => true }, exit: (c) => void (code = c) });
    expect({ code, stdout: out.join('') }).toEqual({ code: 0, stdout: 'schema draft\n' });
  });
});
