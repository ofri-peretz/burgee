/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — a claim ratchet only goes down.
 *
 * D-157 turned three published claims whose ≤ 1 bar is structurally out of reach (D-102, D-148)
 * into ceilings just above the measurement: `cold-start-at-or-below-cac`, `lighter-than-commander`
 * and `lighter-than-cac`. The owner's words were *"something acceptable and realistic, while we
 * consistently keep them as low as we can"*, and the second half is the one a hurried PR forgets.
 * `benchmarks/axes/weight.ts` records what happens to a ceiling nothing holds down: 3.5 -> 3.51 ->
 * 3.54 -> 3.55 -> 3.56 in one day, each raise correct and the sum nobody's decision.
 *
 * So `.sdlc/bands/claim-ratchets.json` carries each ceiling *and its history*, and this refuses:
 *
 *   1. a `ceiling` that is not the last step of its own history — the number the gates read is
 *      the number the history ends on;
 *   2. a step above the one before it, unless it cites a D-row **newer** than the step it raises
 *      — a raise is a decision, written down, not an edit;
 *   3. a decision the ledger does not have (one file per decision in `.sdlc/decisions/`);
 *   4. a history that rewrites or drops what is committed — the history is append-only, so the
 *      last value cannot be lowered in the file's memory to make a raise look like a fall.
 *
 * (4) reads the committed file with `git show HEAD:`, exactly as `release-budget-lock.test.ts`
 * does and for its reason: the only account of the old number that cannot be edited in the same
 * commit. Lowering needs nothing but a new step; `npm run ratchets:propose` prints it.
 *
 * Proven red on the introducing commit, one mutation each: the cac ceiling set to 2.4 with no
 * new step (rule 1), a second step at 2.4 citing D-157 again (rule 2), a step citing D-999
 * (rule 3), and the first step's ceiling edited to 2.5 against the committed file (rule 4).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { RATCHETS_FILE, type RatchetsDoc, readRatchets } from 'benchmarks/claim-ratchets.js';
import { CLAIMS } from 'benchmarks/claims.js';
import { describe, expect, it } from 'vitest';

import { DECISION_ID, readDecisions } from './ledgers.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const current = readRatchets(REPO_ROOT);
const ledger: ReadonlySet<string> = new Set(readDecisions(REPO_ROOT).entries.map((d) => d.id));
const readme = readFileSync(resolve(REPO_ROOT, 'README.md'), 'utf8');

/** The three D-157 names. Asserted present, so an emptied file cannot pass every rule vacuously. */
const D157 = ['cold-start-at-or-below-cac', 'lighter-than-cac', 'lighter-than-commander'];

/**
 * Which of two decisions is newer. A sequential id (`D-157`) orders by its number; a dated one
 * (`D-20260928-slug`, the only kind written since the ledger went one file per entry) orders by
 * its date, after every sequential id. Two dated ids from the same day are not ordered, so one
 * cannot raise a ceiling the other set — stricter, never looser.
 */
const DATED_AFTER_SEQUENTIAL = 1e9;
function decisionNumber(id: string): number {
  const m = DECISION_ID.exec(id);
  if (m === null) return Number.NaN;
  return m[1] === undefined ? DATED_AFTER_SEQUENTIAL + Number(`${m[2] ?? ''}${m[3] ?? ''}${m[4] ?? ''}`) : Number(m[1]);
}

/** The committed version, or nothing when the file is new in this commit. */
function committed(): RatchetsDoc | undefined {
  try {
    return JSON.parse(execFileSync('git', ['show', `HEAD:${RATCHETS_FILE}`], { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })) as RatchetsDoc;
  } catch {
    return undefined;
  }
}

/** Rules 1–3 on one ratchet, as the list of what is wrong with it — driven directly by the cases at the bottom. */
function stepProblems(id: string, ratchet: RatchetsDoc['ratchets'][string], decisions: ReadonlySet<string>): string[] {
  const problems: string[] = [];
  const { history } = ratchet;
  if (history.length === 0) return [`${id} has no history — a ceiling with no record of how it got there`];
  const last = history.at(-1);
  if (last?.ceiling !== ratchet.ceiling) problems.push(`${id}: ceiling ${String(ratchet.ceiling)} is not its last history step (${String(last?.ceiling)}). Move the ceiling by appending a step, never by editing the number`);
  history.forEach((step, i) => {
    if (!DECISION_ID.test(step.decision)) problems.push(`${id} step ${String(i)}: "${step.decision}" is not a decision id (D-NNN, or D-YYYYMMDD-slug)`);
    else if (!decisions.has(step.decision)) problems.push(`${id} step ${String(i)} cites ${step.decision}, which .sdlc/decisions/ has no row for`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(step.setOn)) problems.push(`${id} step ${String(i)}: setOn "${step.setOn}" is not a date`);
    if (step.why.trim().length < 20) problems.push(`${id} step ${String(i)} gives no reason`);
    const before = history[i - 1];
    if (before === undefined) return;
    if (step.setOn < before.setOn) problems.push(`${id} step ${String(i)} is dated before the step it follows`);
    if (step.ceiling > before.ceiling && !(decisionNumber(step.decision) > decisionNumber(before.decision))) {
      problems.push(`${id}: ${String(before.ceiling)} -> ${String(step.ceiling)} is a raise, and it cites ${step.decision}, no newer than ${before.decision}. A ratchet goes down; raising one takes a new decision in .sdlc/decisions/, cited here.`);
    }
  });
  return problems;
}

describe('the claim ratchets', () => {
  it('declares the three D-157 ratchets', () => {
    expect(Object.keys(current.ratchets).sort()).toEqual(expect.arrayContaining(D157));
  });

  it.each(Object.keys(current.ratchets))('%s is a declared claim, and the claim is the ceiling', (id) => {
    const claim = CLAIMS.find((c) => c.id === id);
    expect(claim, `${RATCHETS_FILE} ratchets "${id}", which benchmarks/claims.ts does not declare`).toBeDefined();
    expect(claim?.test.max, `${id}'s claim reads max ${String(claim?.test.max)} while its ratchet is ${String(current.ratchets[id]?.ceiling)}`).toBe(current.ratchets[id]?.ceiling);
    expect(claim?.claim, `${id}'s public wording should say it is a ratchet, not keep the bar it cannot meet`).toMatch(/ratchet/);
    expect(claim?.claim).toContain(`${String(current.ratchets[id]?.ceiling)}×`);
  });

  it.each(Object.keys(current.ratchets))("%s's README row states the ceiling it is held to", (id) => {
    // `readme:gates` writes the measured cell and the verdict; the claim cell is prose, so a
    // lowered ceiling would otherwise leave the row promising the old number.
    const row = readme.split('\n').find((line) => line.includes(`| \`${id}\` |`));
    expect(row, `README.md has no gate row for ${id}`).toBeDefined();
    expect(row?.split('|')[1], `README.md's ${id} row does not say "${String(current.ratchets[id]?.ceiling)}×"`).toContain(`${String(current.ratchets[id]?.ceiling)}×`);
  });

  it.each(Object.entries(current.ratchets))('%s only goes down, or cites a newer decision to go up', (id, ratchet) => {
    expect(stepProblems(id, ratchet, ledger)).toEqual([]);
  });

  it('keeps the committed history — steps are appended, never rewritten or dropped', () => {
    const before = committed();
    if (before === undefined) return; // the commit that introduces the file has nothing to compare
    const problems: string[] = [];
    for (const [id, old] of Object.entries(before.ratchets)) {
      const now = current.ratchets[id];
      if (now === undefined) {
        problems.push(`${id} was removed. Retiring a ratchet is a decision: record it, and change this lock in the same commit`);
        continue;
      }
      old.history.forEach((step, i) => {
        if (JSON.stringify(now.history[i]) !== JSON.stringify(step)) problems.push(`${id} step ${String(i)} differs from the committed one — history is append-only`);
      });
    }
    expect(problems).toEqual([]);
  });
});

/** A synthetic ratchet whose history is these `[ceiling, decision]` steps, in order. */
const ratchet = (ceilings: [number, string][]): RatchetsDoc['ratchets'][string] => ({
  ceiling: ceilings.at(-1)?.[0] ?? 0,
  unit: 'ratio',
  was: '<= 1',
  derive: { source: 'bundle', headroomBytes: 80, step: 0.05, rule: 'test' },
  history: ceilings.map(([ceiling, decision]) => ({ ceiling, decision, setOn: '2026-09-27', measured: ceiling, why: 'a step in a synthetic history' })),
});

describe('the rules themselves', () => {
  const decisions: ReadonlySet<string> = new Set(['D-157', 'D-158', 'D-20260928-a', 'D-20260928-b', 'D-20260929-c']);

  it('lets a ceiling fall under the same decision', () => {
    expect(stepProblems('x', ratchet([[2.35, 'D-157'], [2.3, 'D-157']]), decisions)).toEqual([]);
  });

  it('refuses a raise that cites no newer decision', () => {
    expect(stepProblems('x', ratchet([[2.35, 'D-157'], [2.4, 'D-157']]), decisions).join()).toContain('is a raise');
  });

  it('allows a raise that cites a newer decision the ledger has', () => {
    expect(stepProblems('x', ratchet([[2.35, 'D-157'], [2.4, 'D-158']]), decisions)).toEqual([]);
  });

  it('orders a dated decision after every sequential one, and by its date', () => {
    expect(stepProblems('x', ratchet([[2.35, 'D-158'], [2.4, 'D-20260928-a']]), decisions)).toEqual([]);
    expect(stepProblems('x', ratchet([[2.35, 'D-20260928-a'], [2.4, 'D-20260929-c']]), decisions)).toEqual([]);
    expect(stepProblems('x', ratchet([[2.35, 'D-20260928-a'], [2.4, 'D-20260928-b']]), decisions).join()).toContain('is a raise');
    expect(stepProblems('x', ratchet([[2.35, 'D-20260928-a'], [2.4, 'D-158']]), decisions).join()).toContain('is a raise');
  });

  it('refuses a decision the ledger does not have', () => {
    expect(stepProblems('x', ratchet([[2.35, 'D-157'], [2.4, 'D-999']]), decisions).join()).toContain('has no row');
  });

  it('refuses a ceiling moved without a step', () => {
    expect(stepProblems('x', { ...ratchet([[2.35, 'D-157']]), ceiling: 2.4 }, decisions).join()).toContain('is not its last history step');
  });
});
