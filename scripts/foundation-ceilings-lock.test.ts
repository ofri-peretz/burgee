/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — every foundation layer has a Y8 ceiling, and the ceiling is measured.
 *
 * PLAN.md decision D1: of eighteen named incumbents only three ship zero dependencies, so
 * "at or under the lightest zero-dependency incumbent" is undefinable for four of the six
 * foundation layers. The ceiling is the incumbent's installed bytes **including its tree** —
 * what a user actually removes by switching.
 *
 * What this refuses is a ceilings file that drifts away from the packages it is about: a new
 * foundation package with no entry, an entry with no incumbents, or a ratio that disagrees
 * with the bytes beside it. It does not re-measure — `benchmarks/axes/weight.ts` owns that,
 * and a check that recomputed the number from the same code would agree with itself.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = join(ROOT, '.sdlc/bands/foundation-ceilings.json');

interface Layer {
  ours: number;
  incumbents: Record<string, number>;
  ceiling: number;
  ratio: number;
  unmeasured?: string[];
}

/** The tier this file is about, from `.sdlc/PLAN.md`'s own layer table. */
const FOUNDATION = ['linegauge', 'paratext', 'seniority', 'closeout', 'caique', 'bellpull'];

const read = (): { layers: Record<string, Layer> } => JSON.parse(readFileSync(FILE, 'utf8')) as { layers: Record<string, Layer> };

describe('foundation ceilings', () => {
  it('exists, because a ceiling nobody wrote down is a slogan', () => {
    expect(existsSync(FILE), `${FILE} is what PLAN.md D1 asks for`).toBe(true);
  });

  it('covers every foundation layer', () => {
    expect(FOUNDATION.filter((l) => !(l in read().layers))).toEqual([]);
  });

  it('names at least one incumbent per layer, since a ceiling is a comparison', () => {
    const empty = Object.entries(read().layers)
      .filter(([, l]) => Object.keys(l.incumbents).length === 0)
      .map(([name]) => name);
    expect(empty).toEqual([]);
  });

  it('agrees with itself: the ceiling is the sum, and the ratio is ours over it', () => {
    const wrong: string[] = [];
    for (const [name, l] of Object.entries(read().layers)) {
      const sum = Object.values(l.incumbents).reduce((a, b) => a + b, 0);
      if (sum !== l.ceiling) wrong.push(`${name}: ceiling ${String(l.ceiling)} is not the sum ${String(sum)}`);
      const ratio = Math.round((l.ours / l.ceiling) * 10_000) / 10_000;
      if (Math.abs(ratio - l.ratio) > 0.0001) wrong.push(`${name}: ratio ${String(l.ratio)} is not ${String(ratio)}`);
    }
    expect(wrong, 'a derived number that disagrees with what it was derived from is not a measurement').toEqual([]);
  });

  it('says so when an incumbent was not installed, rather than leaving it out silently', () => {
    // An absent incumbent understates the ceiling, which flatters us — so the file has to
    // admit it. paratext is the live case: `terminal-link` and `term-img` are not installed
    // here, and its ratio of 1.43 is therefore a *worse* number than the real one.
    const lying = Object.entries(read().layers)
      .filter(([, l]) => (l.unmeasured?.length ?? 0) > 0 && !JSON.stringify(l).includes('$unmeasured'))
      .map(([name]) => name);
    expect(lying).toEqual([]);
  });
});
