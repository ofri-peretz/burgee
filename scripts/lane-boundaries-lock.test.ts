/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — a path belongs to one lane, and every plan step belongs to one lane.
 *
 * Ten sub-agents can run at once only while that is true. Two lanes owning one path is a
 * merge conflict scheduled in advance; a plan step owned by nobody is work that never gets
 * picked up, and a step owned by two is the same work done twice and merged against itself.
 *
 * This is the check for `.sdlc/LANES.md`, which is otherwise prose that sounds organised.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { prompt } from './dispatch-lanes.js';
import { forbidden, type Lane, lanes, owns, shared } from './lanes.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LANES_MD = readFileSync(resolve(ROOT, '.sdlc/LANES.md'), 'utf-8');
const PLAN_MD = readFileSync(resolve(ROOT, '.sdlc/PLAN.md'), 'utf-8');
const LANE_NAMES = new Set(lanes().map((l) => l.name));

/** Dotted step ids compared segment by segment: `2.5.0` < `2.5.1` < `2.14`. */
const compare = (a: string, b: string): number => {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
};

/** Step ids from PLAN.md's bullets, and the ones the ownership table accounts for. */
const planSteps = (): string[] => [...PLAN_MD.matchAll(/^- \*\*(\d[\w.]*)/gm)].map((m) => m[1] as string);
/** A row may name a range (`2.2-2.13`, `2.5.0-2.5.5`); both ends count as owned. */
const ownedSteps = (): string[] =>
  [...LANES_MD.matchAll(/^\| (\d[\w.]*)(?:[–-]([\d.]+))? /gm)].flatMap((m) => (m[2] === undefined ? [m[1] as string] : [m[1] as string, m[2]]));

/** Step ids a row claims more than once. */
function ownedTwice(): string[] {
  const counts = new Map<string, number>();
  for (const id of ownedSteps()) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts].filter(([, n]) => n > 1).map(([id]) => id);
}

/**
 * Whether some row covers this step — named, or inside a range it declares.
 *
 * A row covering `2.2-2.13` owns `2.2`; one covering `2.5.0-2.5.5` owns `2.5.1` through
 * `2.5.4` too. Compared segment by segment rather than by string prefix, or `2.5` would
 * silently own `2.50`.
 */
function owned(id: string): boolean {
  const named = ownedSteps();
  if (named.some((o) => id === o || id.startsWith(`${o}.`) || o.startsWith(`${id}.`))) return true;
  return [...LANES_MD.matchAll(/^\| (\d[\w.]*)[–-]([\d.]+) /gm)].some(([, lo, hi]) => compare(id, lo as string) >= 0 && compare(id, hi as string) <= 0);
}

describe('the one path every lane may write', () => {
  /**
   * `.sdlc/LANES.md` grants every lane its own changeset, and for a year the script did not
   * implement it: `--check` called each lane's changeset a stray, so every lane was told to
   * ignore the result of its own boundary check — which makes the check worth nothing. A rule
   * stated in the document and absent from the enforcement is exactly the drift this file is
   * about, committed by the file that enforces it.
   */
  it('grants the changeset the document says it grants, read from the document', () => {
    expect(shared(), 'LANES.md stopped granting `.changeset/*.md`, or stopped saying so where the parser looks').toContain('.changeset/*.md');
  });

  it('lets any lane write its own changeset', () => {
    for (const lane of lanes()) expect(owns(lane, '.changeset/whatever-this-lane-did.md'), `${lane.name} cannot write a changeset`).toBe(true);
  });

  it('does not turn the exemption into a hole', () => {
    const output = lanes().find((l) => l.name === 'output') as Lane;
    // Narrow on both axes: the directory alone is not enough, and neither is the extension.
    expect(owns(output, '.changeset/config.json'), 'the changeset directory is not open season').toBe(false);
    expect(owns(output, '.changeset/nested/thing.md'), '`*` does not cross a slash').toBe(false);
    expect(owns(output, 'packages/burgee/src/execute.ts'), 'another lane’s file').toBe(false);
  });
});

describe('lane boundaries', () => {
  it('no path is owned by two lanes', () => {
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const lane of lanes()) {
      for (const glob of lane.owns) {
        const first = seen.get(glob);
        if (first !== undefined) clashes.push(`${glob} is claimed by both ${first} and ${lane.name}`);
        else seen.set(glob, lane.name);
      }
    }
    expect(clashes, 'two lanes on one path is a merge conflict scheduled in advance').toEqual([]);
  });

  it('every package has a lane that owns it', () => {
    const unowned = readdirSync(resolve(ROOT, 'packages')).filter((pkg) => !lanes().some((l) => owns(l, `packages/${pkg}/src/index.ts`)));
    expect(unowned, 'a package no lane owns is a package no agent may touch').toEqual([]);
  });

  it('every plan step is owned exactly once', () => {
    expect(ownedTwice(), 'a step owned twice is work merged against itself').toEqual([]);
    expect(planSteps().filter((id) => !owned(id)), 'a step nobody owns is a step nobody starts').toEqual([]);
  });

  it('names a lane for every row, and only lanes that exist', () => {
    const named = [...LANES_MD.matchAll(/^\| \d[^|]*\|[^|]*\| ([\w*]+)/gm)].map((m) => m[1] as string);
    expect(named.length, 'every step row names a lane').toBeGreaterThanOrEqual(20);
    // `**owner**` and `**person**` are the two steps no agent may take — 0.3, a repository
    // setting, and 5.3, an adopter. Bolded in the table so they read as the exception.
    const unknown = named.map((n) => n.replaceAll('*', '')).filter((n) => !LANE_NAMES.has(n) && n !== 'owner' && n !== 'person' && n !== 'each');
    expect(unknown, 'a step assigned to a lane that does not exist is unassigned').toEqual([]);
  });

  it('no lane owns a path the table forbids to every lane', () => {
    const bad = lanes()
      .filter((l) => l.name !== 'integrator')
      .flatMap((l) => forbidden().filter((f) => owns(l, f.replace(/\*\*$/, 'x'))).map((f) => `${l.name} owns forbidden ${f}`));
    expect(bad).toEqual([]);
  });

  it('every lane prompt renders every one of its steps', () => {
    // The lock was green while `2.2-2.13` — twelve vendored suites, the largest step in the
    // plan — rendered as "no PLAN.md paragraph" in all six package lanes. A consistent
    // mapping is not a usable prompt; this reads what a sub-agent would actually be given.
    const broken = lanes()
      .filter((l) => prompt(l).includes('no PLAN.md paragraph'))
      .map((l) => l.name);
    expect(broken, 'a step with no paragraph is a step with no "Done when"').toEqual([]);
  });

  it('the working tree obeys the lane the branch names', () => {
    const branch = execFileSync('git', ['branch', '--show-current'], { cwd: ROOT, encoding: 'utf8' }).trim();
    const lane = lanes().find((l) => l.branch === branch);
    if (lane === undefined) return; // not a lane branch; this repo's own plumbing branches are not lanes
    const changed = execFileSync('git', ['diff', '--name-only', 'origin/main...HEAD'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
    expect(changed.filter((p) => !owns(lane, p))).toEqual([]);
  });
});
