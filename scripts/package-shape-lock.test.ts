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
  .map((dir) => ({ dir, pkg: JSON.parse(readFileSync(join(root, 'packages', dir, 'package.json'), 'utf8')) as Pkg }))
  .filter(({ pkg }) => pkg.private !== true);

/** Node has these natively now (util.styleText, fs.glob, fetch, util.parseArgs). */
const BANNED = ['chalk', 'picocolors', 'glob', 'node-fetch', 'minimist'];

describe.each(published)('published package $pkg.name', ({ dir, pkg }) => {
  it('has no runtime dependencies at all (K1)', () => {
    expect(Object.keys(pkg.dependencies ?? {})).toEqual([]);
  });

  it('is ESM, requires Node >= 24, and declares no legacy main (K2)', () => {
    expect(pkg.type).toBe('module');
    expect(pkg.engines?.node?.startsWith('>=24')).toBe(true);
    expect(pkg.main).toBeUndefined();
  });

  it('exposes types, import and default on every entry, so CommonJS can require() it (K2)', () => {
    const entries = Object.entries(pkg.exports ?? {}).filter(([k]) => k !== './package.json');
    expect(entries.length).toBeGreaterThan(0);
    for (const [entry, target] of entries) {
      expect(typeof target, `${entry} must be a conditions object`).toBe('object');
      const conditions = target as Record<string, string>;
      expect(Object.keys(conditions).sort(), entry).toEqual(['default', 'import', 'types']);
      expect(conditions['default'], `${entry}: default must be the same ESM file as import`).toBe(conditions['import']);
    }
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
