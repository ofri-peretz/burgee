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
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/** `foundation-ceilings.json` records ratios to four places; so does this file. */
const RATIO_PLACES = 4;

const pkgRoot = fileURLToPath(new URL('..', import.meta.url));

const manifest = JSON.parse(readFileSync(resolve(pkgRoot, 'package.json'), 'utf8')) as {
  exports: Record<string, { import?: string } | string>;
};

interface Ceilings {
  entries: Record<string, { distBytes: number; bundledBytes: number; replaces: string | null }>;
  y8: {
    holds: boolean;
    why: string[];
    notBuilt: string[];
    supersededBar: { name: string; bundledBytes: number; entriesClearing: number; entriesTotal: number };
  };
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
  // Code entries only: `./schema.json` maps to a plain string because it is data, and a data
  // export has no import graph to walk or bytes to budget as code.
  const published = Object.values(manifest.exports)
    .map((e) => (typeof e === 'string' ? undefined : e.import))
    .filter((file): file is string => file !== undefined)
    .map((file) => file.replace('./dist/', ''));

  /**
   * The rule that keeps the gate from being skipped by adding a subpath. A new entry with
   * no recorded ceiling is not "under budget", it is unmeasured — which is the state this
   * file exists to make impossible.
   */
  it('every published entry has a ceiling, and every ceiling names a published entry', () => {
    expect(Object.keys(ceilings.entries).toSorted()).toEqual(published.toSorted());
  });
});

/** What this package weighs against D1's ceiling — `layers.linegauge` in the band, and nowhere else. */
interface BandLayer {
  ours: number;
  ceiling: number;
  ratio: number;
}

const band = (): BandLayer =>
  (JSON.parse(readFileSync(resolve(pkgRoot, '../../.sdlc/bands/foundation-ceilings.json'), 'utf8')) as { layers: Record<string, BandLayer> }).layers['linegauge'] as BandLayer;

/**
 * Where `y8.holds` and the band disagree, as sentences — empty when they agree. Pure, so the
 * test below can feed it a regressed band and watch it object.
 */
function disagreements(holds: boolean, { ours, ceiling, ratio }: BandLayer): string[] {
  const wrong: string[] = [];
  if (holds !== ours <= ceiling) wrong.push(`y8.holds says ${String(holds)} while ${String(ours)} <= ${String(ceiling)} is ${String(ours <= ceiling)}`);
  if (Number((ours / ceiling).toFixed(RATIO_PLACES)) !== ratio) wrong.push(`the band's ratio ${String(ratio)} is not ours ÷ ceiling`);
  return wrong;
}

/**
 * The claim, asserted against the numbers rather than against a flag.
 *
 * This block used to read `expect(ceilings.y8.holds).toBe(false)` — the shortfall pinned so
 * that nobody could flip a boolean without the measurement moving. On 2026-09-16 the bar was
 * restated as D1's, in the integrator lane, on the reasoning §R9 of the design had already
 * written out; so the flag is now `true` and pinning it would assert the opposite tautology.
 *
 * What is pinned instead is the arithmetic. `holds` has to agree with `ours <= ceiling` as
 * `.sdlc/bands/foundation-ceilings.json` records them, and the superseded bar has to still be
 * there with its one-of-six count — a bar that is restated and then vanishes is
 * indistinguishable from one that was quietly met.
 *
 * The numbers are read from the band, not from a copy here. `ceilings.json` used to carry
 * `y8.measured`, a mirror of `layers.linegauge` that a test held equal to the band — so every
 * re-measure edited the same three lines in two files, and two branches that each moved
 * linegauge's weight conflicted in both. A copy that must equal its source checks nothing the
 * source does not; the last test here keeps it from coming back.
 */
describe('R9 holds against the bar D1 sets, and still records the one it replaced', () => {
  it('agrees with its own arithmetic rather than asserting a flag', () => {
    expect(disagreements(ceilings.y8.holds, band())).toEqual([]);
  });

  it('objects when the band says the package went over its ceiling and the flag did not follow', () => {
    const { ceiling } = band();
    const over = { ours: ceiling + 1, ceiling, ratio: Number(((ceiling + 1) / ceiling).toFixed(RATIO_PLACES)) };
    expect(disagreements(true, over)).toEqual([`y8.holds says true while ${String(ceiling + 1)} <= ${String(ceiling)} is false`]);
    const recorded = band();
    const offByOnePlace = { ...recorded, ratio: recorded.ratio + 0.0001 };
    expect(disagreements(recorded.ours <= recorded.ceiling, offByOnePlace), 'a ratio one place off is still wrong').toEqual([`the band's ratio ${String(offByOnePlace.ratio)} is not ours ÷ ceiling`]);
  });

  it('keeps no copy of the band, so there is one number to move and one line to conflict on', () => {
    expect(Object.keys(ceilings.y8), 'y8.measured is the band again — read `layers.linegauge` instead').not.toContain('measured');
  });

  it('still records the bar it replaced, and that one of six entries cleared it', () => {
    expect(ceilings.y8.supersededBar.name).toBe('get-east-asian-width');
    expect(ceilings.y8.supersededBar.entriesClearing).toBe(1);
    expect(ceilings.y8.why.join(' '), 'the restatement must say what it replaced').toContain('get-east-asian-width');
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

/** npm on Windows is `npm.cmd`, which Node will only spawn through a shell. Fixed argv, nothing to escape. */
const WINDOWS = process.platform === 'win32';
const packed = (): number =>
  (JSON.parse(execFileSync(WINDOWS ? 'npm.cmd' : 'npm', ['pack', '--dry-run', '--json'], { cwd: pkgRoot, encoding: 'utf8', shell: WINDOWS, stdio: ['ignore', 'pipe', 'pipe'] })) as { unpackedSize: number }[])[0]?.unpackedSize ?? 0;

describe('the ceilings file', () => {
  it(
    'tracks the band: what this package weighs is what the ceilings file says it weighs',
    () => {
      // Added 2026-10-05: five of the six band layers had no test holding `ours`, and four of
      // them were stale on main. The band follows the package; either moving alone goes red here.
      const ours = packed();
      const { ours: recordedOurs, ceiling, ratio: recordedRatio } = band();
      expect({ ours, ratio: Number((ours / ceiling).toFixed(4)) }, 'the package and its recorded weight disagree — run `npm run weight:converge`').toEqual({
        ours: recordedOurs,
        ratio: recordedRatio,
      });
    },
    120_000,
  );
});
