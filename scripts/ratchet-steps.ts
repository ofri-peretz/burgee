/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Rules 1–3 of a downward-only ratchet, shared by every ratchet file that has a history:
 * the D-157 claim ratchets (`claim-ratchets-lock.test.ts`) and B5's runtime ratchets
 * (`runtime-ratchets-lock.test.ts`). One implementation, because two copies of "a ceiling only
 * goes down" are two places for the rule to be loosened by accident.
 */
import { type RatchetStep } from 'benchmarks/claim-ratchets.js';

import { DECISION_ID } from './ledgers.js';

/**
 * Which of two decisions is newer. A sequential id (`D-157`) orders by its number; a dated one
 * (`D-20260928-slug`, the only kind written since the ledger went one file per entry) orders by
 * its date, after every sequential id. Two dated ids from the same day are not ordered, so one
 * cannot raise a ceiling the other set — stricter, never looser.
 */
const DATED_AFTER_SEQUENTIAL = 1e9;
/** A step's `why` shorter than this is a label, not a reason. */
const MIN_REASON_LENGTH = 20;
export function decisionNumber(id: string): number {
  const m = DECISION_ID.exec(id);
  if (m === null) return Number.NaN;
  return m[1] === undefined ? DATED_AFTER_SEQUENTIAL + Number(`${m[2] ?? ''}${m[3] ?? ''}${m[4] ?? ''}`) : Number(m[1]);
}

/** Rules 1–3 on one ratchet, as the list of what is wrong with it — driven directly by the cases at the bottom of `claim-ratchets-lock.test.ts`. */
export function stepProblems(id: string, ratchet: { ceiling: number; history: readonly RatchetStep[] }, decisions: ReadonlySet<string>): string[] {
  const problems: string[] = [];
  const { history } = ratchet;
  if (history.length === 0) return [`${id} has no history — a ceiling with no record of how it got there`];
  const last = history.at(-1);
  if (last?.ceiling !== ratchet.ceiling) problems.push(`${id}: ceiling ${String(ratchet.ceiling)} is not its last history step (${String(last?.ceiling)}). Move the ceiling by appending a step, never by editing the number`);
  history.forEach((step, i) => {
    if (!DECISION_ID.test(step.decision)) problems.push(`${id} step ${String(i)}: "${step.decision}" is not a decision id (D-NNN, or D-YYYYMMDD-slug)`);
    else if (!decisions.has(step.decision)) problems.push(`${id} step ${String(i)} cites ${step.decision}, which .sdlc/decisions/ has no row for`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(step.setOn)) problems.push(`${id} step ${String(i)}: setOn "${step.setOn}" is not a date`);
    if (step.why.trim().length < MIN_REASON_LENGTH) problems.push(`${id} step ${String(i)} gives no reason`);
    const before = history[i - 1];
    if (before === undefined) return;
    if (step.setOn < before.setOn) problems.push(`${id} step ${String(i)} is dated before the step it follows`);
    if (step.ceiling > before.ceiling && !(decisionNumber(step.decision) > decisionNumber(before.decision))) {
      problems.push(`${id}: ${String(before.ceiling)} -> ${String(step.ceiling)} is a raise, and it cites ${step.decision}, no newer than ${before.decision}. A ratchet goes down; raising one takes a new decision in .sdlc/decisions/, cited here.`);
    }
  });
  return problems;
}
