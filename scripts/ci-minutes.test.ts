/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — `ci-affected-lanes` R4: the affected lanes are measured, and the measurement is what the
 * script computes.
 *
 * #1101 made a pull request run only the packages it can have changed. Its spec held back the
 * last requirement until twenty PRs had run on the new lanes: compat job-minutes per PR for the
 * twenty before and the twenty after, published in a decision, with the "after" median below the
 * "before". This holds the counting rules (`scripts/ci-minutes.ts`) on fixtures, and holds the
 * committed reading to them: its summaries are recomputed from its own rows, so a hand-edited
 * median fails, and the decision must quote the medians the file carries.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  collect,
  DEFAULT_N,
  isLaneJob,
  jobSeconds,
  median,
  population,
  type Pr,
  prReading,
  type Reading,
  reading,
  REPO_ROOT,
  RESULTS_DIR,
  type Run,
  runsOfPr,
  summary,
} from './ci-minutes';

const job = (name: string, start: string | null, end: string | null) => ({ name, started_at: start, completed_at: end });
const T = (minute: number): string => new Date(Date.UTC(2026, 9, 18, 12, minute)).toISOString();
const TEN_MINUTE_CELL = [job('Node 24 · ubuntu-latest', T(0), T(10))];
const run = (id: number, branch: string, createdMinute: number, { jobs = TEN_MINUTE_CELL, event = 'pull_request' } = {}): Run => ({
  id,
  head_branch: branch,
  event,
  created_at: T(createdMinute),
  jobs,
});
const pr = (number: number, branch: string, created: number, merged: number): Pr => ({ number, headRefName: branch, createdAt: T(created), mergedAt: T(merged) });

describe('jobSeconds', () => {
  it('is the wall clock between start and completion', () => {
    expect(jobSeconds(job('x', T(0), T(2)))).toBe(120);
  });

  it.each([
    ['never started', null, T(1)],
    ['never finished', T(1), null],
    ['finished before it started', T(2), T(1)],
    ['an unreadable stamp', 'not a date', T(1)],
  ])('is zero for a job that %s', (_, start, end) => {
    expect(jobSeconds(job('x', start, end))).toBe(0);
  });
});

describe('isLaneJob', () => {
  it.each(['Node 24 · ubuntu-latest', 'Node 20.19.0 · windows-latest · published suites'])('%s is a matrix or floor cell', (name) => {
    expect(isLaneJob(name)).toBe(true);
  });

  it.each(["Ratchet · each host's suite against burgee", 'Affected packages'])('%s is not', (name) => {
    expect(isLaneJob(name)).toBe(false);
  });
});

describe('runsOfPr', () => {
  it('keeps the PR’s branch, the pull_request event, and its open window, both ends included', () => {
    const p = pr(1, 'chore/bench-series', 10, 20);
    const runs = [
      run(1, 'chore/bench-series', 10),
      run(2, 'chore/bench-series', 20),
      run(3, 'chore/bench-series', 9), // the previous PR on the same branch
      run(4, 'chore/bench-series', 21), // the next one
      run(5, 'other', 15),
      run(6, 'chore/bench-series', 15, { event: 'workflow_dispatch' }),
    ];
    expect(runsOfPr(p, runs).map((r) => r.id)).toEqual([1, 2]);
  });
});

describe('prReading', () => {
  it('sums every job of every run, and the matrix and floor cells apart', () => {
    const runs = [
      run(1, 'b', 0, { jobs: [job('Node 24 · ubuntu-latest', T(0), T(30)), job('Ratchet · x', T(0), T(15)), job('Affected packages', T(0), T(1))] }),
      run(2, 'b', 1, { jobs: [job('Node 22.13.0 · macos-latest · published suites', T(0), T(4)), job('Node 24 · macos-latest', null, null)] }),
    ];
    expect(prReading(pr(7, 'b', 0, 60), runs)).toEqual({ number: 7, branch: 'b', runs: 2, minutes: 50, laneMinutes: 34 });
  });

  it('publishes minutes to one decimal', () => {
    const r = prReading(pr(1, 'b', 0, 1), [run(1, 'b', 0, { jobs: [{ name: 'Node 24', started_at: '2026-10-18T12:00:00Z', completed_at: '2026-10-18T12:00:20Z' }] })]);
    expect(r.minutes).toBe(0.3);
  });
});

describe('median', () => {
  it.each([
    [[], 0],
    [[3], 3],
    [[5, 1, 3], 3],
    [[4, 1, 3, 2], 2.5],
    [[1, 2], 1.5],
  ])('of %j is %d', (xs, m) => {
    expect(median(xs)).toBe(m);
  });
});

describe('population', () => {
  it('carries the rows, their medians and totals, and the minutes per run', () => {
    const rows = [
      { number: 1, branch: 'a', runs: 2, minutes: 10, laneMinutes: 8 },
      { number: 2, branch: 'b', runs: 1, minutes: 30, laneMinutes: 20 },
      { number: 3, branch: 'c', runs: 1, minutes: 20, laneMinutes: 2 },
    ];
    expect(population(rows)).toEqual({
      n: 3,
      runs: 4,
      minutesPerRun: 15,
      medianMinutes: 20,
      totalMinutes: 60,
      medianLaneMinutes: 8,
      totalLaneMinutes: 30,
      prs: rows,
    });
  });

  it('is zeros, not NaN, with no rows', () => {
    expect(population([])).toMatchObject({ n: 0, runs: 0, minutesPerRun: 0, medianMinutes: 0, totalMinutes: 0 });
  });
});

/** One ten-minute run at each PR's opening; none for a release PR, which is dispatched. */
const MS_PER_MINUTE = 60_000;
const runsFor = (p: Pr): Run[] =>
  p.headRefName === 'release' ? [] : [run(p.number, p.headRefName, (Date.parse(p.createdAt) - Date.parse(T(0))) / MS_PER_MINUTE)];

describe('collect', () => {
  // The pivot (#10) is opened at minute 0 and merged at 50. Listed out of order on purpose: the
  // API's order is not merge order, and the sides are picked by time, nearest first.
  const prs = [
    pr(8, 'f', 53, 80),
    pr(2, 'b', 2, 20),
    pr(10, 'ci/pivot', 0, 50),
    pr(11, 'h', 50, 50), // opened and merged at the pivot's merge instant: on neither side
    pr(1, 'a', 1, 10),
    pr(3, 'release', 3, 30), // never ran the workflow on pull_request
    pr(4, 'c', 4, 40),
    pr(5, 'd', 5, 60), // opened before the pivot merged, merged after: some runs on the old workflow
    pr(6, 'e', 51, 70),
    pr(7, 'release', 52, 75),
    pr(9, 'g', 54, 90),
  ].reverse();

  it('takes the last n merged before the pivot and the first n opened after it merged', () => {
    const { before, after, pivotMergedAt } = collect(prs, 10, 2, runsFor);
    expect(pivotMergedAt).toBe(T(50));
    expect(before.map((r) => r.number)).toEqual([4, 2]);
    expect(after.map((r) => r.number)).toEqual([6, 8]);
  });

  it('passes over a PR that never ran the workflow instead of counting it as zero, and never counts a straddler', () => {
    const { before, after } = collect(prs, 10, 10, runsFor);
    expect(before.map((r) => r.number)).toEqual([4, 2, 1]);
    expect(after.map((r) => r.number)).toEqual([6, 8, 9]);
  });

  it('asks the API only until each side is full', () => {
    const asked: number[] = [];
    collect(prs, 10, 1, (p) => {
      asked.push(p.number);
      return runsFor(p);
    });
    expect(asked.sort((a, b) => a - b)).toEqual([4, 6]);
  });

  it('refuses a pivot that is not a merged PR', () => {
    expect(() => collect(prs, 99, 2, runsFor)).toThrow('#99 is not among the merged pull requests');
  });

  it('reading wraps both sides with the pivot and when it was measured, and summary prints one line per side', () => {
    const r = reading({ prs, pivot: 10, n: 2, runsFor, measuredAt: '2026-10-26T00:00:00.000Z' });
    expect(r).toMatchObject({ pivot: 10, pivotMergedAt: T(50), measuredAt: '2026-10-26T00:00:00.000Z', workflow: 'compat.yml' });
    expect(r.before.n).toBe(2);
    expect(summary(r)).toBe(
      'before: 2 PRs, median 10 job-min (lanes 10), total 20 (lanes 20), 10 per run over 2\n' +
        'after : 2 PRs, median 10 job-min (lanes 10), total 20 (lanes 20), 10 per run over 2\n',
    );
  });
});

// ── The committed reading ───────────────────────────────────────────────────────────────────

const DECISION = '.sdlc/decisions/D-20261026-ci-affected-lanes-minutes.md';
/** Bench-recording PRs reuse one branch each and change only `benchmarks/results/`. */
const SERIES = /^chore\/[a-z0-9]+-series$/;

/** The median of a side with the bench-series PRs left out. */
const rest = (p: Reading['before']): number => median(p.prs.filter((x) => !SERIES.test(x.branch)).map((x) => x.minutes));

function committed(): { file: string; r: Reading } {
  const dir = path.join(REPO_ROOT, RESULTS_DIR);
  const files = readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  const file = files.at(-1);
  if (file === undefined) throw new Error(`no reading under ${RESULTS_DIR}`);
  return { file: `${RESULTS_DIR}/${file}`, r: JSON.parse(readFileSync(path.join(dir, file), 'utf8')) as Reading };
}

describe('the committed reading (R4)', () => {
  const { file, r } = committed();

  it('measures #1101 over twenty PRs on each side, none of them twice and neither the pivot', () => {
    expect(r.pivot).toBe(1101);
    expect(r.before.n).toBe(DEFAULT_N);
    expect(r.after.n).toBe(DEFAULT_N);
    const numbers = [...r.before.prs, ...r.after.prs].map((p) => p.number);
    expect(new Set(numbers).size).toBe(numbers.length);
    expect(numbers).not.toContain(r.pivot);
  });

  it('carries the summaries its own rows compute, so no median is typed by hand', () => {
    expect(r.before).toEqual(population(r.before.prs));
    expect(r.after).toEqual(population(r.after.prs));
  });

  it('reads lower after than before, per PR and per run', () => {
    expect(r.after.medianMinutes).toBeLessThan(r.before.medianMinutes);
    expect(r.after.minutesPerRun).toBeLessThan(r.before.minutesPerRun);
  });

  it('still reads lower with the bench-series PRs set aside, which the after window has more of', () => {
    expect(rest(r.after)).toBeLessThan(rest(r.before));
  });

  it('is published in a decision that names the file and quotes its medians', () => {
    const decision = readFileSync(path.join(REPO_ROOT, DECISION), 'utf8');
    expect(decision).toContain(file);
    expect(decision).toContain(`${r.before.medianMinutes}`);
    expect(decision).toContain(`${r.after.medianMinutes}`);
  });
});
