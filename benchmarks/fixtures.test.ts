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
import { DEFAULT_EXPORT, fixtureSource, PAIRS } from './fixtures/entry-points.js';

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

  it('pair each entry point with exactly one incumbent, and no incumbent twice', () => {
    const incumbents = PAIRS.map((p) => p.incumbent.specifier);
    expect(new Set(incumbents).size).toBe(incumbents.length);
    for (const pair of PAIRS) expect(pair.why).not.toBe('');
  });
});
