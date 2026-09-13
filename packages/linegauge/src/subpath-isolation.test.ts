/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * R8 — each subpath costs only itself, locked rather than intended. Mirrors
 * `flagstaff/src/subpath-isolation.test.ts` and `roundel`'s before it.
 *
 * The specific thing it prevents: `slice`, `wrap` and `truncate` share `style.ts`, and the
 * moment one of them reaches for another instead, a caller who imported `linegauge/slice`
 * to cut one string starts paying for the whole wrapper. That is exactly how `slice-ansi`
 * ends up in a dependency tree three times over, which is what this package is for.
 *
 * It reads `dist/`, so it measures what is published rather than what is written.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const pkgRoot = fileURLToPath(new URL('..', import.meta.url));
const manifest = JSON.parse(readFileSync(resolve(pkgRoot, 'package.json'), 'utf8')) as {
  exports: Record<string, { import: string }>;
};

/**
 * What each published entry may reach, relatively.
 *
 * `style.js` is the shared stack and is named by everything that cuts; `width.js` is the
 * measurement and is named by everything that counts. Nothing names a sibling entry: that
 * is the whole rule, and `index.js` is the one door that opens onto all of them.
 */
const ALLOWED: Record<string, string[]> = {
  'index.js': ['./slice.js', './truncate.js', './widest.js', './width.js', './wrap.js'],
  'wrap.js': ['./style.js', './width.js'],
  'slice.js': ['./style.js', './width.js'],
  // Over `slice`, never over `wrap` — the ellipsis-fits arithmetic needs a cut, not a fold.
  'truncate.js': ['./slice.js', './width.js'],
  'widest.js': ['./width.js'],
};

/**
 * Internal modules, checked exactly as an entry is.
 *
 * `width.js` is here rather than in `ALLOWED` because there is no `./width` subpath: the
 * measurement is the root default export (R8/Y3, so the `string-width` override resolves),
 * which makes it the one module every entry reaches and none of them publishes.
 */
const INTERNAL_ALLOWED: Record<string, string[]> = {
  'style.js': ['./width.js'],
  'width.js': [],
};

const RELATIVE = /(?:from|import)\s*'(\.[^']+)'/g;

function relativeImports(file: string): string[] {
  return [...readFileSync(file, 'utf8').matchAll(RELATIVE)].map((m) => m[1] ?? '').toSorted();
}

const dist = (name: string): string => resolve(pkgRoot, 'dist', name);

describe.each(Object.keys(ALLOWED))('entry %s', (file) => {
  it('carries only its allowed relative imports', () => {
    expect(existsSync(dist(file)), `${file} is not built`).toBe(true);
    expect(relativeImports(dist(file))).toEqual([...(ALLOWED[file] ?? [])].toSorted());
  });
});

describe.each(Object.keys(INTERNAL_ALLOWED))('internal module %s', (file) => {
  it('carries only its allowed relative imports', () => {
    expect(relativeImports(dist(file))).toEqual([...(INTERNAL_ALLOWED[file] ?? [])].toSorted());
  });
});

describe('the rule covers what is published', () => {
  const published = Object.values(manifest.exports).map((e) => e.import.replace('./dist/', ''));

  it('every published entry has a rule, and every rule names a published entry', () => {
    expect(Object.keys(ALLOWED).toSorted()).toEqual(published.toSorted());
  });

  it('nothing in the internal table is actually an entry', () => {
    for (const file of Object.keys(INTERNAL_ALLOWED)) {
      expect(published.includes(file), `${file} is published — it belongs in ALLOWED`).toBe(false);
    }
  });

  /**
   * The property the lists exist to defend, asserted directly so a wrong list is not the
   * only thing standing between us and a fat subpath: cutting one string must not load the
   * wrapper, and wrapping must not load the truncator.
   */
  it('no entry reaches a sibling entry', () => {
    const entries = new Set(published.filter((f) => f !== 'index.js'));
    for (const [file, allowed] of Object.entries(ALLOWED)) {
      if (file === 'index.js') continue;
      const siblings = allowed.filter((spec) => entries.has(spec.replace('./', '')));
      // `truncate -> slice` is the one composition the design asks for (R6 is built over R4).
      expect(siblings, `${file} reaches a sibling entry`).toEqual(file === 'truncate.js' ? ['./slice.js'] : []);
    }
  });
});
