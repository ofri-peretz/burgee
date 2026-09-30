/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * linegauge — how much of a terminal line a string occupies, and how to fold it.
 *
 * F1 of the foundation tier, built by moving rather than by writing: `width` and `wrap`
 * were already in `flagstaff`, already ported, already graded differentially against
 * `string-width` and `wrap-ansi`. This package is where they belong, because measuring a
 * line is not drawing one — a spinner, a box, a table and a status line all need the
 * measurement, and nothing about the measurement needs any of them.
 *
 * The default export is `width`, byte-for-byte call-compatible with `string-width`'s
 * default (R8), so `overrides: { "string-width": "npm:linegauge@^1" }` resolves.
 *
 * `slice`, `truncate` and `widest` came next, built on the style stack `wrap` already
 * carried — which is the consolidation the design is named for: `slice-ansi`, `wrap-ansi`
 * and `cli-truncate` each keep their own copy of it, and they disagree at the edges.
 *
 * `strip` (R3) followed, and it is where the measured divergence from Node's own
 * `stripVTControlCharacters` is recorded — one shape in sixteen, and it was a live bug in
 * `width()`.
 *
 * R2's fast path: locked by `differential.test.ts`.
 */
// A star and not `export { slice }`, measured: esbuild counts a named re-export as one more use
// of `slice` when it hands out short names, so `import { slice } from 'linegauge'` minified to
// one byte more than the same import from `linegauge/slice` did, and the tree-shake fixture
// (U10) requires the two to be equal. `slice.js` exports `slice` and a default, and a star
// never re-exports a default, so the root's surface is the same. **First**, since 2026-09-30:
// esbuild emits modules in the order the root reaches them, and short names follow that order,
// so `{ truncate }` from the root measured a byte off `linegauge/truncate` until the root reached
// `slice` before `width`, as `truncate.ts` itself does — and `truncate` is a star below for the
// reason `slice` is one (U10, B5).
export * from './slice.js';
// `Options` is string-width's name for `WidthOptions`: the root is string-width's drop-in, so a
// typed program's `import { type Options } from 'string-width'` migrates by its import alone.
export { lineCount, measure, width, width as default, type WidthOptions, type WidthOptions as Options } from './width.js';
export { strip } from './strip.js';
export * from './truncate.js'; // `truncate` and `type TruncateOptions`; see the note on `slice`
export { widest } from './widest.js';
export { wrap, type WrapOptions } from './wrap.js';
