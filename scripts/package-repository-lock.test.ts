/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — every published package points npm at its own folder in this repo.
 *
 * npm's "Repository" link, provenance checks and tools that open a package's source all read
 * `repository.url` + `repository.directory`. A manifest copied from a sibling that keeps the
 * sibling's directory sends readers to the wrong code, and nothing else notices. Checked on npm
 * for all 12 published packages on 2026-11-15: correct; this keeps it so.
 *
 * Proven by changing one package's `repository.directory`: this fails.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const REPO = 'https://github.com/ofri-peretz/burgee';

const published = readdirSync(join(ROOT, 'packages'))
  .filter((dir) => existsSync(join(ROOT, 'packages', dir, 'package.json')))
  .map((dir) => ({
    dir,
    pkg: JSON.parse(readFileSync(join(ROOT, 'packages', dir, 'package.json'), 'utf8')) as {
      name: string;
      private?: boolean;
      repository?: unknown;
      bugs?: { url?: string };
      homepage?: string;
    },
  }))
  .filter(({ pkg }) => pkg.private !== true);

describe('published packages point npm at their own folder', () => {
  it('finds the published packages', () => {
    expect(published.length).toBeGreaterThan(10);
  });

  it.each(published)('$pkg.name', ({ dir, pkg }) => {
    expect(pkg.repository).toEqual({ type: 'git', url: `git+${REPO}.git`, directory: `packages/${dir}` });
    expect(pkg.bugs?.url).toBe(`${REPO}/issues`);
    expect(pkg.homepage).toMatch(/^https:\/\//);
  });
});
