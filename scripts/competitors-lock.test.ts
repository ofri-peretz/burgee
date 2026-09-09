/**
 * Competitor declaration lock — `upstream-watch` R1 and R2.
 *
 * A published number is a claim, and a claim nobody re-reads becomes false without an
 * event. `packages/<pkg>/competitors.json` is where a package names what it is measured
 * against; this lock is what stops that file and the numbers in the tree drifting apart.
 *
 * Three assertions, and the third is the one with teeth:
 *
 *   1. every subpath in the file is a real `exports` entry — a declaration for a subpath
 *      that does not exist is a watch on nothing;
 *   2. every entry names a package and a claim the watch knows how to make;
 *   3. **every competitor cited in a published comparison is declared.** A package name
 *      that appears in a weight rule or a README — which is where our byte figures are
 *      written down — and not in `competitors.json` is a number nobody will ever re-read.
 *
 * (3) is deliberately file-level rather than per-subpath. Mapping a name inside a comment
 * block back to the rule it belongs to means parsing comments, which breaks the first time
 * somebody reflows a paragraph; asking "is this competitor watched at all" needs no parsing
 * and catches the failure that actually happens, which is a competitor nobody watches.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PACKAGES = join(ROOT, 'packages');

const CLAIMS = new Set(['compat', 'weight', 'surface']);

/**
 * The packages we measure ourselves against, anywhere in the family. A name is only
 * searched for when it is on this list, so an incidental mention of, say, `node` in prose
 * cannot fail a build — and adding a competitor to a README means adding it here, which is
 * the moment somebody decides whether it is watched.
 */
const KNOWN = [
  'boxen',
  'chalk',
  'cli-boxes',
  'cli-spinners',
  'cli-table3',
  'clack',
  'get-east-asian-width',
  'inquirer',
  'log-update',
  'mimic-function',
  'ora',
  'picocolors',
  'signal-exit',
  'slice-ansi',
  'string-width',
  'wrap-ansi',
  'yoctocolors',
];

interface Entry {
  package: string;
  claim: string;
  seen: unknown;
}

interface Declared {
  name: string;
  dir: string;
  file: string;
  subpaths: Record<string, Entry[]>;
  exports: string[];
  /** Where a published comparison is written: the weight lock and the README. */
  citations: string[];
}

function declared(): Declared[] {
  return readdirSync(PACKAGES, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(PACKAGES, e.name, 'competitors.json')))
    .map((e) => {
      const dir = join(PACKAGES, e.name);
      const file = join(dir, 'competitors.json');
      const raw = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
      const subpaths = Object.fromEntries(Object.entries(raw).filter(([key]) => key.startsWith('./'))) as Record<string, Entry[]>;
      const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { exports?: Record<string, unknown> };
      return {
        name: e.name,
        dir,
        file,
        subpaths,
        exports: Object.keys(pkg.exports ?? {}),
        citations: ['src/weight.test.ts', 'README.md'].map((rel) => join(dir, rel)).filter((p) => existsSync(p)),
      };
    });
}

const found = declared();

/** Every competitor name this package writes into a published comparison. */
function cited(pkg: Declared): string[] {
  const text = pkg.citations.map((p) => readFileSync(p, 'utf8')).join('\n');
  // Not preceded by `/`: `roundel/chalk` is our own subpath, not a citation of chalk.
  return KNOWN.filter((name) => new RegExp(`(^|[^\\w/-])${name}\\b`).test(text));
}

/** Every competitor this package declares, across all its subpaths. */
const declaredNames = (pkg: Declared): string[] => [...new Set(Object.values(pkg.subpaths).flat().map((entry) => entry.package))];

describe('competitor declarations', () => {
  it('at least one package declares its competitors — otherwise this lock asserts nothing', () => {
    expect(found.map((p) => p.name)).not.toHaveLength(0);
  });

  it.each(found)('$name: every declared subpath is a real export', (pkg) => {
    for (const subpath of Object.keys(pkg.subpaths)) {
      expect(pkg.exports, `${pkg.name} declares competitors for ${subpath}, which it does not export`).toContain(subpath);
    }
  });

  it.each(found)('$name: every entry names a package and a claim the watch understands', (pkg) => {
    for (const [subpath, entries] of Object.entries(pkg.subpaths)) {
      expect(Array.isArray(entries), `${subpath} must hold a list`).toBe(true);
      for (const entry of entries) {
        expect(typeof entry.package, `${subpath}: an entry needs a package name`).toBe('string');
        expect([...CLAIMS], `${subpath} -> ${entry.package}: "${entry.claim}" is not a claim`).toContain(entry.claim);
      }
    }
  });

  it.each(found)('$name: every competitor it cites in a published comparison is declared', (pkg) => {
    const missing = cited(pkg).filter((name) => !declaredNames(pkg).includes(name));
    expect(missing, `${pkg.name} publishes a figure against ${missing.join(', ')} and watches ${missing.length === 1 ? 'it' : 'them'} nowhere — the number will go stale silently`).toEqual([]);
  });

  it.each(found)('$name: a `compat` claim names a host the oracle actually grades', (pkg) => {
    const hosts = readFileSync(join(PACKAGES, 'compat-oracle/src/hosts.ts'), 'utf8');
    for (const entry of Object.values(pkg.subpaths).flat()) {
      if (entry.claim !== 'compat') continue;
      expect(hosts, `${pkg.name} claims compat against ${entry.package}, which is not a host in compat-oracle`).toContain(`name: '${entry.package}'`);
    }
  });
});
