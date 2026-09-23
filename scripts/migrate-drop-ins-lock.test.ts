/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — the drop-ins `burgee migrate` rewrites are the ones `compat-oracle` grades (A11, D-134).
 *
 * `packages/burgee/src/compat.ts` carries `DROP_INS` as a copy, because the oracle is
 * `private: true` and a user who installs burgee has no `hosts.ts` to read. A copy nothing
 * checks is how a codemod comes to rewrite `chalk` to a specifier the oracle never graded —
 * or to stop rewriting one it did. So this re-derives the list from the oracle's own host
 * table, exactly as the oracle builds each graded import: the incumbent is `<host><subpath>`
 * (or the import's `control`, where the incumbent is a separate package, as `yargs-parser`
 * is), and the drop-in is `<target><subpath>`.
 */
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// eslint-disable-next-line import-next/no-relative-packages -- by path, never by name: a bare `burgee/*` resolves from another checkout's dist/ in an uninstalled worktree, and `compat.ts` is not an export
import { DROP_INS } from '../packages/burgee/src/compat.js';
// eslint-disable-next-line import-next/no-relative-packages -- by path, never by name: compat-oracle is private and never installed as a dependency (compat-oracle R6, scripts/oracle-import-lock.test.ts)
import { HOSTS } from '../packages/compat-oracle/src/hosts.js';

const BASELINE = resolve(fileURLToPath(new URL('..', import.meta.url)), 'packages/compat-oracle/baseline');

/** Every graded pair, from the oracle: hosts with a baseline and a family target. */
const derived = HOSTS.filter((h) => existsSync(join(BASELINE, `${h.name}.json`)) && h.target !== '—').flatMap((h) =>
  h.imports.map((i) => ({ host: h.name, from: i.control ?? `${h.npmName ?? h.name}${i.subpath}`, to: `${h.target}${i.subpath}` })),
);
const unique = [...new Map(derived.map((d) => [`${d.from} ${d.to}`, d])).values()];

const key = (d: { host: string; from: string; to: string }): string => `${d.host} ${d.from} ${d.to}`;

describe("burgee migrate's drop-ins are the oracle's", () => {
  it('derives a non-empty list, so the comparison below cannot pass vacuously', () => {
    expect(unique.length).toBeGreaterThan(20);
  });

  it('holds DROP_INS equal to the pairs the oracle grades', () => {
    expect(DROP_INS.map(key).sort()).toEqual(unique.map(key).sort());
  });
});
