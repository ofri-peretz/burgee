/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * N15 / D-146 — `--format=agent`: one compact line per record, not JSON, and **smaller than
 * `--json` on the same result**. The size is the property the format exists for, and like
 * `machine-json.test.ts` the only test that can defend a size is one that measures the string:
 * a format that grew back its braces would still split into the same records.
 */
import { describe, expect, it } from 'vitest';

import { agentLines } from './agent-format.js';
import { defineCommand, defineProgram } from './index.js';
import { runBurgee } from './testing.js';

const AGENT = '--format=agent';

/** Representative results: what a list, a show, a status, an idempotent write and a scalar command return. */
const files = Array.from({ length: 12 }, (_, i) => ({ path: `src/module-${i}.ts`, size: 1_024 * (i + 1), kind: i % 3 === 0 ? 'test' : 'source', modified: `2026-09-${String(10 + i).padStart(2, '0')}T12:00:00.000Z` }));
const deployment = { id: 'dep_7f3a', status: 'ready', target: { region: 'iad1', url: 'https://app-7f3a.example.dev' }, tags: ['prod', 'canary'], checks: [{ name: 'lint', ok: true }, { name: 'test', ok: true }], message: 'Fix the\n  retry loop' };
const status = { branch: 'main', ahead: 2, behind: 0, clean: false, staged: ['a.ts', 'b.ts'], unstaged: [] };
const names = ['burgee', 'roundel', 'linegauge', 'closeout', 'seniority', 'flagstaff', 'caique', 'paratext', 'bellpull'];

const program = defineProgram({
  name: 'app',
  version: '1.0.0',
  commands: [
    defineCommand({ name: 'ls', effects: 'read_only', run: () => files }),
    defineCommand({ name: 'show', effects: 'read_only', run: () => deployment }),
    defineCommand({ name: 'status', effects: 'read_only', run: () => status }),
    defineCommand({ name: 'names', effects: 'read_only', run: () => names }),
    defineCommand({ name: 'count', effects: 'read_only', run: () => names.length }),
    defineCommand({ name: 'sync', effects: 'idempotent', options: { force: { type: 'boolean' } }, run: ({ options }) => ({ changed: options.force === true, synced: 3 }) }),
    defineCommand({ name: 'none', effects: 'read_only', run: () => null }),
    defineCommand({ name: 'partial', effects: 'read_only', run: () => ({ done: 1, left: 2, exitCode: 1 }) }),
    defineCommand({ name: 'boom', effects: 'read_only', run: () => { throw new Error('the disk is full'); } }),
    defineCommand({ name: 'export', effects: 'read_only', options: { format: { type: 'string' } }, run: ({ options }) => ({ format: options.format ?? null }) }),
    defineCommand({ name: 'echo', effects: 'read_only', arguments: [{ name: 'words', variadic: true, required: false }], run: ({ positionals, passthrough }) => ({ positionals, passthrough }) }),
  ],
});

const REPRESENTATIVE = [['ls'], ['show'], ['status'], ['names'], ['count'], ['sync', '--force']];

describe('--format=agent is smaller than --json on the same result (N15)', () => {
  it.each(REPRESENTATIVE)('%s: fewer bytes than the --json envelope', async (...argv) => {
    const json = await runBurgee(program, { argv: [...argv, '--json'] });
    const agent = await runBurgee(program, { argv: [...argv, AGENT] });
    expect(agent.code).toBe(0);
    expect(agent.stderr).toBe('');
    expect(json.code).toBe(0);
    expect(Buffer.byteLength(agent.stdout)).toBeGreaterThan(0);
    expect(Buffer.byteLength(agent.stdout)).toBeLessThan(Buffer.byteLength(json.stdout));
  });

  it('is smaller over the whole set by a margin, not a rounding error', async () => {
    const runs = await Promise.all(REPRESENTATIVE.map(async (argv) => [await runBurgee(program, { argv: [...argv, '--json'] }), await runBurgee(program, { argv: [...argv, AGENT] })] as const));
    // An empty stdout is "smaller" too: a run that failed must not score as a saving.
    for (const [j, a] of runs) expect([j.code, a.code, a.stderr]).toEqual([0, 0, '']);
    const json = runs.reduce((sum, [j]) => sum + Buffer.byteLength(j.stdout), 0);
    const agent = runs.reduce((sum, [, a]) => sum + Buffer.byteLength(a.stdout), 0);
    expect(agent).toBeGreaterThan(0);
    // Measured 2026-09-24 on these six results: 1,294 bytes against 1,882, 31.2% smaller — from
    // 20.5% on the twelve-row list, where logfmt repeats each key per line as JSON does, to
    // 95.7% on a bare count. The floor sits under the figure on purpose: it defends
    // "measurably smaller", and a format that grew its braces back would fall through it.
    expect(1 - agent / json).toBeGreaterThan(0.2);
  });
});

describe('--format=agent — one compact line per record (N15)', () => {
  it('prints a list result as one line per element', async () => {
    const r = await runBurgee(program, { argv: ['ls', AGENT] });
    const lines = r.stdout.split('\n');
    expect(lines.pop()).toBe('');
    expect(lines).toHaveLength(files.length);
    expect(lines[0]).toBe('path=src/module-0.ts size=1024 kind=test modified=2026-09-10T12:00:00.000Z');
  });

  it('prints an object result as one line: dotted keys, comma-joined scalars, indexed objects, whitespace collapsed', async () => {
    const r = await runBurgee(program, { argv: ['show', AGENT] });
    expect(r.stdout).toBe('id=dep_7f3a status=ready target.region=iad1 target.url=https://app-7f3a.example.dev tags=prod,canary checks.0.name=lint checks.0.ok=true checks.1.name=test checks.1.ok=true message="Fix the retry loop"\n');
  });

  it('is not JSON: no envelope, no meta, no braces', async () => {
    const r = await runBurgee(program, { argv: ['status', AGENT] });
    expect(r.stdout).toBe('branch=main ahead=2 behind=0 clean=false staged=a.ts,b.ts unstaged=\n');
    expect(() => JSON.parse(r.stdout) as unknown).toThrow();
    expect(r.stdout).not.toContain('provenance');
  });

  it('prints scalar records as themselves', async () => {
    expect((await runBurgee(program, { argv: ['names', AGENT] })).stdout).toBe(`${names.join('\n')}\n`);
    expect((await runBurgee(program, { argv: ['count', AGENT] })).stdout).toBe('9\n');
  });

  it('keeps `changed`, so a no-op still announces itself (N7)', async () => {
    expect((await runBurgee(program, { argv: ['sync', AGENT] })).stdout).toBe('changed=false synced=3\n');
  });

  it('prints nothing for no records, and exits OK', async () => {
    const r = await runBurgee(program, { argv: ['none', AGENT] });
    expect(r).toMatchObject({ code: 0, stdout: '', stderr: '' });
  });

  it('keeps the exit code the result names (E1)', async () => {
    const r = await runBurgee(program, { argv: ['partial', AGENT] });
    expect(r.code).toBe(1);
    expect(r.stdout).toBe('done=1 left=2 exitCode=1\n');
  });

  it('sits anywhere among the command options, like --json', async () => {
    expect((await runBurgee(program, { argv: ['sync', AGENT, '--force'] })).stdout).toBe('changed=true synced=3\n');
  });
});

describe('--format=agent leaves every other contract alone', () => {
  it('--json wins when both are typed: the envelope, unchanged', async () => {
    const both = await runBurgee(program, { argv: ['status', '--json', AGENT] });
    const json = await runBurgee(program, { argv: ['status', '--json'] });
    expect(both.stdout).toBe(json.stdout);
  });

  it('--json=<fields> still selects, and wins the same way', async () => {
    const r = await runBurgee(program, { argv: ['status', AGENT, '--json=branch'] });
    expect(JSON.parse(r.stdout)).toMatchObject({ ok: true, data: { branch: 'main' } });
  });

  it('a --json failure is still one envelope on stdout, stderr empty (D-140)', async () => {
    const r = await runBurgee(program, { argv: ['boom', '--json', AGENT] });
    expect(r.code).not.toBe(0);
    expect(r.stderr).toBe('');
    expect(JSON.parse(r.stdout)).toMatchObject({ ok: false, error: { message: 'the disk is full' } });
  });

  it('a failure without --json is still prose on stderr, stdout empty', async () => {
    const r = await runBurgee(program, { argv: ['boom', AGENT] });
    expect(r.code).not.toBe(0);
    expect(r.stdout).toBe('');
    expect(r.stderr).toContain('the disk is full');
  });

  it('an unknown option is still refused', async () => {
    const r = await runBurgee(program, { argv: ['count', AGENT, '--nope'] });
    expect(r.code).toBe(2);
  });

  it('a command that declares its own `format` option keeps the flag — the program wins', async () => {
    const r = await runBurgee(program, { argv: ['export', AGENT, '--json'] });
    expect(JSON.parse(r.stdout)).toMatchObject({ ok: true, data: { format: 'agent' } });
  });

  it('after `--` it is pass-through, not a format (G5)', async () => {
    const r = await runBurgee(program, { argv: ['echo', '--json', '--', AGENT] });
    expect(JSON.parse(r.stdout)).toMatchObject({ data: { passthrough: [AGENT] } });
  });
});

describe('agentLines', () => {
  it('quotes a value only when splitting would otherwise break it', () => {
    expect(agentLines({ a: '', b: 'x y', c: 'k=v', d: 'say "hi"', e: 'a,b', f: 'tab\there', g: 'plain', h: '\u001b[31m' })).toBe(
      'a="" b="x y" c="k=v" d="say \\"hi\\"" e="a,b" f="tab here" g=plain h="\\u001b[31m"\n',
    );
  });

  it('carries what --json carries: toJSON applied, undefined dropped, null kept', () => {
    expect(agentLines({ at: new Date(Date.UTC(2026, 8, 24)), gone: undefined, none: null })).toBe('at=2026-09-24T00:00:00.000Z none=null\n');
  });

  it('indexes a nested list record, and prints nothing for undefined or an empty list', () => {
    expect(agentLines([['a', { b: 1 }]])).toBe('0=a 1.b=1\n');
    expect(agentLines(undefined)).toBe('');
    expect(agentLines([])).toBe('');
  });

  it('collapses a multi-line scalar record onto one line', () => {
    expect(agentLines(['first\n\n  second  '])).toBe('first second\n');
  });
});
