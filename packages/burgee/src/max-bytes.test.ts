/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * `agent-headroom` R3 — `--max-bytes N`, a row budget on any machine format.
 *
 * The failure this prevents: an agent receives part of a document, `JSON.parse` throws, and it
 * cannot tell a truncated answer from a broken CLI. So a list result over the budget is cut at a
 * whole row and stays a document that parses, and it **says** it was cut: `truncated: { of,
 * returned }` in the envelope, and no `truncated` at all when nothing was. A result that is not a
 * list is never cut — it comes back whole, with `over` saying by how much the budget was missed.
 * There is no continuation token: a framework cannot page a handler it did not write, so the next
 * step is the command's own arguments.
 *
 * The line formats have no envelope to carry the notice, so they keep stdout to whole rows and put
 * the same `{"truncated":…}` object on stderr, as one JSON line, where the failure line goes.
 */
import { describe, expect, it } from 'vitest';

import { defineCommand, defineProgram, ExitCode } from './index.js';
import { budgetJson, printer } from './max-bytes.js';
import { definePlugin } from './plugin.js';
import { runBurgee } from './testing.js';

const files = Array.from({ length: 12 }, (_, i) => ({ path: `src/module-${String(i)}.ts`, size: 1_024 * (i + 1), kind: i % 3 === 0 ? 'test' : 'source' }));
const deployment = { id: 'dep_7f3a', status: 'ready', target: { region: 'iad1', url: 'https://app-7f3a.example.dev' } };

let ran = 0;
const program = defineProgram({
  name: 'app',
  version: '1.0.0',
  commands: [
    defineCommand({ name: 'ls', effects: 'read_only', fields: ['path', 'size', 'kind'], run: () => (ran++, files) }),
    defineCommand({ name: 'show', effects: 'read_only', run: () => deployment }),
    defineCommand({ name: 'save', effects: 'read_only', options: { output: { type: 'string' } }, run: ({ options }) => ({ output: options.output ?? null }) }),
    defineCommand({ name: 'echo', effects: 'read_only', arguments: [{ name: 'words', variadic: true, required: false }], run: ({ positionals }) => positionals }),
    defineCommand({ name: 'slow', effects: 'read_only', run: async ({ signal }) => await new Promise((resolve) => setTimeout(() => resolve({ aborted: signal.aborted }), 30)) }),
    defineCommand({ name: 'nothing', effects: 'read_only', run: () => undefined }),
    defineCommand({ name: 'mine', effects: 'read_only', options: { maxBytes: { type: 'number' } }, run: ({ options }) => ({ maxBytes: options.maxBytes ?? null }) }),
  ],
});

const bytes = (s: string): number => Buffer.byteLength(s);
interface Doc {
  ok: boolean;
  data: unknown;
  truncated?: { of: number; returned: number; over?: number };
}
const parse = (stdout: string): Doc => JSON.parse(stdout) as Doc;

describe('--max-bytes on the --json envelope (R3)', () => {
  it('leaves a result that fits exactly as --json prints it, with no `truncated` key', async () => {
    const whole = await runBurgee(program, { argv: ['ls', '--json'] });
    const r = await runBurgee(program, { argv: ['ls', '--json', '--max-bytes', String(bytes(whole.stdout))] });
    expect(r.stdout).toBe(whole.stdout);
    expect(parse(r.stdout)).not.toHaveProperty('truncated');
  });

  it('cuts a list at the last whole row that fits, and says how many of how many it returned', async () => {
    const r = await runBurgee(program, { argv: ['ls', '--json', '--max-bytes=600'] });
    expect(r).toMatchObject({ code: 0, stderr: '' });
    expect(bytes(r.stdout)).toBeLessThanOrEqual(600);
    const doc = parse(r.stdout);
    const rows = doc.data as unknown[];
    expect(doc.truncated).toEqual({ of: 12, returned: rows.length });
    expect(rows).toEqual(files.slice(0, rows.length));
    // The last row that fits, not merely a row that fits: one more is over.
    expect(bytes(JSON.stringify({ ...doc, data: files.slice(0, rows.length + 1), truncated: { of: 12, returned: rows.length + 1 } }))).toBeGreaterThan(600 - 1);
  });

  it('returns a result that is not a list whole, and says by how much it is over', async () => {
    const whole = await runBurgee(program, { argv: ['show', '--json'] });
    const r = await runBurgee(program, { argv: ['show', '--json', '--max-bytes', '50'] });
    const doc = parse(r.stdout);
    expect(doc.data).toEqual(deployment);
    expect(doc.truncated).toEqual({ of: 1, returned: 1, over: bytes(r.stdout) - 50 });
    expect(bytes(r.stdout)).toBeGreaterThan(bytes(whole.stdout));
  });

  it('budgets what --json=<fields> selected', async () => {
    const r = await runBurgee(program, { argv: ['ls', '--json=path', '--max-bytes', '200'] });
    const doc = parse(r.stdout);
    expect((doc.data as object[]).every((row) => Object.keys(row).join() === 'path')).toBe(true);
    expect(doc.truncated?.of).toBe(12);
    expect(bytes(r.stdout)).toBeLessThanOrEqual(200);
  });

  /**
   * C3 — an agent can tell a truncated response from a complete one, at every budget: the
   * document parses, it carries `truncated` exactly when rows were dropped or the budget was
   * missed, and `over` is the truth about the bytes it sent.
   */
  it('parses at every budget from 10 B to the whole document, and is partial exactly when it says so', async () => {
    const whole = (await runBurgee(program, { argv: ['ls', '--json'] })).stdout;
    const budgets = Array.from({ length: bytes(whole) - 9 }, (_, i) => 10 + i);
    const runs = await Promise.all(budgets.map(async (max) => ({ max, ...(await runBurgee(program, { argv: ['ls', '--json', `--max-bytes=${String(max)}`] })) })));
    // Every budget, byte by byte: a cut that is off by one shows at exactly one of them.
    expect(runs.at(-1)?.max).toBe(bytes(whole));
    for (const { max, stdout, code } of runs) {
      expect(code).toBe(0);
      const doc = parse(stdout);
      const rows = doc.data as unknown[];
      expect(rows).toEqual(files.slice(0, rows.length));
      if (doc.truncated === undefined) expect(stdout).toBe(whole);
      else expect(doc.truncated).toEqual({ of: 12, returned: rows.length, ...(bytes(stdout) > max ? { over: bytes(stdout) - max } : {}) });
      if (rows.length > 0) expect(bytes(stdout)).toBeLessThanOrEqual(max);
    }
  });
});

describe('--max-bytes on a line format (R3)', () => {
  it('keeps --format=agent to whole lines and puts the notice on stderr as one JSON line', async () => {
    const whole = (await runBurgee(program, { argv: ['ls', '--format=agent'] })).stdout;
    const r = await runBurgee(program, { argv: ['ls', '--format=agent', '--max-bytes', '200'] });
    expect(r.code).toBe(0);
    expect(bytes(r.stdout)).toBeLessThanOrEqual(200);
    expect(whole.startsWith(r.stdout)).toBe(true);
    expect(r.stdout.endsWith('\n')).toBe(true);
    const returned = r.stdout.split('\n').length - 1;
    expect(JSON.parse(r.stderr)).toEqual({ truncated: { of: 12, returned } });
    // Whole lines, and the most of them that fit.
    expect(bytes(whole.split('\n').slice(0, returned + 1).join('\n'))).toBeGreaterThan(200 - 1);
  });

  it('keeps --format=tsv to its header and whole rows', async () => {
    const r = await runBurgee(program, { argv: ['ls', '--format=tsv', '--max-bytes', '90'] });
    const lines = r.stdout.split('\n');
    expect(lines[0]).toBe('path\tsize\tkind');
    expect(bytes(r.stdout)).toBeLessThanOrEqual(90);
    expect(JSON.parse(r.stderr)).toEqual({ truncated: { of: 12, returned: lines.length - 2 } });
  });

  it('writes the rows whole, and nothing to stderr, at a budget of exactly their bytes', async () => {
    const whole = (await runBurgee(program, { argv: ['ls', '--format=agent'] })).stdout;
    expect(await runBurgee(program, { argv: ['ls', '--format=agent', '--max-bytes', String(bytes(whole))] })).toMatchObject({ code: 0, stdout: whole, stderr: '' });
  });

  it('writes nothing to stderr when the rows fit', async () => {
    expect(await runBurgee(program, { argv: ['ls', '--format=agent', '--max-bytes', '100000'] })).toMatchObject({ code: 0, stderr: '' });
  });

  it('returns a record that is not a list whole, and says by how much it is over', async () => {
    const r = await runBurgee(program, { argv: ['show', '--format=agent', '--max-bytes=10'] });
    expect(r.stdout).toBe((await runBurgee(program, { argv: ['show', '--format=agent'] })).stdout);
    expect(JSON.parse(r.stderr)).toEqual({ truncated: { of: 1, returned: 1, over: bytes(r.stdout) - 10 } });
  });
});

describe('--max-bytes on a format an author registered (R3)', () => {
  // A format whose rendering of no rows is not empty: a title line, then one line per row.
  const titled = defineProgram({ name: 't', commands: [defineCommand({ name: 'ls', effects: 'read_only', run: () => files })] });
  titled.use(definePlugin({ name: 'titled', formats: { titled: { description: 'a title, then paths', render: (rows) => `# files\n${(rows as { path: string }[]).map((r) => `${r.path}\n`).join('')}` } } }));

  it('is cut at a whole row like the built-in formats', async () => {
    const r = await runBurgee(titled, { argv: ['ls', '--format=titled', '--max-bytes', '40'] });
    expect(r.stdout).toBe('# files\nsrc/module-0.ts\nsrc/module-1.ts\n');
    expect(JSON.parse(r.stderr)).toEqual({ truncated: { of: 12, returned: 2 } });
  });

  it('says it is over when not even no rows fit', async () => {
    const r = await runBurgee(titled, { argv: ['ls', '--format=titled', '--max-bytes', '3'] });
    expect(r.stdout).toBe('# files\n');
    expect(JSON.parse(r.stderr)).toEqual({ truncated: { of: 12, returned: 0, over: 5 } });
  });

  it('hands a result of nothing to the format as null, as --json carries it', async () => {
    expect(await runBurgee(program, { argv: ['nothing', '--format=agent', '--max-bytes', '5'] })).toMatchObject({ code: 0, stdout: '', stderr: '' });
  });
});

describe('--max-bytes is read the way the other globals are', () => {
  it('is refused before the handler runs when no machine format is asked for', async () => {
    const before = ran;
    const r = await runBurgee(program, { argv: ['ls', '--max-bytes', '100'] });
    expect(r.code).toBe(ExitCode.USAGE);
    expect(r.stderr).toContain('error: --max-bytes budgets a machine format, and none was asked for\nhint: add --json, or --format=<name>; --format lists them\n');
    expect(ran).toBe(before);
  });

  it.each([
    ['--format text, which asks for the human rendering', ['ls', '--format', 'text']],
    ['--output xml, which is not a json spelling', ['ls', '--output', 'xml']],
    ['a json that is a positional, not a flag’s value', ['echo', 'say', 'json']],
    ['a word that only ends like the spelling', ['echo', 'x--output', 'json']],
    ['--output json on a command whose own option --output is', ['save', '--output', 'json']],
  ])('is refused beside %s, before anything is parsed', async (_, argv) => {
    const r = await runBurgee(program, { argv: [...argv, '--max-bytes', '100'] });
    expect(r.code).toBe(ExitCode.USAGE);
    expect(r.stderr).toContain('error: --max-bytes budgets a machine format, and none was asked for\n');
  });

  it('sets no deadline: a handler that takes its time is not cut short, and its signal never aborts', async () => {
    const r = await runBurgee(program, { argv: ['slow', '--json', '--max-bytes', '1000'] });
    expect(r.code).toBe(0);
    expect(parse(r.stdout).data).toEqual({ aborted: false });
  });

  it('does not count a --json after `--`, which is the handler’s (G5)', async () => {
    expect((await runBurgee(program, { argv: ['ls', '--max-bytes', '100', '--', '--json'] })).code).toBe(ExitCode.USAGE);
  });

  it.each(['abc', '0', '-5', '1.5', ''])('refuses %j as a budget', async (value) => {
    const r = await runBurgee(program, { argv: ['ls', '--json', `--max-bytes=${value}`] });
    expect(r.code).toBe(ExitCode.USAGE);
    expect(r.stdout).toContain(`"message":"--max-bytes takes a whole number of bytes, not \\"${value}\\""`);
    expect(r.stdout).toContain('"hint":"pass a number above 0, such as --max-bytes 4096"');
  });

  it('takes the --format=json spelling, which runs as --json (D-20261009)', async () => {
    const doc = parse((await runBurgee(program, { argv: ['ls', '--format=json', '--max-bytes', '300'] })).stdout);
    expect(doc.truncated?.of).toBe(12);
  });

  it('takes the --format json and --output=json spellings too', async () => {
    expect(parse((await runBurgee(program, { argv: ['ls', '--format', 'json', '--max-bytes', '300'] })).stdout).truncated?.of).toBe(12);
    expect(parse((await runBurgee(program, { argv: ['ls', '--output=json', '--max-bytes', '300'] })).stdout).truncated?.of).toBe(12);
    expect(parse((await runBurgee(program, { argv: ['ls', '--output', 'json', '--max-bytes', '300'] })).stdout).truncated?.of).toBe(12);
  });

  it('is read before the command, like the other globals', async () => {
    expect(parse((await runBurgee(program, { argv: ['--max-bytes', '300', 'ls', '--json'] })).stdout).truncated?.of).toBe(12);
  });

  it('a command that declares its own maxBytes keeps the flag — the program wins', async () => {
    expect(parse((await runBurgee(program, { argv: ['mine', '--json', '--max-bytes', '7'] })).stdout).data).toEqual({ maxBytes: 7 });
  });
});

describe('printer and budgetJson', () => {
  it('a printer leaves a run with neither --json nor a format to the human rendering', () => {
    expect(printer(undefined, 10)({ ok: true, data: [1], meta: {} }, false, { err: { write: () => true } })).toBeUndefined();
  });

  it('a printer with no budget leaves --json to the engine', () => {
    expect(printer(String, undefined)({ ok: true, data: [1], meta: {} }, true, { err: { write: () => true } })).toBeUndefined();
  });

  it('an empty list that does not fit is returned empty, and says it is over', () => {
    const out = budgetJson({ ok: true, data: [], meta: { provenance: {} } }, 5);
    expect(JSON.parse(out)).toEqual({ ok: true, data: [], meta: { provenance: {} }, truncated: { of: 0, returned: 0, over: bytes(out) - 5 } });
  });
});
