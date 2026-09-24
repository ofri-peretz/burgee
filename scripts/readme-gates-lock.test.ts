/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — the bundle figures the project quotes are the ones the current build measures.
 *
 * `claim-table-lock.test.ts` checks the README's verdicts against the last *results document*,
 * and says in its own header what that cannot do: a figure that goes stale after the last run is
 * invisible to it. That is how the README came to say `lighter-than-commander` **1.514×** at
 * tag burgee@0.11.1 while `benchmarks/axes/weight.ts` — edited in the same PR that moved the
 * bytes, D-134 — recorded **1.524** beside the raised ceiling. A published article quoted the
 * README and had to be corrected.
 *
 * So this one does not read a stored number. It bundles the three framework entries, their
 * incumbents and the parity stacks from the build — `bundledRecords`, the bundled half of B4 —
 * and requires every gate row and every declared quote to be exactly what
 * `scripts/readme-gates.ts` would write from that. A PR that moves a bundled byte of `burgee`,
 * `burgee/commander` or `burgee/yargs` regenerates them in the same PR, or it does not push.
 *
 * Nine esbuild runs, a couple of seconds; it needs `dist/`, which the pre-push battery builds
 * before this suite runs.
 *
 * Proven red on origin/main at 0d65c754d3, before the README was regenerated: README.md,
 * vs/commander.mdx, vs/yargs.mdx and launch-kit.md all drifted — `lighter-than-commander`
 * 1.514× against a measured 1.525×, `core-under-52kb-bundled` 27,552 against 28,275.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import { assertBuilt, COMMAND, FILES, type Figures, gateIds, measure, QUOTES, rewrite } from './readme-gates.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file: string): string => readFileSync(join(ROOT, file), 'utf8');
/** Nine esbuild runs; generous, because the pre-push battery runs this under full load. */
const MEASURE_MS = 120_000;

describe('the quoted bundle figures', () => {
  let figures: Figures;
  beforeAll(() => {
    assertBuilt();
    figures = measure();
  }, MEASURE_MS);

  it('finds the README gate rows it settles, so a broken reader cannot make this vacuous', () => {
    // Seven today: the core bytes, three bare ratios and three at parity. A row renamed away
    // from its gate id would otherwise drop out of the check without a sound.
    expect(gateIds(read('README.md'), figures).sort()).toEqual(
      [
        'core-under-52kb-bundled',
        'lighter-than-cac',
        'lighter-than-cac-at-parity',
        'lighter-than-commander',
        'lighter-than-commander-at-parity',
        'lighter-than-yargs',
        'lighter-than-yargs-at-parity',
      ].sort(),
    );
  });

  it('declares its quotes in files that exist', () => {
    expect(QUOTES.length).toBeGreaterThan(0);
    for (const file of FILES) expect(() => read(file), file).not.toThrow();
  });

  it.each(FILES)('%s states what the build measures', (file) => {
    const text = read(file);
    const before = text.split('\n');
    const after = rewrite(file, text, figures).split('\n');
    // The lines that would change, stated as `stated → measured`, rather than a diff of the file.
    const drift = after.flatMap((line, i) => (line === before[i] ? [] : [`- ${before[i] ?? ''}\n+ ${line}`]));
    expect(drift, `${file} quotes bundle figures the current build does not measure. Run \`${COMMAND}\` and commit the result — these figures are generated, and a byte moved without regenerating them is what put 1.514× in a published article.`).toEqual([]);
  });
});
