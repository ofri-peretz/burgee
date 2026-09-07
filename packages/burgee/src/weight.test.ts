/**
 * K6/B4 — weight is paid per import, never per config.
 *
 * Selecting commander-, yargs- or native-shaped burgee is an *import specifier*,
 * resolved by the bundler, not a runtime `config.mode`. A runtime flag would ship
 * every front-end to every user and decline to execute two of them — full weight,
 * no benefit (competitor map §6). Separate entry points mean a user who imports
 * `burgee` never has commander or yargs in their bundle, and tree-shaking works
 * because there is nothing to shake: the bytes were never pulled in.
 *
 * This walks the import graph of every entry point in `exports` and asserts what
 * each may reach. The important property is the last test: **an entry point
 * cannot be added without declaring its budget here**, so this lock grows with the
 * package instead of rotting behind it.
 *
 * It reads `dist/`, so it measures what is published rather than what is written.
 */
import { readFileSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const pkgRoot = fileURLToPath(new URL('..', import.meta.url));
const dist = resolve(pkgRoot, 'dist');

interface Manifest {
  exports: Record<string, { import: string }>;
}

// Read rather than import: the published entry list is data here, and a JSON
// import would reach out of src/ for it.
const manifest = JSON.parse(readFileSync(resolve(pkgRoot, 'package.json'), 'utf8')) as Manifest;

interface EntryRule {
  /** Bare specifiers this entry may import. The host front-ends will name their peer. */
  allow: string[];
  /** Bytes reachable from it. A ratchet: lowering is free, raising is a decision. */
  budget: number;
  /** Modules this entry must never reach, whatever else changes. */
  denied: string[];
}

const RULES: Record<string, EntryRule> = {
  // The engine. Imports nothing at all, and never drags the harness in.
  // Raised from 12,000 on 2026-09-07, deliberately and once: the entry now reaches
  // the execution core and the manifest, which is the whole engine and is what
  // `import 'burgee'` should give you. 12 KB against commander's 232 KB installed.
  '.': { allow: [], budget: 20_000, denied: ['testing.js', 'testing-helpers.js'] },
  // The harness. Test-time only, so a user's shipped CLI never pays for it.
  './testing': { allow: [], budget: 24_000, denied: [] },
  // `allow: []` is the point: the compat front-ends *implement* the incumbents'
  // surfaces over our engine, they do not wrap the real packages, so they import
  // nothing either (J9). Real commander and yargs live only in compat-oracle, which
  // is private and never reaches a user.
  // Raised from 24,000 on 2026-09-07, deliberately and once: the front-end is commander 15
  // ported method for method (graded 1,327/1,331 by commander's own suite), and 24,000 was
  // a placeholder from before it existed. 128,000 is commander's own lib/ (126,365 B), so
  // the lock still proves the front-end is no heavier than the package it replaces.
  // `import 'burgee'` reaches none of it (entry `.` above).
  './commander': { allow: [], budget: 128_000, denied: ['testing.js', 'testing-helpers.js'] },
  // './yargs': { allow: [], budget: 24_000, denied: ['testing.js', 'testing-helpers.js'] },
};

const SPECIFIER = /(?:from|import)\s*\(?\s*'([^']+)'/g;

function walk(entry: string): { reached: string[]; external: string[]; bytes: number } {
  const files = new Set<string>();
  const external = new Set<string>();
  const queue = [entry];
  let bytes = 0;

  while (queue.length > 0) {
    const file = queue.pop();
    if (file === undefined || files.has(file)) continue;
    files.add(file);
    bytes += statSync(file).size;
    for (const match of readFileSync(file, 'utf8').matchAll(SPECIFIER)) {
      const spec = match[1] ?? '';
      if (spec.startsWith('.')) queue.push(resolve(dirname(file), spec));
      else if (spec !== '' && !spec.startsWith('node:')) external.add(spec);
    }
  }
  return { reached: [...files].map((f) => relative(dist, f)), external: [...external], bytes };
}

function entryFile(subpath: string): string {
  const conditions = manifest.exports[subpath];
  if (conditions === undefined) throw new Error(`no exports entry for ${subpath}`);
  return resolve(pkgRoot, conditions.import);
}

describe.each(Object.keys(RULES))('entry %s', (subpath) => {
  const rule = RULES[subpath] as EntryRule;
  const graph = walk(entryFile(subpath));

  it('imports only what its rule allows', () => {
    expect(graph.external.sort()).toEqual([...rule.allow].sort());
  });

  it('reaches nothing on its denied list', () => {
    for (const denied of rule.denied) expect(graph.reached).not.toContain(denied);
  });

  it('stays inside its byte budget', () => {
    expect(graph.bytes).toBeLessThanOrEqual(rule.budget);
  });
});

describe('the lock grows with the package', () => {
  it('every published entry point declares a weight rule', () => {
    // Adding `burgee/commander` without a budget here fails, which is the point:
    // a new surface cannot ship until someone has said what it may weigh.
    expect(Object.keys(manifest.exports).sort()).toEqual(Object.keys(RULES).sort());
  });
});
