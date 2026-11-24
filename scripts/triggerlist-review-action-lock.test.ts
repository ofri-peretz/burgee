/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock: the triggerlist review action reviews with the base branch's rules, and a review of a head
 * that moved is never green (triggerlist intent criteria 2 and 3, spec R5).
 *
 * #1782 shipped the composite action `.github/actions/triggerlist-review`. Its brief carried the
 * base branch's REVIEW.md, but the reviewer then ran in the PR's checkout, where `REVIEW.md` and
 * the checklist on disk were the PR's own edit: a pull request could still hand the reviewer rules
 * it wrote. And a head that moved while the review ran only printed a warning, so the stale run
 * ended green. Both gaps were noted in the duplicate #1781 and left open.
 *
 * Each step is lifted out of the parsed action and run under `bash` against a fixture repository,
 * with `gh` stubbed: the brief step must leave the base branch's REVIEW.md and checklist on disk
 * (and remove one the base does not have), and the stale step must exit non-zero, after saying so
 * on the PR, when the head moved, and pass when it did not.
 */

import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { load as loadYaml } from 'js-yaml';
import { describe, expect, it } from 'vitest';

import { scratchDirs } from './scratch-dir.js';

const scratchDir = scratchDirs();

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ACTION = join(REPO_ROOT, '.github/actions/triggerlist-review/action.yml');

interface Step {
  id?: string;
  name?: string;
  run?: string;
}
interface Action {
  runs: { steps: Step[] };
}

const steps = (loadYaml(readFileSync(ACTION, 'utf8')) as Action).runs.steps;
const briefStep = steps.find((s) => s.id === 'brief');
const staleStep = steps.find((s) => /stale/iu.test(s.name ?? ''));

/** A `gh` that logs its arguments and answers `api …/pulls/N` with `$NOW_HEAD` and comments with `[]`. */
function stubGh(bin: string): void {
  writeFileSync(
    join(bin, 'gh'),
    [
      '#!/usr/bin/env bash',
      'printf "%s\\n" "$*" >> "$GH_LOG"',
      'if [ "$1" = api ]; then',
      '  case "$2" in',
      '    */comments) echo "[]" ;;',
      '    --paginate) echo "[]" ;;',
      '    *) echo "$NOW_HEAD" ;;',
      '  esac',
      'fi',
      'exit 0',
      '',
    ].join('\n'),
  );
  chmodSync(join(bin, 'gh'), 0o755);
}

const GIT_ENV = {
  GIT_AUTHOR_NAME: 'lock',
  GIT_AUTHOR_EMAIL: 'lock@example.invalid',
  GIT_COMMITTER_NAME: 'lock',
  GIT_COMMITTER_EMAIL: 'lock@example.invalid',
  GIT_CONFIG_NOSYSTEM: '1',
};

function git(cwd: string, home: string, ...args: string[]): string {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: { PATH: process.env['PATH'] ?? '', HOME: home, ...GIT_ENV } });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

function runStep(run: string, cwd: string, dir: string, env: Record<string, string>): { status: number; output: string; calls: string[] } {
  const bin = join(dir, 'bin');
  mkdirSync(bin, { recursive: true });
  stubGh(bin);
  const log = join(dir, 'gh.log');
  writeFileSync(log, '');
  const runnerTemp = join(dir, 'runner-temp');
  mkdirSync(runnerTemp, { recursive: true });
  writeFileSync(join(dir, 'step.sh'), run);
  const r = spawnSync('bash', ['-e', join(dir, 'step.sh')], {
    cwd,
    encoding: 'utf8',
    env: {
      PATH: `${bin}${delimiter}${process.env['PATH'] ?? ''}`,
      HOME: dir,
      GH_LOG: log,
      RUNNER_TEMP: runnerTemp,
      GITHUB_OUTPUT: join(dir, 'github-output'),
      REPO: 'ofri-peretz/fixture',
      PR: '7',
      ...GIT_ENV,
      ...env,
    },
  });
  return { status: r.status ?? -1, output: `${r.stdout ?? ''}${r.stderr ?? ''}`, calls: readFileSync(log, 'utf8').split('\n').filter(Boolean) };
}

/** A clone on a PR branch whose commit edits REVIEW.md, the checklist, and adds an extra rules file. */
function fixture(): { dir: string; clone: string; head: string } {
  const dir = scratchDir('triggerlist-review-action-');
  const origin = join(dir, 'origin.git');
  const work = join(dir, 'work');
  mkdirSync(work);
  git(dir, dir, 'init', '-q', '--bare', '-b', 'main', origin);
  git(work, dir, 'init', '-q', '-b', 'main');
  mkdirSync(join(work, '.sdlc'));
  writeFileSync(join(work, 'REVIEW.md'), 'base rules\n');
  writeFileSync(join(work, '.sdlc/checklist.yaml'), 'base checklist\n');
  git(work, dir, 'add', '-A');
  git(work, dir, 'commit', '-q', '-m', 'base');
  git(work, dir, 'remote', 'add', 'origin', origin);
  git(work, dir, 'push', '-q', 'origin', 'main');
  const clone = join(dir, 'clone');
  git(dir, dir, 'clone', '-q', origin, clone);
  git(clone, dir, 'checkout', '-q', '-b', 'pr');
  writeFileSync(join(clone, 'REVIEW.md'), 'rules the PR wrote\n');
  writeFileSync(join(clone, '.sdlc/checklist.yaml'), 'checklist the PR wrote\n');
  writeFileSync(join(clone, 'EXTRA.md'), 'a rules file the base does not have\n');
  git(clone, dir, 'add', '-A');
  git(clone, dir, 'commit', '-q', '-m', 'pr edits the rules');
  return { dir, clone, head: git(clone, dir, 'rev-parse', 'HEAD') };
}

const executes = it.skipIf(process.platform === 'win32');

describe('the triggerlist review action', () => {
  it('has the brief step and the stale step this lock runs', () => {
    expect(briefStep?.run, 'no step with id: brief').toEqual(expect.any(String));
    expect(staleStep?.run, 'no step whose name says stale').toEqual(expect.any(String));
  });

  executes('leaves the base branch’s REVIEW.md and checklist on disk for the reviewer', () => {
    const { dir, clone, head } = fixture();
    const r = runStep(briefStep!.run!, clone, dir, {
      BASE_REF: 'main',
      HEAD_SHA: head,
      TRIGGERLIST: 'echo',
      CHECKLIST: '.sdlc/checklist.yaml',
      REVIEW_FILE: 'REVIEW.md',
    });
    expect(r.status, r.output).toBe(0);
    expect(readFileSync(join(clone, 'REVIEW.md'), 'utf8')).toBe('base rules\n');
    expect(readFileSync(join(clone, '.sdlc/checklist.yaml'), 'utf8')).toBe('base checklist\n');
  });

  executes('removes a rules file the base branch does not have', () => {
    const { dir, clone, head } = fixture();
    const r = runStep(briefStep!.run!, clone, dir, {
      BASE_REF: 'main',
      HEAD_SHA: head,
      TRIGGERLIST: 'echo',
      CHECKLIST: '.sdlc/checklist.yaml',
      REVIEW_FILE: 'EXTRA.md',
    });
    expect(r.status, r.output).toBe(0);
    expect(existsSync(join(clone, 'EXTRA.md'))).toBe(false);
  });

  executes('fails, after saying so on the PR, when the head moved during the review', () => {
    const dir = scratchDir('triggerlist-review-stale-');
    const r = runStep(staleStep!.run!, dir, dir, { HEAD_SHA: 'aaaa', NOW_HEAD: 'bbbb' });
    expect(r.status, r.output).not.toBe(0);
    expect(r.calls.filter((c) => c.startsWith('pr comment')), r.output).toHaveLength(1);
  });

  executes('passes, saying nothing, when the head did not move', () => {
    const dir = scratchDir('triggerlist-review-fresh-');
    const r = runStep(staleStep!.run!, dir, dir, { HEAD_SHA: 'aaaa', NOW_HEAD: 'aaaa' });
    expect(r.status, r.output).toBe(0);
    expect(r.calls.filter((c) => c.startsWith('pr comment')), r.output).toEqual([]);
  });
});
