/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — a reference vector file has readers, and they are tests.
 *
 * **This began as something else, and the change is worth recording.** Floor rule Y1 let
 * `burgee` keep its own copy of the WCAG contrast maths on one condition — *"the two copies
 * share a test-vector file"* — and the condition was met half way: roundel's test read the
 * vectors, burgee's did not, so the pinned copy could not drift and the unpinned one could.
 *
 * Then #194 removed the copy. `burgee/contrast` now imports `roundel/contrast`, so there is
 * one implementation and nothing to drift *between*. The original reason for this file is
 * gone, and a lock kept alive by a reason that has expired is exactly the stale blocker the
 * roadmap audit was about.
 *
 * What survives is smaller and still true: `contrast-vectors.json` is a set of reference
 * values computed outside the implementation, and **a reference nobody reads is a file, not a
 * reference.** Both tests do read it — burgee's grades the re-exported functions, roundel's
 * grades the source — and this keeps that true, and keeps a future `*-vectors.json` from
 * landing with no reader at all.
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
    what: 'the WCAG 2.2 relative-luminance contrast values (roundel R5; one implementation since #194)',
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
      `${reader} exercises this logic but does not read ${basename} — a reference nobody reads is a file, not a reference`,
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
