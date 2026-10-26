/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * ci-minutes.ts — what the Compatibility workflow cost each pull request, before and after a change.
 *
 * `ci-affected-lanes` R4: the affected lanes (#1101) are measured, not assumed. This reads the
 * Actions API for the pull requests merged just before a pivot PR and those opened just after it
 * merged, sums every Compatibility job's wall clock per pull request, and writes the two
 * populations side by side to `benchmarks/results/ci-minutes/`.
 *
 *   npx tsx scripts/ci-minutes.ts --pivot 1101 [--n 20] [--out <file>]
 *
 * How a pull request is counted, each choice written down because each moves the number:
 *
 *   - **Runs.** Compatibility runs on the `pull_request` event whose head branch is the PR's and
 *     which were created between the PR's opening and its merge. Branch names repeat here
 *     (`chore/bench-series` is reused by every bench PR), and `pull_requests` on a run is empty
 *     once the branch is deleted, so the window is what tells two PRs on one branch apart.
 *   - **Minutes.** Each job's `completed_at - started_at`, every attempt (`filter=all`), every job
 *     (ratchet, the affected step, `matrix`, `floor`), cancelled ones too: a cancelled job held a
 *     runner for as long as it ran. `laneMinutes` is the `matrix` and `floor` share alone, the
 *     part #1101 filtered. Queue time is not runner time and is not counted.
 *   - **Populations.** "Before": the last `n` PRs merged before the pivot merged. "After": the
 *     first `n` PRs opened after it merged, so no run of theirs used the old workflow. A PR with
 *     no Compatibility run on `pull_request` (a release PR, which is dispatched) never asked for
 *     the lanes and is passed over, not counted as zero.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import url from 'node:url';

/** `gh pr list --limit 1000` prints about a megabyte; the default buffer is one. */
const GH_MAX_BUFFER = 0x4000000;
const SCRIPT_DIR = path.dirname(url.fileURLToPath(import.meta.url));
// Stryker disable next-line StringLiteral: static, evaluated once at load, so the in-process runner never sees the mutant; applied by hand, the lock fails with ENOENT
export const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
// Stryker disable next-line StringLiteral: static, as above; applied by hand, the lock fails with "no reading under"
export const RESULTS_DIR = 'benchmarks/results/ci-minutes';
export const WORKFLOW = 'compat.yml';
/** The spec's population size on each side. */
export const DEFAULT_N = 20;

const SECONDS_PER_MINUTE = 60;
const MS_PER_SECOND = 1000;
/** Minutes are published to one decimal: a job's wall clock is not known closer than that. */
const DECIMALS = 10;
/** Exit code when fewer than `n` pull requests have been opened since the pivot merged. */
export const EXIT_NOT_YET = 3;

export interface Job {
  name: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface Run {
  id: number;
  head_branch: string;
  event: string;
  created_at: string;
  jobs: Job[];
}

export interface Pr {
  number: number;
  headRefName: string;
  createdAt: string;
  mergedAt: string;
}

export interface PrReading {
  number: number;
  /** The head branch, so a reader can split the bench-series PRs from the rest. */
  branch: string;
  runs: number;
  minutes: number;
  laneMinutes: number;
}

export interface Population {
  n: number;
  /** Runs summed over the PRs, and the total over them: the reading with push count taken out. */
  runs: number;
  minutesPerRun: number;
  medianMinutes: number;
  totalMinutes: number;
  medianLaneMinutes: number;
  totalLaneMinutes: number;
  prs: PrReading[];
}

export interface Reading {
  pivot: number;
  pivotMergedAt: string;
  measuredAt: string;
  workflow: string;
  before: Population;
  after: Population;
}

const round = (minutes: number): number => Math.round(minutes * DECIMALS) / DECIMALS;
const sumRounded = (xs: readonly number[]): number => round(xs.reduce((a, b) => a + b, 0));

/** A job's runner seconds; zero for one that never started or never finished. */
export function jobSeconds(job: Job): number {
  // A null stamp parses as NaN, which is what an unreadable one does too.
  const seconds = (Date.parse(String(job.completed_at)) - Date.parse(String(job.started_at))) / MS_PER_SECOND;
  return Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
}

/** `matrix` (`Node 24 · ubuntu-latest`) and `floor` (`… · published suites`): the cells #1101 filtered. */
export function isLaneJob(name: string): boolean {
  return name.startsWith('Node ');
}

/** The runs that belong to `pr`: its branch, the `pull_request` event, inside its open window. */
export function runsOfPr(pr: Pr, runs: readonly Run[]): Run[] {
  const opened = Date.parse(pr.createdAt);
  const merged = Date.parse(pr.mergedAt);
  return runs.filter((run) => {
    const at = Date.parse(run.created_at);
    return run.event === 'pull_request' && run.head_branch === pr.headRefName && at >= opened && at <= merged;
  });
}

export function prReading(pr: Pr, runs: readonly Run[]): PrReading {
  let seconds = 0;
  let laneSeconds = 0;
  for (const run of runs) {
    for (const job of run.jobs) {
      const s = jobSeconds(job);
      seconds += s;
      if (isLaneJob(job.name)) laneSeconds += s;
    }
  }
  return {
    number: pr.number,
    branch: pr.headRefName,
    runs: runs.length,
    minutes: round(seconds / SECONDS_PER_MINUTE),
    laneMinutes: round(laneSeconds / SECONDS_PER_MINUTE),
  };
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

export function population(prs: readonly PrReading[]): Population {
  const minutes = prs.map((p) => p.minutes);
  const lanes = prs.map((p) => p.laneMinutes);
  const runs = prs.reduce((a, p) => a + p.runs, 0);
  return {
    n: prs.length,
    runs,
    minutesPerRun: runs === 0 ? 0 : round(sumRounded(minutes) / runs),
    medianMinutes: median(minutes),
    totalMinutes: sumRounded(minutes),
    medianLaneMinutes: median(lanes),
    totalLaneMinutes: sumRounded(lanes),
    prs: [...prs],
  };
}

/**
 * The two populations around `pivot`. `runsFor` is asked lazily, nearest PR first, so the API is
 * called only until each side has `n` PRs that ran the workflow.
 */
export function collect(
  prs: readonly Pr[],
  pivot: number,
  n: number,
  runsFor: (pr: Pr) => Run[],
): { pivotMergedAt: string; before: PrReading[]; after: PrReading[] } {
  const anchor = prs.find((p) => p.number === pivot);
  if (anchor === undefined) throw new Error(`#${pivot} is not among the merged pull requests`);
  const at = Date.parse(anchor.mergedAt);
  // Strict on both sides, which also leaves the pivot out: it merged at `at` and opened before it.
  const earlier = prs.filter((p) => Date.parse(p.mergedAt) < at).sort((a, b) => Date.parse(b.mergedAt) - Date.parse(a.mergedAt));
  const later = prs.filter((p) => Date.parse(p.createdAt) > at).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const take = (candidates: Pr[]): PrReading[] => {
    const out: PrReading[] = [];
    for (const pr of candidates) {
      if (out.length === n) break;
      const runs = runsOfPr(pr, runsFor(pr));
      if (runs.length > 0) out.push(prReading(pr, runs));
    }
    return out;
  };
  return { pivotMergedAt: anchor.mergedAt, before: take(earlier), after: take(later) };
}

export interface ReadingInput {
  prs: readonly Pr[];
  pivot: number;
  n: number;
  runsFor: (pr: Pr) => Run[];
  measuredAt: string;
}

export function reading({ prs, pivot, n, runsFor, measuredAt }: ReadingInput): Reading {
  const { pivotMergedAt, before, after } = collect(prs, pivot, n, runsFor);
  return { pivot, pivotMergedAt, measuredAt, workflow: WORKFLOW, before: population(before), after: population(after) };
}

const side = (label: string, p: Population): string =>
  `${label}: ${p.n} PRs, median ${p.medianMinutes} job-min (lanes ${p.medianLaneMinutes}), total ${p.totalMinutes} (lanes ${p.totalLaneMinutes}), ${p.minutesPerRun} per run over ${p.runs}`;

/** One line per side, for the terminal and the decision. */
export function summary(r: Reading): string {
  return `${side('before', r.before)}\n${side('after ', r.after)}\n`;
}

// ── The Actions API, through `gh` ───────────────────────────────────────────────────────────

/* c8 ignore start -- network: the pure functions above are what the lock tests */
/** A function, not a constant, so nothing here runs when the module is only imported. */
function repo(): string {
  return 'ofri-peretz/burgee';
}

function gh(args: string[]): string {
  return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: GH_MAX_BUFFER });
}

function mergedPrs(): Pr[] {
  const out = gh(['pr', 'list', '-R', repo(), '--state', 'merged', '--limit', '1000', '--json', 'number,headRefName,createdAt,mergedAt']);
  return JSON.parse(out) as Pr[];
}

function runsFromApi(pr: Pr): Run[] {
  const window = `${pr.createdAt}..${pr.mergedAt}`;
  const query = `repos/${repo()}/actions/workflows/${WORKFLOW}/runs?event=pull_request&per_page=100&branch=${encodeURIComponent(pr.headRefName)}&created=${encodeURIComponent(window)}`;
  const runs = JSON.parse(gh(['api', query, '--jq', '[.workflow_runs[] | {id, head_branch, event, created_at}]'])) as Omit<Run, 'jobs'>[];
  return runs.map((run) => ({
    ...run,
    jobs: JSON.parse(
      gh(['api', `repos/${repo()}/actions/runs/${run.id}/jobs?filter=all&per_page=100`, '--jq', '[.jobs[] | {name, started_at, completed_at}]']),
    ) as Job[],
  }));
}

function flag(argv: readonly string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i === -1 ? undefined : argv[i + 1];
}

function main(argv: readonly string[]): number {
  const pivot = Number(flag(argv, '--pivot'));
  const n = Number(flag(argv, '--n') ?? DEFAULT_N);
  if (!Number.isInteger(pivot) || !Number.isInteger(n) || n < 1) {
    process.stderr.write('usage: npx tsx scripts/ci-minutes.ts --pivot <pr> [--n 20] [--out <file>]\n');
    return 2;
  }
  const measuredAt = new Date().toISOString();
  const r = reading({ prs: mergedPrs(), pivot, n, runsFor: runsFromApi, measuredAt });
  process.stdout.write(summary(r));
  if (r.after.n < n || r.before.n < n) {
    process.stdout.write(`not yet: ${r.before.n} before and ${r.after.n} after of ${n} each; no file written\n`);
    return EXIT_NOT_YET;
  }
  const out = flag(argv, '--out') ?? path.join(RESULTS_DIR, `${measuredAt.slice(0, 'YYYY-MM-DD'.length)}.json`);
  mkdirSync(path.dirname(path.resolve(REPO_ROOT, out)), { recursive: true });
  writeFileSync(path.resolve(REPO_ROOT, out), `${JSON.stringify(r, null, 2)}\n`);
  process.stdout.write(`wrote ${out.split(path.sep).join('/')}\n`);
  return 0;
}

// Stryker disable next-line all: the entry-point guard; a mutant that runs main() under the test runner calls the live API
if (process.argv[1] !== undefined && url.pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.exitCode = main(process.argv.slice(2));
}
/* c8 ignore stop */
