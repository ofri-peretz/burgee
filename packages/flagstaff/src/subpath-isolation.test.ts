/**
 * R7 — each subpath costs only itself. Conditional weight is a lock, not a convention:
 * this reads every published `dist/` entry and asserts the relative imports it may carry.
 * Importing `flagstaff/loop` never loads the plugin registry; the spinner reads the registry
 * and never the loop. Add a cross-import and this goes red. Mirrors roundel's lock.
 *
 * It reads `dist/`, so it measures what is published rather than what is written.
 */
import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const pkgRoot = fileURLToPath(new URL('..', import.meta.url));

interface Manifest {
  sideEffects: boolean;
  exports: Record<string, { import: string }>;
}
const manifest = JSON.parse(readFileSync(resolve(pkgRoot, 'package.json'), 'utf8')) as Manifest;

/** The only edges allowed. `projection` and `builtins` are leaves; the schema is data. */
const ALLOWED: Record<string, string[]> = {
  'loop.js': ['./projection.js'],
  'plugin.js': ['./builtins.js', './schema.json'],
  'spinner.js': ['./plugin.js'],
  'index.js': ['./box.js', './loop.js', './plugin.js', './progress.js', './spinner.js', './table.js', './tasks.js'],
  // The façade stands apart on purpose: it reads the corpus and the width function and
  // nothing else in the package, so `flagstaff/ora` and `flagstaff` share no code path and
  // a program on one pays nothing for the other (R6, R10).
  'ora.js': ['./spinners.json', './width.js'],
  // The two façades share the width function and nothing else; `wrap.js` is the ANSI-aware
  // wrapper `box` and `table` will need next, which is why it is its own module.
  'log-update.js': ['./wrap.js'],
  // The built-ins: `progress` is self-contained, `tasks` reads the registry for its glyphs
  // and its spinner style, and `box` and `table` are string functions over the same two
  // modules — never over each other.
  'progress.js': [],
  'tasks.js': ['./plugin.js'],
  'box.js': ['./width.js', './wrap.js'],
  'table.js': ['./width.js', './wrap.js'],
};

const RELATIVE = /(?:from|import)\s*'(\.[^']+)'/g;

function relativeImports(file: string): string[] {
  return [...readFileSync(file, 'utf8').matchAll(RELATIVE)].map((m) => m[1] ?? '').sort();
}

describe.each(Object.entries(manifest.exports))('entry %s', (_, { import: entry }) => {
  const file = basename(entry);

  it('carries only its allowed relative imports', () => {
    expect(ALLOWED[file], `${file} has no isolation rule`).toBeDefined();
    expect(relativeImports(resolve(pkgRoot, entry))).toEqual([...(ALLOWED[file] ?? [])].sort());
  });
});

describe('the package as a whole', () => {
  it('declares sideEffects: false, so a bundler may drop what a program does not use (U10)', () => {
    expect(manifest.sideEffects).toBe(false);
  });

  it('has a root entry that is re-exports only — no side effects, nothing of its own', () => {
    const lines = readFileSync(resolve(pkgRoot, manifest.exports['.']?.import ?? ''), 'utf8')
      .split('\n')
      .filter((l) => l.trim() !== '');
    expect(lines.every((l) => l.startsWith('export * from '))).toBe(true);
  });

  it('every isolation rule names a published entry — the lock cannot outlive a file', () => {
    const published = Object.values(manifest.exports).map((e) => basename(e.import));
    expect(Object.keys(ALLOWED).sort()).toEqual(published.sort());
  });
});
