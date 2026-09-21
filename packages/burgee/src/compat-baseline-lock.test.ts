/**
 * Lock — A7. The compat figures `burgee migrate` prints are the oracle's, not a template's.
 *
 * `src/compat.ts` is a copy of `packages/compat-oracle/baseline/<host>.json`, and it has to
 * be a copy: the oracle is `private: true` and is never published, so a user who installs
 * `burgee` has no baseline directory for the command to read. A copy with nothing checking
 * it is exactly the failure this repository has already shipped — the published table said
 * `flagstaff/table` 0 / 29 for days after the row was graded 29 / 29, because nothing
 * compared the two.
 *
 * So this compares the two. It reads the baseline as **text**, never imports it, for the
 * reason `exit-code-lock.test.ts` gives about locks that import across layers: an import
 * here would build the coupling the private package exists to avoid.
 *
 * **The fourth named mutation of `migrate.test.ts` is killed here**: change `passed` in
 * `compat.ts` to anything the oracle did not measure and this goes red, whatever the
 * report prints.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { GRADED, type Graded } from './compat.js';

const BASELINE = resolve(fileURLToPath(new URL('..', import.meta.url)), '../compat-oracle/baseline');

function oracle(host: string): Graded {
  const { reference, passed, rate } = JSON.parse(readFileSync(resolve(BASELINE, `${host}.json`), 'utf8')) as Graded;
  return { reference, passed, rate };
}

describe('the graded numbers migrate reports', () => {
  it.each(Object.keys(GRADED))('%s matches the oracle baseline exactly', (host) => {
    expect(GRADED[host]).toEqual(oracle(host));
  });

  it('carries a row for every host migrate can rewrite, and no other', () => {
    // A row without a mapping would claim a migration path that does not exist; a mapping
    // without a row would print a blank where the measurement goes.
    expect(Object.keys(GRADED).sort()).toEqual(['commander', 'yargs']);
  });

  it('reads a real baseline file, so the comparison above cannot pass vacuously', () => {
    expect(oracle('commander').reference).toBeGreaterThan(0);
  });
});
