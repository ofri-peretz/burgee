/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — PLAN 5.1: every package README points at the measured numbers, and the numbers in it
 * are the measured ones.
 *
 * The failure this exists for already happened once: the published compatibility table said
 * `flagstaff/table` 0 / 29 for days after the row was graded 29 / 29, because the page was
 * generated and nothing compared it to what generated it. A README is the same shape of
 * artifact, ten times over.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { rewrite } from './readme-benchmarks.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGES = join(ROOT, 'packages');

const readmes = (): string[] => readdirSync(PACKAGES).filter((pkg) => readdirSync(join(PACKAGES, pkg)).includes('README.md'));

describe('README benchmark sections', () => {
  it('every package README links the published page', () => {
    const missing = readmes().filter((pkg) => !readFileSync(join(PACKAGES, pkg, 'README.md'), 'utf8').includes('/benchmarks'));
    expect(missing, 'a package whose README cites no measurement is a package making unchecked claims').toEqual([]);
  });

  it('matches what was measured, so a hand edit goes red', () => {
    const drifted = readmes().filter((pkg) => {
      const text = readFileSync(join(PACKAGES, pkg, 'README.md'), 'utf8');
      return rewrite(text, pkg) !== text;
    });
    expect(drifted, 'run `npx tsx scripts/readme-benchmarks.ts` — these sections are generated').toEqual([]);
  });
});
