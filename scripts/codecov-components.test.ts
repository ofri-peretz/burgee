import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Workspace lock — every package Codecov could report on has a component, and every
 * component points at a package that exists.
 *
 * A per-package coverage reading is only per-package while the list is complete. Add a
 * tenth package and its lines land in the repo total and nowhere else: the component
 * page still shows nine green rows, the new package's coverage is folded invisibly into
 * a number that barely moves, and nothing anywhere goes red. That is the failure this
 * exists to make loud — a missing component is not a smaller report, it is a report that
 * quietly stops answering the question it is there to answer.
 *
 * The other direction matters less but costs nothing: a component whose path no longer
 * exists carries its last reading forward forever, which reads as a package still being
 * measured after it was deleted.
 */

import { load } from 'js-yaml';
import { describe, it, expect } from 'vitest';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

interface CodecovConfig {
  component_management?: {
    individual_components?: { component_id: string; paths: string[] }[];
  };
}

/** Test files a package owns — what makes a `coverage` script able to produce anything. */
function testFileCount(name: string): number {
  const src = join(REPO_ROOT, 'packages', name, 'src');
  if (!existsSync(src)) return 0;
  return readdirSync(src, { recursive: true, withFileTypes: true }).filter(
    (e) => e.isFile() && e.name.endsWith('.test.ts'),
  ).length;
}

/** Whether the package's manifest declares the script `turbo run coverage` looks for. */
function hasCoverageScript(name: string): boolean {
  const manifest = JSON.parse(
    readFileSync(join(REPO_ROOT, 'packages', name, 'package.json'), 'utf-8'),
  ) as { scripts?: Record<string, string> };
  return typeof manifest.scripts?.coverage === 'string';
}

/** Directories under `packages/` that are real workspaces — a manifest and sources. */
function packageDirs(): string[] {
  const dir = join(REPO_ROOT, 'packages');
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter(
      (name) =>
        existsSync(join(dir, name, 'package.json')) && existsSync(join(dir, name, 'src')),
    )
    .sort();
}

describe('codecov components', () => {
  const config = load(
    readFileSync(join(REPO_ROOT, 'codecov.yml'), 'utf-8'),
  ) as CodecovConfig;
  const components = config.component_management?.individual_components ?? [];
  const declared = components.map((c) => c.component_id).sort();
  const packages = packageDirs();

  it('reads a component list and a set of packages to compare it against', () => {
    expect(components.length).toBeGreaterThan(0);
    expect(packages.length).toBeGreaterThan(0);
  });

  it('every package under packages/ has a component', () => {
    expect(
      packages.filter((p) => !declared.includes(p)),
      'a package with no component is folded into the repo total and reports nothing ' +
        'of its own — add it to codecov.yml',
    ).toEqual([]);
  });

  it('every component points at a package that exists', () => {
    expect(
      declared.filter((c) => !packages.includes(c)),
      'a component whose package is gone carries its last reading forward forever',
    ).toEqual([]);
  });

  it('every component glob matches its own package directory', () => {
    const wrong = components
      .filter((c) => c.paths.length !== 1 || c.paths[0] !== `packages/${c.component_id}/**`)
      .map((c) => `${c.component_id}: ${c.paths.join(', ')}`);

    expect(wrong, 'a component id and its path have to name the same package').toEqual([]);
  });
});

/**
 * The other half of the component lock — a component is only a reading if the package can
 * actually produce one.
 *
 * `turbo run coverage` skips a package with no `coverage` script silently and exits 0, so a
 * package with a full suite and no script reports nothing while every job stays green. That
 * is what happened between #193 and 2026-09-13: five of nine packages had no script, four
 * uploaded, and the component page showed four rows at 100% while `linegauge` and
 * `compat-oracle` — twelve and two test files respectively — were simply absent. Nothing was
 * red, and the number on the badge was measured over less than half the tree.
 *
 * The criterion is owning tests, not being publishable: `bellpull`, `closeout` and
 * `seniority` are seven-line name reservations with no suite yet, and a script there would
 * only add an empty report.
 */
describe('codecov reporting reaches every package that has tests', () => {
  it('a package with test files declares a coverage script', () => {
    const silent = packageDirs()
      .filter((name) => testFileCount(name) > 0 && !hasCoverageScript(name))
      .map((name) => `${name} (${String(testFileCount(name))} test files, no coverage script)`);

    expect(
      silent,
      'turbo skips a package with no `coverage` script without failing, so its suite runs ' +
        'and its lines never reach Codecov — add `"coverage": "vitest run --coverage.enabled"`',
    ).toEqual([]);
  });
});
