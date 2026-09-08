/**
 * R7 — each subpath costs only itself. Conditional weight is a lock, not a convention:
 * this reads every published `dist/` entry and asserts the relative imports it may carry.
 * Importing `roundel/tokens` never loads the theme; importing the theme never loads the
 * tokens. Add a cross-import and this goes red, which was proven by adding one.
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
  'chalk.js': ['./policy.js', './tokens.js'],
  'index.js': ['./contrast.js', './policy.js', './theme.js', './tokens.js'],
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
