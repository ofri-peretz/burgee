#!/usr/bin/env node

/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * case-budget.ts — the five-second gate's verdict on a whole battery (D-20261101-tests-under-5s).
 *
 * Inside `turbo run test` every vitest run that reads a case over the budget writes it to
 * `$VITEST_CASE_BUDGET_DEFER` instead of judging it there, because nothing inside a battery is
 * alone (`scripts/vitest-case-budget-reporter.ts`, `DEFER_ENV`). This runs after the battery,
 * measures each of those cases alone — its file, `-t` naming it, best of two — and exits 1 naming
 * every one still over the budget. A directory with no candidates is a pass: every case was
 * within the budget the first time. The directory is emptied once read, so a stale candidate from
 * an earlier battery is never judged twice.
 *
 *   npx tsx scripts/case-budget.ts <dir>
 */
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

import { budgetFrom, type Candidate, judge } from './vitest-case-budget-reporter.js';

/** Every candidate the battery's runs left in `dir`. */
export function readCandidates(dir: string): Candidate[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .flatMap((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as Candidate[]);
}

const [dir] = process.argv.slice(2);
if (dir === undefined) {
  process.stderr.write('usage: npx tsx scripts/case-budget.ts <dir>\n');
  process.exitCode = 2;
} else {
  const candidates = readCandidates(dir);
  rmSync(dir, { recursive: true, force: true });
  const budget = budgetFrom(process.env);
  const passed = budget === 0 || judge(candidates, budget);
  process.stdout.write(passed ? `No test case over the ${String(budget)} ms budget (${String(candidates.length)} re-measured alone).\n` : '');
  process.exitCode = passed ? 0 : 1;
}
