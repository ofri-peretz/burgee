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
const error = (stdout: string): { code: string; message: string; hint: string } => (JSON.parse(stdout) as { error: { code: string; message: string; hint: string } }).error;

/** A program whose one command declares `fields` as given, however malformed. */
const bad = (fields: string[]): ReturnType<typeof defineProgram> =>
  defineProgram({ name: 'app', version: '1.0.0', commands: [defineCommand({ name: 'bad', fields, effects: 'read_only', run: () => ({}) })] });

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
    expect(error(r.stdout).message).toContain('"owner"');
    expect(error(r.stdout).hint).toBe('valid fields: name, stars, private');
    expect(ran).toBe(before);
  });

  it('refuses an unknown field of an undeclared command, naming the keys the result has', async () => {
    const r = await runBurgee(program, { argv: ['list', '--json=owner'] });
    expect(r.code).toBe(2);
    expect(error(r.stdout).hint).toBe('valid fields: name, stars, private');
  });

  it('`--json=` on a command that declares none says so, as JSON', async () => {
    const r = await runBurgee(program, { argv: ['list', '--json='] });
    expect(r.code).toBe(2);
    expect(error(r.stdout).message).toBe('"list" declares no fields to list');
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

  it('refuses a malformed field declaration the first time `--json=` reads it', async () => {
    const dup = await runBurgee(bad(['a', 'a']), { argv: ['bad', '--json='] });
    expect(dup.code).not.toBe(0);
    expect(dup.stdout).toContain('distinct, non-empty names without commas');
    const comma = await runBurgee(bad(['a,b']), { argv: ['bad', '--json=a'] });
    expect(comma.stdout).toContain('without commas');
  });
});
