/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — a budget moves once per release, or it is not a budget.
 *
 * `benchmarks/axes/weight.ts` diagnosed this in its own comment and could not fix it:
 *
 *   > Three raises in one session means this stopped being a ratchet. A ceiling moved per
 *   > PR is a record of what happened, not a limit on it ... It wants a budget somebody
 *   > sets for a release rather than a number that follows the last commit.
 *
 * By the time that was written the number had gone 3.5 -> 3.51 -> 3.54 -> 3.55 -> 3.56 in a
 * day, each raise correct on its own and priced in its own commit, and the sum nobody's
 * decision. **Prose cannot stop that. A check can**, and this is the smallest one that does:
 * a value in `release-budgets.json` may change only in a commit that also changes `release`.
 *
 * It costs nothing to obey and cannot be obeyed by accident. Raising a budget becomes an
 * act of naming the release you are spending it on, which is exactly the deliberation the
 * per-PR raise was skipping — and if a release genuinely needs the room, the raise is one
 * line and one word.
 *
 * The previous state is read from `git show HEAD:` rather than from a second copy in the
 * repository, for the reason `control-bands.ts` reads git: the only account of what the
 * number used to be that cannot itself be edited in the same commit.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = '.sdlc/bands/release-budgets.json';

interface Budget {
  value: number;
  unit: string;
  why: string;
  derivedFrom: { band: string; observations: number; rule: string };
}
interface Budgets {
  release: string;
  setOn: string;
  budgets: Record<string, Budget>;
}

const current = JSON.parse(readFileSync(resolve(REPO_ROOT, FILE), 'utf-8')) as Budgets;

/** The committed version, or nothing when the file is new in this commit. */
function committed(): Budgets | undefined {
  try {
    return JSON.parse(execFileSync('git', ['show', `HEAD:${FILE}`], { cwd: REPO_ROOT, encoding: 'utf8' })) as Budgets;
  } catch {
    return undefined;
  }
}

describe('a release budget', () => {
  it('names the release it was set for, and when', () => {
    expect(current.release).toMatch(/\S/);
    expect(current.setOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('has at least one budget — otherwise every rule below is vacuous', () => {
    expect(Object.keys(current.budgets).length).toBeGreaterThan(0);
  });

  /**
   * A number with no derivation is a guess with a JSON schema. Every budget says which band
   * it came from, over how many observations, and by what rule — so the next person to move
   * it argues with the measurement rather than with whoever typed it.
   */
  it.each(Object.entries(current.budgets))('%s says where its number came from', (_id, budget) => {
    expect(budget.why.length, 'a budget without a reason is a ceiling with better manners').toBeGreaterThan(40);
    expect(budget.derivedFrom.band).toMatch(/\S/);
    expect(budget.derivedFrom.observations).toBeGreaterThanOrEqual(8);
    expect(budget.derivedFrom.rule).toMatch(/\S/);
  });

  /** The lock itself. */
  it('cannot change without the release changing in the same commit', () => {
    const before = committed();
    if (before === undefined) return; // the commit that introduces the file has nothing to compare

    const moved = Object.entries(current.budgets)
      .filter(([id, budget]) => before.budgets[id] !== undefined && before.budgets[id]?.value !== budget.value)
      .map(([id, budget]) => `${id}: ${String(before.budgets[id]?.value)} -> ${String(budget.value)}`);

    if (moved.length === 0) return;
    expect(
      current.release,
      `budgets moved (${moved.join('; ')}) while release stayed "${before.release}". A budget is set for a release: name the one you are spending it on, in this commit.`,
    ).not.toBe(before.release);
  });

  /**
   * The other half, and the one a hurried commit reaches for first: dropping a budget is not
   * a way to raise it. A removal has to be deliberate too, so it needs the same release bump.
   */
  it('cannot be deleted without the release changing either', () => {
    const before = committed();
    if (before === undefined) return;
    const gone = Object.keys(before.budgets).filter((id) => current.budgets[id] === undefined);
    if (gone.length === 0) return;
    expect(current.release, `budgets removed (${gone.join(', ')}) while release stayed "${before.release}"`).not.toBe(before.release);
  });
});
