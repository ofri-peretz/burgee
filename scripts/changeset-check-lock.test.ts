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
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import { scratchDirs } from './scratch-dir.js';

/** Every scratch directory this file makes, removed after its last test (`scripts/scratch-dir.ts`). */
const scratchDir = scratchDirs();

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
function statusFor(env: Record<string, string>, cwd = scratchDir('changeset-check-')): Answer {
  const scratch = scratchDir('changeset-check-');
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
const MANIFEST_PATH = 'packages/flagstaff/package.json';

const bumpDev = (m: typeof MANIFEST): object => ({ ...m, devDependencies: { 'fast-check': '^4.10.2' } });

/**
 * The pull requests the Dependabot cases ask about, each one commit on top of `base` (which holds
 * {@link MANIFEST}): a manifest change, and any other files the head adds.
 */
const HEADS = {
  dev: { manifest: bumpDev(MANIFEST), extra: {} },
  runtime: { manifest: { ...MANIFEST, dependencies: { roundel: '^0.6.0' } }, extra: {} },
  src: { manifest: bumpDev(MANIFEST), extra: { 'packages/flagstaff/src/index.ts': 'export {};\n' } },
} satisfies Record<string, { manifest: object; extra: Record<string, string> }>;
type Head = keyof typeof HEADS;

/** Every git run that builds the repository, counted, so the budget below is a fact and not a hope. */
let builderRuns = 0;
function git(cwd: string, args: string[], input?: string): string {
  builderRuns += 1;
  return execFileSync('git', ['-c', 'user.name=lock', '-c', 'user.email=lock@example.com', '-c', 'commit.gpgsign=false', ...args], { cwd, env: withoutGit(), input, stdio: 'pipe' })
    .toString()
    .trim();
}

/** One `M` line of a fast-import commit, with its content inline. */
const file = (path: string, text: string): string => `M 100644 inline ${path}\ndata ${String(Buffer.byteLength(text))}\n${text}\n`;
const json = (value: object): string => `${JSON.stringify(value, undefined, 2)}\n`;

/** One `git fast-import` commit record: a ref, its mark, a message, the files, and its parent mark. */
interface FastImportCommit {
  ref: string;
  mark: number;
  message: string;
  files: string;
  from?: number;
}
const commit = ({ ref, mark, message, files, from }: FastImportCommit): string =>
  `commit refs/heads/${ref}\nmark :${String(mark)}\ncommitter lock <lock@example.com> 1700000000 +0000\ndata ${String(message.length)}\n${message}\n${from === undefined ? '' : `from :${String(from)}\n`}${files}\n`;

/**
 * windows-lane-holds R4 — one repository per file, built in two git runs: `git init` and one
 * `git fast-import` that writes `base` and every head as a branch on it. The step only reads
 * (`git diff`, `git merge-base`, `git show`), so every case can ask the same repository.
 *
 * It was seven git runs per case (`init`, then `add`, `commit` and `rev-parse` twice). On
 * 2026-09-27, under a load average of 54–72 on 14 cores with endpoint security scanning every
 * exec, a single `git init` took 5.0 s and a single `git commit` 15.8 s, and one case took 52 s.
 * The step itself stayed under 0.7 s every time. The time was in building, so building is what
 * moved out of the cases.
 */
function buildRepository(): { cwd: string; shas: Record<'base' | Head, string> } {
  const cwd = scratchDir('changeset-check-repo-');
  const marks = join(scratchDir('changeset-check-marks-'), 'marks');
  const names = Object.keys(HEADS) as Head[];
  const stream = [
    commit({ ref: 'base', mark: 1, message: 'base', files: file(MANIFEST_PATH, json(MANIFEST)) }),
    ...names.map((name, i) => {
      const { manifest, extra } = HEADS[name];
      return commit({ ref: name, mark: i + 2, message: 'head', files: [file(MANIFEST_PATH, json(manifest)), ...Object.entries(extra).map(([path, text]) => file(path, text))].join(''), from: 1 });
    }),
  ].join('');
  git(cwd, ['init', '--quiet']);
  git(cwd, ['fast-import', '--quiet', `--export-marks=${marks}`], stream);
  const byMark = new Map(readFileSync(marks, 'utf8').trim().split('\n').map((line) => line.split(' ') as [string, string]));
  const sha = (mark: number): string => byMark.get(`:${String(mark)}`) ?? '';
  return { cwd, shas: { base: sha(1), ...Object.fromEntries(names.map((name, i) => [name, sha(i + 2)])) } as Record<'base' | Head, string> };
}

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
// Each case runs the step (five processes) against the one repository `beforeAll` built. The
// 120 s budget predates that, when each case built its own; it stays until the R2 report shows
// these cases under half of 30 s on every cell, and is then removed rather than kept as slack.
describe('the changeset check and Dependabot', { timeout: 120_000 }, () => {
  let repository: ReturnType<typeof buildRepository>;
  beforeAll(() => {
    repository = buildRepository();
  }, 120_000);

  /** Assert the step's answer for a pull request opened by `author` whose head is `head`. */
  function expectStatusOf(expected: string, author: string, head: Head): void {
    const { cwd } = repository;
    const shas = { BASE_SHA: repository.shas.base, HEAD_SHA: repository.shas[head] };
    const { status, trace } = statusFor({ ...shas, HEAD_REF: 'dependabot/npm_and_yarn/all-packages-0', LABELS: 'dependencies,npm', PR_AUTHOR: author }, cwd);
    expect(status, status === expected ? undefined : `${trace}\n${gitFacts(cwd, shas)}`).toBe(expected);
  }

  it('R4 — builds its repository once per file, in at most three git runs', () => {
    expect(Object.values(repository.shas).every((sha) => /^[0-9a-f]{40}$/u.test(sha)), JSON.stringify(repository.shas)).toBe(true);
    expect(new Set(Object.values(repository.shas)).size).toBe(Object.keys(HEADS).length + 1);
    expect(builderRuns).toBeLessThanOrEqual(3);
  });

  it('answers `dev-dependencies` when Dependabot moves only devDependencies', () => {
    expectStatusOf('dev-dependencies', 'dependabot[bot]', 'dev');
  });

  it('still answers `missing` when Dependabot moves a runtime dependency', () => {
    expectStatusOf('missing', 'dependabot[bot]', 'runtime');
  });

  it('still answers `missing` when a src/ change rides on a Dependabot branch', () => {
    expectStatusOf('missing', 'dependabot[bot]', 'src');
  });

  it('does not extend the exemption to a person — the label is their signed decision', () => {
    expectStatusOf('missing', 'ofri-peretz', 'dev');
  });

  it('a case builds nothing: every git run above happened before the first case', () => {
    expect(builderRuns).toBeLessThanOrEqual(3);
  });
});
