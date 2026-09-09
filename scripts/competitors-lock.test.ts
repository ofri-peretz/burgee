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
  'commander',
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
  'yargs',
  'yoctocolors',
];

interface Entry {
  package: string;
  claim: string;
  /** The npm package, when it is not the name we call it by. */
  registry?: string;
  /** The competitor whose resolved tree this figure is itemised from. */
  via?: string;
  seen: { version?: string | null; registry?: string; shasum?: string } | null;
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

/**
 * A measured figure: a comma-grouped byte count, a number with a byte unit, or a version.
 *
 * This is what separates a *citation* from a mention. A README that says "chalk and ora
 * disagree about the same terminal" is prose; one that says "chalk 16,727" is a claim with
 * a number in it, and only the second goes stale when upstream ships. Requiring the figure
 * on the same line is crude and it is right about every case in this repo — checked against
 * all six matches the first version produced, four of which were an issue reference, a
 * sentence about behaviour, and two example values in a code sample.
 */
const FIGURE = /\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?\s*(?:B|KB|MB|bytes)\b|\d+\.\d+(?:\.\d+)?/;

/** Every competitor name this package writes into a published comparison. */
function cited(pkg: Declared): string[] {
  const lines = pkg.citations.flatMap((path) => readFileSync(path, 'utf8').split('\n')).filter((line) => FIGURE.test(line));
  // Not preceded by `/`: `roundel/chalk` is our own subpath, not a citation of chalk.
  return KNOWN.filter((name) => lines.some((line) => new RegExp(`(^|[^\\w/-])${name}\\b`).test(line)));
}

/** Every competitor this package declares, across all its subpaths. */
const declaredNames = (pkg: Declared): string[] => [...new Set(Object.values(pkg.subpaths).flat().map((entry) => entry.package))];

const declaredEntries = (pkg: Declared): Entry[] => Object.values(pkg.subpaths).flat();

/**
 * Names whose npm package is *not* the same string, so a bare fetch would get the wrong
 * package. Listed rather than detected: confirming it needs the network, and a name only
 * lands here because somebody looked. `clack` is the one we found — npm's `clack` is an
 * unrelated placeholder at 0.1.0 and the prompts library is `@clack/prompts`.
 */
const AMBIGUOUS = new Set(['clack']);

/** The fourteen the intent's success criteria name. */
const REQUIRED = [
  'boxen', 'chalk', 'clack', 'cli-boxes', 'cli-spinners', 'cli-table3', 'commander',
  'inquirer', 'log-update', 'ora', 'picocolors', 'string-width', 'wrap-ansi', 'yargs',
];

/** Declared names whose npm package differs and which compat-oracle does not map. */
function unmapped(pkg: Declared): string[] {
  const source = readFileSync(join(PACKAGES, 'compat-oracle/src/competitors.ts'), 'utf8');
  return declaredEntries(pkg)
    .filter((entry) => entry.registry === undefined && AMBIGUOUS.has(entry.package))
    .filter((entry) => !source.includes(`${entry.package}: '`))
    .map((entry) => entry.package);
}

/** `via` targets that are not declared in the same subpath as the entry itemising them. */
function orphanedVia(pkg: Declared): string[] {
  const orphans: string[] = [];
  for (const [subpath, entries] of Object.entries(pkg.subpaths)) {
    const here = new Set(entries.map((e) => e.package));
    for (const entry of entries) {
      if (entry.via !== undefined && !here.has(entry.via)) orphans.push(`${subpath}: ${entry.package} via ${entry.via}`);
    }
  }
  return orphans;
}

/** Recorded fingerprints that do not say which package and which tarball produced them. */
function withoutProvenance(pkg: Declared): string[] {
  return declaredEntries(pkg)
    .filter((entry) => entry.seen !== null && entry.seen.version !== null && entry.seen.version !== undefined)
    .filter((entry) => typeof entry.seen?.registry !== 'string' || !/^[0-9a-f]{40}$/.test(entry.seen.shasum ?? ''))
    .map((entry) => entry.package);
}

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

  /**
   * The reverse direction, and the reason it is here: `commander` and `yargs` were missing
   * from KNOWN when this lock was written, so burgee's citations were checked against
   * nothing and the engine's own numbers — the roadmap's first bet — were unwatched while
   * the lock reported green. A list that can silently omit a competitor needs a guard that
   * a declaration cannot outrun it.
   */
  it.each(found)('$name: every competitor it declares is on the KNOWN list', (pkg) => {
    const unknown = declaredNames(pkg).filter((name) => !KNOWN.includes(name));
    expect(unknown, `${pkg.name} declares ${unknown.join(', ')}, which KNOWN does not list — nothing would search for ${unknown.length === 1 ? 'it' : 'them'}`).toEqual([]);
  });

  /**
   * The gap this intent was opened to close. Every competitor named in the success criteria
   * must be declared *somewhere* in the family — the watch is only as wide as the declarations
   * it reads, and a competitor nobody declares is a claim nobody re-reads.
   */
  it('the fourteen competitors the intent names are all declared somewhere', () => {
    const everywhere = new Set(found.flatMap((pkg) => declaredNames(pkg)));
    const missing = REQUIRED.filter((name) => !everywhere.has(name));
    expect(missing, `no package declares ${missing.join(', ')} — the watch would not cover ${missing.length === 1 ? 'it' : 'them'}`).toEqual([]);
  });

  /**
   * A declared name the watch cannot turn into an npm package is worse than an unwatched
   * competitor: it is a fetch we would get *wrong*. `clack` is the live example — the npm
   * package under that exact name is an unrelated placeholder at 0.1.0, and the prompts
   * library is `@clack/prompts`. `NPM_NAME` in compat-oracle is where that decision is
   * recorded, and this asserts the declaration can never outrun it.
   */
  it.each(found)('$name: every competitor it declares resolves to a confirmed npm package', (pkg) => {
    // Either the bare name is its own npm package, or compat-oracle maps it. A name that is
    // neither would be fetched as itself, which is the clack failure exactly.
    expect(unmapped(pkg), `${pkg.name} declares a competitor whose npm package differs from its name and is not mapped in compat-oracle's NPM_NAME`).toEqual([]);
  });

  /**
   * An itemised figure is read out of its parent's resolved tree, so the parent has to be
   * watched too — otherwise the number moves when the parent's resolution moves and nothing
   * fetches the tree that would show it.
   */
  it.each(found)('$name: every `via` names a competitor declared in the same subpath', (pkg) => {
    expect(orphanedVia(pkg), `${pkg.name} itemises a figure out of a tree it does not watch`).toEqual([]);
  });

  /**
   * A fingerprint has to say what it fingerprinted. A `seen` block with a version but no
   * record of which npm package or which tarball produced it is a number with no provenance
   * — and this repo has already shipped a benchmark that resolved a hoisted package and
   * reported a plausible figure.
   */
  it.each(found)('$name: every recorded fingerprint names the package and tarball it came from', (pkg) => {
    expect(withoutProvenance(pkg), `${pkg.name} holds a fingerprint that cannot be traced to a tarball`).toEqual([]);
  });

  it.each(found)('$name: a `compat` claim names a host the oracle actually grades', (pkg) => {
    const hosts = readFileSync(join(PACKAGES, 'compat-oracle/src/hosts.ts'), 'utf8');
    for (const entry of Object.values(pkg.subpaths).flat()) {
      if (entry.claim !== 'compat') continue;
      expect(hosts, `${pkg.name} claims compat against ${entry.package}, which is not a host in compat-oracle`).toContain(`name: '${entry.package}'`);
    }
  });
});
