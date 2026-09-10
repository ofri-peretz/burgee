import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Packaging lock — cli-packaging R1, R2, R3 (floor K1, K2, K3).
 *
 * Every published package must be installable into anyone's tree without dragging a
 * dependency in, loadable from ESM and CommonJS alike, and free of the packages Node now
 * ships natively. Read from package.json and src/, so it needs no build.
 */
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

interface Pkg {
  name: string;
  private?: boolean;
  type?: string;
  main?: string;
  engines?: { node?: string };
  dependencies?: Record<string, string>;
  exports?: Record<string, string | Record<string, string>>;
}

const published = readdirSync(join(root, 'packages'))
  // A directory with no package.json is build residue, not a package (a folded-away
  // workspace leaves its dist/ behind); it is not graded and must not crash the lock.
  .filter((dir) => existsSync(join(root, 'packages', dir, 'package.json')))
  .map((dir) => ({ dir, pkg: JSON.parse(readFileSync(join(root, 'packages', dir, 'package.json'), 'utf8')) as Pkg }))
  .filter(({ pkg }) => pkg.private !== true);

/**
 * U1 / U6 (cli-output-stack): zero *external* dependencies. A published package may depend
 * only on another package published from this repo, and only on one that sits earlier in
 * this order, so the arrows point one way: burgee → ∅, roundel → ∅, flagstaff → roundel,
 * caique → roundel, flagstaff.
 */
const FAMILY_ORDER = ['burgee', 'roundel', 'flagstaff', 'caique'];

/**
 * The foundation tier (`cli-foundation-stack`), which sits *below* the whole family and
 * depends on nothing but Node builtins.
 *
 * Y1 is not "earlier in the order" and cannot be expressed by prepending these to
 * `FAMILY_ORDER`: that would admit a `burgee` → foundation edge, which Y1 forbids by name.
 * The rule has two halves and needs both — **`flagstaff` and `caique` may depend on a
 * foundation package; `burgee` and `roundel` may not.** burgee keeps its own copy of any
 * shared logic on purpose, because it has to install alone.
 *
 * Written when `linegauge` took `width` and `wrap` out of `flagstaff` (F1) and this lock
 * refused the edge — correctly, since until then it had no idea the tier existed. Y1 asked
 * for exactly this ("extended to refuse a `burgee` → foundation edge by name") and nothing
 * had built it.
 */
const FOUNDATION = ['bellpull', 'closeout', 'linegauge', 'seniority'];
/** The two that sit above the line, and so may reach down to it (Y1). */
const MAY_USE_FOUNDATION = new Set(['flagstaff', 'caique']);

/** Node has these natively now (util.styleText, fs.glob, fetch, util.parseArgs). */
const BANNED = ['chalk', 'picocolors', 'glob', 'node-fetch', 'minimist'];

/**
 * A subpath that names a data file rather than a module. `./package.json` is Node's own
 * convention and handled separately; everything else ending `.json` is a payload a caller
 * reads — flagstaff's plugin schema is the first.
 */
const isDataExport = (subpath: string): boolean => subpath.endsWith('.json');

/** Every module entry is a full conditions object, so a `require()` finds the same file. */
function checkCodeExports(exports: Record<string, unknown>): void {
  const entries = Object.entries(exports).filter(([k]) => k !== './package.json' && !isDataExport(k));
  expect(entries.length).toBeGreaterThan(0);
  for (const [entry, target] of entries) {
    expect(typeof target, `${entry} must be a conditions object`).toBe('object');
    const conditions = target as Record<string, string>;
    expect(Object.keys(conditions).sort(), entry).toEqual(['default', 'import', 'types']);
    expect(conditions['default'], `${entry}: default must be the same ESM file as import`).toBe(conditions['import']);
  }
}

/**
 * A data export is a plain path, and has to be: there is no `types` for a JSON file and no
 * `import` condition distinct from `default`. It gets the assertion that does apply — it
 * points at a `.json` inside `dist/`, so what a caller reads is what was published.
 */
function checkDataExports(exports: Record<string, unknown>): void {
  for (const [entry, target] of Object.entries(exports).filter(([k]) => isDataExport(k))) {
    expect(typeof target, `${entry} is data; it takes a path, not a conditions object`).toBe('string');
    expect(String(target), entry).toMatch(/^\.\/dist\/.+\.json$/);
  }
}

describe.each(published)('published package $pkg.name', ({ dir, pkg }) => {
  it('has no external runtime dependencies, and same-repo ones only point up the family (K1, U1, U6)', () => {
    const rank = FAMILY_ORDER.indexOf(pkg.name);
    const offenders = Object.keys(pkg.dependencies ?? {}).filter((dep) => {
      if (FOUNDATION.includes(dep)) return !MAY_USE_FOUNDATION.has(pkg.name);
      const depRank = FAMILY_ORDER.indexOf(dep);
      return depRank === -1 || rank === -1 || depRank >= rank;
    });
    expect(offenders, `${pkg.name} may depend only on earlier family packages, or — if it is flagstaff or caique — on the foundation tier`).toEqual([]);
  });

  it('is ESM, requires Node >= 24, and declares no legacy main (K2)', () => {
    expect(pkg.type).toBe('module');
    expect(pkg.engines?.node?.startsWith('>=24')).toBe(true);
    expect(pkg.main).toBeUndefined();
  });

  it('exposes types, import and default on every code entry, so CommonJS can require() it (K2)', () => {
    checkCodeExports(pkg.exports ?? {});
  });

  it('publishes any data export as a plain path into dist (K2)', () => {
    checkDataExports(pkg.exports ?? {});
  });

  it('imports none of the packages Node ships natively (K3)', () => {
    const src = join(root, 'packages', dir, 'src');
    if (!existsSync(src)) return;
    const offenders: string[] = [];
    for (const file of readdirSync(src).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))) {
      const text = readFileSync(join(src, file), 'utf8');
      for (const name of BANNED) {
        if (new RegExp(`from ['"]${name}['"]`).test(text)) offenders.push(`${file} -> ${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

/**
 * Y1's other half, which the per-package check above cannot state: a foundation package
 * depends on nothing at all, and `burgee` never depends on one. Asserted over the manifests
 * directly rather than through `published`, so it holds for a foundation package whose
 * `private` flag or publish state changes.
 */
describe('the foundation tier (Y1)', () => {
  const manifestOf = (name: string): { dependencies?: Record<string, string> } | undefined => {
    const file = join(root, 'packages', name, 'package.json');
    return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf-8')) as { dependencies?: Record<string, string> }) : undefined;
  };

  it('is not empty — otherwise every assertion below passes by having nothing to check', () => {
    expect(FOUNDATION.filter((n) => manifestOf(n) !== undefined).length).toBeGreaterThan(0);
  });

  it.each(FOUNDATION)('%s depends on nothing: it is the floor', (name) => {
    const manifest = manifestOf(name);
    if (manifest === undefined) return; // a reserved name with no package yet is not a finding
    expect(Object.keys(manifest.dependencies ?? {})).toEqual([]);
  });

  it.each(['burgee', 'roundel'])('%s never depends on a foundation package — it keeps its own copy (Y1)', (name) => {
    const manifest = manifestOf(name);
    expect(manifest, `${name} should exist`).toBeDefined();
    const reached = Object.keys(manifest?.dependencies ?? {}).filter((d) => FOUNDATION.includes(d));
    expect(reached, `${name} has to install alone; the shared logic is copied, and Y1 says the copies share a test-vector file instead`).toEqual([]);
  });
});
