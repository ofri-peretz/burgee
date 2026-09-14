/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * R10 — the one property the three vendored suites cannot run without.
 *
 * `strip-ansi`, `wrap-ansi` and `slice-ansi` all export a single function as their
 * **default**, and all three of their suites open with `import x from './index.js'`. The
 * oracle grades ours by generating a shim that re-exports the target, so the first line of
 * every one of those runs is effectively `export { default } from 'linegauge/strip'`. A
 * subpath with no default does not fail one case there — it fails to *link*, and the whole
 * suite dies before a single assertion runs.
 *
 * That is not a hypothetical. Measured 2026-09-14, before the defaults were added:
 *
 *     SyntaxError: The requested module 'linegauge/strip' does not provide an export
 *     named 'default'
 *     ...
 *     # tests 0 / # pass 0 / # fail 2
 *
 * Eight cases the implementation already satisfies, reported as zero. So the compat rate is
 * not by itself a check on this: a missing default reads there as "we are incompatible",
 * which is the most expensive way to say "an export line is absent". This file says it in
 * one sentence instead, in the package that owns the export, and it fails the moment any of
 * the three defaults is dropped or re-pointed at a different function.
 *
 * `truncate` and `widest` are deliberately absent from the table: neither has a vendored
 * suite yet, and an export is a contract forever.
 */
import { describe, expect, it } from 'vitest';

import sliceDefault, { slice } from './slice.js';
import stripDefault, { strip } from './strip.js';
import wrapDefault, { wrap } from './wrap.js';

/** Each graded subpath: the default it publishes, and the named export it must *be*. */
const FACADES = [
  { subpath: 'linegauge/strip', incumbent: 'strip-ansi', asDefault: stripDefault as unknown, named: strip as unknown },
  { subpath: 'linegauge/wrap', incumbent: 'wrap-ansi', asDefault: wrapDefault as unknown, named: wrap as unknown },
  { subpath: 'linegauge/slice', incumbent: 'slice-ansi', asDefault: sliceDefault as unknown, named: slice as unknown },
] as const;

describe.each(FACADES)('$subpath, the $incumbent façade', ({ asDefault, named }) => {
  it('publishes a default export', () => {
    expect(typeof asDefault).toBe('function');
  });

  /**
   * Identity, not equivalence. Two functions that merely agree today would let the façade
   * and the named export drift apart later without anything going red, and the drift would
   * surface as a compat rate falling for no reason anyone could name.
   */
  it('publishes the same function object as its named export', () => {
    expect(asDefault).toBe(named);
  });
});

describe('the root default stays `width`', () => {
  /**
   * The subpath defaults exist *because* the root one is spoken for (R8/Y3): the
   * `string-width` override resolves to the package root, so `width` cannot move without
   * breaking the one drop-in recipe the README publishes.
   */
  it('is `width`, not one of the three new subpath defaults', async () => {
    const index = (await import('./index.js')) as { default: unknown };
    const { width } = await import('./width.js');
    expect(index.default).toBe(width);
  });
});
