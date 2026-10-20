#!/usr/bin/env node

/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * affected.mts — the packages a pull request can have changed, and the one place CI asks.
 *
 * Every pull request used to ask for the same 13 compat jobs, whether it changed a parser or a
 * benchmark JSON file (#1062, #1081), on an account that runs about six jobs at a time: on
 * 2026-10-12, 24 of the last 30 Compatibility runs were cancelled before they finished.
 * D-20261012-ci-affected-pr-lanes: a pull request runs each package it changed and each one
 * that depends on one (turbo's `...[base]`); everything else runs everything.
 *
 * The rule errs toward running more:
 *
 *   - any event but `pull_request`, or `--full` (the `run-full-ci` label), selects everything;
 *   - so does a pull request with no base, or a base git cannot diff against;
 *   - so does any change to a file every package consumes (`selectsEverything`): any root-level
 *     file, `.github/`, `scripts/`, a package's own `package.json`, `.sdlc/bands/`;
 *   - a path a package's suite reads from outside its own directory (`UNDECLARED_READS`)
 *     selects that package and its dependents, which turbo cannot see.
 *
 * Prints `{ "full", "packages", "workspaces" }`: `packages` are the names under `packages/`
 * (compat's cells, coverage), `workspaces` every affected workspace, docs apps included
 * (quality-full's `test`). `full` is true when everything was selected, so a lane can run
 * exactly what it ran before this script existed.
 *
 * Plain Node (type stripping, builtins only); turbo comes from this repository's node_modules.
 *
 *   node scripts/affected.mts --event pull_request --base origin/main [--full] [--root <dir>]
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import url from 'node:url';

const SCRIPT_DIR = path.dirname(url.fileURLToPath(import.meta.url));
const TURBO = path.join(SCRIPT_DIR, '..', 'node_modules', 'turbo', 'bin', 'turbo');

/** What the workflows read. */
export interface Affected {
  /** Everything was selected: not a pull request, the label, or a change every package consumes. */
  full: boolean;
  /** Affected workspaces under `packages/`, by name, sorted. */
  packages: string[];
  /** Every affected workspace, docs apps and `benchmarks` included, by name, sorted. */
  workspaces: string[];
}

/** Directories whose every file feeds every package's build or suite. */
const EVERYTHING_DIRS = ['.github/', 'scripts/', '.sdlc/bands/'] as const;

/**
 * Does a change to `file` (repository-relative, forward slashes) select every package?
 *
 * A root-level file is the workspace's own configuration (`package-lock.json`, `turbo.json`,
 * `tsconfig.base.json`, `vitest*.config.ts`, `.nvmrc`) or something a suite reads (burgee's
 * `shape.test.ts` reads the root README); none of them is cheap to tell apart, and all of them
 * are rare in a pull request, so all of them count. A package's own `package.json` counts too:
 * its dependencies are what the lockfile resolves, and burgee's `migrate` reads every family
 * manifest. `.sdlc/bands/` holds the ceilings every package's `weight.test.ts` reads.
 */
export function selectsEverything(file: string): boolean {
  if (!file.includes('/')) return true;
  if (EVERYTHING_DIRS.some((dir) => file.startsWith(dir))) return true;
  return /^packages\/[^/]+\/package\.json$/u.test(file);
}

/**
 * Paths outside `packages/` that a package's own suite reads, by the package that reads them.
 * turbo's change detection stops at a package's directory, so these are added by hand. Found
 * by reading every `../../` in `packages/*\/src` on 2026-10-13; a new one belongs here.
 */
export const UNDECLARED_READS: Readonly<Record<string, readonly string[]>> = {
  // `facade-types.test.ts` and `migrate-demo.test.ts` run burgee's migrate over them.
  'examples/': ['burgee'],
  // `compat-baseline-lock.test.ts` holds the published scoreboard to the baselines.
  'apps/docs/content/docs/compatibility.mdx': ['burgee'],
  // `demand.test.ts` reads every intent for the demand it cites.
  '.sdlc/intents/': ['compat-oracle'],
};

interface Item {
  name: string;
  path: string;
}

/** `turbo ls` under `root`, with these filters (none: every workspace). Throws on failure. */
function turboLs(root: string, filters: string[]): Item[] {
  const r = spawnSync(process.execPath, [TURBO, 'ls', '--output=json', ...filters.map((f) => `--filter=${f}`)], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, TURBO_TELEMETRY_DISABLED: '1', TURBO_PRINT_VERSION_DISABLED: '1' },
  });
  const out = r.stdout ?? '';
  const start = out.indexOf('{');
  if (r.status !== 0 || start === -1) throw new Error(`turbo ls ${filters.join(' ')} failed (exit ${String(r.status)}):\n${r.stderr}${out}`);
  const items = (JSON.parse(out.slice(start)) as { packages: { items: Item[] } }).packages.items;
  // turbo prints the platform's separator on Windows; the set is read on Linux, but say it once.
  return items.map((i) => ({ name: i.name, path: i.path.replaceAll('\\', '/') }));
}

/** The files changed between the merge base of `base` and HEAD, or undefined when git cannot say. */
function changedFiles(root: string, base: string): string[] | undefined {
  const r = spawnSync('git', ['diff', '--name-only', `${base}...HEAD`], { cwd: root, encoding: 'utf8' });
  if (r.status !== 0) return undefined;
  return r.stdout.split('\n').filter(Boolean);
}

const shape = (items: Item[], full: boolean): Affected => ({
  full,
  packages: items.filter((i) => i.path.startsWith('packages/')).map((i) => i.name).toSorted(),
  workspaces: items.map((i) => i.name).toSorted(),
});

const silent = (): undefined => undefined;

/** The affected set for one CI event. `log` hears why everything was selected, when it was. */
export function affected(opts: { root: string; event: string; base?: string; full?: boolean; log?: (line: string) => void }): Affected {
  const log = opts.log ?? silent;
  const everything = (why: string): Affected => {
    log(`affected: everything — ${why}`);
    return shape(turboLs(opts.root, []), true);
  };
  if (opts.event !== 'pull_request') return everything(`a ${opts.event || 'non-pull-request'} event`);
  if (opts.full) return everything('the run-full-ci label');
  if (!opts.base) return everything('a pull request with no base to compare against');
  const files = changedFiles(opts.root, opts.base);
  if (!files) return everything(`git cannot diff against ${opts.base}`);
  const root = files.find(selectsEverything);
  if (root) return everything(`${root} is consumed by every package`);
  const readers = Object.entries(UNDECLARED_READS)
    .filter(([prefix]) => files.some((f) => f.startsWith(prefix)))
    .flatMap(([, names]) => names.map((n) => `...${n}`));
  return shape(turboLs(opts.root, [`...[${opts.base}]`, ...new Set(readers)]), false);
}

/**
 * The lanes that must take their set from this script (R2, R3): compat's two suite matrices
 * and quality-full's two suite jobs. Checked by `scripts/lint-workflows.ts`.
 */
export const AFFECTED_LANES: Readonly<Record<string, readonly string[]>> = {
  'compat.yml': ['matrix', 'floor'],
  'quality-full.yml': ['test', 'coverage'],
};

interface LaneStep {
  run?: string;
  env?: Record<string, unknown>;
}
interface LaneJob {
  if?: unknown;
  needs?: string | string[];
  steps?: LaneStep[];
}

const SCRIPT_CALL = 'scripts/affected.mts';
const EVENT_NAME = /^\$\{\{\s*github\.event_name\s*\}\}$/u;

/** The call passes `--event`, from an env set to exactly `${{ github.event_name }}`. */
const givenEvent = (s: LaneStep): boolean => /--event\b/u.test(s.run ?? '') && Object.values(s.env ?? {}).some((v) => EVENT_NAME.test(String(v)));
/** The call can pass `--full`, from an env that reads the `run-full-ci` label. */
const givenLabel = (s: LaneStep): boolean => /--full\b/u.test(s.run ?? '') && Object.values(s.env ?? {}).some((v) => String(v).includes("'run-full-ci'"));

/** Every step anywhere in the workflow that runs `turbo ls` instead of asking the script. */
function inlineSets(file: string, jobs: Record<string, LaneJob | undefined>): string[] {
  return Object.entries(jobs).flatMap(([key, job]) =>
    (job?.steps ?? [])
      .filter((step) => step.run && /\bturbo\s+ls\b/u.test(step.run) && !step.run.includes(SCRIPT_CALL))
      .map(() => `[affected] ${file} → ${key}: runs \`turbo ls\` itself — the affected set is computed once, by ${SCRIPT_CALL}.`),
  );
}

/** What is wrong with one lane: no set, a set missing the event or the label, or a job-level skip. */
function laneProblems(file: string, lane: string, jobs: Record<string, LaneJob | undefined>): string[] {
  const job = jobs[lane];
  if (!job) return [`[affected] ${file}: has no \`${lane}\` job, which ${SCRIPT_CALL}'s AFFECTED_LANES names.`];
  const needs = typeof job.needs === 'string' ? [job.needs] : (job.needs ?? []);
  const callers = [job, ...needs.map((n) => jobs[n])].flatMap((j) => j?.steps ?? []).filter((s) => s.run?.includes(SCRIPT_CALL));
  if (callers.length === 0) return [`[affected] ${file} → ${lane}: does not take its set from ${SCRIPT_CALL} (in its own steps or a job it needs).`];
  const problems: string[] = [];
  if (!callers.every(givenEvent)) {
    problems.push(`[affected] ${file} → ${lane}: calls ${SCRIPT_CALL} without \`--event\` from an env set to \`\${{ github.event_name }}\` — a push, the merge queue or the weekly scan could be read as a pull request and run less.`);
  }
  if (!callers.every(givenLabel)) {
    problems.push(`[affected] ${file} → ${lane}: calls ${SCRIPT_CALL} without \`--full\` from the \`run-full-ci\` label — the label could no longer ask for the full matrix.`);
  }
  if (typeof job.if === 'string' && job.if.includes('needs.')) {
    problems.push(`[affected] ${file} → ${lane}: has a job-level \`if:\` reading another job — a cell with nothing to run must report success from a step, not "skipped".`);
  }
  return problems;
}

/**
 * Every way `file` breaks the affected-lane convention, as ready-to-print errors.
 *
 *   - each lane runs this script, or needs a job that does;
 *   - that call passes `--event` from an env set to `${{ github.event_name }}` (so a push, the
 *     merge queue, the weekly scan and a dispatch select everything), and `--full` from an env
 *     reading the `run-full-ci` label;
 *   - no lane has a job-level `if:` reading another job: a skipped cell reports "skipped" and a
 *     cell with nothing to run must report success, from a step that says so;
 *   - no workflow runs `turbo ls` itself — one set, computed in one place.
 */
export function affectedLaneProblems(file: string, wf: { jobs?: Record<string, LaneJob | undefined> }): string[] {
  const jobs = wf.jobs ?? {};
  return [...inlineSets(file, jobs), ...(AFFECTED_LANES[file] ?? []).flatMap((lane) => laneProblems(file, lane, jobs))];
}

function arg(name: string): string | undefined {
  const argv = process.argv.slice(2);
  const at = argv.lastIndexOf(name);
  return at === -1 ? undefined : argv[at + 1];
}

if (process.argv[1] && path.resolve(process.argv[1]) === url.fileURLToPath(import.meta.url)) {
  const result = affected({
    root: path.resolve(arg('--root') ?? path.join(SCRIPT_DIR, '..')),
    event: arg('--event') ?? '',
    base: arg('--base'),
    full: process.argv.includes('--full'),
    log: (line) => process.stderr.write(`${line}\n`),
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
