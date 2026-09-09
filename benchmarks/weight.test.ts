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
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { join, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

import { PAIRS } from './fixtures/entry-points.js';
import manifest from './package.json' with { type: 'json' };
import { BENCH_ROOT, packageDir, satisfies } from './resolve.js';

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

/**
 * The second thing this axis got wrong, and the more expensive one: `installedBytes`
 * resolved every transitive dependency from `benchmarks/` instead of from the directory
 * of the package that depends on it, and deduplicated by package *name*. `boxen` came out
 * at 353,976 bytes against 747,463 actually on disk — published, in the PR table and at
 * `/docs/benchmarks`.
 *
 * The fix skips nested `node_modules` in `dirBytes` and reaches each nested package
 * through the dependency graph instead. That is only correct while every nested directory
 * *is* reachable that way; if one is not, its bytes vanish and the number is quietly small
 * again — the exact failure being fixed, in the other direction. So this walks the real
 * trees and fails if anything is unreachable, rather than trusting the argument.
 */
describe('installed bytes count every copy on disk, once', () => {
  const measured = [...new Set(PAIRS.map((p) => p.incumbent.specifier))];

  /** The closure `installedBytes` visits: same walk, same dedup key, no byte counting. */
  function closure(name: string, from = BENCH_ROOT, seen = new Set<string>()): Set<string> {
    const { dir } = packageDir(name, from);
    const key = realpathSync(dir);
    if (seen.has(key)) return seen;
    seen.add(key);
    const manifest_ = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { dependencies?: Record<string, string> };
    for (const dep of Object.keys(manifest_.dependencies ?? {})) closure(dep, dir, seen);
    return seen;
  }

  /** Every `node_modules` entry inside the closure that the closure did not itself reach. */
  function unreached(name: string): string[] {
    const seen = closure(name);
    const missed: string[] = [];
    for (const dir of seen) {
      const nested = join(dir, 'node_modules');
      if (!existsSync(nested)) continue;
      for (const entry of readdirSync(nested)) {
        if (entry.startsWith('.')) continue;
        const paths = entry.startsWith('@') ? readdirSync(join(nested, entry)).map((k) => join(nested, entry, k)) : [join(nested, entry)];
        for (const candidate of paths) if (!seen.has(realpathSync(candidate))) missed.push(candidate);
      }
    }
    return missed;
  }

  it.each(measured)('%s: every nested install is reached through the dependency graph', (name) => {
    expect(unreached(name), `nested under ${name} but not reachable from its dependencies — its bytes would go uncounted`).toEqual([]);
  });

  it('distinguishes two installed copies of the same package, which a user pays for twice', () => {
    // boxen is the case that made the published number 2.1x wrong: three separate
    // string-width directories, collapsed to one by a name-keyed `seen` set.
    const copies = [...closure('boxen')].filter((d) => d.endsWith(`${sep}string-width`));
    expect(copies.length).toBeGreaterThan(1);
  });
});
