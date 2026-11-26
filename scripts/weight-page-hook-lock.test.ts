/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — pre-push regenerates the weight page whenever the branch could change it, and only then.
 *
 * `weight-page` took 155 s alone on a warm tree (2026-11-26), the largest step of a pre-push that
 * ran 383-675 s and once outlived the SSH connection carrying the push
 * (`.sdlc/intents/pre-push-under-three-minutes/`). It now runs only when the branch changes one
 * of the page's inputs since `origin/main`. CI's ratchet runs it on every PR regardless.
 *
 * Not a lefthook `glob`: on a branch's first push there is no upstream, lefthook inspects every
 * tracked file, and the step never skipped (measured 2026-11-26: weight-page 110 s on a push that
 * touched none of its inputs). So the gate is `git diff --quiet origin/main...HEAD`, run for real
 * below against a throwaway repository.
 *
 * What fails here: the gate dropping an input (a package change would push a stale page and fail
 * CI, the six-cycle week of 2026-11-23 again), or skipping when it cannot tell what changed.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { load as loadYaml } from 'js-yaml';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { discard } from './scratch-dir.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = (file: string): string => readFileSync(join(ROOT, file), 'utf8');

const CHECK = 'npm run weight:page -- --check';
type Hook = { 'pre-push': { commands: Record<string, { run: string }> } };
const run = (loadYaml(read('lefthook.yml')) as Hook)['pre-push'].commands['weight-page']?.run ?? '';
const gate = run.split(' && ')[0] ?? '';

let repo = '';
const git = (...args: string[]): string => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
const write = (file: string, text: string): void => {
  mkdirSync(dirname(join(repo, file)), { recursive: true });
  writeFileSync(join(repo, file), text);
};

const INPUTS = ['packages/a/src/i.ts', 'apps/docs/content/docs/weight.mdx', 'scripts/subpath-weight.ts', 'package-lock.json'];

// One throwaway repo for the file, `origin/main` holding every input: each case resets a branch on
// it, which keeps a case to four git calls (a fresh repo per case cost ten, and 42 s under load).
beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), 'weight-gate-'));
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'lock@example.invalid');
  git('config', 'user.name', 'lock');
  for (const f of [...INPUTS, 'docs/readme.md']) write(f, 'v1\n');
  git('add', '-A');
  git('commit', '-qm', 'base', '--no-verify');
  git('update-ref', 'refs/remotes/origin/main', 'HEAD');
});
afterAll(() => {
  if (repo !== '') discard(repo);
});

/** A branch off `origin/main` that changes `file`. */
function branchChanging(file: string): void {
  git('switch', '-qfC', 'feat', 'main');
  write(file, 'v2\n');
  git('add', '-A');
  git('commit', '-qm', 'change', '--no-verify');
}

/**
 * The gate's exit status: 0 skips the check, anything else runs it. The gate is one `git`
 * command whose paths hold no spaces, so it runs as an argument array with no shell between.
 */
function gateStatus(): number | null {
  const [program, ...args] = gate.split(' ');
  expect(program).toBe('git');
  return spawnSync('git', args, { cwd: repo }).status;
}

describe('pre-push weight-page', () => {
  it('falls through to the check CI runs', () => {
    expect(run.endsWith(`|| ${CHECK}`)).toBe(true);
    expect(gate.startsWith('git diff --quiet origin/main...HEAD -- ')).toBe(true);
  });

  it.each([...INPUTS, 'packages/b/package.json'])('runs the check when the branch changes %s', (file) => {
    branchChanging(file);
    expect(gateStatus()).not.toBe(0);
  });

  it('skips it when the branch changes none of its inputs', () => {
    branchChanging('docs/readme.md');
    expect(gateStatus()).toBe(0);
  });

  // Last: it deletes the ref every case above compares against.
  it('runs the check when it cannot tell, with no origin/main', () => {
    git('switch', '-qfC', 'feat', 'main');
    git('update-ref', '-d', 'refs/remotes/origin/main');
    expect(gateStatus()).not.toBe(0);
  });
});
