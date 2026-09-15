/**
 * R7 — each subpath costs only itself. Conditional weight is a lock, not a convention:
 * this reads every published `dist/` entry and asserts the relative imports it may carry.
 * Importing `roundel/tokens` never loads the theme; importing the theme never loads the
 * tokens. Add a cross-import and this goes red, which was proven by adding one.
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

/**
 * The only edges allowed. `policy` is the floor every subpath may stand on; `theme` also
 * reaches `contrast`, because checking a theme is what the theme does and a third copy of
 * the maths inside one package would be duplication with no arrow to justify it. `chalk`
 * reaches `tokens` for the one emitter every escape goes through (R3) and `policy` for its
 * level at import (R6) — never the theme: chalk has none, and a chalk user pays for none.
 */
const ALLOWED: Record<string, string[]> = {
  'policy.js': [],
  'contrast.js': [],
  'tokens.js': ['./policy.js'],
  'theme.js': ['./policy.js', './contrast.js'],
  // `./runtime.js` is the process seam (Y9): the guarded `globalThis.process` cast used to
  // sit in this file, and chalk is still the only entry that reaches it, because chalk is
  // the only subpath whose contract is "detect the terminal at import".
  'chalk.js': ['./policy.js', './runtime.js', './tokens.js'],
  'index.js': ['./contrast.js', './plugin.js', './policy.js', './theme.js', './tokens.js'],
  // The plugin host reaches nothing at run time: its only import is `Theme`, a type, which
  // `verbatimModuleSyntax` erases. Collecting a theme costs no module.
  'plugin.js': [],
};

/**
 * The same rule for the modules an entry pulls in, which `ALLOWED` never reached: it compares
 * only each *entry's* direct imports, so anything one level down was unlocked. Until Y9 every
 * module in this package was a published entry, so the hole was empty; `runtime.ts` is the
 * first that is not, and it is the one file that names the process — precisely the module
 * whose edges a reader would want locked. It reaches nothing, and this is what says so.
 * Mirrors flagstaff's `INTERNAL_ALLOWED`.
 */
const INTERNAL_ALLOWED: Record<string, string[]> = {
  'runtime.js': [],
};

const RELATIVE = /(?:from|import)\s*'(\.[^']+)'/g;

function relativeImports(file: string): string[] {
  return [...readFileSync(file, 'utf8').matchAll(RELATIVE)].map((m) => m[1] ?? '').sort();
}

/**
 * A `.json` export is data, not an entry point: it has no imports to isolate, and the file
 * *is* the payload rather than a door onto the graph. It is checked for existence instead —
 * a different assertion, not a weaker one.
 */
const code = Object.entries(manifest.exports).filter((e): e is [string, { import: string }] => typeof e[1] === 'object');
const data = Object.entries(manifest.exports).filter((e): e is [string, string] => typeof e[1] === 'string');

describe.each(data)('data export %s', (subpath, target) => {
  it('points at a file that exists — a data export cannot be tree-shaken into place', () => {
    expect(target.endsWith('.json'), `${subpath} is a string export but not JSON; only data may take that form`).toBe(true);
    expect(existsSync(resolve(pkgRoot, target)), `${subpath} -> ${target} is not on disk`).toBe(true);
  });
});

describe.each(code)('entry %s', (_, { import: entry }) => {
  const file = basename(entry);

  it('carries only its allowed relative imports', () => {
    expect(ALLOWED[file], `${file} has no isolation rule`).toBeDefined();
    expect(relativeImports(resolve(pkgRoot, entry))).toEqual([...(ALLOWED[file] ?? [])].sort());
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
