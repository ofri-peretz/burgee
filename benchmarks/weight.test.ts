/**
 * Lock — B4 measures the package it says it measures.
 *
 * This is here because the axis got it wrong, in CI, on this suite's first run. The
 * workspace root has **commander 8.3.0** hoisted as somebody's transitive dependency
 * while the version we grade against is **15.0.0**, in `benchmarks/node_modules`. The
 * CI cache did not carry that directory, the upward walk fell through to the root, and
 * the run reported commander at 29,275 bytes and a 2.0x ratio — a plausible number, a
 * red gate, and nothing but a `detail.version` field anywhere saying it had measured a
 * package from 2021.
 *
 * A benchmark that measures the wrong thing does not look broken. It looks like a
 * regression. So the version is checked against what `benchmarks/package.json` declares,
 * and a mismatch stops the run.
 */
import { describe, expect, it } from 'vitest';

import { satisfies } from './axes/weight.js';
import { PAIRS } from './fixtures/entry-points.js';
import manifest from './package.json' with { type: 'json' };

const declared: Record<string, string> = { ...manifest.dependencies, ...manifest.devDependencies };

describe('satisfies', () => {
  it('rejects the exact shadowing that happened: commander 8 where commander 15 is declared', () => {
    expect(satisfies('8.3.0', '^15.0.0')).toBe(false);
    expect(satisfies('15.0.0', '^15.0.0')).toBe(true);
  });

  it('honours a caret range within the major, and never across it', () => {
    expect(satisfies('18.1.0', '^18.0.0')).toBe(true);
    expect(satisfies('18.0.0', '^18.1.0')).toBe(false);
    expect(satisfies('19.0.0', '^18.0.0')).toBe(false);
  });

  it('treats an exact range as exact — ora and log-update are pinned on purpose', () => {
    expect(satisfies('8.0.0', '8.0.0')).toBe(true);
    expect(satisfies('8.0.1', '8.0.0')).toBe(false);
  });

  it('accepts anything for a workspace link, whose identity the symlink already fixes', () => {
    expect(satisfies('0.3.0', '*')).toBe(true);
  });

  it('throws on a range it does not understand, rather than passing it', () => {
    // A version check that quietly returns true for whatever it cannot parse is not a
    // check; it is the same failure this file exists to prevent, one level up.
    expect(() => satisfies('1.0.0', '>=1 <2')).toThrow(/does not know/);
  });
});

describe('the entry-point table', () => {
  it('declares every package it measures, so no version is whatever npm happened to hoist', () => {
    const measured = new Set(PAIRS.flatMap((p) => [p.ours.specifier, p.incumbent.specifier].map((s) => (s.startsWith('@') ? s.split('/').slice(0, 2).join('/') : (s.split('/')[0] as string)))));
    for (const name of measured) expect(declared[name], `${name} is measured by B4 but not declared in benchmarks/package.json`).toBeDefined();
  });

  it('pins the incumbents to the majors the oracle grades against', () => {
    expect(declared['commander']).toBe('^15.0.0');
    expect(declared['yargs']).toBe('^18.0.0');
  });
});
