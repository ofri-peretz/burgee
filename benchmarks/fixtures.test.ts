/**
 * Lock — the fixtures measure what they claim to.
 *
 * A cold-start fixture that stopped parsing, or a weight fixture that imported a symbol
 * the bundler could shake away, produces a beautiful number for nothing. `proveFixtures`
 * is the same function the perf axis runs before it times anything; running it here means
 * a broken fixture fails `npm test`, not just a benchmark nobody was watching.
 */
import { describe, expect, it } from 'vitest';

import { proveFixtures, VARIANTS } from './axes/perf.js';
import { DEFAULT_EXPORT, fixtureSource, PAIRS, ratioVariant, sideSource } from './fixtures/entry-points.js';

/**
 * Spawning fourteen processes takes 1 second here and 5.8 on a Windows runner, which is
 * past vitest's 5 s default. The generous timeout is deliberate and carries no meaning:
 * this asserts that the fixtures are *correct*, never that they are fast. The only place
 * a duration is allowed to decide anything in this suite is a ratio between two spawns
 * taken in the same run.
 */
const SPAWN_TIMEOUT_MS = 120_000;

describe('cold-start fixtures', () => {
  it(
    'all print the same line, and every one that claims a parser proves it honours --shout',
    () => {
      expect(() => {
        proveFixtures();
      }).not.toThrow();
    },
    SPAWN_TIMEOUT_MS,
  );

  it('includes the bare-node floor row, which intent constraint 5 makes mandatory', () => {
    expect(VARIANTS.some((v) => v.id === 'bare node' && !v.parses)).toBe(true);
  });

  it('gives every layered variant a host to be measured against', () => {
    for (const v of VARIANTS.filter((x) => x.host !== undefined)) {
      expect(VARIANTS.map((x) => x.id)).toContain(v.host);
    }
  });
});

describe('weight fixtures', () => {
  it('re-export the symbol they import, so the bundler cannot shake away the subject', () => {
    expect(fixtureSource({ specifier: 'burgee', symbol: 'run' })).toBe("import { run } from \"burgee\";\nexport { run };\n");
    expect(fixtureSource({ specifier: 'ora', symbol: DEFAULT_EXPORT })).toBe('import x from "ora";\nexport default x;\n');
  });

  // controlroom W1: a side of several packages is one program, so a module two of them share is
  // bundled once — and it is named by every package it installs, so the row says what it weighed.
  it('bundle a side of several imports as one program, named by every package in it', () => {
    const w1 = PAIRS.find((p) => p.id === 'controlroom/ink') as (typeof PAIRS)[number];
    expect(sideSource(w1.ours)).toBe('import { render as x0 } from "controlroom/ink";\nimport x1 from "react";\nimport x2 from "react-reconciler";\nexport default [x0, x1, x2];\n');
    expect(sideSource(w1.incumbent)).toBe('import { render as x0 } from "ink";\nimport x1 from "react";\nexport default [x0, x1];\n');
    expect(ratioVariant(w1)).toBe('controlroom/ink + react + react-reconciler ÷ ink + react');
    for (const pair of PAIRS.filter((p) => p.ours.with === undefined && p.incumbent.with === undefined)) {
      expect(ratioVariant(pair), 'a one-import pair keeps the row name it always had').toBe(`${pair.id} ÷ ${pair.incumbent.specifier}`);
    }
  });

  // This read "no incumbent twice" until 2026-09-23. What it protected was one record per
  // incumbent; flagstaff R10 then needed its native `spinner`, `box` and `table` against the
  // same ora, boxen and cli-table3 its façades answer to. The axis now measures an incumbent
  // once and dedupes its rows (`uniqueRecords`), so the invariant is kept where it lives.
  it('pair each entry point with exactly one incumbent, and name every pair and claim once', () => {
    const ids = PAIRS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    const claims = PAIRS.map((p) => p.claim ?? `lighter-than-${p.incumbent.specifier}`);
    expect(new Set(claims).size, 'two pairs against one incumbent need an explicit `claim` id').toBe(claims.length);
    for (const pair of PAIRS) expect(pair.why).not.toBe('');
  });
});
