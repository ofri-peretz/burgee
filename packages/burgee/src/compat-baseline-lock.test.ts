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
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { GRADED, type Graded } from './compat.js';

const BASELINE = resolve(fileURLToPath(new URL('..', import.meta.url)), '../compat-oracle/baseline');

function oracle(host: string): Graded {
  const { reference, passed, rate } = JSON.parse(readFileSync(resolve(BASELINE, `${host}.json`), 'utf8')) as Graded;
  return { reference, passed, rate };
}

/**
 * The control column of the published compatibility page, per host: `| **host** | `target` |
 * ours | rate | control | …`. That page is generated on ubuntu by `npm run compat:page`
 * and committed, so it is the one place the control's count is recorded.
 */
const PAGE = resolve(fileURLToPath(new URL('..', import.meta.url)), '../../apps/docs/content/docs/compatibility.mdx');
const CONTROL = new Map(
  [...readFileSync(PAGE, 'utf8').matchAll(/^\| \[?\*\*([\w@/-]+)\*\*(?:\]\([^)]*\))? \| `[^`]+` \| [^|]+ \| [\d.]+% \| (\d+) \/ \d+ \|/gmu)].map(([, host, control]) => [host!, Number(control)]),
);

describe('the graded numbers migrate reports', () => {
  it.each(Object.keys(GRADED))('%s matches the oracle baseline exactly', (host) => {
    const { reference, passed, rate } = GRADED[host] as Graded;
    expect({ reference, passed, rate }).toEqual(oracle(host));
  });

  // D-137: `control` decides whether `migrate` rewrites a host at all, so it is held to the
  // published page as tightly as the grade is held to the baseline.
  it.each(Object.keys(GRADED))('%s carries the control the compatibility page publishes', (host) => {
    expect(GRADED[host]?.control).toBe(CONTROL.get(host));
  });

  it('carries a row for every host the oracle has a baseline for, and no other', () => {
    // Restated 2026-09-23 (A12): it was commander and yargs, the two hosts `migrate`
    // rewrote. It now rewrites every level drop-in and reports the rest, so every graded
    // host needs its row — a mapping without one would print a blank where the grade goes.
    const baselines = readdirSync(BASELINE).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -'.json'.length));
    expect(Object.keys(GRADED).sort()).toEqual(baselines.sort());
  });

  it('reads a real baseline file and a real page, so the comparisons above cannot pass vacuously', () => {
    expect(oracle('commander').reference).toBeGreaterThan(0);
    expect(CONTROL.size).toBeGreaterThan(20);
  });
});
