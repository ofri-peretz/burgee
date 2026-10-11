/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * The declaration closure `declaration-reach.mts` prunes by, and the lock that it is applied.
 *
 * The first block builds small packages on disk and asks which declarations their `exports`
 * reach, one edge kind per case, because a missed edge is the one failure that matters: it
 * would prune a file a consumer's compiler opens. The second holds every published package's
 * built `dist/` to "no declaration outside the closure", and its `build` to running the prune,
 * so the 35 files burgee stopped publishing on 2026-10-11 cannot creep back one module at a
 * time. `pack-list-lock.test.ts` checks the other direction from the tarball itself.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { declarationBeside, entryDeclarations, pruneDeclarations, reachableDeclarations, type TypedPackage, unreachableDeclarations } from './declaration-reach.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let made: string[] = [];
afterEach(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
  made = [];
});

/** A package on disk: `package.json` from `pkg`, and each file of `files` under it. */
function fixture(pkg: TypedPackage, files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'declaration-reach-'));
  made.push(dir);
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ type: 'module', ...pkg }));
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), text);
  }
  return dir;
}

const ENTRY = { '.': { types: './dist/index.d.ts', import: './dist/index.js' } };

describe('declarationBeside', () => {
  it('maps each JavaScript extension to the declaration tsc emits beside it', () => {
    expect(declarationBeside('dist/a.js')).toBe('dist/a.d.ts');
    expect(declarationBeside('dist/a.mjs')).toBe('dist/a.d.mts');
    expect(declarationBeside('dist/a.cjs')).toBe('dist/a.d.cts');
    expect(declarationBeside('dist/a.json')).toBeUndefined();
  });
});

describe('entryDeclarations', () => {
  it('starts from types targets, the declaration beside a bare JavaScript target, types and typesVersions', () => {
    const dir = fixture(
      {
        name: 'p',
        types: './dist/top.d.ts',
        exports: { '.': { types: './dist/index.d.ts', default: './dist/index.js' }, './bare': './dist/bare.js', './data.json': './dist/data.json', './lib/*': { import: './dist/lib/*.js' } },
        typesVersions: { '*': { legacy: ['dist/legacy.d.ts'] } },
      },
      {
        'dist/index.d.ts': '',
        'dist/bare.d.ts': '',
        'dist/top.d.ts': '',
        'dist/legacy.d.ts': '',
        'dist/data.json': '{}',
        'dist/lib/one.js': '',
        'dist/lib/one.d.ts': '',
        'dist/lib/deep/two.js': '',
        'dist/lib/deep/two.d.ts': '',
      },
    );
    expect(entryDeclarations(dir, JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as TypedPackage)).toEqual([
      'dist/bare.d.ts',
      'dist/index.d.ts',
      'dist/legacy.d.ts',
      'dist/lib/deep/two.d.ts',
      'dist/lib/one.d.ts',
      'dist/top.d.ts',
    ]);
  });
});

describe('reachableDeclarations — every edge a compiler follows', () => {
  /** [what, dist/index.d.ts, the file it reaches, extra exports]. */
  const cases: [string, string, string, Record<string, unknown>][] = [
    ['an import', "import type { B } from './b.js';\nexport type A = B;\n", 'dist/b.d.ts', {}],
    ['a re-export', "export * from './b.js';\n", 'dist/b.d.ts', {}],
    ['a named re-export', "export { type B } from './b.js';\n", 'dist/b.d.ts', {}],
    ['an import() type', "export type A = import('./b.js').B;\n", 'dist/b.d.ts', {}],
    ['a triple-slash reference', '/// <reference path="./b.d.ts" />\nexport type A = B;\n', 'dist/b.d.ts', {}],
    ['a directory index', "export * from './b/index.js';\n", 'dist/b/index.d.ts', {}],
    ['a self-reference by package name', "export * from 'p/b';\n", 'dist/b/index.d.ts', { './b': { types: './dist/b/index.d.ts' } }],
  ];
  it.each(cases)('follows %s', (_, index, target, extra) => {
    const pkg: TypedPackage = { name: 'p', exports: { ...ENTRY, ...extra } };
    const dir = fixture(pkg, {
      'dist/index.d.ts': index,
      [target]: 'export interface B { b: 1 }\n',
      'dist/orphan.d.ts': 'export type O = 1;\n',
    });
    expect(reachableDeclarations(dir, pkg)).toEqual(['dist/index.d.ts', target].toSorted());
    expect(unreachableDeclarations(dir, pkg)).toEqual(['dist/orphan.d.ts']);
  });

  it('follows edges transitively, and not out of an unreachable file', () => {
    const pkg: TypedPackage = { name: 'p', exports: ENTRY };
    const dir = fixture(pkg, {
      'dist/index.d.ts': "export * from './a.js';\n",
      'dist/a.d.ts': "export type A = import('./nested/b.js').B;\n",
      'dist/nested/b.d.ts': "export * from '../c.js';\nexport interface B { b: 1 }\n",
      'dist/c.d.ts': 'export type C = 1;\n',
      'dist/dead.d.ts': "export * from './dead-dep.js';\n",
      'dist/dead-dep.d.ts': 'export type D = 1;\n',
    });
    expect(reachableDeclarations(dir, pkg)).toEqual(['dist/a.d.ts', 'dist/c.d.ts', 'dist/index.d.ts', 'dist/nested/b.d.ts']);
    expect(unreachableDeclarations(dir, pkg)).toEqual(['dist/dead-dep.d.ts', 'dist/dead.d.ts']);
  });

  it('reaches nothing, and so would prune everything, when no entry has types — callers must not prune such a package blind', () => {
    const pkg: TypedPackage = { name: 'p', exports: { '.': './dist/index.js' } };
    const dir = fixture(pkg, { 'dist/index.js': '', 'dist/other.d.ts': '' });
    expect(reachableDeclarations(dir, pkg)).toEqual([]);
  });
});

describe('pruneDeclarations', () => {
  it('deletes the unreachable declarations and their maps, keeps everything else, and counts the bytes', () => {
    const pkg: TypedPackage = { name: 'p', exports: ENTRY };
    const dir = fixture(pkg, {
      'dist/index.js': 'export {};\n',
      'dist/index.d.ts': 'export {};\n',
      'dist/dead.js': 'export {};\n',
      'dist/dead.d.ts': 'export type Dead = 1;\n',
      'dist/dead.d.ts.map': '{}',
    });
    expect(pruneDeclarations(dir, pkg)).toEqual({ files: ['dist/dead.d.ts'], bytes: 'export type Dead = 1;\n'.length });
    expect(readdirSync(join(dir, 'dist')).toSorted()).toEqual(['dead.js', 'index.d.ts', 'index.js']);
  });
});

/** Every published workspace package. */
const published = readdirSync(join(REPO_ROOT, 'packages'))
  .filter((dir) => existsSync(join(REPO_ROOT, 'packages', dir, 'package.json')))
  .map((dir) => ({ dir, pkg: JSON.parse(readFileSync(join(REPO_ROOT, 'packages', dir, 'package.json'), 'utf8')) as TypedPackage & { private?: boolean; scripts?: Record<string, string> } }))
  .filter(({ pkg }) => pkg.private !== true);

/** The step every published package's build ends with. */
const PRUNE = 'node ../../scripts/declaration-reach.mts --prune';

describe.each(published)('published package $pkg.name', ({ dir, pkg }) => {
  it('prunes unreachable declarations as the last step of its build', () => {
    expect(pkg.scripts?.['build']?.endsWith(` && ${PRUNE}`)).toBe(true);
  });

  it('has an entry point with types, so the closure is not empty', () => {
    expect(entryDeclarations(join(REPO_ROOT, 'packages', dir), pkg).length).toBeGreaterThan(0);
  });

  it('builds a dist with no declaration file its exports cannot reach', () => {
    expect(unreachableDeclarations(join(REPO_ROOT, 'packages', dir), pkg)).toEqual([]);
  });
});
