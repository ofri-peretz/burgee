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
      const depRank = FAMILY_ORDER.indexOf(dep);
      return depRank === -1 || rank === -1 || depRank >= rank;
    });
    expect(offenders, `${pkg.name} may depend only on earlier family packages`).toEqual([]);
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
