/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * N14 / D-114 — `--json=<a,b>` selects fields; `--json=` alone lists the valid ones; an
 * unknown field is refused naming the valid set. Only the `=` form takes fields, so
 * `cmd --json name` keeps `name` a positional.
 */
import { describe, expect, it } from 'vitest';

import { defineCommand, defineProgram } from './index.js';
import { runBurgee } from './testing.js';

let ran = 0;
const repo = { name: 'burgee', stars: 12, private: false };

const program = defineProgram({
  name: 'app',
  version: '1.0.0',
  commands: [
    defineCommand({
      name: 'view',
      fields: ['name', 'stars', 'private'],
      arguments: [{ name: 'which', required: false }],
      effects: 'read_only',
      run: ({ positionals }) => {
        ran += 1;
        return { ...repo, which: positionals[0] ?? null };
      },
    }),
    defineCommand({ name: 'list', effects: 'read_only', run: () => [repo, { ...repo, name: 'roundel' }] }),
  ],
});

const data = (stdout: string): unknown => (JSON.parse(stdout) as { data: unknown }).data;
const error = (stderr: string): { code: string; message: string; hint: string } => (JSON.parse(stderr) as { error: { code: string; message: string; hint: string } }).error;

describe('--json=<fields> (N14)', () => {
  it('selects the named fields of an object result', async () => {
    const r = await runBurgee(program, { argv: ['view', '--json=name,stars'] });
    expect(r.code).toBe(0);
    expect(data(r.stdout)).toEqual({ name: 'burgee', stars: 12 });
  });

  it('selects from each row of a list result, checked against the rows it returned', async () => {
    const r = await runBurgee(program, { argv: ['list', '--json=name'] });
    expect(data(r.stdout)).toEqual([{ name: 'burgee' }, { name: 'roundel' }]);
  });

  it('`--json=` lists the declared fields without running the handler', async () => {
    const before = ran;
    const r = await runBurgee(program, { argv: ['view', '--json='] });
    expect(r.code).toBe(0);
    expect(data(r.stdout)).toEqual({ fields: ['name', 'stars', 'private'] });
    expect(ran).toBe(before);
  });

  it('refuses an unknown declared field before running, naming the valid set', async () => {
    const before = ran;
    const r = await runBurgee(program, { argv: ['view', '--json=name,owner'] });
    expect(r.code).toBe(2);
    expect(error(r.stderr).message).toContain('"owner"');
    expect(error(r.stderr).hint).toBe('valid fields: name, stars, private');
    expect(ran).toBe(before);
  });

  it('refuses an unknown field of an undeclared command, naming the keys the result has', async () => {
    const r = await runBurgee(program, { argv: ['list', '--json=owner'] });
    expect(r.code).toBe(2);
    expect(error(r.stderr).hint).toBe('valid fields: name, stars, private');
  });

  it('`--json=` on a command that declares none says so, as JSON', async () => {
    const r = await runBurgee(program, { argv: ['list', '--json='] });
    expect(r.code).toBe(2);
    expect(error(r.stderr).message).toBe('"list" declares no fields to list');
  });

  it('bare `--json` is unchanged, and never takes the next word as fields', async () => {
    const r = await runBurgee(program, { argv: ['view', '--json', 'name'] });
    expect(data(r.stdout)).toEqual({ ...repo, which: 'name' });
  });

  it('reads nothing after `--`', async () => {
    // The `--json=name` after `--` is pass-through, so nothing is selected.
    const r = await runBurgee(program, { argv: ['view', '--json', '--', '--json=name'] });
    expect(Object.keys(data(r.stdout) as object)).toEqual(['name', 'stars', 'private', 'which']);
  });

  it('publishes the declared fields in --schema, so an agent can discover them', async () => {
    const r = await runBurgee(program, { argv: ['--schema', 'view'] });
    expect(JSON.stringify(JSON.parse(r.stdout))).toContain('"fields":["name","stars","private"]');
  });

  it('refuses a malformed field declaration when the command is defined', () => {
    expect(() => defineCommand({ name: 'bad', fields: ['a', 'a'], effects: 'read_only', run: () => ({}) })).toThrow(/distinct, non-empty/);
    expect(() => defineCommand({ name: 'bad', fields: ['a,b'], effects: 'read_only', run: () => ({}) })).toThrow(/without commas/);
  });
});
