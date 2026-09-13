/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — a shared test-vector file is read by every copy it governs.
 *
 * Floor rule Y1 lets `burgee` keep its own copy of logic a foundation package would
 * otherwise own, on one condition: *"the two copies share a test-vector file."* The copy of
 * the WCAG contrast maths was made in 2026-09-08 and the condition was met **half way** —
 * roundel's test read the vectors, burgee's did not, and roundel's header said so in prose
 * for five days while nothing acted on it.
 *
 * Half is the worst version. The copy that is pinned cannot drift; the copy that is not can,
 * and it keeps a green suite while doing it. So the condition is a check now: if a vector
 * file exists, every package that holds a copy of the thing it describes reads it.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const PACKAGES = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'packages');

/**
 * Each shared vector file, and the copies it governs.
 *
 * Listed rather than discovered: "which packages hold a copy of this logic" is a fact about
 * intent, not about the tree, and a scan that guessed it would either miss a copy or invent
 * one. Adding a third copy means adding it here, which is the moment to ask whether a third
 * copy is wanted.
 */
const SHARED: { vectors: string; readers: string[]; what: string }[] = [
  {
    vectors: 'roundel/src/contrast-vectors.json',
    readers: ['roundel/src/contrast.test.ts', 'burgee/src/contrast.test.ts'],
    what: 'the WCAG 2.2 relative-luminance contrast maths (Y1, roundel R5)',
  },
];

describe.each(SHARED)('$what', ({ vectors, readers }) => {
  const file = join(PACKAGES, vectors);

  it('the vector file exists and is not empty', () => {
    expect(existsSync(file), `${vectors} is missing — every reader below is asserting nothing`).toBe(true);
    const parsed = JSON.parse(readFileSync(file, 'utf-8')) as unknown[];
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length, 'an empty vector file makes `it.each` pass silently').toBeGreaterThan(0);
  });

  it.each(readers)('%s reads it', (reader) => {
    const path = join(PACKAGES, reader);
    expect(existsSync(path), `${reader} does not exist`).toBe(true);
    const basename = vectors.slice(vectors.lastIndexOf('/') + 1);
    expect(
      readFileSync(path, 'utf-8').includes(basename),
      `${reader} holds a copy of this logic but does not read ${basename} — that is the one-sided drift lock Y1 exists to prevent`,
    ).toBe(true);
  });

  /**
   * The readers must be readers. A list that named a file which does not test the logic
   * would satisfy the rule above and protect nothing, so each one has to actually be a test.
   */
  it('every reader is a test file', () => {
    for (const reader of readers) expect(reader.endsWith('.test.ts'), reader).toBe(true);
  });
});

describe('the lock covers what it claims to', () => {
  it('finds at least one shared vector file', () => {
    expect(SHARED.length).toBeGreaterThan(0);
  });

  /**
   * A `*-vectors.json` in any package is a shared reference by naming convention, so one that
   * nobody listed here is a reference with no lock — which is how this gap appeared the first
   * time.
   */
  it('no *-vectors.json in the tree is left ungoverned', () => {
    const found: string[] = [];
    for (const pkg of readdirSync(PACKAGES, { withFileTypes: true })) {
      if (!pkg.isDirectory()) continue;
      const src = join(PACKAGES, pkg.name, 'src');
      if (!existsSync(src)) continue;
      for (const entry of readdirSync(src)) {
        if (entry.endsWith('-vectors.json')) found.push(`${pkg.name}/src/${entry}`);
      }
    }
    expect(found.toSorted()).toEqual(SHARED.map((s) => s.vectors).toSorted());
  });
});
