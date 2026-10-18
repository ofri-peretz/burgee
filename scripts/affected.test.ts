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
 * with a `main` branch for the base and one commit on top for the pull request. What it prints
 * is the contract the workflows read.
 *
 * Proven red, 2026-10-13: every case below failed with no `scripts/affected.mts` on the branch
 * (`Cannot find module`), and the workflow cases failed on main's compat.yml and
 * quality-full.yml, where neither the cells nor `test` read a set.
 */

import { load as loadYaml } from 'js-yaml';
import { afterAll, describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'affected.mts');
const WORKFLOWS = join(REPO_ROOT, '.github', 'workflows');

interface Affected {
  full: boolean;
  packages: string[];
  workspaces: string[];
}

const ALL = ['burgee', 'compat-oracle', 'linegauge', 'seniority'];

const scratch: string[] = [];
afterAll(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

function git(cwd: string, ...args: string[]): void {
  const r = spawnSync('git', ['-c', 'user.email=lock@example.com', '-c', 'user.name=lock', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
}

function write(root: string, file: string, text: string): void {
  mkdirSync(dirname(join(root, file)), { recursive: true });
  writeFileSync(join(root, file), text);
}

const manifest = (name: string, deps: string[] = []): string => `${JSON.stringify({ name, version: '1.0.0', dependencies: Object.fromEntries(deps.map((d) => [d, '*'])) })}\n`;

/**
 * A repository with burgee's shape: `linegauge` is a leaf burgee depends on, `compat-oracle`
 * depends on burgee, `seniority` is a leaf nothing depends on, and `docs` (an app) and
 * `benchmarks` are workspaces outside `packages/`. `main` holds it; `pr` is checked out.
 */
function repo(): string {
  const root = mkdtempSync(join(tmpdir(), 'affected-'));
  scratch.push(root);
  write(root, 'package.json', `${JSON.stringify({ name: 'root', private: true, packageManager: 'npm@11.6.2', workspaces: ['packages/*', 'apps/*', 'benchmarks'] })}\n`);
  write(root, 'package-lock.json', `${JSON.stringify({ name: 'root', lockfileVersion: 3, requires: true, packages: {} })}\n`);
  write(root, 'turbo.json', '{ "tasks": {} }\n');
  write(root, 'tsconfig.base.json', '{}\n');
  write(root, 'vitest.root.config.ts', 'export default {};\n');
  write(root, '.nvmrc', '24\n');
  write(root, 'README.md', '# root\n');
  write(root, '.github/workflows/compat.yml', 'name: Compatibility\n');
  write(root, 'scripts/build-helper.ts', 'export {};\n');
  write(root, '.sdlc/research/notes.md', 'decided\n');
  write(root, '.sdlc/intents/x/intent.md', 'intent\n');
  write(root, '.sdlc/bands/foundation-ceilings.json', '{}\n');
  write(root, 'examples/demo/demo.js', '\n');
  write(root, 'benchmarks/package.json', manifest('benchmarks'));
  write(root, 'benchmarks/results/b1.json', '{}\n');
  write(root, 'apps/docs/package.json', manifest('docs', ['burgee']));
  write(root, 'packages/linegauge/package.json', manifest('linegauge'));
  write(root, 'packages/linegauge/src/index.ts', 'export {};\n');
  write(root, 'packages/burgee/package.json', manifest('burgee', ['linegauge']));
  write(root, 'packages/burgee/src/index.ts', 'export {};\n');
  write(root, 'packages/compat-oracle/package.json', manifest('compat-oracle', ['burgee']));
  write(root, 'packages/seniority/package.json', manifest('seniority'));
  write(root, 'packages/seniority/src/index.ts', 'export {};\n');
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'add', '-A');
  git(root, 'commit', '-qm', 'base');
  git(root, 'checkout', '-qb', 'pr');
  return root;
}

/** Commit a change to each of `files` on `pr`, then run the script as a pull request against `main`. */
function prTouching(files: string[], args: string[] = []): Affected {
  const root = repo();
  // A manifest stays a manifest, or turbo refuses the repository before the script decides.
  for (const file of files) {
    const json = file.endsWith('.json') ? (JSON.parse(readFileSync(join(root, file), 'utf8')) as Record<string, unknown>) : undefined;
    const changed = file === 'turbo.json' ? { globalEnv: ['CHANGED'] } : { description: 'changed' };
    write(root, file, json ? `${JSON.stringify({ ...json, ...changed })}\n` : `${file} changed\n`);
  }
  git(root, 'add', '-A');
  git(root, 'commit', '-qm', 'change');
  return run(root, ['--event', 'pull_request', '--base', 'main', ...args]);
}

function run(root: string, args: string[]): Affected {
  const r = spawnSync(process.execPath, [SCRIPT, '--root', root, ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`affected.mts exited ${r.status}: ${r.stderr}`);
  return JSON.parse(r.stdout) as Affected;
}

describe('scripts/affected.mts — the one affected set', () => {
  it('a docs-only pull request (.sdlc/research) selects no package', () => {
    const got = prTouching(['.sdlc/research/wave-4.md']);
    expect(got).toEqual({ full: false, packages: [], workspaces: [] });
  });

  it('a pull request touching only benchmarks/results selects no package (#1062, #1081)', () => {
    const got = prTouching(['benchmarks/results/b1.json']);
    expect(got.full).toBe(false);
    expect(got.packages).toEqual([]);
    expect(got.workspaces).toEqual(['benchmarks']);
  });

  it('one leaf package selects itself', () => {
    expect(prTouching(['packages/seniority/src/index.ts'])).toEqual({ full: false, packages: ['seniority'], workspaces: ['seniority'] });
  });

  it('a package with dependents selects it and every dependent, apps among the workspaces', () => {
    const got = prTouching(['packages/linegauge/src/index.ts']);
    expect(got.full).toBe(false);
    expect(got.packages).toEqual(['burgee', 'compat-oracle', 'linegauge']);
    expect(got.workspaces).toEqual(['burgee', 'compat-oracle', 'docs', 'linegauge']);
  });

  for (const file of ['package-lock.json', '.github/workflows/compat.yml', 'turbo.json', 'tsconfig.base.json', 'vitest.root.config.ts', '.nvmrc', 'scripts/build-helper.ts', 'package.json', 'README.md', 'packages/seniority/package.json', '.sdlc/bands/foundation-ceilings.json', '.github/actions/setup/action.yml']) {
    it(`a change to ${file} selects everything`, () => {
      const got = prTouching([file]);
      expect(got.full).toBe(true);
      expect(got.packages).toEqual(ALL);
      expect(got.workspaces).toEqual(['benchmarks', ...ALL.slice(0, 2), 'docs', ...ALL.slice(2)]);
    });
  }

  it('a root change wins over a docs change in the same pull request', () => {
    expect(prTouching(['.sdlc/research/wave-4.md', 'package-lock.json']).full).toBe(true);
  });

  it('what a package reads outside its directory selects that package and its dependents', () => {
    expect(prTouching(['examples/demo/demo.js']).packages).toEqual(['burgee', 'compat-oracle']);
    expect(prTouching(['.sdlc/intents/x/intent.md']).packages).toEqual(['compat-oracle']);
    expect(prTouching(['apps/docs/content/docs/compatibility.mdx']).packages).toEqual(['burgee', 'compat-oracle']);
  });

  for (const event of ['push', 'merge_group', 'schedule', 'workflow_dispatch']) {
    it(`a ${event} selects everything, whatever changed`, () => {
      const root = repo();
      expect(run(root, ['--event', event, '--base', 'main'])).toMatchObject({ full: true, packages: ALL });
    });
  }

  it('the run-full-ci label (--full) selects everything on a pull request', () => {
    expect(prTouching(['.sdlc/research/wave-4.md'], ['--full'])).toMatchObject({ full: true, packages: ALL });
  });

  it('a pull request whose base cannot be diffed selects everything rather than nothing', () => {
    expect(prTouching(['.sdlc/research/wave-4.md'], ['--base', 'no-such-ref'])).toMatchObject({ full: true, packages: ALL });
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
