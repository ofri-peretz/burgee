/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — the engine does not reach down into a host front-end.
 *
 * `src/` used to be 43 files in one directory, 6 of them prefixed `commander-` and 11
 * `yargs-`. The prefixes were the structure and nothing enforced them, so the arrow between
 * the engine and its two front-ends was a naming convention: **`unknown-option.ts` imported
 * `commander-suggest.ts`**, which is the engine depending on a front-end, and no reader of
 * a flat directory would have called it that. (It is `src/suggest.ts` now — a
 * Damerau-Levenshtein distance is neither host's, and both use it.)
 *
 * Making it a directory is what turns that into a checkable claim, and this is the check.
 * Two rules:
 *
 *   1. **`src/*.ts` is exactly the published entry surface, plus the engine.** Only an
 *      entry point named in `package.json`'s `exports` may import from `commander/` or
 *      `yargs/` — that is what an entry point is for.
 *   2. **Neither front-end imports the other.** They are two independent ports of two
 *      unrelated packages that happen to share an engine; an edge between them would mean
 *      one host's behaviour had started depending on the other's.
 *
 * The reverse direction — a front-end reaching `../` for the engine — is the arrow the
 * package is built on, and `eslint.config.mjs` turns `no-relative-parent-imports` off for
 * exactly these two directories and nowhere else.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)));
const PKG = resolve(SRC, '..', 'package.json');

/** Every `./x.js` or `./dir/x.js` a file imports, comments stripped. */
function specifiers(file: string): string[] {
  const text = readFileSync(file, 'utf-8')
    .split(/\r?\n/)
    .map((line) => (/^\s*(\*|\/\*)/.test(line) ? '' : line.replace(/\/\/.*$/, '')))
    .join('\n');
  return [...text.matchAll(/from\s+'(\.[^']*)'/g)].map((m) => m[1] as string);
}

const sources = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.ts') && !e.name.endsWith('.test.ts'))
    .map((e) => join(dir, e.name));

/**
 * The entry points, read from `exports` rather than listed here, so a new subpath is
 * admitted by publishing it and not by editing this lock.
 */
function entryStems(): Set<string> {
  const exports_ = (JSON.parse(readFileSync(PKG, 'utf-8')) as { exports: Record<string, { import: string }> }).exports;
  return new Set(Object.values(exports_).map((e) => e.import.replace(/^\.\/dist\//, '').replace(/\.js$/, '')));
}

/** Every import from one front-end directory into the other, in both directions. */
function crossEdges(): string[] {
  const out: string[] = [];
  for (const [dir, other] of [['commander', 'yargs'], ['yargs', 'commander']] as const) {
    for (const file of sources(join(SRC, dir))) {
      const reaches = specifiers(file).filter((spec) => spec.includes(`${other}/`) || spec === `../${other}.js`);
      out.push(...reaches.map((spec) => `${dir}/${file.split('/').pop() ?? ''} -> ${spec}`));
    }
  }
  return out;
}

describe('the engine does not reach down into a front-end', () => {
  const entries = entryStems();

  it('reads the entry points out of the exports map', () => {
    // If this ever comes back empty the two tests below pass vacuously.
    expect(entries.size).toBeGreaterThanOrEqual(10);
    expect(entries).toContain('commander');
    expect(entries).toContain('yargs');
  });

  it('only a published entry point imports from commander/ or yargs/', () => {
    const offenders: string[] = [];
    for (const file of sources(SRC)) {
      const stem = file.slice(SRC.length + 1).replace(/\.ts$/, '');
      if (entries.has(stem)) continue;
      for (const spec of specifiers(file)) {
        if (/^\.\/(commander|yargs)\//.test(spec)) offenders.push(`${stem}.ts -> ${spec}`);
      }
    }
    expect(offenders, 'the engine is not allowed to depend on a host front-end — hoist the shared piece to src/').toEqual([]);
  });

  it('neither front-end imports the other', () => {
    expect(crossEdges(), 'two ports of two unrelated packages, sharing an engine and nothing else').toEqual([]);
  });
});
