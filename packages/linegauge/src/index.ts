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
 * Not here yet, and each still at the Design→Build gate: `slice`, `truncate`, `widest`,
 * the R2 ASCII fast path, and an exported `strip`. This release is the move, so that a
 * green `flagstaff` across the deletion proves the consolidation is real before anything
 * new is written on top of it.
 */
export { lineCount, measure, width, width as default } from './width.js';
export { wrap, type WrapOptions } from './wrap.js';
