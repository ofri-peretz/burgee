/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * R12 (K2) — `require('linegauge')` works, and no entry has a top-level `await`.
 *
 * The design has named a `shape.test.ts` since 2026-09-09 and there was none. R12 was
 * therefore a claim with nothing behind it: the package is ESM, every consumer in this
 * repository imports it, and **nothing in the tree ever called `require` on it**. The
 * override recipe R8 exists for — `overrides: { "string-width": "npm:linegauge@^1" }` —
 * lands this package inside CommonJS dependency trees that have required `string-width`
 * since 2015. If `require` throws there, the override does not degrade, it breaks the build.
 *
 * The two clauses are one check, which is why this file is short. Node's `require(esm)`
 * refuses a module graph containing a top-level `await` with `ERR_REQUIRE_ASYNC_MODULE`, so
 * a `require` that returns the namespace has proved both halves at once: the entry is
 * requirable *and* nothing it reaches awaits at the top level. Asserting "no top-level
 * await" by scanning the emitted text would be the other mistake — a regex over printed
 * source, which this repository has already caught itself doing.
 *
 * It reads `dist/`, like `subpath-isolation.test.ts` and `weight.test.ts`, because what a
 * CommonJS caller requires is what was published, not what was written.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { width } from './width.js';

const pkgRoot = fileURLToPath(new URL('..', import.meta.url));
const manifest = JSON.parse(readFileSync(resolve(pkgRoot, 'package.json'), 'utf8')) as {
  exports: Record<string, { import?: string }>;
};
const loadFromCjs = createRequire(import.meta.url);

/** Every published entry, with the named export it must carry, from the manifest rather than a list. */
const ENTRIES = Object.entries(manifest.exports)
  .filter(([, condition]) => typeof condition.import === 'string')
  .map(([subpath, condition]) => ({
    subpath,
    file: resolve(pkgRoot, condition.import as string),
    named: subpath === '.' ? 'width' : subpath.slice(2),
  }));

describe('R12 — every published entry is requirable from CommonJS', () => {
  it('the manifest still has entries to check, so this file cannot pass by finding nothing', () => {
    expect(ENTRIES.length).toBeGreaterThan(0);
  });

  it.each(ENTRIES)('linegauge$subpath: require() returns its namespace, so nothing in it awaits at the top level', ({ file, named }) => {
    // eslint-disable-next-line node-security/no-dynamic-dependency-loading -- requiring is the assertion. R12 says a CommonJS caller can reach this package; a static import cannot express that, and the path comes from the package’s own exports map, not from an input.
    const required: unknown = loadFromCjs(file);
    expect(typeof required).toBe('object');
    expect(typeof (required as Record<string, unknown>)[named]).toBe('function');
  });

  /**
   * R8's half of the same fact: the override resolves `string-width`'s default, and a
   * CommonJS caller reaches it as `require('string-width')`, which is this.
   */
  it('the root default is `width` under require, which is what the string-width override resolves', () => {
    // eslint-disable-next-line node-security/no-dynamic-dependency-loading -- requiring is the assertion. R12 says a CommonJS caller can reach this package; a static import cannot express that, and the path comes from the package’s own exports map, not from an input.
    const root = loadFromCjs(resolve(pkgRoot, 'dist/index.js')) as { default?: unknown; width?: unknown };
    // The same function object as the named export, not merely one that agrees — `dist/`'s
    // `width` is a different object from the source `width` this file imports, so identity
    // against the import would compare two builds and fail for a reason R12 is not about.
    expect(root.default).toBe(root.width);
    expect((root.default as typeof width)('\u53E4\u4EE3')).toBe(width('\u53E4\u4EE3'));
  });
});
