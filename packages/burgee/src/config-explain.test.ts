/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * V8 / D-117 — `config explain`: synthesised for a program that reads config, generated from
 * the resolver's own precedence and provenance.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { width } from 'linegauge';
import { candidates } from 'seniority/config';
import { ORDER } from 'seniority/precedence';
import { describe, expect, it } from 'vitest';

import { scratchDirs } from './__fixtures__/scratch-dir.js';
import { defineCommand, defineProgram } from './index.js';
import { runBurgee } from './testing.js';

const scratch = scratchDirs();

const deploy = defineCommand({
  name: 'deploy',
  options: {
    region: { type: 'string', default: 'us-east' },
    tier: { type: 'string' },
    replicas: { type: 'number' },
    dry: { type: 'boolean', default: false },
  },
  effects: 'non_idempotent',
  run: () => 'ok',
});

const program = defineProgram({ name: 'app', version: '1.0.0', config: true, envPrefix: 'APP', commands: [deploy] });

const cwd = scratch('burgee-config-explain-');
writeFileSync(join(cwd, 'app.config.json'), `${JSON.stringify({ region: 'eu-west', replicas: 3 })}\n`);
// Everything the resolver reads comes from here: no user config directory, no ambient APP_*.
const env = { XDG_CONFIG_HOME: join(cwd, 'none'), HOME: join(cwd, 'none'), APP_TIER: 'pro' };

async function explain(...argv: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return runBurgee(program, { argv: ['config', 'explain', ...argv], env, cwd });
}

describe('config explain (V8)', () => {
  it('prints the precedence from the resolver’s own order, then each option and the source that won', async () => {
    const r = await explain('deploy');
    expect(r.code).toBe(0);
    const [first, ...rows] = r.stdout.trimEnd().split('\n');
    expect(first).toBe(`precedence: ${ORDER.map((s) => (s === 'package' ? 'package.json' : s)).join(' > ')} — the first that sets a value wins`);
    const byOption = Object.fromEntries(rows.map((l) => [l.trim().split(/\s+/)[0], l]));
    expect(byOption['--region']).toMatch(/eu-west\s+\(config .*app\.config\.json/);
    expect(byOption['--replicas']).toMatch(/3\s+\(config /);
    expect(byOption['--tier']).toMatch(/pro\s+\(env APP_TIER\)/);
    expect(byOption['--dry']).toMatch(/false\s+\(default\)/);
  });

  it('lines every value up in terminal columns, whatever the option is named in', async () => {
    // `--地域` is four code units and six columns. Padded with `.padEnd`, its value started
    // two columns right of every ASCII option's.
    const wide = defineCommand({ name: 'deploy', options: { region: { type: 'string', default: 'us' }, 地域: { type: 'string', default: 'eu' } }, effects: 'withheld', run: () => 'ok' });
    const app = defineProgram({ name: 'app', version: '1.0.0', config: true, commands: [wide] });
    const r = await runBurgee(app, { argv: ['config', 'explain', 'deploy', '--no-config'], env, cwd });
    expect(r.code).toBe(0);
    // The option rows only: the discovery section below them is not part of this table.
    const rows = r.stdout.trimEnd().split('\n').slice(1).filter((l) => l.startsWith('  --'));
    const starts = rows.map((l) => width(l.slice(0, l.search(/(?:us|eu) {2}\(/))));
    expect(starts).toHaveLength(2);
    expect(new Set(starts).size).toBe(1);
  });

  it('answers as data with --json', async () => {
    const r = await explain('deploy', '--json');
    const body = JSON.parse(r.stdout) as { ok: boolean; data: { precedence: string[]; options: { option: string; value: unknown; source: string }[] } };
    expect(body.ok).toBe(true);
    expect(body.data.precedence).toEqual(['flag', 'env', 'config', 'package.json', 'default']);
    expect(body.data.options).toContainEqual(expect.objectContaining({ option: '--region', value: 'eu-west', source: 'config' }));
    expect(body.data.options).toContainEqual(expect.objectContaining({ option: '--tier', value: 'pro', source: 'env' }));
  });

  it('honours --no-config, which is what a run would read', async () => {
    const r = await explain('deploy', '--no-config', '--json');
    const { options } = (JSON.parse(r.stdout) as { data: { options: { option: string; value: unknown; source: string }[] } }).data;
    expect(options).toContainEqual(expect.objectContaining({ option: '--region', value: 'us-east', source: 'default' }));
  });

  it('is not synthesised for a program that reads no config', async () => {
    const plain = defineProgram({ name: 'app', version: '1.0.0', commands: [deploy] });
    const r = await runBurgee(plain, { argv: ['config', 'explain'], env, cwd });
    expect(r.code).not.toBe(0);
  });

  it('gives way to a program that defines `config explain` itself', async () => {
    const own = defineProgram({
      name: 'app',
      version: '1.0.0',
      config: true,
      commands: [defineCommand({ name: 'config', commands: [defineCommand({ name: 'explain', effects: 'read_only', run: () => 'mine' })] })],
    });
    const r = await runBurgee(own, { argv: ['config', 'explain'], env, cwd });
    expect(r.stdout.trim()).toBe('mine');
  });
});

const indentOf = (l: string): string => l.slice(0, l.length - l.trimStart().length);
/** The line `--explain` adds under its `candidates:` line, and the indent of each. */
const addedLine = (stdout: string): { line: string; indent: string; under: string } => {
  const lines = stdout.split('\n');
  const at = lines.findIndex((l) => l.trimStart().startsWith('candidates:'));
  const added = lines[at + 1] ?? '';
  return { line: added.trimStart(), indent: indentOf(added), under: indentOf(lines[at] ?? '') };
};

/**
 * commander-env K3 — constraint 3 promised that the file discovery order is itself explainable.
 * `config explain` printed the precedence and `--explain` named the winning file, and neither
 * said which files were tried, in what order, or why. seniority's `candidates()` already returns
 * that order with a reason per path; these render it.
 */
describe('the discovery order, explained (commander-env K3)', () => {
  const order = candidates({ name: 'app', cwd, env });
  const read = join(cwd, 'app.config.json');

  it('config explain prints every path tried, in order, with why, and marks the one read', async () => {
    const r = await explain('deploy');
    expect(r.code).toBe(0);
    const lines = r.stdout.trimEnd().split('\n');
    const at = lines.indexOf('discovery: the first file that exists is read');
    expect(at, r.stdout).toBeGreaterThan(0);
    const steps = lines.slice(at + 1);
    expect(steps).toHaveLength(order.length);
    order.forEach((c, i) => {
      expect(steps[i]).toBe(`  ${String(i + 1)}. ${c.path}  (${c.reason})${c.path === read ? ' — read' : ''}`);
    });
  });

  it('carries the same order under --json, and the path read', async () => {
    const r = await explain('deploy', '--json');
    const { discovery } = (JSON.parse(r.stdout) as { data: { discovery: { order: { path: string; reason: string; found: boolean }[]; read: string | null } } }).data;
    expect(discovery.order).toEqual(order.map((c) => ({ path: c.path, reason: c.reason, found: c.path === read })));
    expect(discovery.read).toBe(read);
  });

  it('says discovery is off under --no-config, and that --config names the one file read', async () => {
    expect((await explain('deploy', '--no-config')).stdout.trimEnd().split('\n').at(-1)).toBe('discovery: off (--no-config)');
    const r = await explain('deploy', '--config', 'app.config.json', '--json');
    expect((JSON.parse(r.stdout) as { data: { discovery: unknown } }).data.discovery).toEqual({ order: [{ path: read, reason: '--config', found: true }], read });
  });

  it('--explain <option> names the file a config value won from, and its place in the discovery order', async () => {
    const r = await runBurgee(program, { argv: ['deploy', '--explain', 'region'], env, cwd });
    expect(r.code).toBe(0);
    const position = order.findIndex((c) => c.path === read);
    const { line, indent, under } = addedLine(r.stdout);
    expect(line).toBe(`config file ${read}: discovery candidate ${String(position + 1)} of ${String(order.length)} (${order[position]!.reason})`);
    expect(indent).toBe(under);
    expect(indent.length).toBeGreaterThan(0);
  });

  it('--explain counts the place of a file read further down the order, from the user config directory', async () => {
    const home = scratch('burgee-config-explain-user-');
    mkdirSync(join(home, 'xdg', 'app'), { recursive: true });
    writeFileSync(join(home, 'xdg', 'app', 'config.json'), `${JSON.stringify({ region: 'ap-south' })}\n`);
    const userEnv = { XDG_CONFIG_HOME: join(home, 'xdg'), HOME: join(home, 'none') };
    const tried = candidates({ name: 'app', cwd: home, env: userEnv });
    const r = await runBurgee(program, { argv: ['deploy', '--explain', 'region'], env: userEnv, cwd: home });
    expect(r.code).toBe(0);
    expect(addedLine(r.stdout).line).toBe(`config file ${join(home, 'xdg', 'app', 'config.json')}: discovery candidate ${String(tried.length)} of ${String(tried.length)} (user config directory)`);
  });

  it('--explain says nothing about discovery when the value did not come from a config file', async () => {
    const r = await runBurgee(program, { argv: ['deploy', '--explain', 'tier'], env, cwd });
    expect(r.code).toBe(0);
    expect(r.stdout).not.toContain('discovery candidate');
  });
});
