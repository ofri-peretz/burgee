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
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
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
 * this order, so the arrows point one way.
 *
 * The order is the tier stack read bottom-up: foundation, then the output stack, then the
 * engine. Each layer consumes the layers below it and nothing above — `burgee` is last
 * because it is the top of the stack, the package that declares a command and then asks
 * every layer beneath it to render, colour and prompt.
 *
 * It used to run the other way, with `burgee` first and permitted no dependencies at all.
 * That is what let `contrast.ts` exist twice — the same WCAG luminance and ratio code, in
 * `burgee` and in `roundel`, differing only in which package name the error message says.
 * A rule that forbids the arrow does not remove the need; it converts it into a copy, which
 * is the one outcome principle 2 exists to prevent.
 *
 * Zero external dependencies is unchanged and is the claim that was ever worth making: what
 * a caller installs still comes from one repo and one supply chain to audit.
 */
const FAMILY_ORDER = [
  'linegauge',
  'seniority',
  'bellpull',
  'closeout',
  'paratext',
  'roundel',
  'flagstaff',
  'caique',
  'burgee',
];

/**
 * The foundation tier (`cli-foundation-stack`), which sits *below* the whole family and
 * depends on nothing but Node builtins.
 *
 * **Any family package may depend on it.** Y1 used to exempt `burgee` and `roundel` by
 * name — they "keep their own copy, because burgee has to install alone" — and the copy is
 * what that bought: `precedence.ts` and `config.ts`, 281 lines implementing the whole of
 * seniority's stated job, inside burgee, where the rule guaranteed they could never move.
 * A layer nobody above may use is not a layer; it is a suggestion.
 *
 * Reversing the FAMILY order was the other half of the same argument and landed first.
 * This is the half that frees the tier below it.
 *
 * The arrow still points one way, and that is the part worth enforcing: the foundation
 * depends on nothing, so no edge can come back up.
 */
/*
 * `paratext` was in neither list until 2026-09-16 — a gap rather than a decision, and one
 * nothing could see while no family package depended on it. `demand.ts`'s `LAYERS` has always
 * named nine layers and these two lists between them named eight. The first consumer (R12,
 * `flagstaff/box` and `flagstaff/table` linking a path) is what made the gap legible: the
 * edge read as "a dependency on a package outside the family", which it is not. It belongs
 * here, on the same terms as the other four — zero dependencies, nothing but Node builtins —
 * and the two `it.each(FOUNDATION)` cases below now grade it as the floor.
 */
const FOUNDATION = ['bellpull', 'closeout', 'linegauge', 'paratext', 'seniority'];

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
      // The foundation sits below everything, so an edge into it is always downward.
      if (FOUNDATION.includes(dep)) return false;
      const depRank = FAMILY_ORDER.indexOf(dep);
      return depRank === -1 || rank === -1 || depRank >= rank;
    });
    expect(offenders, `${pkg.name} may depend only on earlier family packages, or on the foundation tier`).toEqual([]);
  });

  // The owner's rule, 2026-09-23 (D-111): a published package depends on nothing outside this
  // repository — not as a dependency, not as a peer, not as an optional one. npm installs
  // peers and optional dependencies by default, so checking `dependencies` alone left two of
  // the three doors open; a package could have taken an external peer and passed.
  it('installs nothing from outside this repository — dependencies, peers or optional (D-111)', () => {
    const family = new Set(published.map((p) => p.pkg.name));
    const fields = [pkg.dependencies, pkg.peerDependencies, pkg.optionalDependencies];
    const external = fields.flatMap((f) => Object.keys(f ?? {})).filter((dep) => !family.has(dep));
    expect(external, `${pkg.name} would install ${external.join(', ')} from outside this repository`).toEqual([]);
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

  /*
   * The half of Y1 that survives its reversal, and the only half that was ever
   * load-bearing: the tier is a floor. A foundation package reaching back up to the family
   * would make the two mutually dependent and the "install it on its own" claim false.
   */
  it.each(FOUNDATION)('%s reaches nothing in the family: the arrow points one way', (name) => {
    const manifest = manifestOf(name);
    if (manifest === undefined) return; // a reserved name with no package yet is not a finding
    const upward = Object.keys(manifest.dependencies ?? {}).filter((d) => FAMILY_ORDER.includes(d));
    expect(upward, `${name} is the floor; nothing it depends on may sit above it`).toEqual([]);
  });
});
