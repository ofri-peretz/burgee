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
