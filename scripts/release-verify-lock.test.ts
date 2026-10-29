/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Release-verify lock: `release.yml` publishes a commit only when its required gates passed, and a
 * commit superseded on `main` before its gates finished is skipped, not reported as a failure.
 *
 * On 2026-10-11 two release runs on `main` went red (38110188386, 38111759370) with "Refusing to
 * publish … Quality Gate (failure)". Every non-success check on both commits was `cancelled`: a newer
 * push to `main` superseded them, and the aggregate gate job reports `failure` when the jobs it waits
 * on are cancelled. The step already skipped a *cancelled* gate on a superseded commit; a gate that
 * *failed* only because its jobs were cancelled fell through to the refusal. Nothing was published
 * either way (the next commit's release published seniority@1.0.4), but each superseded release
 * painted `main` red, which is how a real failure gets ignored.
 *
 * The verify step is lifted out of the parsed workflow and run under `bash` with `gh` stubbed.
 */

import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { load as loadYaml } from 'js-yaml';
import { describe, expect, it } from 'vitest';

import { scratchDirs } from './scratch-dir.js';

/** Every scratch directory this file makes, removed after its last test (`scripts/scratch-dir.ts`). */
const scratchDir = scratchDirs();

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

interface Step {
  id?: string;
  run?: string;
}
interface Workflow {
  jobs: Record<string, { steps?: Step[] }>;
}

const waitStep = (): string => {
  const wf = loadYaml(readFileSync(join(REPO_ROOT, '.github/workflows/release.yml'), 'utf8')) as Workflow;
  const run = wf.jobs['verify']?.steps?.find((s) => s.id === 'wait')?.run;
  if (run === undefined) throw new Error('release.yml → verify has no step with id `wait`');
  return run;
};

interface Gates {
  /** What the stub reports for each gate: `success`, `failure`, `cancelled`, `in_progress`… */
  qualityGate: string;
  fullGate: string;
  /** The head of `main`. */
  head: string;
  /** How many Actions check runs on the commit were cancelled. */
  cancelled: number;
  /** How many workflow runs on the commit were cancelled (default 0). */
  runsCancelled?: number;
}

const SHA = 'a'.repeat(40);

function verify(gates: Gates): { status: number; output: string; outputs: string } {
  const dir = scratchDir('release-verify-');
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  writeFileSync(
    join(bin, 'gh'),
    [
      '#!/usr/bin/env bash',
      'args="$*"',
      'case "$args" in',
      '  *"commits/main"*) echo "$HEAD"; exit 0 ;;',
      '  *"check-runs?per_page=100"*) echo "$CANCELLED"; exit 0 ;;',
      '  *"actions/runs?head_sha="*) echo "$RUNS_CANCELLED"; exit 0 ;;',
      '  *"check_name=Quality Gate"*) echo "$QG"; exit 0 ;;',
      '  *"check_name=Quality (Full) Gate"*) echo "$QFG"; exit 0 ;;',
      'esac',
      'echo "unexpected gh call: $args" >&2; exit 3',
      '',
    ].join('\n'),
  );
  chmodSync(join(bin, 'gh'), 0o755);
  writeFileSync(join(bin, 'sleep'), '#!/usr/bin/env bash\nexit 0\n');
  chmodSync(join(bin, 'sleep'), 0o755);
  // A clock that moves 20 minutes a call, so a step that would wait out its 45 minutes ends in
  // three passes instead of hanging the suite.
  writeFileSync(join(bin, 'date'), '#!/usr/bin/env bash\nn=$(cat "$HOME/clock" 2>/dev/null || echo 0)\necho $((n + 1200)) > "$HOME/clock"\necho "$n"\n');
  chmodSync(join(bin, 'date'), 0o755);
  const outputs = join(dir, 'outputs');
  writeFileSync(outputs, '');
  writeFileSync(join(dir, 'step.sh'), waitStep());
  const r = spawnSync('bash', [join(dir, 'step.sh')], {
    cwd: dir,
    encoding: 'utf8',
    env: {
      PATH: `${bin}${delimiter}${process.env['PATH'] ?? ''}`,
      HOME: dir,
      GITHUB_OUTPUT: outputs,
      GITHUB_STEP_SUMMARY: join(dir, 'summary'),
      GH_REPO: 'ofri-peretz/burgee',
      SHA,
      DRY_RUN: 'false',
      CHECKS: 'Quality Gate|Quality (Full) Gate',
      QG: gates.qualityGate,
      QFG: gates.fullGate,
      HEAD: gates.head,
      CANCELLED: String(gates.cancelled),
      RUNS_CANCELLED: String(gates.runsCancelled ?? 0),
    },
  });
  return { status: r.status ?? -1, output: `${r.stdout ?? ''}${r.stderr ?? ''}`, outputs: readFileSync(outputs, 'utf8') };
}

const executes = it.skipIf(process.platform === 'win32');
const NEWER = 'b'.repeat(40);

describe("release.yml's verify step", () => {
  executes('publishes a commit whose gates passed', () => {
    const r = verify({ qualityGate: 'success', fullGate: 'success', head: SHA, cancelled: 0 });
    expect(r.status, r.output).toBe(0);
    expect(r.outputs).toContain('ok=true');
  });

  executes('skips, without failing, a superseded commit whose gate failed only after its jobs were cancelled', () => {
    const r = verify({ qualityGate: 'failure', fullGate: 'in_progress', head: NEWER, cancelled: 12 });
    expect(r.status, r.output).toBe(0);
    expect(r.outputs).toContain('ok=false');
    expect(r.output).toContain('superseded');
  });

  executes('refuses a failed gate on the head of main', () => {
    const r = verify({ qualityGate: 'failure', fullGate: 'success', head: SHA, cancelled: 12 });
    expect(r.status).toBe(1);
    expect(r.output).toContain('Refusing to publish');
    expect(r.outputs).not.toContain('ok=');
  });

  executes('refuses a superseded commit whose gate failed with nothing cancelled', () => {
    const r = verify({ qualityGate: 'failure', fullGate: 'success', head: NEWER, cancelled: 0 });
    expect(r.status).toBe(1);
    expect(r.output).toContain('Refusing to publish');
  });

  executes('still skips a superseded commit whose gate was cancelled outright', () => {
    const r = verify({ qualityGate: 'cancelled', fullGate: 'success', head: NEWER, cancelled: 3 });
    expect(r.status, r.output).toBe(0);
    expect(r.outputs).toContain('ok=false');
  });

  /**
   * Run 39247745837, on Version commit 1b0ea782 (#1151): a later merge cancelled its Quality
   * Gate, and cancelled its Quality (Full) workflow before the `Gate` job existed, so that check
   * run was *missing*. Missing read as pending, the step waited out 45 minutes holding the
   * `release-workflow` concurrency group, and went red, while three releases on main starved.
   */
  executes('skips a superseded commit whose gate was cancelled while the other is missing', () => {
    const r = verify({ qualityGate: 'cancelled', fullGate: 'missing', head: NEWER, cancelled: 4, runsCancelled: 2 });
    expect(r.status, r.output).toBe(0);
    expect(r.outputs).toContain('ok=false');
    expect(r.output).toContain('superseded');
  });

  executes('skips a superseded commit whose gate is missing because its workflow run was cancelled', () => {
    const r = verify({ qualityGate: 'success', fullGate: 'missing', head: NEWER, cancelled: 0, runsCancelled: 1 });
    expect(r.status, r.output).toBe(0);
    expect(r.outputs).toContain('ok=false');
  });

  executes('keeps waiting on a superseded commit when nothing on it was cancelled', () => {
    const r = verify({ qualityGate: 'success', fullGate: 'missing', head: NEWER, cancelled: 0, runsCancelled: 0 });
    expect(r.status).toBe(1);
    expect(r.output).toContain('Gave up waiting');
    expect(r.outputs).not.toContain('ok=');
  });

  executes('never skips on the head of main: a cancelled gate beside a missing one is waited on, then refused', () => {
    const r = verify({ qualityGate: 'cancelled', fullGate: 'missing', head: SHA, cancelled: 4, runsCancelled: 2 });
    expect(r.status).toBe(1);
    expect(r.outputs).not.toContain('ok=');
  });
});

/**
 * The gates the verify step waits on must finish on every merged commit. With them cancelled by
 * the next push to `main`, each release run saw its gate superseded and deferred to the newer
 * commit, whose run deferred in turn: merges ~18 minutes apart published nothing for hours
 * (oxmutate 1.0.1, 2026-10-29). A push runs in a group of its own; only pull requests cancel.
 */
describe('the gates a release waits on are never cancelled on main', () => {
  const workflows = ['quality.yml', 'quality-full.yml', 'compat.yml'];
  it.each(workflows)('%s keeps a push to main in its own group, and cancels only pull requests', (file) => {
    const text = readFileSync(join(REPO_ROOT, '.github/workflows', file), 'utf8');
    const block = /^concurrency:\n((?: {2}.*\n)+)/mu.exec(text)?.[1] ?? '';
    expect(block, file).toMatch(/group: .*\$\{\{ github\.event_name == 'push' && github\.sha \|\| '' \}\}/u);
    expect(block, file).toMatch(/cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/u);
  });
});
