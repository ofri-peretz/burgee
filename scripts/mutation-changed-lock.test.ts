/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — a laptop runs CI's changed-lines mutation lane, not a copy of it.
 *
 * Until 2026-11-01 the lane's plan, builds and mutation run were four steps in quality-full.yml
 * and nowhere else: no npm script ran them and pre-push did not, so a surviving mutant was first
 * seen in CI. Now the lane is one file, `scripts/mutation-changed.sh`, run by
 * `npm run mutation:changed`; CI's job runs that npm script and pre-push runs it last.
 *
 * What fails here is each way the two could drift apart again: CI doing part of the lane in a
 * step of its own, CI passing a variable the script does not read (or the script reading one CI
 * does not pass), the npm script pointing elsewhere, pre-push dropping or reordering it, and the
 * script losing a step of the lane.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { load as loadYaml } from 'js-yaml';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SCRIPT = 'scripts/mutation-changed.sh';
const NPM_RUN = 'npm run mutation:changed';
const read = (file: string): string => readFileSync(join(ROOT, file), 'utf8');

interface Step {
  name?: string;
  run?: string;
  if?: string;
  env?: Record<string, unknown>;
}
const job = (loadYaml(read('.github/workflows/quality-full.yml')) as { jobs: { mutation: { steps: Step[] } } }).jobs.mutation;
const script = read(SCRIPT);
/** Without comments: what the script runs, not what it says about itself. */
const code = script.split('\n').filter((l) => !l.trimStart().startsWith('#')).join('\n');

/** Text that only the lane does; a workflow step containing one is doing part of the lane itself. */
const LANE_PARTS = ['scripts/mutation.ts', 'build:native', 'turbo run build', 'mutation-changed.sh'];

describe('CI runs the npm script, and only the npm script', () => {
  it('has exactly one step that runs the lane, and it is `npm run mutation:changed`, unconditionally', () => {
    const lane = job.steps.filter((s) => s.run?.includes(NPM_RUN));
    expect(lane, 'one step of quality-full.yml → mutation runs the npm script').toHaveLength(1);
    expect(lane[0]?.run?.trim()).toBe(NPM_RUN);
    // The plan inside the script decides; a step-level `if` would be a second rule beside it.
    expect(lane[0]?.if).toBeUndefined();
  });

  it('does no part of the lane in a step of its own', () => {
    const own = job.steps.flatMap((s) => LANE_PARTS.filter((p) => s.run?.includes(p)).map((p) => `${s.name ?? '(unnamed)'}: ${p}`));
    expect(own, 'move it into scripts/mutation-changed.sh, which a laptop runs too').toEqual([]);
  });

  it('passes exactly the variables the script reads', () => {
    const passed = Object.keys(job.steps.find((s) => s.run?.includes(NPM_RUN))?.env ?? {}).toSorted();
    const reads = [...new Set(code.match(/\bMUTATION_[A-Z_]+/g) ?? [])].toSorted();
    expect(passed).toEqual(reads);
    expect(reads).toEqual(['MUTATION_BASE', 'MUTATION_CONCURRENCY', 'MUTATION_EVENT']);
  });
});

describe('package.json and pre-push run the same script', () => {
  it('`mutation:changed` is the script', () => {
    const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
    expect(pkg.scripts['mutation:changed']).toBe(`bash ${SCRIPT}`);
  });

  it('pre-push runs it, sequentially, after the battery and the root suite', () => {
    const hook = (loadYaml(read('lefthook.yml')) as { 'pre-push': { parallel?: boolean; commands: Record<string, { run: string; priority?: number }> } })['pre-push'];
    expect(hook.parallel ?? false).toBe(false);
    const cmds = hook.commands;
    const mutation = Object.values(cmds).filter((c) => c.run === NPM_RUN);
    expect(mutation).toHaveLength(1);
    // lefthook orders a sequential hook by `priority`, then by name — not by position in the file.
    const after = mutation[0]?.priority ?? 0;
    for (const name of ['battery', 'root-suite']) {
      const before = cmds[name]?.priority ?? 0;
      expect(before, `${name} needs a priority`).toBeGreaterThan(0);
      expect(after, `mutation-changed runs after ${name}`).toBeGreaterThan(before);
    }
  });
});

describe('the script is the whole lane', () => {
  it('plans, builds, builds the native core, then mutates, with the same flags', () => {
    const steps = [
      'npx tsx scripts/mutation.ts changed --event "$event" --base "$base" --plan',
      "npx turbo run build --filter='./packages/*' --concurrency=\"$concurrency\"",
      '(cd packages/oxmutate && npm run build:native)',
      'npx tsx scripts/mutation.ts changed --event "$event" --base "$base" --concurrency "$concurrency" ${GITHUB_STEP_SUMMARY:+--summary "$GITHUB_STEP_SUMMARY"}',
    ];
    const at = steps.map((s) => code.indexOf(s));
    expect(at.filter((i) => i === -1), 'every step of the lane is in the script').toEqual([]);
    expect(at.toSorted((a, b) => a - b)).toEqual(at);
    // Nothing is built before the plan has said there is work.
    expect(code.indexOf('exit 0')).toBeGreaterThan(at[0]!);
    expect(code.indexOf('exit 0')).toBeLessThan(at[1]!);
  });

  it('fails loudly, with a fix line, when cargo is missing, before the native build', () => {
    const check = code.indexOf('command -v cargo');
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(code.indexOf('npm run build:native'));
    expect(code).toMatch(/echo "fix: install rustup[^\n]*>&2\n\s*exit 1/);
  });

  it.skipIf(process.platform === 'win32')('ends successfully, having built nothing, when the event is not a pull request', () => {
    const r = spawnSync('bash', [SCRIPT], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, MUTATION_EVENT: 'push', MUTATION_BASE: '', MUTATION_CONCURRENCY: '1' } });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('Not a pull request');
    expect(r.stdout).not.toContain('turbo');
  }, 60_000);
});
