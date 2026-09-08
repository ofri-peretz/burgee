/**
 * R7: each published subpath costs only itself. Every `dist/` entry may import Node
 * built-ins and, relatively, only `./policy.js` (the one function the family shares)
 * and the modules that subpath *is*; the root entry re-exports and does nothing else.
 * Proven by adding a cross-import: it fails.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const pkgRoot = fileURLToPath(new URL('..', import.meta.url));
const manifest = JSON.parse(readFileSync(resolve(pkgRoot, 'package.json'), 'utf8')) as { exports: Record<string, { import: string }>; sideEffects?: boolean };

/** What each subpath may reach beyond itself and `./policy.js`. */
const MAY_REACH: Record<string, string[]> = {
  './policy': [],
  './contrast': [],
  './theme': ['./contrast.js'],
  './tokens': ['./contrast.js', './theme.js'],
};

const RELATIVE = /from '(\.\/[^']+)'/g;

describe('subpath isolation (R7)', () => {
  it.each(Object.entries(MAY_REACH))('%s imports only itself, ./policy.js and what it is made of', (subpath, allowed) => {
    const file = resolve(pkgRoot, manifest.exports[subpath]?.import ?? '');
    const imports = [...readFileSync(file, 'utf8').matchAll(RELATIVE)].map((m) => m[1] ?? '');
    const foreign = imports.filter((i) => i !== './policy.js' && !allowed.includes(i));
    expect(foreign).toEqual([]);
  });

  it('the root entry only re-exports', () => {
    const source = readFileSync(resolve(pkgRoot, manifest.exports['.']?.import ?? ''), 'utf8');
    const statements = source.split('\n').filter((l) => l.trim() !== '' && !l.startsWith('//') && !l.startsWith('/*') && !l.startsWith(' *'));
    for (const line of statements) expect(line.startsWith('export ')).toBe(true);
  });

  it('declares no side effects, so a bundler drops what a program never names', () => {
    expect(manifest.sideEffects).toBe(false);
  });
});
