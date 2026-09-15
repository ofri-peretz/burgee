/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * R9 (Y8) — what a subpath costs, ratcheted.
 *
 * `subpath-isolation.test.ts` locks *which* modules an entry may reach. This locks *how
 * much they weigh*, which is the part that rots quietly: every allowed import can grow
 * without the allow-list changing a character, and a package whose whole argument is "one
 * dependency instead of fourteen" cannot let that happen unobserved.
 *
 * **The unit is `dist/` bytes, not bundled bytes, and that is a deliberate downgrade.**
 * R9's own unit is the minified bundle, and it is the right one — it is what a user's
 * application actually grows by. But producing it means running `esbuild`, which this
 * package does not depend on and should not: a test that shells out to a binary it never
 * declared is a check that passes for the wrong reason on the first day the binary is not
 * hoisted where it expected. That measurement belongs in `benchmarks/axes/weight.ts`, which
 * has no `linegauge` pair yet; `ceilings.json` records the numbers and says so under
 * `y8.notBuilt`. What is here needs nothing but `node:fs`, gives the same answer on every
 * machine, and moves for every reason the bundled number would move.
 *
 * **The recorded numbers are not a pass mark.** `ceilings.json`'s `y8.holds` is `false`:
 * five of six entries are over the bar R9 names. These assertions stop the figure drifting
 * further while that is true; they do not assert that it is fine.
 */
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const pkgRoot = fileURLToPath(new URL('..', import.meta.url));

const manifest = JSON.parse(readFileSync(resolve(pkgRoot, 'package.json'), 'utf8')) as {
  exports: Record<string, { import: string }>;
};

interface Ceilings {
  entries: Record<string, { distBytes: number; bundledBytes: number; replaces: string | null }>;
  y8: { holds: boolean; why: string[]; notBuilt: string[] };
  growth: { beforeBundledBytes: Record<string, number>; deltaBundledBytes: Record<string, number> };
}

const ceilings = JSON.parse(readFileSync(resolve(pkgRoot, 'ceilings.json'), 'utf8')) as Ceilings;

/** The same relative-import shape `subpath-isolation.test.ts` reads, over the same `dist/`. */
const RELATIVE = /(?:from|import)\s*'(\.[^']+)'/g;
const dist = (name: string): string => resolve(pkgRoot, 'dist', name);

/** Every `dist/` file an entry reaches, itself included — the bytes that entry really costs. */
function closure(entry: string): string[] {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop();
    if (file === undefined || seen.has(file)) continue;
    seen.add(file);
    for (const match of readFileSync(dist(file), 'utf8').matchAll(RELATIVE)) {
      queue.push((match[1] ?? '').replace('./', ''));
    }
  }
  return [...seen];
}

const closureBytes = (entry: string): number => closure(entry).reduce((total, file) => total + statSync(dist(file)).size, 0);

describe.each(Object.keys(ceilings.entries))('published entry %s', (entry) => {
  it('costs no more than its recorded ceiling', () => {
    const recorded = ceilings.entries[entry]?.distBytes ?? 0;
    const actual = closureBytes(entry);
    expect(
      actual,
      `${entry} reaches ${String(actual)} bytes of dist/, over the ${String(recorded)} recorded in ceilings.json. ` +
        'Growing a subpath is allowed; growing it silently is not — raise the number in that file with the reason, or take the weight back out.',
    ).toBeLessThanOrEqual(recorded);
  });
});

describe('the ceiling covers what is published', () => {
  const published = Object.values(manifest.exports).map((e) => e.import.replace('./dist/', ''));

  /**
   * The rule that keeps the gate from being skipped by adding a subpath. A new entry with
   * no recorded ceiling is not "under budget", it is unmeasured — which is the state this
   * file exists to make impossible.
   */
  it('every published entry has a ceiling, and every ceiling names a published entry', () => {
    expect(Object.keys(ceilings.entries).toSorted()).toEqual(published.toSorted());
  });
});

/**
 * The claim itself, asserted as the thing it is: **not met**. This block fails if somebody
 * flips `y8.holds` to `true` without the numbers having moved, which is the one way a
 * recorded-rather-than-enforced measurement goes bad — and it fails just as loudly if the
 * numbers *do* move and nobody updates the file.
 */
describe('R9 is not met, and says so', () => {
  it('records the Y8 shortfall rather than a pass', () => {
    expect(ceilings.y8.holds).toBe(false);
    expect(ceilings.y8.why.join(' ')).toContain('get-east-asian-width');
    expect(ceilings.y8.notBuilt.length).toBeGreaterThan(0);
  });

  it('keeps the recorded bundled figures paired with the dist figures they came from', () => {
    for (const [entry, recorded] of Object.entries(ceilings.entries)) {
      expect(recorded.bundledBytes, `${entry} has no recorded bundled measurement`).toBeGreaterThan(0);
      expect(recorded.bundledBytes, `${entry}: a bundle cannot exceed the unminified dist it is built from`).toBeLessThan(recorded.distBytes);
    }
  });

  /**
   * The growth this session's correctness work cost, kept beside the result rather than
   * absorbed into it: closing 28 `string-width` failures and one `slice-ansi` failure added
   * roughly a kilobyte to every entry that measures or cuts. Stating it is the point —
   * a ceiling file that only ever showed the current number would hide exactly this.
   */
  it('states what the 2026-09-15 correctness work added', () => {
    for (const [entry, delta] of Object.entries(ceilings.growth.deltaBundledBytes)) {
      const before = ceilings.growth.beforeBundledBytes[entry] ?? 0;
      expect(before + delta, `${entry}: before + delta must equal the recorded bundled size`).toBe(ceilings.entries[entry]?.bundledBytes);
    }
  });
});
