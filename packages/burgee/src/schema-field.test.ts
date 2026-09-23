/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * N13 / D-116 — `--schema <command> --field <path>` returns one field of one command's schema.
 */
import { describe, expect, it } from 'vitest';

import { defineCommand, defineProgram } from './index.js';
import { runBurgee } from './testing.js';

const program = defineProgram({
  name: 'app',
  version: '1.0.0',
  commands: [
    defineCommand({
      name: 'deploy',
      description: 'Ship a build',
      options: { region: { type: 'string', description: 'where to', choices: ['eu', 'us'] }, dry: { type: 'boolean' } },
      effects: 'non_idempotent',
      run: () => 'ok',
    }),
  ],
});

async function drill(...argv: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return runBurgee(program, { argv: ['--schema', ...argv] });
}

describe('--schema <command> --field <path> (N13)', () => {
  it('returns the one field, not the command around it', async () => {
    const whole = JSON.parse((await drill('deploy')).stdout) as Record<string, unknown>;
    const r = await drill('deploy', '--field', 'description');
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout)).toBe(whole['description']);
  });

  it('walks a dotted path, and takes the `=` form too', async () => {
    const whole = JSON.parse((await drill('deploy')).stdout) as { options: Record<string, unknown> };
    const spaced = await drill('deploy', '--field', 'options.region');
    const equals = await drill('deploy', '--field=options.region');
    expect(JSON.parse(spaced.stdout)).toEqual(whole.options['region']);
    expect(equals.stdout).toBe(spaced.stdout);
  });

  it('is smaller than the command it drills into — the point of drilling', async () => {
    expect((await drill('deploy', '--field', 'options.region')).stdout.length).toBeLessThan((await drill('deploy')).stdout.length);
  });

  it('refuses a step that does not exist, naming the steps that do', async () => {
    const r = await drill('deploy', '--field', 'options.zone');
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('"options" has no field "zone"');
    expect(r.stderr).toContain('fields here: region, dry');
  });

  it('refuses --field without a command to drill into', async () => {
    const r = await drill('--field', 'options');
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('--schema <command> --field <path>');
  });
});
