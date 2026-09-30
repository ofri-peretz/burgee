/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — a B5 runtime ratchet only goes down (D-20260929-b5-runtime-ratchets).
 *
 * B5 holds every entry point to "at least as fast as the incumbent it replaces", and most pairs
 * started far above it: the gate is a ceiling just above the measurement, lowered by each PR that
 * makes a pair faster. A ceiling nothing holds down drifts up one reasonable raise at a time —
 * `benchmarks/axes/weight.ts` records 3.5 -> 3.51 -> 3.54 -> 3.55 -> 3.56 in one day — so this
 * file refuses, with the rules the D-157 claim ratchets use (`ratchet-steps.ts`):
 *
 *   1. a `ceiling` that is not the last step of its own history;
 *   2. a step above the one before it, unless it cites a newer decision;
 *   3. a decision `.sdlc/decisions/` does not have;
 *   4. a history that rewrites or drops what is committed (against `git show HEAD:`);
 *
 * and two of its own: a pair `benchmarks/axes/runtime.ts` measures with no ratchet, or a ratchet
 * for a pair it does not measure (either way a gate reads a number nobody set); and a target
 * above 1.0, which would call "slower than the incumbent" the goal.
 */
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PAIRS } from 'benchmarks/axes/runtime.js';
import { readRuntimeRatchets, RUNTIME_RATCHETS_FILE, type RuntimeRatchetsDoc } from 'benchmarks/runtime-ratchets.js';
import { describe, expect, it } from 'vitest';

import { readDecisions } from './ledgers.js';
import { stepProblems } from './ratchet-steps.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const current = readRuntimeRatchets(REPO_ROOT);
const ledger: ReadonlySet<string> = new Set(readDecisions(REPO_ROOT).entries.map((d) => d.id));

/** The committed version, or nothing when the file is new in this commit. */
function committed(): RuntimeRatchetsDoc | undefined {
  try {
    return JSON.parse(execFileSync('git', ['show', `HEAD:${RUNTIME_RATCHETS_FILE}`], { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })) as RuntimeRatchetsDoc;
  } catch {
    return undefined;
  }
}

describe('the B5 runtime ratchets', () => {
  it('cover exactly the pairs the axis measures', () => {
    expect(Object.keys(current.ratchets).toSorted()).toEqual(PAIRS.map((p) => p.id).toSorted());
  });

  it.each(Object.entries(current.ratchets))('%s aims at or below the incumbent', (_id, ratchet) => {
    expect(ratchet.target).toBeLessThanOrEqual(1);
    expect(ratchet.derive.headroom).toBeGreaterThanOrEqual(1);
    expect(ratchet.derive.step).toBeGreaterThan(0);
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
