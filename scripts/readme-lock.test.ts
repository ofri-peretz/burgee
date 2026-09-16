/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * PLAN 5.2 — the generated half of every package README, locked.
 *
 * Two sections are written by `scripts/readme-benchmarks.ts` rather than by hand: `##
 * Benchmarks`, which quotes what was measured, and `## Where it sits`, which says which key
 * plugins register under and what is above and below the package in the family. Both are
 * derived — from `baseline/`, from `.sdlc/bands/foundation-ceilings.json`, from each
 * package's `export interface Plugin`, and from the manifests' own dependency edges.
 *
 * The reason they are generated is that this repository has already watched the hand-written
 * kind rot: the published compatibility table read `flagstaff/table` 0 / 29 for days after
 * the row graded 29 / 29, because nothing compared the two. A number in prose is a copy, and
 * a copy drifts silently — which is worse than being absent, because it still reads true.
 *
 * So the lock is not "the sections exist". It is that **a hand edit to either of them fails**,
 * which is 5.2's own done-condition, and the last test here proves that rather than asserting
 * it: it edits a README in memory and requires the check to notice.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { place, pluginKeys, rewrite, section } from './readme-benchmarks.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGES = join(ROOT, 'packages');
const readmes = (): string[] => readdirSync(PACKAGES).filter((p) => existsSync(join(PACKAGES, p, 'README.md')));
const read = (pkg: string): string => readFileSync(join(PACKAGES, pkg, 'README.md'), 'utf8');

describe('the generated half of every README matches what was measured', () => {
  it('has no package whose README drifted from the generator', () => {
    const drifted = readmes().filter((pkg) => rewrite(read(pkg), pkg) !== read(pkg));
    expect(drifted, 'run `npx tsx scripts/readme-benchmarks.ts`').toEqual([]);
  });

  it('gives every published package both sections', () => {
    // compat-oracle is internal tooling and gets no `Where it sits`; it is not one of the nine.
    const published = readmes().filter((p) => place(p) !== '');
    expect(published.length, 'the nine layers, minus any without a README yet').toBeGreaterThanOrEqual(9);
    for (const pkg of published) {
      expect(read(pkg), `${pkg} is missing its benchmark section`).toContain('## Benchmarks');
      expect(read(pkg), `${pkg} is missing its place in the family`).toContain('## Where it sits');
    }
  });

  it('states a plugin key that the package actually declares, not one written down twice', () => {
    // Derived by the generator, not re-derived here. This test used to read the `Plugin`
    // interface itself — a second copy of the same rule — and the two diverged the moment the
    // generator learned that `enforce` is not a key anything registers *under*: it orders
    // burgee's hooks. The lock then demanded a README sentence the generator was right not to
    // write. One definition, imported.
    for (const pkg of readmes().filter((p) => place(p) !== '')) {
      for (const key of pluginKeys(pkg)) expect(place(pkg), `${pkg} hosts \`${key}\` and its README does not say so`).toContain(`\`${key}\``);
    }
  });

  // The assertion the other three rest on: without this, a lock that never fails reads
  // exactly like a repository that never drifts.
  it('fails when a README is edited by hand', () => {
    const pkg = readmes().find((p) => place(p) !== '') as string;
    const byHand = read(pkg).replace('## Benchmarks', '## Benchmarks\n\nHand-written claim: twice as fast as everything.');
    expect(byHand, 'the edit did not apply, so this proves nothing').not.toBe(read(pkg));
    expect(rewrite(byHand, pkg), 'a hand edit survived the generator — the lock cannot catch one').toBe(read(pkg));
  });

  it('notices a hand-edited number in the place section too, not just the benchmark one', () => {
    const pkg = 'roundel';
    const tampered = read(pkg).replace('## Where it sits', '## Where it sits\n\nPlugins register under the `everything` key.');
    expect(tampered).not.toBe(read(pkg));
    expect(rewrite(tampered, pkg)).toBe(read(pkg));
  });
});

describe('the sections are derived, not stored', () => {
  it('builds a package section without reading that package README', () => {
    // `section()` and `place()` take a package name and nothing else. If either ever started
    // reading the README it is about, the lock above would compare a file to itself and pass
    // on anything — the failure mode this repository calls a check that cannot fail.
    expect(section('roundel')).toContain('## Benchmarks');
    expect(place('roundel')).toContain('`tokens`');
    expect(place('compat-oracle'), 'internal tooling is not one of the nine layers').toBe('');
  });
});
