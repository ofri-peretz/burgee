/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * `agent-headroom` RF — output formats are data on the plugin object, and `tsv` is the first one
 * delivered that way.
 *
 * `--format=<name>` picks a registered format; `--format` alone lists every name, the built-ins
 * included. burgee's own `agent` and `tsv` are registered by the same plugin path an author's
 * are, so the extension point is proven by the format with the largest measured saving rather
 * than asserted beside it. A format renders a success's data and nothing else: a failure is
 * never handed to one (`hint-survives.test.ts`), and `--json` wins when both are typed.
 */
import { describe, expect, it } from 'vitest';

import { formatsOf, tsvOf } from './formats.js';
import { defineCommand, defineProgram, ExitCode } from './index.js';
import { definePlugin, type Plugin, PluginError } from './plugin.js';
import { runBurgee } from './testing.js';

const TSV = '--format=tsv';

/** The design's fixture (2026-09-09): fifty rows of four fields, where it measured TSV 63% under minified JSON. */
const fifty = Array.from({ length: 50 }, (_, i) => ({ id: i + 1, name: `package-${String(i + 1)}`, version: `1.${String(i % 7)}.${String(i % 3)}`, private: i % 4 === 0 }));

const ragged = [{ name: 'a', size: 1 }, { size: 2, kind: 'dir' }, { name: 'c' }];

const program = defineProgram({
  name: 'app',
  version: '1.0.0',
  commands: [
    defineCommand({ name: 'packages', effects: 'read_only', run: () => fifty }),
    defineCommand({ name: 'ragged', effects: 'read_only', run: () => ragged }),
    defineCommand({ name: 'cells', effects: 'read_only', run: () => [{ text: 'tab\there', lines: 'one\ntwo\r', slash: 'a\\b', nested: { a: [1, 2] }, list: ['x', 'y'], none: null, gone: undefined, at: new Date(Date.UTC(2026, 9, 25)) }] }),
    defineCommand({ name: 'names', effects: 'read_only', run: () => ['burgee', 'roundel', 'tab\tname'] }),
    defineCommand({ name: 'holes', effects: 'read_only', run: () => [null, { a: 1 }] }),
    defineCommand({ name: 'empty', effects: 'read_only', run: () => [] }),
    defineCommand({ name: 'show', effects: 'read_only', run: () => ({ id: 'dep_7f3a', status: 'ready' }) }),
    defineCommand({ name: 'export', effects: 'read_only', options: { format: { type: 'string' } }, run: ({ options }) => ({ format: options.format ?? null }) }),
    defineCommand({ name: 'echo', effects: 'read_only', arguments: [{ name: 'words', variadic: true, required: false }], run: ({ positionals, passthrough }) => ({ positionals, passthrough }) }),
  ],
});

/** An author's format: one line per row, `name@version`. Registered exactly as burgee registers its own. */
const pins = definePlugin({
  name: 'pins',
  formats: { pins: { description: 'name@version, one per line', render: (value) => (value as { name: string; version: string }[]).map((r) => `${r.name}@${r.version}\n`).join('') } },
});
program.use(pins);

const data = (stdout: string): unknown => (JSON.parse(stdout) as { data: unknown }).data;

describe('--format=tsv — a header row, then one tab-separated line per row (RF)', () => {
  it('prints a list of records as a header and one line per row', async () => {
    const r = await runBurgee(program, { argv: ['packages', TSV] });
    expect(r).toMatchObject({ code: 0, stderr: '' });
    const lines = r.stdout.split('\n');
    expect(lines.pop()).toBe('');
    expect(lines).toHaveLength(51);
    expect(lines[0]).toBe('id\tname\tversion\tprivate');
    expect(lines[1]).toBe('1\tpackage-1\t1.0.0\ttrue');
    expect(lines[50]).toBe('50\tpackage-50\t1.0.1\tfalse');
  });

  it('takes its columns from every row, in the order each key first appears, and leaves a missing cell empty', async () => {
    expect((await runBurgee(program, { argv: ['ragged', TSV] })).stdout).toBe('name\tsize\tkind\na\t1\t\n\t2\tdir\nc\t\t\n');
  });

  it('keeps every row one line: tab, newline, carriage return and backslash are escaped, a nested value is compact JSON', async () => {
    expect((await runBurgee(program, { argv: ['cells', TSV] })).stdout).toBe('text\tlines\tslash\tnested\tlist\tnone\tat\ntab\\there\tone\\ntwo\\r\ta\\\\b\t{"a":[1,2]}\t["x","y"]\t\t2026-10-25T00:00:00.000Z\n');
  });

  it('prints a list of scalars as one column named value', async () => {
    expect((await runBurgee(program, { argv: ['names', TSV] })).stdout).toBe('value\nburgee\nroundel\ntab\\tname\n');
  });

  it('puts a row that is not an object, null included, in the value column', async () => {
    expect((await runBurgee(program, { argv: ['holes', TSV] })).stdout).toBe('value\ta\n\t\n\t1\n');
  });

  it('prints nothing for an empty list, and exits OK', async () => {
    expect(await runBurgee(program, { argv: ['empty', TSV] })).toMatchObject({ code: 0, stdout: '', stderr: '' });
  });

  it('refuses a result that is not a list, naming --json', async () => {
    const r = await runBurgee(program, { argv: ['show', TSV] });
    expect(r.code).toBe(ExitCode.USAGE);
    expect(r.stdout).toBe('');
    expect(r.stderr).toContain('error: --format=tsv prints a list result, and this one is not a list\nhint: run it with --json for the whole result\n');
  });

  it('is smaller than minified JSON on the design’s fifty rows by the margin it was chosen for', async () => {
    const json = Buffer.byteLength(JSON.stringify(fifty));
    const tsv = Buffer.byteLength((await runBurgee(program, { argv: ['packages', TSV] })).stdout);
    // Measured 2026-10-25: 1,293 B against minified JSON's 3,170 B, 59.2% smaller (the design
    // measured 63% on its own fifty rows, 2026-09-09). The floor defends "a large saving", not the
    // figure: a tsv that grew a key back into every cell would fall through it.
    expect(1 - tsv / json).toBeGreaterThan(0.5);
  });

  it('--json wins when both are typed: the envelope, unchanged', async () => {
    const both = await runBurgee(program, { argv: ['ragged', TSV, '--json'] });
    expect(both.stdout).toBe((await runBurgee(program, { argv: ['ragged', '--json'] })).stdout);
  });

  it('prints what --json=<fields> selected', async () => {
    expect((await runBurgee(program, { argv: ['ragged', TSV, '--json=size'] })).stdout).toContain('"data":[{"size":1},{"size":2},{}]');
  });
});

describe('formats are registered on the plugin object (RF)', () => {
  it('an author’s format is picked by its name, and renders the data --json would carry', async () => {
    const r = await runBurgee(program, { argv: ['packages', '--format=pins'] });
    expect(r).toMatchObject({ code: 0, stderr: '' });
    expect(r.stdout.split('\n').slice(0, 2)).toEqual(['package-1@1.0.0', 'package-2@1.1.1']);
  });

  it('--format alone lists every format, the built-ins first and then the registered ones in order', async () => {
    const r = await runBurgee(program, { argv: ['packages', '--format'] });
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout)).toMatchObject({ ok: true, meta: {} });
    const { formats } = data(r.stdout) as { formats: { name: string; description: string }[] };
    expect(formats.map((f) => f.name)).toEqual(['text', 'json', 'agent', 'tsv', 'pins']);
    for (const f of formats) expect(f.description).not.toBe('');
    expect(formats.at(-1)).toEqual({ name: 'pins', description: 'name@version, one per line' });
  });

  it('lists without running the handler, and `--format=` lists the same', async () => {
    let ran = 0;
    const counted = defineProgram({ name: 'c', commands: [defineCommand({ name: 'go', effects: 'read_only', run: () => ++ran })] });
    const bare = await runBurgee(counted, { argv: ['go', '--format'] });
    const empty = await runBurgee(counted, { argv: ['go', '--format='] });
    expect(empty.stdout).toBe(bare.stdout);
    expect(ran).toBe(0);
  });

  it('a bare --format followed by an option still lists', async () => {
    expect((await runBurgee(program, { argv: ['packages', '--format', '--json'] })).stdout).toBe((await runBurgee(program, { argv: ['packages', '--format'] })).stdout);
  });

  it('names the same formats --schema declares under output', async () => {
    const listed = data((await runBurgee(program, { argv: ['show', '--format'] })).stdout) as { formats: { name: string }[] };
    const schema = JSON.parse((await runBurgee(program, { argv: ['--schema'] })).stdout) as { output: { formats: string[] } };
    expect(schema.output.formats).toEqual(listed.formats.map((f) => f.name));
  });

  it.each([[null], [[]], ['tsv']])('--schema names no format for a plugin whose formats are %j — `--format` is where that is refused', async (formats) => {
    const p = defineProgram({ name: 'p', commands: [defineCommand({ name: 'ls', effects: 'read_only', run: () => [] })] });
    p.use({ name: 'bad', contract: 1, formats } as unknown as Plugin);
    const schema = JSON.parse((await runBurgee(p, { argv: ['--schema'] })).stdout) as { output: { formats: string[] } };
    expect(schema.output.formats).toEqual(['text', 'json', 'agent', 'tsv']);
  });

  it('refuses a format nothing registered, naming the ones there are', async () => {
    const r = await runBurgee(program, { argv: ['packages', '--format=yaml'] });
    expect(r.code).toBe(ExitCode.USAGE);
    expect(r.stderr).toContain('error: unknown format "yaml"\nhint: formats: text, json, agent, tsv, pins\n');
  });

  it('leaves --format=json and --format text to the spellings that already answer them (D-20261009)', async () => {
    expect(JSON.parse((await runBurgee(program, { argv: ['show', '--format=json'] })).stdout)).toMatchObject({ ok: true, data: { id: 'dep_7f3a' } });
    expect((await runBurgee(program, { argv: ['show', '--format', 'text'] })).code).toBe(0);
  });

  it('a command that declares its own `format` option keeps the flag, bare or not — the program wins', async () => {
    expect(data((await runBurgee(program, { argv: ['export', TSV, '--json'] })).stdout)).toEqual({ format: 'tsv' });
    expect((await runBurgee(program, { argv: ['export', '--format'] })).code).toBe(ExitCode.USAGE);
  });

  it('after `--` it is pass-through, not a format (G5)', async () => {
    expect(data((await runBurgee(program, { argv: ['echo', '--json', '--', TSV, '--format'] })).stdout)).toMatchObject({ passthrough: [TSV, '--format'] });
  });
});

const render = (): string => '';

describe('a format is checked where it is first used, under the family’s code', () => {
  const run = async (plugin: Record<string, unknown>): Promise<{ code: number; stderr: string }> => {
    const p = defineProgram({ name: 'p', commands: [defineCommand({ name: 'ls', effects: 'read_only', run: () => [] })] });
    p.use({ name: 'bad', contract: 1, ...plugin } as Plugin);
    return await runBurgee(p, { argv: ['ls', '--format=tsv'] });
  };

  const NAME_FIX = 'name it in lower-case letters, digits and dashes, starting with a letter: it is typed as --format=<name>';
  const SHAPE_FIX = "`rows: { render: (value) => string, description: '…' }`";
  const TAKEN_FIX = 'rename it — one name, one format';
  it.each([
    ['formats that are not an object', { formats: [] }, 'plugin "bad": formats must be an object', 'map a name to `{ render(value), description }`'],
    ['a name that is not lower-case', { formats: { 'My-rows': { render, description: 'x' } } }, 'plugin "bad": "My-rows" is not a format name', NAME_FIX],
    ['a name that is two words', { formats: { 'my rows': { render, description: 'x' } } }, 'plugin "bad": "my rows" is not a format name', NAME_FIX],
    ['a format with no render', { formats: { rows: { description: 'x' } } }, 'plugin "bad": format "rows" is not { render(value), description }', SHAPE_FIX],
    ['a format with no description', { formats: { rows: { render } } }, 'plugin "bad": format "rows" is not { render(value), description }', SHAPE_FIX],
    ['an empty description', { formats: { rows: { render, description: '' } } }, 'plugin "bad": format "rows" is not { render(value), description }', SHAPE_FIX],
    ['a name burgee registers', { formats: { tsv: { render, description: 'mine' } } }, 'plugin "bad": format "tsv" is already registered', TAKEN_FIX],
    ['a name that is burgee’s own surface', { formats: { json: { render, description: 'mine' } } }, 'plugin "bad": format "json" is already registered', TAKEN_FIX],
  ])('refuses %s, with the fix', async (_, plugin, message, fix) => {
    const r = await run(plugin);
    expect(r.code).toBe(ExitCode.CONFIG);
    expect(r.stderr).toContain(`error: E_PLUGIN_SCHEMA ${message}\nhint: ${fix}\n`);
  });

  it('takes a name with digits and dashes', () => {
    expect([...formatsOf([{ name: 'ok', contract: 1, formats: { 'csv-2': { render, description: 'x' } } }]).keys()]).toEqual(['agent', 'tsv', 'csv-2']);
  });

  it('refuses two plugins registering one name, naming the second', () => {
    const one = { name: 'one', contract: 1, formats: { rows: { render, description: 'x' } } };
    expect(() => formatsOf([one, { ...one, name: 'two' }])).toThrow(new PluginError('E_PLUGIN_SCHEMA', 'plugin "two": format "rows" is already registered', 'rename it — one name, one format'));
  });

  it('reads nothing from a plugin that registers no formats', () => {
    expect([...formatsOf([{ name: 'none', contract: 1 }]).keys()]).toEqual(['agent', 'tsv']);
  });
});

describe('tsvOf', () => {
  it('is the same function the registered tsv format renders with', () => {
    expect(formatsOf([]).get('tsv')?.render).toBe(tsvOf);
  });
});
