/**
 * B3 — compatibility, read from `compat-oracle` and never recomputed (intent constraint
 * 8, design R8). There is no grading logic in this file and there must not be: two
 * implementations of a compatibility rate produce two rates, and the honest one is the
 * one the oracle computed with the hosts' own suites.
 *
 * What this axis adds is a *band*. The rate was already measured on every PR by
 * `compat.yml` and printed to a log; nothing recorded it over time, so a slow slide was
 * only ever visible to whoever re-read two logs. That missing band is the last gap
 * between `commander-compat`, `yargs-compat` and `shipped`.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { COMPAT_HOSTS } from '../bands.js';
import { type BenchRecord } from '../record.js';

const REPO_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const ORACLE = join(REPO_ROOT, 'packages', 'compat-oracle');
const RESULTS = join(ORACLE, 'results.json');
const BASELINE = join(ORACLE, 'baseline.json');
const ORACLE_BIN = join(ORACLE, 'dist', 'bin.js');

export interface Grade {
  host: string;
  target: string;
  tests: number;
  passed: number;
  failed: number;
  skipped: number;
  reference: number;
  rate: number;
  note?: string;
  error?: string;
}

interface Results {
  measured: string;
  grades: Grade[];
}

export type Baseline = Record<string, { reference: number; passed: number; rate: number }>;

export const readBaseline = (): Baseline => JSON.parse(readFileSync(BASELINE, 'utf8')) as Baseline;

/**
 * `results.json` is gitignored — it is the oracle's output, not a checked-in claim — so a
 * clean checkout has none. Running the oracle *is* reading the oracle; what constraint 8
 * forbids is computing a second rate here. It takes about 25 seconds.
 */
export function readResults(allowRun: boolean): Results | { reason: string } {
  if (!existsSync(RESULTS)) {
    if (!allowRun) return { reason: `${RESULTS} does not exist and --no-oracle was passed` };
    if (!existsSync(ORACLE_BIN)) return { reason: `compat-oracle is not built (${ORACLE_BIN}); run \`npx turbo run build --filter=./packages/*\`` };
    execFileSync(process.execPath, [ORACLE_BIN], { cwd: REPO_ROOT, stdio: 'ignore' });
  }
  return JSON.parse(readFileSync(RESULTS, 'utf8')) as Results;
}

export function hostRecords(grade: Grade, baseline: Baseline): BenchRecord[] {
  const was = baseline[grade.host];
  const denominator = Math.max(grade.reference, grade.tests);
  // The oracle counts a case the host skipped on this OS as a pass, because that is what
  // the host's own TAP summary says; it is a pass for no one and a failure for no one.
  // Stated here rather than smoothed, so the reader can see what the 100% is over.
  const skipNote = grade.skipped > 0 ? ` ${String(grade.skipped)} case(s) skipped on this OS are inside that count, as the host's own summary reports them` : '';
  return [
    {
      axis: 'compat',
      variant: grade.host,
      metric: 'pass-rate',
      unit: 'ratio',
      samples: 1,
      median: grade.rate,
      p95: grade.rate,
      ...(was === undefined ? {} : { gate: { min: was.rate, why: `the recorded baseline in compat-oracle/baseline.json; C5 says this number only goes up` } }),
      note: `${grade.host}'s own suite against \`${grade.target}\`, as graded by compat-oracle.${skipNote}`,
      detail: { target: grade.target, passed: grade.passed, tests: grade.tests, skipped: grade.skipped, reference: grade.reference, denominator },
    },
    {
      axis: 'compat',
      variant: grade.host,
      metric: 'passing-tests',
      unit: 'tests',
      samples: 1,
      median: grade.passed,
      p95: grade.passed,
      ...(was === undefined ? {} : { gate: { min: was.passed, why: 'the ratchet in counts rather than in a rounded rate: one lost case out of 1,360 moves the rate by 0.0007 and this by 1' } }),
      note: `passing cases in ${grade.host}'s own suite`,
      detail: { target: grade.target },
    },
  ];
}

export function run(allowRun = true): { records: BenchRecord[] } | { reason: string } {
  const results = readResults(allowRun);
  if ('reason' in results) return results;
  const baseline = readBaseline();
  const records: BenchRecord[] = [];
  for (const host of COMPAT_HOSTS) {
    const grade = results.grades.find((g) => g.host === host);
    // A host the registry names and the oracle did not grade is a hole in the suite, not
    // a zero: emitting 0 here would feed a band a number nobody measured.
    if (grade === undefined || grade.error !== undefined) return { reason: `compat-oracle produced no usable grade for ${host}` };
    records.push(...hostRecords(grade, baseline));
  }
  return { records };
}

export const method =
  'Read from `packages/compat-oracle/results.json` — each host\'s own upstream test suite, vendored and run against our entry point by compat-oracle, which computes the rate. This axis re-emits that number and bands it; it contains no grading logic. The oracle is run to produce the file when a checkout has none (about 25 seconds).';
