/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — no suite in this repository reads the developer's colour environment.
 *
 * `FORCE_COLOR=1` in a shell turned ten assertions in `flagstaff/cli-table3` and
 * `flagstaff/ora` red while CI stayed green, because CI's environment is neutral. Green where
 * merges are decided and red where work happens is the worst arrangement a test can have: it
 * cost a session of bisecting, a wrong accusation against a merged PR, and a false claim
 * written into a code comment that `main` was broken.
 *
 * `vitest-colour-setup.ts` fixes it for every suite that exists. This keeps it fixed for every
 * suite that will: a new package with its own `vitest.config.ts` and no setup file inherits
 * the shell again, silently, and nothing else in the repo would notice.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SETUP = 'vitest-colour-setup.ts';

/** Every vitest config in the repo: the root's, and one per package that has tests. */
function configs(): string[] {
  const found = [join(ROOT, 'vitest.root.config.ts')];
  for (const pkg of readdirSync(join(ROOT, 'packages'), { withFileTypes: true })) {
    if (!pkg.isDirectory()) continue;
    const config = join(ROOT, 'packages', pkg.name, 'vitest.config.ts');
    // A package with no tests has nothing to pin; one with tests and no config is the thing
    // this would miss, so that case is asserted separately below.
    if (existsSync(config)) found.push(config);
  }
  return found;
}

describe('the colour environment is pinned, not inherited', () => {
  const all = configs();

  it('finds the configs — an empty sweep passes every rule below', () => {
    expect(all.length).toBeGreaterThan(5);
  });

  it.each(all.map((c) => c.slice(ROOT.length + 1)))('%s loads the colour setup', (relative) => {
    expect(
      readFileSync(join(ROOT, relative), 'utf-8').includes('colour-setup'),
      `${relative} does not load ${SETUP}, so its suites inherit whatever FORCE_COLOR the shell exports`,
    ).toBe(true);
  });

  it('every package with tests has a config to pin', () => {
    const unpinned: string[] = [];
    for (const pkg of readdirSync(join(ROOT, 'packages'), { withFileTypes: true })) {
      if (!pkg.isDirectory()) continue;
      const src = join(ROOT, 'packages', pkg.name, 'src');
      if (!existsSync(src)) continue;
      const hasTests = readdirSync(src).some((f) => f.endsWith('.test.ts'));
      if (hasTests && !existsSync(join(ROOT, 'packages', pkg.name, 'vitest.config.ts'))) unpinned.push(pkg.name);
    }
    expect(unpinned, 'a package with tests and no vitest config runs under the ambient environment').toEqual([]);
  });

  /**
   * And the setup has to actually do it. A file that is loaded everywhere and sets nothing is
   * the same bug wearing a lock.
   */
  it('the setup neutralises colour rather than merely existing', () => {
    const source = readFileSync(join(ROOT, SETUP), 'utf-8');
    expect(source).toContain("process.env['NO_COLOR'] = '1'");
    expect(source).toContain("process.env['FORCE_COLOR'] = '0'");
    // It runs at import, not on a call somebody has to remember to make.
    expect(source).toMatch(/^neutralColour\(\);$/m);
  });

  /** The state it produces, observed from inside a suite it set up. */
  it('is in force right now, whatever the shell said', () => {
    expect(process.env['NO_COLOR']).toBe('1');
    expect(process.env['FORCE_COLOR']).toBe('0');
    expect(process.env['COLORTERM']).toBeUndefined();
  });
});
