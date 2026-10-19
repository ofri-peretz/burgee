/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — the artifact gate refuses a tarball that would publish a source map, a test file or
 * agent instructions (`cli-packaging` S3 / R4, floor K4).
 *
 * `check:artifacts` runs `forbiddenInPack` on every built package before publish, but until
 * 2026-10-18 nothing ever handed it a forbidden file, so "a deliberate `.map` file in a test
 * fixture is caught" was an unproven regex: the gate passes either way on a clean tree. These
 * cases are the deliberate fixture — a pack list with one of each, each refused by path, and
 * the near-misses a regex loosened or tightened by one character would get wrong.
 */
import { describe, expect, it } from 'vitest';

import { forbiddenInPack, type PackEntry, type Pkg } from './check-published-artifacts';

const pkg: Pkg = { name: 'demo' };
const pack = (...paths: string[]): PackEntry => ({ name: 'demo', size: 0, unpackedSize: 0, files: paths.map((path) => ({ path })) });

describe('forbiddenInPack — the files a tarball must not carry', () => {
  it.each([
    ['a JavaScript source map', 'dist/index.js.map'],
    ['a declaration map', 'dist/index.d.ts.map'],
    ['a TypeScript test', 'dist/cli.test.ts'],
    ['a compiled test', 'dist/cli.test.js'],
    ['an ESM test', 'dist/cli.test.mjs'],
    ['a CommonJS test', 'dist/cli.test.cts'],
    ['agent instructions at the root', 'AGENTS.md'],
    ['agent instructions in a folder', 'docs/CLAUDE.md'],
  ])('refuses %s (%s)', (_, path) => {
    expect(forbiddenInPack(pkg, pack('package.json', 'dist/index.js', path))).toEqual([`demo: would publish ${path}`]);
  });

  it('names every forbidden file in one pack list, not just the first', () => {
    expect(forbiddenInPack(pkg, pack('dist/a.js.map', 'dist/a.js', 'dist/a.test.js', 'CLAUDE.md'))).toEqual([
      'demo: would publish dist/a.js.map',
      'demo: would publish dist/a.test.js',
      'demo: would publish CLAUDE.md',
    ]);
  });

  it.each([
    ['the code and its declarations', 'dist/index.js'],
    ['a declaration', 'dist/index.d.ts'],
    ['a file whose name only contains "map"', 'dist/sitemap.js'],
    ['a file whose name only contains "test"', 'dist/latest.js'],
    ['a test helper that is not a test file', 'dist/testing.js'],
    ['a README that is not agent instructions', 'README.md'],
    ['a name that only ends in AGENTS.md', 'dist/MYAGENTS.md'],
  ])('lets %s through (%s)', (_, path) => {
    expect(forbiddenInPack(pkg, pack(path))).toEqual([]);
  });
});
