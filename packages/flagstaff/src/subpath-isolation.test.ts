/**
 * R7 — each subpath costs only itself. Conditional weight is a lock, not a convention:
 * this reads every published `dist/` entry and asserts the relative imports it may carry.
 * Importing `flagstaff/loop` never loads the plugin registry; the spinner reads the registry
 * and never the loop. Add a cross-import and this goes red. Mirrors roundel's lock.
 *
 * It reads `dist/`, so it measures what is published rather than what is written.
 *
 * **What it stopped seeing on 2026-09-09.** `width` and `wrap` left for `linegauge` (F1), so
 * six of these lists lost entries and two became empty. That is not six subpaths getting
 * cleaner — a bare specifier is invisible to `RELATIVE`, and the same modules are still in
 * the graph one package over. `weight.test.ts` carries the same warning against the same
 * move, and its `allow` lists are where a bare specifier is actually checked.
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

/**
 * The only edges allowed. `projection`, `builtins` and `conforms` are leaves; the schema is data.
 * `plugin.js` reads `plugin.schema.json` — flagstaff's slice of the family schema — and never the
 * whole `schema.json`, which ships as data for authors and costs no import (D-108, 2026-09-23).
 */
const ALLOWED: Record<string, string[]> = {
  'loop.js': ['./projection.js'],
  'plugin.js': ['./builtins.js', './conforms.js', './plugin.schema.json'],
  'spinner.js': ['./plugin.js'],
  'index.js': ['./box.js', './import.js', './loop.js', './plugin.js', './progress.js', './spinner.js', './table.js', './tasks.js'],
  // The façade stands apart on purpose: it reads the corpus, the width function and the
  // cursor control, and nothing else in the package, so `flagstaff/ora` and `flagstaff`
  // share no code path and a program on one pays nothing for the other (R6, R10).
  'ora.js': ['./runtime.js', './spinners.json'],
  // The two façades share the cursor control, and since 2026-09-15 it is `closeout`'s
  // rather than this package's: both incumbents port the same `cli-cursor` →
  // `restore-cursor` → `signal-exit` chain, and closeout owns `restore-cursor` and grades
  // 6/6 against its suite. A bare specifier is invisible to `RELATIVE`, so the edge that
  // used to be `./cursor.js` is now checked in `weight.test.ts`'s `allow` list instead.
  'log-update.js': ['./runtime.js'],
  // The boxen façade: the width function and the ANSI-aware wrapper, and nothing else in
  // the package. It carries cli-boxes' table itself rather than reading the registry —
  // `_borderStyles` is boxen's public surface, and a façade whose drawing changed when
  // somebody registered a plugin would be reinterpreting its host.
  //
  // `./runtime.js` is the process seam (Y9): boxen's contract *is* the process for one
  // number — how wide the terminal is — and this is now the only way it reaches it.
  'boxen.js': ['./runtime.js'],
  // The cli-table3 façade: the width function and nothing else in the package. It carries
  // its own wrapping — cli-table3's `wordWrap` splits on `/(\s+)/` and counts with its own
  // `strlen`, which `wrap.js` (a wrap-ansi port) does not reproduce — so a shared wrapper
  // would be a divergence dressed up as reuse.
  'cli-table3.js': [],
  // The built-ins: `progress` is self-contained, `tasks` reads the registry for its glyphs
  // and its spinner style, and `box` and `table` are string functions over the same two
  // modules — never over each other.
  // Types only, all erased: the importer reshapes JSON and reaches nothing to do it.
  'import.js': [],
  'progress.js': [],
  'tasks.js': ['./plugin.js'],
  // `./link.js` is where OSC 8 enters, and it enters from `paratext` (R12). It is a relative
  // edge rather than a bare specifier on purpose: the adapter — which runtime paratext is
  // asked about, and what a static projection is defined against — is this package's, and
  // having exactly one of it is the point. The sequence itself is not here at all.
  'box.js': ['./link.js', './plugin.js'],
  'table.js': ['./link.js'],
};

/**
 * The same rule for the modules an entry pulls in, which `ALLOWED` never reached: it compares
 * only each *entry's* direct imports, so anything one level down was unlocked. `projection`
 * is the case that made this matter — it is the only core module that emits a cursor
 * operation, so it is the one that has to put the cursor back when a signal ends the process,
 * and it now reaches the same `closeout` both façades use rather than a third copy of a
 * subtle thing. A module listed here is checked exactly as an entry is.
 */
const INTERNAL_ALLOWED: Record<string, string[]> = {
  // Now a leaf: the cursor net it registers is `closeout`'s, reached by a bare specifier.
  'projection.js': [],
  // `runtime.js` is where the process name went, and it is a leaf — the seam reaches
  // nothing, which is the point of it.
  'runtime.js': [],
  // The hyperlink adapter (R12). It reaches the process seam and `paratext/link`, and
  // nothing else in the package — in particular not `plugin.js`, so `flagstaff/table` still
  // costs nothing for the registry it does not read.
  'link.js': ['./runtime.js'],
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
