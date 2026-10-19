import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Affected-set lock — a pull request runs the packages it can have changed, and anything it
 * cannot place runs everything (ci-affected-lanes R1–R3, D-20261012-ci-affected-pr-lanes).
 *
 * The script is **run, not imported**: `node scripts/affected.mts` against a throwaway git
 * repository shaped like this one (a leaf, a package with dependents, a docs app, root files),
 * where each pull request's base differs from HEAD by exactly that pull request's files. What
 * it prints is the contract the workflows read.
 *
 * One repository serves every case and is only read by them; `repo()` says why.
 *
 * Proven red, 2026-10-13: every case below failed with no `scripts/affected.mts` on the branch
 * (`Cannot find module`), and the workflow cases failed on main's compat.yml and
 * quality-full.yml, where neither the cells nor `test` read a set.
 */

import { load as loadYaml } from 'js-yaml';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'affected.mts');
const WORKFLOWS = join(REPO_ROOT, '.github', 'workflows');

interface Affected {
  full: boolean;
  packages: string[];
  workspaces: string[];
}

const ALL = ['burgee', 'compat-oracle', 'linegauge', 'seniority'];

let fixture: string | undefined;
afterAll(() => {
  if (fixture) rmSync(fixture, { recursive: true, force: true });
});

function git(cwd: string, args: string[], input?: string): void {
  const r = spawnSync('git', ['-c', 'user.email=lock@example.com', '-c', 'user.name=lock', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8', input });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
}

function write(root: string, file: string, text: string): void {
  mkdirSync(dirname(join(root, file)), { recursive: true });
  writeFileSync(join(root, file), text);
}

const manifest = (name: string, deps: string[] = []): string => `${JSON.stringify({ name, version: '1.0.0', dependencies: Object.fromEntries(deps.map((d) => [d, '*'])) })}\n`;

/**
 * `main`: a repository with burgee's shape. `linegauge` is a leaf burgee depends on,
 * `compat-oracle` depends on burgee, `seniority` is a leaf nothing depends on, and `docs` (an
 * app) and `benchmarks` are workspaces outside `packages/`.
 */
const MAIN: Readonly<Record<string, string>> = {
  'package.json': `${JSON.stringify({ name: 'root', private: true, packageManager: 'npm@11.6.2', workspaces: ['packages/*', 'apps/*', 'benchmarks'] })}\n`,
  'package-lock.json': `${JSON.stringify({ name: 'root', lockfileVersion: 3, requires: true, packages: {} })}\n`,
  // As in this repository: turbo writes nothing outside `.turbo/`, and that is ignored. The cases
  // share one working tree, and without the opt-out turbo under an AI agent writes an AGENTS.md
  // at the root on its first run, which the next case's turbo would see as a root change.
  'turbo.json': '{ "agentGuidance": false, "tasks": {} }\n',
  '.gitignore': '.turbo/\n',
  'tsconfig.base.json': '{}\n',
  'vitest.root.config.ts': 'export default {};\n',
  '.nvmrc': '24\n',
  'README.md': '# root\n',
  '.github/workflows/compat.yml': 'name: Compatibility\n',
  'scripts/build-helper.ts': 'export {};\n',
  '.sdlc/research/notes.md': 'decided\n',
  '.sdlc/intents/x/intent.md': 'intent\n',
  '.sdlc/bands/foundation-ceilings.json': '{}\n',
  'examples/demo/demo.js': '\n',
  'benchmarks/package.json': manifest('benchmarks'),
  'benchmarks/results/b1.json': '{}\n',
  'apps/docs/package.json': manifest('docs', ['burgee']),
  'packages/linegauge/package.json': manifest('linegauge'),
  'packages/linegauge/src/index.ts': 'export {};\n',
  'packages/burgee/package.json': manifest('burgee', ['linegauge']),
  'packages/burgee/src/index.ts': 'export {};\n',
  'packages/compat-oracle/package.json': manifest('compat-oracle', ['burgee']),
  'packages/seniority/package.json': manifest('seniority'),
  'packages/seniority/src/index.ts': 'export {};\n',
};

/** What a pull request changes `file` to. A manifest stays a manifest, or turbo refuses the repository before the script decides. */
function changed(file: string): string {
  const before = MAIN[file];
  if (!file.endsWith('.json') || before === undefined) return `${file} changed\n`;
  return `${JSON.stringify({ ...(JSON.parse(before) as Record<string, unknown>), ...(file === 'turbo.json' ? { globalEnv: ['CHANGED'] } : { description: 'changed' }) })}\n`;
}

/** A pull request a case opens, by the files it changes; `base` is filled in when the fixture is built. */
interface PullRequest {
  files: readonly string[];
  base?: string;
}
const pullRequests: PullRequest[] = [];

/** Declare, while the cases are collected, a pull request that changes `files`. The fixture builds every one up front. */
function pullRequest(...files: string[]): PullRequest {
  const pr: PullRequest = { files };
  pullRequests.push(pr);
  return pr;
}

/** A `fast-import` data block. */
const data = (text: string): string => `data ${Buffer.byteLength(text)}\n${text}\n`;

/** One `fast-import` commit: `parents` and the files it sets, by mark. */
function commit(ref: string, mark: number, parents: number[], files: Readonly<Record<string, string>>): string {
  const [from, ...merges] = parents;
  return [
    `commit ${ref}\nmark :${String(mark)}\ncommitter lock <lock@example.com> 0 +0000\n${data(`commit ${String(mark)}`)}`,
    from === undefined ? '' : `from :${String(from)}\n`,
    ...merges.map((m) => `merge :${String(m)}\n`),
    ...Object.entries(files).map(([file, text]) => `M 100644 inline ${file}\n${data(text)}`),
    '\n',
  ].join('');
}

/**
 * The one repository every case reads, built once and never written to again.
 *
 * Every pull request declared with `pullRequest` gets its own base: `main` plus every other
 * declared change, so that the only difference between that base and HEAD is the pull
 * request's own files. HEAD (`pr`, checked out) is `main` with every change, and merges every
 * base, so each base is an ancestor and `base...HEAD` — what the script diffs, and what turbo's
 * `[base]` sees — is exactly that pull request. The working tree and index are HEAD's.
 *
 * Why one repository, written in three git processes. Each case used to build its own: six git
 * processes that write (init, add, commit, checkout, add, commit). On this machine, while the
 * pre-push root suite runs, a git process that renames or unlinks (every lock file it commits)
 * can stall for 10 to 50 seconds, where a spawn, a file created from Node and a read-only git
 * command stay under three. Measured 2026-10-19: `git reset --hard` 48.6 s, `git commit` 37.9 s,
 * Node's `renameSync` 3.4 s, `git rev-parse` 0.7 s. So the early cases crossed the 30 s test
 * timeout on three pushes on 2026-10-18 ("a change to package-lock.json selects everything",
 * "a docs-only pull request selects no package"), and with three root suites side by side they
 * timed out in 3 runs of 3 — and still did with one shared repository reset between cases (3
 * git writes a case). Now the writes happen once, in `beforeAll`, and a case only reads.
 */
function repo(): string {
  if (fixture) return fixture;
  const root = mkdtempSync(join(tmpdir(), 'affected-'));
  fixture = root;
  const touched = [...new Set(pullRequests.flatMap((pr) => pr.files))].toSorted();
  const every = Object.fromEntries(touched.map((file) => [file, changed(file)]));
  for (const [file, text] of Object.entries({ ...MAIN, ...every })) write(root, file, text);
  // No template: the sample hooks are a dozen files nothing here reads.
  git(root, ['init', '-q', '--template=', '-b', 'pr']);
  const bases = pullRequests.map((pr, i) => commit('refs/heads/pr', i + 2, [1], Object.fromEntries(Object.entries(every).filter(([file]) => !pr.files.includes(file)))));
  const head = commit('refs/heads/pr', pullRequests.length + 2, pullRequests.map((_, i) => i + 2), every);
  // Inside `.git`, where it is not a change the cases would see.
  const marks = join(root, '.git', 'fixture-marks');
  git(root, ['fast-import', '--quiet', `--export-marks=${marks}`], [commit('refs/heads/main', 1, [], MAIN), ...bases, head].join(''));
  git(root, ['reset', '-q']);
  const sha = new Map(readFileSync(marks, 'utf8').trim().split('\n').map((line) => line.split(' ') as [string, string]));
  pullRequests.forEach((pr, i) => (pr.base = sha.get(`:${String(i + 2)}`)));
  return root;
}

/** Run the script as `pr`: a pull request whose base is that pull request's own. */
function opened(pr: PullRequest, args: string[] = []): Affected {
  if (!pr.base) throw new Error(`no base for a pull request changing ${pr.files.join(', ')}: declare it with pullRequest() outside the case`);
  return run(repo(), ['--event', 'pull_request', '--base', pr.base, ...args]);
}

function run(root: string, args: string[]): Affected {
  const r = spawnSync(process.execPath, [SCRIPT, '--root', root, ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`affected.mts exited ${r.status}: ${r.stderr}`);
  return JSON.parse(r.stdout) as Affected;
}

describe('scripts/affected.mts — the one affected set', () => {
  beforeAll(() => {
    repo();
  });

  const docsOnly = pullRequest('.sdlc/research/wave-4.md');
  it('a docs-only pull request (.sdlc/research) selects no package', () => {
    const got = opened(docsOnly);
    expect(got).toEqual({ full: false, packages: [], workspaces: [] });
  });

  const benchmarkResults = pullRequest('benchmarks/results/b1.json');
  it('a pull request touching only benchmarks/results selects no package (#1062, #1081)', () => {
    const got = opened(benchmarkResults);
    expect(got.full).toBe(false);
    expect(got.packages).toEqual([]);
    expect(got.workspaces).toEqual(['benchmarks']);
  });

  const leaf = pullRequest('packages/seniority/src/index.ts');
  it('one leaf package selects itself', () => {
    expect(opened(leaf)).toEqual({ full: false, packages: ['seniority'], workspaces: ['seniority'] });
  });

  const withDependents = pullRequest('packages/linegauge/src/index.ts');
  it('a package with dependents selects it and every dependent, apps among the workspaces', () => {
    const got = opened(withDependents);
    expect(got.full).toBe(false);
    expect(got.packages).toEqual(['burgee', 'compat-oracle', 'linegauge']);
    expect(got.workspaces).toEqual(['burgee', 'compat-oracle', 'docs', 'linegauge']);
  });

  for (const file of ['package-lock.json', '.github/workflows/compat.yml', 'turbo.json', 'tsconfig.base.json', 'vitest.root.config.ts', '.nvmrc', 'scripts/build-helper.ts', 'package.json', 'README.md', 'packages/seniority/package.json', '.sdlc/bands/foundation-ceilings.json', '.github/actions/setup/action.yml']) {
    const pr = pullRequest(file);
    it(`a change to ${file} selects everything`, () => {
      const got = opened(pr);
      expect(got.full).toBe(true);
      expect(got.packages).toEqual(ALL);
      expect(got.workspaces).toEqual(['benchmarks', ...ALL.slice(0, 2), 'docs', ...ALL.slice(2)]);
    });
  }

  const rootAndDocs = pullRequest('.sdlc/research/wave-4.md', 'package-lock.json');
  it('a root change wins over a docs change in the same pull request', () => {
    expect(opened(rootAndDocs).full).toBe(true);
  });

  const examples = pullRequest('examples/demo/demo.js');
  const intents = pullRequest('.sdlc/intents/x/intent.md');
  const scoreboard = pullRequest('apps/docs/content/docs/compatibility.mdx');
  it('what a package reads outside its directory selects that package and its dependents', () => {
    expect(opened(examples).packages).toEqual(['burgee', 'compat-oracle']);
    expect(opened(intents).packages).toEqual(['compat-oracle']);
    expect(opened(scoreboard).packages).toEqual(['burgee', 'compat-oracle']);
  });

  for (const event of ['push', 'merge_group', 'schedule', 'workflow_dispatch']) {
    it(`a ${event} selects everything, whatever changed`, () => {
      // A base with nothing between it and HEAD: only the event can select anything.
      expect(run(repo(), ['--event', event, '--base', 'HEAD'])).toMatchObject({ full: true, packages: ALL });
    });
  }

  it('the run-full-ci label (--full) selects everything on a pull request', () => {
    expect(opened(docsOnly, ['--full'])).toMatchObject({ full: true, packages: ALL });
  });

  it('a pull request whose base cannot be diffed selects everything rather than nothing', () => {
    expect(opened(docsOnly, ['--base', 'no-such-ref'])).toMatchObject({ full: true, packages: ALL });
    expect(run(repo(), ['--event', 'pull_request', '--base', ''])).toMatchObject({ full: true, packages: ALL });
  });

  it('on this repository, a push selects every package under packages/', () => {
    const dirs = readdirSync(join(REPO_ROOT, 'packages')).filter((d) => {
      try {
        return Boolean(readFileSync(join(REPO_ROOT, 'packages', d, 'package.json'), 'utf8'));
      } catch {
        return false;
      }
    });
    const names = dirs.map((d) => (JSON.parse(readFileSync(join(REPO_ROOT, 'packages', d, 'package.json'), 'utf8')) as { name: string }).name).toSorted();
    expect(run(REPO_ROOT, ['--event', 'push']).packages).toEqual(names);
  });
});

interface Step {
  name?: string;
  if?: string;
  run?: string;
  env?: Record<string, string>;
}
interface Job {
  if?: string;
  needs?: string | string[];
  steps?: Step[];
}
interface Workflow {
  jobs: Record<string, Job>;
}

const { affectedLaneProblems, AFFECTED_LANES } = await import('./affected.mjs').catch(() => ({ affectedLaneProblems: undefined, AFFECTED_LANES: undefined }));

const workflow = (file: string): Workflow => loadYaml(readFileSync(join(WORKFLOWS, file), 'utf8')) as Workflow;
const problems = (file: string, wf: Workflow): string[] => {
  expect(affectedLaneProblems, 'scripts/affected.mts exports no affectedLaneProblems').toBeTypeOf('function');
  return affectedLaneProblems!(file, wf);
};

describe('the lanes read the set (lint-workflows rule, R2/R3)', () => {
  it('names compat.yml matrix and floor, and quality-full.yml test and coverage', () => {
    expect(AFFECTED_LANES).toEqual({ 'compat.yml': ['matrix', 'floor'], 'quality-full.yml': ['test', 'coverage'] });
  });

  for (const file of ['compat.yml', 'quality-full.yml']) {
    it(`${file} as committed has no problem`, () => {
      expect(problems(file, workflow(file))).toEqual([]);
    });
  }

  it('refuses a lane that does not read the set', () => {
    const wf = workflow('compat.yml');
    wf.jobs['floor'] = { ...wf.jobs['floor'], needs: undefined };
    expect(problems('compat.yml', wf).join('\n')).toMatch(/floor.*does not take its set from scripts\/affected\.mts/u);
  });

  it('refuses a set computed without the event, so a push could be read as a pull request', () => {
    const wf = workflow('quality-full.yml');
    for (const step of wf.jobs['test']?.steps ?? []) if (step.env) delete step.env['EVENT'];
    expect(problems('quality-full.yml', wf).join('\n')).toMatch(/test.*github\.event_name/u);
  });

  it('refuses a set that ignores the run-full-ci label', () => {
    const wf = workflow('compat.yml');
    const set = Object.values(wf.jobs).flatMap((j) => j.steps ?? []).find((s) => s.run?.includes('scripts/affected.mts'));
    if (set?.env) for (const [k, v] of Object.entries(set.env)) if (String(v).includes('run-full-ci')) delete set.env[k];
    expect(problems('compat.yml', wf).join('\n')).toMatch(/run-full-ci/u);
  });

  it('refuses a cell skipped at the job level, which reports "skipped" instead of success', () => {
    const wf = workflow('compat.yml');
    wf.jobs['matrix'] = { ...wf.jobs['matrix'], if: "needs.affected.outputs.any == 'true'" };
    expect(problems('compat.yml', wf).join('\n')).toMatch(/matrix.*job-level `if:`/u);
  });

  it('refuses a second computation of the set (an inline `turbo ls`)', () => {
    const wf = workflow('quality-full.yml');
    wf.jobs['coverage']?.steps?.push({ run: "npx turbo ls --filter='...[origin/main]'" });
    expect(problems('quality-full.yml', wf).join('\n')).toMatch(/turbo ls/u);
  });
});
