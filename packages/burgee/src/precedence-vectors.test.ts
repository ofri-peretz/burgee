/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * seniority's truth table, run through the engine (`seniority` R1, R2, criterion 5).
 *
 * `precedence-vectors.json` is one row per combination of the five sources: which are set,
 * and which wins. seniority's suite holds `TRUTH_TABLE` and `resolve` to it; this file holds a
 * real program to it — a flag typed, a variable exported, a config file and a `package.json`
 * field written to disk, a declared default — so a change to the order fails both suites at
 * once, and so does a change to the vectors. Reading a sibling's JSON fixture is not an
 * import: `files` does not ship it and the weight and shape locks see no edge.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { scratchDirs } from './__fixtures__/scratch-dir.js';
import { configLayers } from './config-layers.js';
import { defineCommand, defineProgram, execute } from './index.js';

type Source = 'flag' | 'env' | 'config' | 'package' | 'default';
const VECTORS = JSON.parse(readFileSync(new URL('../../seniority/src/precedence-vectors.json', import.meta.url), 'utf8')) as ReadonlyArray<{
  set: Source[];
  winner: Source | null;
}>;

const scratch = scratchDirs();

/** The program, with or without a declared default: the fifth source is a property of the spec. */
const programs = new Map(
  [true, false].map((withDefault) => [
    withDefault,
    defineProgram({
      name: 'app',
      envPrefix: 'APP',
      config: true,
      commands: [
        defineCommand({
          name: 'deploy',
          options: { region: withDefault ? { type: 'string', default: 'default' } : { type: 'string' } },
          effects: 'withheld',
          run: ({ options }) => ({ region: options['region'] ?? null }),
        }),
      ],
    }),
  ]),
);

interface Run {
  code: number;
  stdout: string;
}

/** One row as files, a variable and a flag; `region` is on the config file's third line and the package.json's fifth. */
async function run(set: readonly Source[], extra: readonly string[] = []): Promise<Run & { dir: string }> {
  const dir = scratch('burgee-vectors-');
  mkdirSync(join(dir, 'bin'));
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ name: 'app-pkg', version: '1.0.0', ...(set.includes('package') ? { app: { region: 'package' } } : {}) }, null, 2)}\n`);
  if (set.includes('config')) writeFileSync(join(dir, 'app.config.json'), '{\n  "tier": "pro",\n  "region": "config"\n}\n');
  // No user config directory and nothing ambient: every source is the one this row wrote.
  const env: Record<string, string> = { HOME: join(dir, 'none'), XDG_CONFIG_HOME: join(dir, 'none'), ...(set.includes('env') ? { APP_REGION: 'env' } : {}) };
  const argv = ['deploy', ...(set.includes('flag') ? ['--region', 'flag'] : []), ...extra];
  const out: string[] = [];
  let code = -1;
  await execute(programs.get(set.includes('default'))!, {
    argv,
    env,
    cwd: dir,
    entry: join(dir, 'bin/cli.js'),
    stdout: { write: (s: string) => out.push(s) },
    stderr: { write: () => true },
    exit: (c) => {
      code = c;
    },
  });
  return { code, stdout: out.join(''), dir };
}

describe('every row of the truth table, through a real program', () => {
  it('reads all 32 combinations of the five sources', () => {
    expect(VECTORS).toHaveLength(32);
  });

  it.each(VECTORS.map((v) => [v.set.join(' + ') || 'nothing set', v] as const))('%s', async (_, { set, winner }) => {
    const r = await run(set, ['--json']);
    expect(r.code).toBe(0);
    const body = JSON.parse(r.stdout) as { data: { region: unknown }; meta: { provenance: Record<string, { source: string }> } };
    // Each source sets `region` to its own name, so the value names the winner too.
    expect(body.data.region).toBe(winner);
    expect(body.meta.provenance['region']?.source).toBe(winner ?? undefined);
  });
});

describe('provenance names the file and the line (seniority R3, criterion 3)', () => {
  it('a package.json field that wins carries the line inside the field that set it', async () => {
    const r = await run(['package', 'default'], ['--json']);
    const body = JSON.parse(r.stdout) as { meta: { provenance: Record<string, unknown> } };
    expect(body.meta.provenance['region']).toEqual({ source: 'package', location: join(r.dir, 'package.json'), line: 5 });
  });

  it('a config file that wins carries the line it set the value on', async () => {
    const r = await run(['config', 'package', 'default'], ['--json']);
    const body = JSON.parse(r.stdout) as { meta: { provenance: Record<string, unknown> } };
    expect(body.meta.provenance['region']).toEqual({ source: 'config', location: join(r.dir, 'app.config.json'), line: 3 });
  });

  it('--explain, with all four sources set at once, names the winner and every loser by file, line or variable', async () => {
    const r = await run(['flag', 'env', 'config', 'package', 'default'], ['--explain', 'region']);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/^region = "flag" {3}from flag --region\n/);
    expect(r.stdout).toContain('env APP_REGION "env"');
    expect(r.stdout).toContain(`config file ${join(r.dir, 'app.config.json')}:3 "config"`);
    expect(r.stdout).toContain(`package.json field in ${join(r.dir, 'package.json')}:5 "package"`);
    expect(r.stdout).toContain('default "default"');
  });
});

describe('configLayers hands seniority the layer it loaded', () => {
  it('whole, with its lines, and no config key at all when there is no file', async () => {
    const dir = scratch('burgee-layers-');
    const none = { cwd: dir, env: { HOME: join(dir, 'none'), XDG_CONFIG_HOME: join(dir, 'none') }, pkg: undefined };
    // Strict: `{ config: undefined }` is a different layer set from `{}` to anything that spreads it.
    expect(await configLayers('app', {}, none)).toStrictEqual({});
    writeFileSync(join(dir, 'app.config.json'), '{\n  "region": "eu"\n}\n');
    expect((await configLayers('app', {}, none)).config).toMatchObject({ path: join(dir, 'app.config.json'), data: { region: 'eu' }, lines: { region: 2 } });
  });
});
