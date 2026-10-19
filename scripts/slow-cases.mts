#!/usr/bin/env node

/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * slow-cases.mts — every case that used more than half of its timeout, read from the cell.
 *
 * windows-lane-holds R2. A timeout is a bet on the machine, and the bet is only checked when it
 * is lost: the PowerShell completion case spent 59.7 s of its 120 s on a passing Windows cell
 * (2026-10-18) and nobody saw it until it lost at 122 s. Half the budget is the line: a case
 * past it is one busy runner away from a red build that names the wrong cause.
 *
 * Reads the reports `scripts/vitest-durations-reporter.ts` writes (files, or directories of
 * them), prints one line per case over half its timeout, slowest share first, and exits 1 when
 * there is any. It also exits 1 when it read no case at all: a check that read nothing has not
 * passed.
 *
 * `durationsProblems` is the `lint:workflows` rule (R1) that keeps the reports coming: compat's
 * `matrix` and `floor` cells set `VITEST_DURATIONS_DIR` and upload it on every OS, and the
 * dispatch can select one cell with `os` and `node` inputs.
 *
 * Plain Node (type stripping, builtins only).
 *
 *   node scripts/slow-cases.mts <report.json | directory>...
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import url from 'node:url';

export interface DurationCase {
  file: string;
  name: string;
  state: string;
  duration: number;
  timeout: number;
}

export interface DurationReport {
  version: 1;
  cwd: string;
  platform: string;
  node: string;
  cases: DurationCase[];
}

export interface SlowCase extends DurationCase {
  /** `duration / timeout`, so 0.5 is exactly half. */
  share: number;
  platform: string;
  node: string;
}

/** Every case over half its timeout, slowest share first. A case at exactly half is not over it. */
export function slowCases(reports: readonly DurationReport[]): SlowCase[] {
  return reports
    .flatMap((r) => r.cases.map((c) => ({ ...c, share: c.duration / c.timeout, platform: r.platform, node: r.node })))
    .filter((c) => c.timeout > 0 && c.duration * 2 > c.timeout)
    .sort((a, b) => b.share - a.share || a.file.localeCompare(b.file) || a.name.localeCompare(b.name));
}

/** The reports at `paths`: each a report file, or a directory whose `*.json` files are reports. */
export function readReports(paths: readonly string[]): DurationReport[] {
  const files = paths.flatMap((p) =>
    statSync(p).isDirectory()
      ? readdirSync(p)
          .filter((name) => name.endsWith('.json'))
          .sort()
          .map((name) => path.join(p, name))
      : [p],
  );
  return files.map((file) => {
    const report = JSON.parse(readFileSync(file, 'utf8')) as Partial<DurationReport>;
    if (report.version !== 1 || !Array.isArray(report.cases)) throw new Error(`${file}: not a vitest durations report (version 1)`);
    return report as DurationReport;
  });
}

/** One line per slow case, the way the CLI prints it. */
export function describeSlow(c: SlowCase): string {
  return `${String(Math.round(c.share * 100))}% — ${String(c.duration)} of ${String(c.timeout)} ms · ${c.platform} ${c.node} · ${c.file} › ${c.name}`;
}

interface WorkflowStep {
  uses?: string;
  if?: unknown;
  with?: Record<string, unknown>;
  env?: Record<string, unknown>;
}
interface WorkflowJob {
  env?: Record<string, unknown>;
  steps?: WorkflowStep[];
}
interface WorkflowShape {
  on?: unknown;
  jobs?: Record<string, WorkflowJob | undefined>;
}

/** The workflow, the jobs that must report durations, and the dispatch inputs that pick a cell. */
export const DURATION_LANES: Record<string, { jobs: string[]; inputs: string[] }> = {
  'compat.yml': { jobs: ['matrix', 'floor'], inputs: ['os', 'node'] },
};
export const DURATIONS_DIR = 'vitest-durations';

/** Every way `file` stops reporting per-case durations, as ready-to-print `lint:workflows` errors. */
export function durationsProblems(file: string, wf: WorkflowShape): string[] {
  const lane = DURATION_LANES[file];
  if (lane === undefined) return [];
  const problems: string[] = [];
  const on = (wf.on ?? {}) as Record<string, { inputs?: Record<string, unknown> } | null | undefined>;
  const inputs = on['workflow_dispatch']?.inputs ?? {};
  for (const name of lane.inputs) {
    if (!(name in inputs)) problems.push(`[durations] ${file}: \`workflow_dispatch\` has no \`${name}\` input — one cell cannot be dispatched alone, so a measurement costs the whole matrix.`);
  }
  for (const key of lane.jobs) {
    const job = wf.jobs?.[key];
    if (job === undefined) {
      problems.push(`[durations] ${file}: has no \`${key}\` job, which DURATION_LANES names.`);
      continue;
    }
    const steps = job.steps ?? [];
    const setsDir = [job.env, ...steps.map((s) => s.env)].some((env) => String(env?.['VITEST_DURATIONS_DIR'] ?? '').includes(DURATIONS_DIR));
    if (!setsDir) problems.push(`[durations] ${file} → ${key}: does not set \`VITEST_DURATIONS_DIR\` to a \`${DURATIONS_DIR}\` path — its suites write no per-case durations.`);
    const uploads = steps.some((s) => (s.uses ?? '').startsWith('actions/upload-artifact@') && String(s.with?.['path'] ?? '').includes(DURATIONS_DIR) && String(s.if ?? '').includes('always()'));
    if (!uploads) problems.push(`[durations] ${file} → ${key}: has no \`if: always()\` upload-artifact step for \`${DURATIONS_DIR}\` — a red cell would keep its durations to itself.`);
  }
  return problems;
}

if (process.argv[1] && path.resolve(process.argv[1]) === url.fileURLToPath(import.meta.url)) {
  const paths = process.argv.slice(2);
  if (paths.length === 0) {
    process.stderr.write('usage: node scripts/slow-cases.mts <report.json | directory>...\n');
    process.exit(2);
  }
  const reports = readReports(paths);
  const total = reports.reduce((n, r) => n + r.cases.length, 0);
  const slow = slowCases(reports);
  for (const c of slow) process.stdout.write(`${describeSlow(c)}\n`);
  if (total === 0) {
    process.stdout.write('read no case: a check that read nothing has not passed\n');
    process.exit(1);
  }
  process.stdout.write(`${String(slow.length)} of ${String(total)} case(s) above half their timeout\n`);
  process.exit(slow.length > 0 ? 1 : 0);
}
