/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — every package's `vitest.config.ts` hands the shared `coverage` to vitest.
 *
 * Found 2026-09-28: `bellpull`, `closeout` and `seniority` each had
 *
 *   import { coverage } from '../../vitest-coverage.config.js';
 *
 * at the top of their config, and never passed it into `test: { … }`. The import reads as
 * the policy being applied; it was not. `vitest run --coverage.enabled` then ran with
 * vitest's default reporters — no `lcov` — and none of the shared exclusions, so
 * `.github/workflows/codecov.yml`'s merge step (`packages/<pkg>/coverage/lcov.info`) found no
 * report for any of the three and left them out of the family's coverage number. Nothing
 * went red: the job merged the seven reports that existed, uploaded, and three components
 * read as unmeasured while their suites ran every Monday.
 *
 * `codecov-components.test.ts` already holds the two layers above this one — every package
 * has a component, and every package with tests has a `coverage` script. Neither could see
 * this: the script existed, it ran, it exited 0. The missing piece was one identifier inside
 * an object literal.
 *
 * The check is on the **evaluated** config, not the text: each config is imported and its
 * `test.coverage` must carry the shared object's own values — every key, by reference — and may
 * add only `thresholds`, which is how a package holds itself at 100% (`{ ...coverage, thresholds }`,
 * #710 onward). That still fails the unused import, a config with no import at all, a
 * `coverage: {}` placeholder, and an inlined copy — the last one because a copied `exclude`
 * array is a different array, and a copy is how the exclusion list silently drifts.
 */
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import { coverage } from '../vitest-coverage.config.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGES = join(REPO_ROOT, 'packages');

/** Every workspace under `packages/` — a manifest and sources. */
const packageDirs = readdirSync(PACKAGES, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .filter((name) => existsSync(join(PACKAGES, name, 'package.json')) && existsSync(join(PACKAGES, name, 'src')))
  .sort();

interface LoadedConfig {
  test?: { coverage?: unknown };
}

async function loadConfig(name: string): Promise<LoadedConfig> {
  // eslint-disable-next-line node-security/no-dynamic-dependency-loading -- importing is the assertion: the evaluated config is what vitest reads, and the path is a directory under packages/, never an input
  const mod = (await import(pathToFileURL(join(PACKAGES, name, 'vitest.config.ts')).href)) as {
    default: LoadedConfig;
  };
  return mod.default;
}

describe('package vitest configs pass the shared coverage policy', () => {
  it('reads the packages, so this cannot pass by reading nothing', () => {
    expect(packageDirs).toContain('burgee');
    expect(packageDirs).toContain('compat-oracle');
    expect(packageDirs.length).toBeGreaterThanOrEqual(10);
  });

  it('the shared policy still writes lcov — the one reporter codecov.yml merges', () => {
    expect(coverage.reporter).toContain('lcov');
  });

  it('every package has its own vitest.config.ts', () => {
    expect(
      packageDirs.filter((name) => !existsSync(join(PACKAGES, name, 'vitest.config.ts'))),
      'a package with no config runs on vitest defaults — no lcov, no shared exclusions',
    ).toEqual([]);
  });

  it.each(packageDirs)('%s passes `coverage` into test: { … }', async (name) => {
    const config = await loadConfig(name);

    const given = (config.test?.coverage ?? {}) as Record<string, unknown>;
    const why =
      `packages/${name}/vitest.config.ts does not pass the shared \`coverage\` — its run has ` +
      `no lcov reporter, so codecov.yml's merge step silently leaves it out of the family ` +
      `number. Pass \`coverage\` (or \`{ ...coverage, thresholds }\`) in \`test: { … }\`.`;
    // `thresholds` is the one key a package may replace — raising its own floor is the point.
    for (const [key, value] of Object.entries(coverage)) if (key !== 'thresholds') expect(given[key], `${why} (\`${key}\`)`).toBe(value);
    expect(Object.keys(given).filter((k) => !(k in coverage) && k !== 'thresholds'), `${why} — only \`thresholds\` may be added`).toEqual([]);
  });
});
