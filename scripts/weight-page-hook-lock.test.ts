/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — a stale weight page fails on the laptop, not only in CI.
 *
 * `/docs/weight` is generated from the build's `dist/` and committed. Compat.yml's required
 * `ratchet` job runs `npm run weight:page -- --check` and fails when the page differs, which it
 * does whenever any package's build moves another's row. Until 2026-11-23 only CI ran the check,
 * and a stale page cost six CI cycles in one week. Pre-push builds every package already (the
 * battery), so the same check runs there after it.
 *
 * What fails here: pre-push dropping the check, running it before the battery has built, running
 * a different command from CI, or CI's check changing under it.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { load as loadYaml } from 'js-yaml';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CHECK = 'npm run weight:page -- --check';
const read = (file: string): string => readFileSync(join(ROOT, file), 'utf8');

describe('pre-push runs the weight-page check CI runs', () => {
  const hook = (loadYaml(read('lefthook.yml')) as { 'pre-push': { parallel?: boolean; commands: Record<string, { run: string; priority?: number }> } })['pre-push'];

  it('CI runs this command, so a local pass means the Ratchet job passes', () => {
    const steps = (loadYaml(read('.github/workflows/compat.yml')) as { jobs: Record<string, { steps: { run?: string }[] }> }).jobs;
    const runs = Object.values(steps).flatMap((job) => job.steps.map((s) => s.run)).filter((r) => r === CHECK);
    expect(runs).toHaveLength(1);
  });

  it('pre-push runs it once, sequentially', () => {
    expect(hook.parallel ?? false).toBe(false);
    expect(Object.values(hook.commands).filter((c) => c.run === CHECK)).toHaveLength(1);
  });

  it('after the battery, which builds every package the page measures', () => {
    const battery = hook.commands['battery'];
    expect(battery?.run).toContain('build');
    const weight = Object.values(hook.commands).find((c) => c.run === CHECK);
    // lefthook orders a sequential hook by `priority`, then by name, not by position in the file.
    expect(battery?.priority ?? 0).toBeGreaterThan(0);
    expect(weight?.priority ?? 0).toBeGreaterThan(battery?.priority ?? 0);
  });

  it('`weight:page` is the generator, which `--check` reads', () => {
    const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
    expect(pkg.scripts['weight:page']).toBe('tsx scripts/subpath-weight.ts');
  });
});
