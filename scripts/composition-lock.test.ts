/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Every package except `burgee` is used by another package in the family.
 *
 * `layer-boundaries-lock.test.ts` is the negative half of PRINCIPLES rule 14 — no package does
 * a job a sibling exists to do. This is the positive half, and it turns out to be the one that
 * was failing. Measured the day it was written:
 *
 *     burgee     → linegauge, roundel, seniority
 *     flagstaff  → linegauge, roundel
 *     caique, paratext, closeout, bellpull → used by nothing, using nothing
 *
 * Five edges in a nine-package family. Four packages wired to nothing at all, and one job —
 * putting the cursor back however the process dies — implemented **three times**, in
 * `closeout/cursor.ts`, `flagstaff/cursor.ts` and `caique/raw.ts`, by three files each of which
 * argues in its own comments that a second copy is the danger.
 *
 * A layer nothing else uses has never been proven to fit the stack. The family splits nine ways
 * so a program can adopt one layer without the other eight — but if the framework itself does
 * not compose them, the split is a directory layout and the fit is an assumption.
 *
 * So this is a ratchet, the same shape as the compat rates: `edges` may only go up, and
 * `awaiting` — the packages with no consumer yet — may only shrink. A package must leave that
 * list the moment it gains a consumer, which is what stops the list from becoming a place to
 * park the problem.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BAND = join(ROOT, '.sdlc/bands/composition.json');

/** The top of the stack. Nothing using it is correct, so it is never `awaiting`. */
const TOP = 'burgee';

interface Band {
  edges: number;
  awaiting: string[];
  why: Record<string, string>;
}

const band = (): Band => JSON.parse(readFileSync(BAND, 'utf8')) as Band;

/** The nine layers, read from the file that already declares them. */
function family(): string[] {
  const src = readFileSync(join(ROOT, 'packages/compat-oracle/src/demand.ts'), 'utf8');
  const body = /export const LAYERS: Layer\[\] = \[([\s\S]*?)\n\];/.exec(src)?.[1] ?? '';
  return [...body.matchAll(/pkg: '([^']+)'/g)].map((m) => m[1] as string);
}

/** Which family packages this one declares — a manifest edge, not an import. */
function uses(pkg: string): string[] {
  const m = JSON.parse(readFileSync(join(ROOT, 'packages', pkg, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
  };
  return Object.keys({ ...m.dependencies, ...m.peerDependencies }).filter((d) => family().includes(d));
}

const consumers = (pkg: string): string[] => family().filter((other) => other !== pkg && uses(other).includes(pkg));
const edges = (): number => family().reduce((n, p) => n + uses(p).length, 0);

describe('the family composes', () => {
  it('reads nine layers, or says so instead of passing on nothing', () => {
    expect(family(), 'LAYERS moved or changed shape — this lock is measuring nothing').toHaveLength(9);
  });

  it('has at least as many edges as the last time this was recorded', () => {
    // A number that only goes up. Removing a composition is allowed — but it is a deliberate
    // edit to the band file, reviewed, not something that happens by deleting an import.
    expect(edges(), `edges fell to ${String(edges())}; if that is intended, lower it in ${BAND} and say why`).toBeGreaterThanOrEqual(band().edges);
  });

  it.each(family().filter((p) => p !== TOP))('%s is used by another package, or is declared as awaiting one', (pkg) => {
    const used = consumers(pkg);
    if (band().awaiting.includes(pkg)) {
      expect(band().why[pkg], `${pkg} is awaiting a consumer without saying why`).toBeTruthy();
      return;
    }
    expect(used, `nothing in the family uses ${pkg} — either wire it, or add it to awaiting in ${BAND} with a reason`).not.toEqual([]);
  });

  it('keeps `awaiting` honest — a package that gained a consumer must leave the list', () => {
    // Without this the list is a place to park the problem: a package could be wired up and
    // still sit there, and the ratchet would never notice the work was done.
    const stale = band().awaiting.filter((pkg) => consumers(pkg).length > 0);
    expect(stale, `these now have consumers and must be removed from awaiting in ${BAND}`).toEqual([]);
  });

  it('never lists the top of the stack as awaiting', () => {
    expect(band().awaiting, 'nothing using burgee is correct — it is the framework').not.toContain(TOP);
  });

  it('names every awaiting package in the family', () => {
    expect(band().awaiting.filter((p) => !family().includes(p)), 'awaiting names a package that is not a layer').toEqual([]);
  });
});
