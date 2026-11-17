/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — paratext's root default bundles no heavier than `ansi-escapes`' (U5).
 *
 * B4's `paratext` row bundles a fixture that imports the root's default export and re-exports
 * it, and does the same over `ansi-escapes` 7.3.0. Until 2026-11-17 that read **7,038 B**
 * against **4,351 B**, 1.618×, and the row's gates were ratchets at the measurement (7,200 and
 * 1.65) that only stopped it growing. Those gates are checked by `npm run bench -- --axis weight
 * --check`, which no pre-push hook runs, so a byte added to the root's default reached main and
 * waited for the next benchmark run to say so.
 *
 * What was in the 2,687 B over: the root registered its seven built-ins through `register` at
 * import, so the schema walk (`shape.js`, 1.3 KB) and the capability fragment (452 B) rode in
 * every bundle of the default, for records that are constants; and the default spread `import *
 * as csi`, a namespace esbuild materialises as a getter object (242 B). Both are gone, and this
 * runs the row here, from the build, through the same `bundledRecords` and `pairRecords` the
 * benchmark uses, so every gate the row carries holds before a push rather than after a run.
 *
 * Deterministic: esbuild over `dist/`, no timing. Paratext's figure in CI equals the local one
 * (7,038 in `2026-11-14-6eab290-ci.json` and 7,038 locally at the same commit). It needs `dist/`,
 * which the pre-push battery builds before this suite runs.
 *
 * Proven red on the code before the fix: 7,038 against the 4,400 ceiling and 1.618 against 1.
 */
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { bundledRecords } from 'benchmarks/axes/weight.js';
import { beforeAll, describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** Two esbuild runs; generous, because the pre-push battery runs this under full load. */
const MEASURE_MS = 120_000;

type Row = ReturnType<typeof bundledRecords>[number];

describe('paratext against ansi-escapes, bundled', () => {
  let rows: Row[];
  beforeAll(() => {
    expect(existsSync(join(ROOT, 'packages/paratext/dist/index.js')), 'build paratext first: `npx turbo run build --filter=paratext`').toBe(true);
    rows = bundledRecords(['paratext']);
  }, MEASURE_MS);

  const row = (variant: string, metric: string): Row => {
    const found = rows.find((r) => r.variant === variant && r.metric === metric);
    if (found === undefined) throw new Error(`B4 produced no ${metric} row for ${variant}`);
    return found;
  };

  it('measures both sides, so a broken reader cannot make this vacuous', () => {
    expect(row('paratext', 'bundled-bytes').median).toBeGreaterThan(0);
    expect(row('ansi-escapes', 'bundled-bytes').median).toBeGreaterThan(0);
  });

  it('the root default is no heavier than ansi-escapes’ default', () => {
    const ours = row('paratext', 'bundled-bytes').median;
    const theirs = row('ansi-escapes', 'bundled-bytes').median;
    expect(ours, `paratext bundles to ${String(ours)} B against ansi-escapes' ${String(theirs)} B`).toBeLessThanOrEqual(theirs);
  });

  it('holds every gate the B4 row carries', () => {
    const gated = rows.filter((r) => r.gate?.max !== undefined);
    // The byte ceiling and the ratio: both, or a gate went missing from `weight.ts`.
    expect(gated.map((r) => `${r.variant} ${r.metric}`).toSorted()).toEqual(['paratext bundled-bytes', 'paratext ÷ ansi-escapes bundled-bytes-ratio']);
    for (const r of gated) expect(r.median, `${r.variant} ${r.metric}`).toBeLessThanOrEqual(r.gate?.max as number);
  });
});
