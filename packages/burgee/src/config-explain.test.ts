/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * V8 / D-117 — `config explain`: synthesised for a program that reads config, generated from
 * the resolver's own precedence and provenance.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ORDER } from 'seniority/precedence';
import { describe, expect, it } from 'vitest';

import { defineCommand, defineProgram } from './index.js';
import { runBurgee } from './testing.js';

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

const cwd = mkdtempSync(join(tmpdir(), 'burgee-config-explain-'));
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
