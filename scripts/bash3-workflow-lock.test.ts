/**
 * Lock — a workflow step that can run on a macOS cell speaks bash 3.2.
 *
 * GitHub's macOS runners ship Apple's `/bin/bash`, 3.2, and a `run:` step there uses it unless
 * the step names another shell. `mapfile`, `readarray`, `declare -A` and the case operators
 * `${x,,}` / `${x^^}` are bash 4. On 2026-10-19 compat.yml's "Our suite, affected packages only"
 * read its turbo filters with `mapfile`, and every macOS pull-request cell ended in
 * `line 4: mapfile: command not found`, exit 127, after its root suite had passed (run
 * 39252912956). It had been hidden until #1159, because the cell failed earlier.
 *
 * Linux runners have bash 5 and Windows' `shell: bash` is Git Bash 5, so only a job that can be
 * scheduled on macOS is held to this, and every composite action, which any job may call.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { load as loadYaml } from 'js-yaml';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

/** Bash 4 and later, each with what to write instead. */
export const BASH4: readonly { pattern: RegExp; instead: string }[] = [
  { pattern: /\b(?:mapfile|readarray)\b/u, instead: 'while IFS= read -r x; do a+=("$x"); done < <(…)' },
  { pattern: /\bdeclare\s+-[a-zA-Z]*A/u, instead: 'an indexed array, or a lookup in node or jq' },
  { pattern: /\$\{[#!]?\w+(?:\[[^\]]*\])?(?:,,?|\^\^?)\}/u, instead: "tr '[:upper:]' '[:lower:]', or node" },
];

interface Step {
  name?: string;
  run?: string;
  shell?: string;
}
interface Job {
  'runs-on'?: unknown;
  strategy?: unknown;
  steps?: Step[];
}

/** A step runs under bash when it names no shell (bash is the macOS default) or names bash. */
const runsBash = (step: Step): boolean => step.run !== undefined && (step.shell === undefined || step.shell.startsWith('bash'));

/** Whether a job can be scheduled on macOS: its runner or its matrix names a macOS image. */
export const reachesMacos = (job: Job): boolean => /macos/iu.test(JSON.stringify([job['runs-on'], job.strategy]));

/** Each bash-4 use in one script, as `<feature> — write <instead>`. */
export function bash4In(script: string): string[] {
  return BASH4.filter(({ pattern }) => pattern.test(script)).map(({ pattern, instead }) => `${pattern.exec(script)?.[0] ?? ''} — write ${instead}`);
}

interface Labelled {
  where: string;
  run: string;
}

/** The bash steps of every workflow job that can be scheduled on macOS. */
function workflowSteps(): Labelled[] {
  const dir = join(ROOT, '.github/workflows');
  return readdirSync(dir)
    .filter((f) => /\.ya?ml$/u.test(f))
    .flatMap((file) => {
      const doc = loadYaml(readFileSync(join(dir, file), 'utf8')) as { jobs?: Record<string, Job> };
      return Object.entries(doc.jobs ?? {})
        .filter(([, job]) => reachesMacos(job))
        .flatMap(([id, job]) => (job.steps ?? []).filter(runsBash).map((step) => ({ where: `${file} › ${id} › ${step.name ?? '(unnamed)'}`, run: step.run ?? '' })));
    });
}

/** The bash steps of every composite action, which a macOS job may call. */
function actionSteps(): Labelled[] {
  const dir = join(ROOT, '.github/actions');
  return readdirSync(dir).flatMap((name) => {
    const doc = loadYaml(readFileSync(join(dir, name, 'action.yml'), 'utf8')) as { runs?: { steps?: Step[] } };
    return (doc.runs?.steps ?? [])
      .filter((step) => step.run !== undefined && (step.shell ?? '').startsWith('bash'))
      .map((step) => ({ where: `actions/${name} › ${step.name ?? '(unnamed)'}`, run: step.run ?? '' }));
  });
}

describe('a step that can run on macOS uses nothing bash 3.2 lacks', () => {
  const steps = [...workflowSteps(), ...actionSteps()];

  it('finds macOS bash steps, so a broken reader cannot make this vacuous', () => {
    expect(steps.length).toBeGreaterThan(5);
  });

  it('none of them uses mapfile, readarray, declare -A or ${x,,} / ${x^^}', () => {
    const found = steps.flatMap(({ where, run }) => bash4In(run).map((use) => `${where}: ${use}`));
    expect(found).toEqual([]);
  });

  it('reads each feature, and leaves bash 3 alone', () => {
    expect(bash4In('mapfile -t xs < <(ls)')).toHaveLength(1);
    expect(bash4In('readarray xs')).toHaveLength(1);
    expect(bash4In('declare -A seen=()')).toHaveLength(1);
    expect(bash4In('declare -gA seen')).toHaveLength(1);
    expect(bash4In('echo "${name,,}" "${name^^}" "${xs[0],}"')).toHaveLength(1);
    expect(bash4In('xs=(); while IFS= read -r x; do xs+=("$x"); done < <(ls); declare -a ys; echo "${#xs[@]}" "${x:-a,b}" "${x//,/ }"')).toEqual([]);
  });

  it('knows which jobs can be scheduled on macOS', () => {
    expect(reachesMacos({ 'runs-on': 'macos-latest' })).toBe(true);
    expect(reachesMacos({ 'runs-on': '${{ matrix.os }}', strategy: { matrix: { os: '${{ fromJSON(\'["ubuntu-latest","macos-latest"]\') }}' } } })).toBe(true);
    expect(reachesMacos({ 'runs-on': 'ubuntu-latest' })).toBe(false);
  });
});
