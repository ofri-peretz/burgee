/**
 * R7 — each subpath costs only itself. Conditional weight is a lock, not a convention:
 * this reads every published `dist/` entry and asserts the relative imports it may carry.
 * Importing `flagstaff/loop` never loads the plugin registry; the spinner reads the registry
 * and never the loop. Add a cross-import and this goes red. Mirrors roundel's lock.
 *
 * It reads `dist/`, so it measures what is published rather than what is written.
 */
import { existsSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const pkgRoot = fileURLToPath(new URL('..', import.meta.url));

interface Manifest {
  sideEffects: boolean;
  exports: Record<string, { import: string } | string>;
}
const manifest = JSON.parse(readFileSync(resolve(pkgRoot, 'package.json'), 'utf8')) as Manifest;

/** The only edges allowed. `projection` and `builtins` are leaves; the schema is data. */
const ALLOWED: Record<string, string[]> = {
  'loop.js': ['./projection.js'],
  'plugin.js': ['./builtins.js', './schema.json'],
  'spinner.js': ['./plugin.js'],
  'index.js': ['./box.js', './import.js', './loop.js', './plugin.js', './progress.js', './spinner.js', './table.js', './tasks.js'],
  // The façade stands apart on purpose: it reads the corpus, the width function and the
  // cursor control, and nothing else in the package, so `flagstaff/ora` and `flagstaff`
  // share no code path and a program on one pays nothing for the other (R6, R10).
  'ora.js': ['./cursor.js', './spinners.json', './width.js'],
  // The two façades share `cursor.js` — one implementation of putting the cursor back
  // however the process dies, because both incumbents port the same `cli-cursor` →
  // `restore-cursor` → `signal-exit` chain — and, through `wrap.js`, `width.js`. Nothing
  // else. `wrap.js` is the ANSI-aware wrapper `box` and `table` share, which is why it is
  // its own module rather than a section of this façade.
  'log-update.js': ['./cursor.js', './wrap.js'],
  // The boxen façade: the width function and the ANSI-aware wrapper, and nothing else in
  // the package. It carries cli-boxes' table itself rather than reading the registry —
  // `_borderStyles` is boxen's public surface, and a façade whose drawing changed when
  // somebody registered a plugin would be reinterpreting its host.
  'boxen.js': ['./width.js', './wrap.js'],
  // The built-ins: `progress` is self-contained, `tasks` reads the registry for its glyphs
  // and its spinner style, and `box` and `table` are string functions over the same two
  // modules — never over each other.
  // Types only, all erased: the importer reshapes JSON and reaches nothing to do it.
  'import.js': [],
  'progress.js': [],
  'tasks.js': ['./plugin.js'],
  'box.js': ['./plugin.js', './width.js', './wrap.js'],
  'table.js': ['./width.js', './wrap.js'],
};

/**
 * The same rule for the modules an entry pulls in, which `ALLOWED` never reached: it compares
 * only each *entry's* direct imports, so anything one level down was unlocked. `projection`
 * is the case that made this matter — it is the only core module that emits a cursor
 * operation, so it is the one that has to put the cursor back when a signal ends the process,
 * and it now reaches the same `cursor.js` both façades use rather than a third copy of a
 * subtle thing. A module listed here is checked exactly as an entry is.
 */
const INTERNAL_ALLOWED: Record<string, string[]> = {
  'projection.js': ['./cursor.js'],
};

const RELATIVE = /(?:from|import)\s*'(\.[^']+)'/g;

function relativeImports(file: string): string[] {
  return [...readFileSync(file, 'utf8').matchAll(RELATIVE)].map((m) => m[1] ?? '').sort();
}

/**
 * A `.json` export is data, not an entry point: it has no imports to isolate, and the file
 * *is* the payload rather than a door onto the graph. It is checked for existence below
 * instead of for its edges — which is a different assertion, not a weaker one.
 */
const code = Object.entries(manifest.exports).filter((e): e is [string, { import: string }] => typeof e[1] === 'object');
const data = Object.entries(manifest.exports).filter((e): e is [string, string] => typeof e[1] === 'string');

describe.each(code)('entry %s', (_, { import: entry }) => {
  const file = basename(entry);

  it('carries only its allowed relative imports', () => {
    expect(ALLOWED[file], `${file} has no isolation rule`).toBeDefined();
    expect(relativeImports(resolve(pkgRoot, entry))).toEqual([...(ALLOWED[file] ?? [])].sort());
  });
});

describe.each(data)('data export %s', (subpath, target) => {
  it('points at a file that exists — a data export cannot be tree-shaken into place', () => {
    expect(target.endsWith('.json'), `${subpath} is a string export but not JSON; only data may take that form`).toBe(true);
    expect(existsSync(resolve(pkgRoot, target)), `${subpath} -> ${target} is not on disk`).toBe(true);
  });
});

describe.each(Object.keys(INTERNAL_ALLOWED))('internal module %s', (file) => {
  it('carries only its allowed relative imports', () => {
    expect(relativeImports(resolve(pkgRoot, 'dist', file))).toEqual([...(INTERNAL_ALLOWED[file] ?? [])].sort());
  });
});

describe('the package as a whole', () => {
  it('declares sideEffects: false, so a bundler may drop what a program does not use (U10)', () => {
    expect(manifest.sideEffects).toBe(false);
  });

  it('has a root entry that is re-exports only — no side effects, nothing of its own', () => {
    const root = manifest.exports['.'];
    const lines = readFileSync(resolve(pkgRoot, typeof root === 'object' ? root.import : ''), 'utf8')
      .split('\n')
      .filter((l) => l.trim() !== '');
    expect(lines.every((l) => l.startsWith('export * from '))).toBe(true);
  });

  it('every isolation rule names a published entry — the lock cannot outlive a file', () => {
    const published = code.map(([, e]) => basename(e.import));
    expect(Object.keys(ALLOWED).sort()).toEqual(published.sort());
  });

  it('every internal rule names a file that exists and is not itself an entry', () => {
    const published = new Set(code.map(([, e]) => basename(e.import)));
    for (const file of Object.keys(INTERNAL_ALLOWED)) {
      expect(published.has(file), `${file} is a published entry — it belongs in ALLOWED`).toBe(false);
      expect(existsSync(resolve(pkgRoot, 'dist', file)), `${file} does not exist`).toBe(true);
    }
  });
});
