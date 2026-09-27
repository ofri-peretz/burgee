/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — the Version PR is not missing a changeset.
 *
 * `Changeset present` fails a PR that edits a package's source or manifest and adds no
 * `.changeset` entry. The Version PR does exactly that and is *supposed* to: it
 * consumes the changesets, deleting each one and writing the version it implies. So every
 * release went red on this check and collected a bot comment telling its author to run
 * `npm run changeset` — on a branch no author wrote.
 *
 * A red check on every release is worse than no check. It is the state in which a team
 * learns that red is normal here, and the next red one — a real one — reads the same.
 *
 * This runs the step's own shell rather than matching its text, because the defect was in
 * what the script decided, not in how it was spelled. The release case returns before the
 * script touches git, which is what makes it runnable outside a PR.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOW = join(REPO_ROOT, '.github/workflows/changesets-pr.yml');

/**
 * The `Check for changeset` step's `run:` body, dedented.
 *
 * Read as text, the way `scripts/lint-workflows.ts` reads these files: `yaml` is not a
 * dependency of this repo, only something that happens to be under `node_modules` today,
 * and a lock that leans on a transitive install disappears the week the tree is deduped.
 */
function checkScript(): string {
  const source = readFileSync(WORKFLOW, 'utf8');
  const at = source.indexOf('name: Check for changeset');
  expect(at, 'the `Check for changeset` step is gone — this lock is now asserting nothing').toBeGreaterThan(-1);
  const body = source.slice(source.indexOf('run: |', at) + 'run: |\n'.length);
  const lines: string[] = [];
  for (const line of body.split('\n')) {
    if (line.trim() !== '' && !line.startsWith('          ')) break;
    lines.push(line.slice(10));
  }
  return lines.join('\n');
}

/**
 * The environment without git's own variables. Git exports `GIT_DIR` and friends to its
 * hooks, and lefthook's pre-push runs this suite. A `git init` that inherits them does not
 * create a scratch repository. It re-initialises the repository being pushed, as bare. So
 * every git this file runs, directly or through the step, gets an environment without them.
 */
function withoutGit(): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
}

/** What the step wrote to `$GITHUB_OUTPUT`, and how it got there. */
interface Answer {
  status: string;
  /** The step's exit and its `bash -x` trace, for the assertion message. */
  trace: string;
}

/**
 * Run the step with a given environment. Under `bash -x`, so a wrong answer arrives with the
 * path that produced it. This lock went red once in a pre-push hook and passed on retry, and
 * all that was left was the wrong status. The step discards `git show`'s stderr, and it maps
 * an empty result to `missing`. The trace shows each argument after expansion, so an empty
 * `git show` is visible in it.
 */
function statusFor(env: Record<string, string>, cwd = mkdtempSync(join(tmpdir(), 'changeset-check-'))): Answer {
  const scratch = mkdtempSync(join(tmpdir(), 'changeset-check-'));
  const script = join(scratch, 'check.sh');
  const out = join(scratch, 'output');
  writeFileSync(script, checkScript());
  writeFileSync(out, '');
  const run = spawnSync('bash', ['-x', script], { cwd, env: { ...withoutGit(), ...env, GITHUB_OUTPUT: out }, encoding: 'utf8' });
  const exit = `exit ${run.status ?? run.signal}${run.error ? ` (${run.error.message})` : ''}`;
  return { status: (/^status=(.*)$/m.exec(readFileSync(out, 'utf8'))?.[1] ?? '').trim(), trace: `${exit}\n${run.stderr}` };
}

/** Git's own view of the scratch repository, rerun beside the step with stderr kept. Only on a wrong answer: it is five more spawns. */
function gitFacts(cwd: string, { BASE_SHA, HEAD_SHA }: { BASE_SHA: string; HEAD_SHA: string }): string {
  const manifest = 'packages/flagstaff/package.json';
  return [
    ['log', '--format=%H %cI %s'],
    ['merge-base', BASE_SHA, HEAD_SHA],
    ['diff', '--name-only', `${BASE_SHA}...${HEAD_SHA}`],
    ['show', `${BASE_SHA}:${manifest}`],
    ['show', `${HEAD_SHA}:${manifest}`],
  ]
    .map((args) => {
      const run = spawnSync('git', args, { cwd, env: withoutGit(), encoding: 'utf8' });
      return `$ git ${args.join(' ')}  (exit ${run.status ?? run.signal})\n${run.stdout}${run.stderr}`;
    })
    .join('\n');
}

const MANIFEST = { name: 'flagstaff', version: '1.0.0', dependencies: { roundel: '^0.5.2' }, devDependencies: { 'fast-check': '^4.10.1' } };

/**
 * A throwaway repository with two commits: `base` holds {@link MANIFEST}, and `head` applies
 * `change` to it. Returns the SHAs the step reads, so the script runs its real `git diff`.
 */
function pullRequest(change: (manifest: typeof MANIFEST) => object, extra: Record<string, string> = {}): { BASE_SHA: string; HEAD_SHA: string; cwd: string } {
  const cwd = mkdtempSync(join(tmpdir(), 'changeset-check-repo-'));
  const git = (...args: string[]): string =>
    execFileSync('git', ['-c', 'user.name=lock', '-c', 'user.email=lock@example.com', '-c', 'commit.gpgsign=false', ...args], { cwd, env: withoutGit(), stdio: 'pipe' })
      .toString()
      .trim();
  const manifest = join(cwd, 'packages/flagstaff/package.json');
  git('init', '--quiet');
  mkdirSync(dirname(manifest), { recursive: true });
  writeFileSync(manifest, `${JSON.stringify(MANIFEST, undefined, 2)}\n`);
  git('add', '.');
  git('commit', '--quiet', '-m', 'base');
  const BASE_SHA = git('rev-parse', 'HEAD');
  writeFileSync(manifest, `${JSON.stringify(change(structuredClone(MANIFEST)), undefined, 2)}\n`);
  for (const [path, text] of Object.entries(extra)) {
    mkdirSync(dirname(join(cwd, path)), { recursive: true });
    writeFileSync(join(cwd, path), text);
  }
  git('add', '.');
  git('commit', '--quiet', '-m', 'head');
  return { BASE_SHA, HEAD_SHA: git('rev-parse', 'HEAD'), cwd };
}

/** Assert the step's answer for a pull request opened by `author` that makes `change`. */
function expectStatusOf(expected: string, author: string, change: (manifest: typeof MANIFEST) => object, extra?: Record<string, string>): void {
  const { cwd, ...shas } = pullRequest(change, extra);
  const { status, trace } = statusFor({ ...shas, HEAD_REF: 'dependabot/npm_and_yarn/all-packages-0', LABELS: 'dependencies,npm', PR_AUTHOR: author }, cwd);
  expect(status, status === expected ? undefined : `${trace}\n${gitFacts(cwd, shas)}`).toBe(expected);
}

const bumpDev = (m: typeof MANIFEST): object => ({ ...m, devDependencies: { 'fast-check': '^4.10.2' } });

describe('the changeset check and the Version PR', () => {
  it('answers `release` for the branch changesets pushes, before it looks at any diff', () => {
    // No BASE_SHA or HEAD_SHA: reaching the diff without them answers `not-needed`, which
    // is what this assertion catches, and on a real Version PR — where the SHAs are set and
    // a `package.json` moved per bump — reaching the diff answers `missing` and goes red.
    // Either way the wrong branch was taken, and `release` can only come from the guard.
    const { status, trace } = statusFor({ HEAD_REF: 'changeset-release/main', LABELS: '' });
    expect(status, trace).toBe('release');
  });

  it('still answers `skipped` for the label, which the release case must not have displaced', () => {
    const { status, trace } = statusFor({ HEAD_REF: 'fix/whatever', LABELS: 'skip-changeset,other' });
    expect(status, trace).toBe('skipped');
  });

  it('fails only on `missing`, so `release` cannot go red however it is reached', () => {
    const source = readFileSync(WORKFLOW, 'utf8');
    const failing = source.slice(source.indexOf('name: Fail when the changeset is missing'));
    expect(/^\s*if: steps\.check\.outputs\.status == 'missing'$/m.test(failing.split('run:')[0] ?? '')).toBe(true);
  });
});

/**
 * Dependabot's grouped bumps move `devDependencies` in a package's manifest, and the check
 * went red on every one of them (#571) — a PR nobody authored, so nobody added the label.
 * The exemption is for exactly that shape and nothing wider: a runtime dependency reaches
 * the package's users, and so does anything under `src/`.
 */
//
// Each case builds a repository (seven `git` runs) and then runs the step (five more
// processes). Idle, that takes about 20 ms per process. In the root suite on 2026-09-27, with
// a load average of 54–72 on 14 cores and endpoint security scanning every exec, a single
// `git init` took 5.0 s and a single `git commit` took 15.8 s. One case took 52 s. At the
// 30 s default, two cases timed out in one pre-push run and one timed out in a run by hand.
// That matches the flake of 2026-09-24. The step itself stayed under 0.7 s every time, and
// every answer was right. The time went into building the repositories, so the budget covers that.
describe('the changeset check and Dependabot', { timeout: 120_000 }, () => {
  it('answers `dev-dependencies` when Dependabot moves only devDependencies', () => {
    expectStatusOf('dev-dependencies', 'dependabot[bot]', bumpDev);
  });

  it('still answers `missing` when Dependabot moves a runtime dependency', () => {
    expectStatusOf('missing', 'dependabot[bot]', (m) => ({ ...m, dependencies: { roundel: '^0.6.0' } }));
  });

  it('still answers `missing` when a src/ change rides on a Dependabot branch', () => {
    expectStatusOf('missing', 'dependabot[bot]', bumpDev, { 'packages/flagstaff/src/index.ts': 'export {};\n' });
  });

  it('does not extend the exemption to a person — the label is their signed decision', () => {
    expectStatusOf('missing', 'ofri-peretz', bumpDev);
  });
});
