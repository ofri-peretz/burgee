/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — the changed-lines mutation lane is one script, and pre-push is where it runs.
 *
 * Until 2026-11-01 the lane's plan, builds and mutation run were four steps in quality-full.yml
 * and nowhere else: no npm script ran them and pre-push did not, so a surviving mutant was first
 * seen in CI. #1417 made the lane one file, `scripts/mutation-changed.sh`, run by
 * `npm run mutation:changed`, which CI's job and pre-push both ran. Then the owner ruled "No
 * oxmutate in GHA" (D-20261101-no-mutation-in-gha): CI's `Mutation (changed lines)` job is gone,
 * and pre-push is the per-PR mutation gate.
 *
 * What fails here: a workflow running the lane again, the npm script pointing elsewhere,
 * pre-push dropping or reordering it, and the script losing a step of the lane.
 * `mutation-local-only-lock.test.ts` holds every other mutation run out of `.github/`.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { load as loadYaml } from 'js-yaml';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SCRIPT = 'scripts/mutation-changed.sh';
const NPM_RUN = 'npm run mutation:changed';
const read = (file: string): string => readFileSync(join(ROOT, file), 'utf8');

const script = read(SCRIPT);
/** Without comments: what the script runs, not what it says about itself. */
const code = script.split('\n').filter((l) => !l.trimStart().startsWith('#')).join('\n');
/** A workflow file's text without its comment lines: what it runs. */
const uncommented = (file: string): string => read(file).split('\n').filter((l) => !l.trimStart().startsWith('#')).join('\n');

describe('no workflow runs the lane (D-20261101-no-mutation-in-gha)', () => {
  it('quality-full.yml has no mutation job', () => {
    const jobs = (loadYaml(read('.github/workflows/quality-full.yml')) as { jobs: Record<string, unknown> }).jobs;
    expect(Object.keys(jobs)).not.toContain('mutation');
  });

  it('no workflow runs `npm run mutation:changed` or the script', () => {
    const runs = readdirSync(join(ROOT, '.github/workflows'))
      .filter((f) => /\.ya?ml$/u.test(f))
      .filter((f) => [NPM_RUN, SCRIPT].some((t) => uncommented(`.github/workflows/${f}`).includes(t)));
    expect(runs, "the changed-lines lane runs in pre-push, on the owner's machine").toEqual([]);
  });

  it('the script reads only its own three variables, so a laptop can set each', () => {
    expect([...new Set(code.match(/\bMUTATION_[A-Z_]+/g) ?? [])].toSorted()).toEqual(['MUTATION_BASE', 'MUTATION_CONCURRENCY', 'MUTATION_EVENT']);
  });
});

describe('package.json and pre-push run the script', () => {
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
