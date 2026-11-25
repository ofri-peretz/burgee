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
 * `$TRUEPASS_BUDGET_DEFER` instead of judging it there, because nothing inside a battery is alone
 * (truepass's budget reporter, `DEFER_ENV`). This runs after the battery, measures each of those
 * cases alone — its file, `-t` naming it, best of two — and exits 1 naming every one still over the
 * budget. A directory with no candidates is a pass: every case was within the budget the first
 * time. The directory is emptied once read, so a stale candidate from an earlier battery is never
 * judged twice.
 *
 * It is `truepass budget <dir>` with this repository's advice, read from truepass's source so it
 * needs nothing built.
 *
 *   npx tsx scripts/case-budget.ts <dir>
 */
import { rmSync } from 'node:fs';
import process from 'node:process';

// eslint-disable-next-line import-next/no-relative-packages -- by path, the source: a bare `truepass` resolves to a dist/ the battery may not have built
import { budgetFrom, judge, readCandidates } from '../packages/truepass/src/budget.js';

import { CASE_BUDGET_HINT, CASE_BUDGET_MS } from './nightly-only.js';

async function main(dir: string | undefined): Promise<number> {
  if (dir === undefined) {
    process.stderr.write('usage: npx tsx scripts/case-budget.ts <dir>\n');
    return 2;
  }
  const candidates = readCandidates(dir);
  rmSync(dir, { recursive: true, force: true });
  const budget = budgetFrom(process.env, CASE_BUDGET_MS);
  const passed = budget === 0 || (await judge(candidates, budget, CASE_BUDGET_HINT));
  process.stdout.write(passed ? `No test case over the ${String(budget)} ms budget (${String(candidates.length)} re-measured alone).\n` : '');
  return passed ? 0 : 1;
}

main(process.argv[2]).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    process.stderr.write(`case-budget: ${String(error)}\n`);
    process.exitCode = 1;
  },
);
