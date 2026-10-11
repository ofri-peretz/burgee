/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * `linegauge/widest-line` — the drop-in path for `widest-line` 6 (`graded-override-targets` R6).
 *
 * widest-line's default export, graded by its own suite in `compat-oracle`: one string, split
 * on `\n`, the widest line's columns. `linegauge/widest` takes any iterable of lines instead,
 * so a caller measuring a file need not hold it, and that stays the family's API; this is the
 * incumbent's shape over it.
 */
import { widest } from './widest.js';

/** The width of the widest line in `string`, in terminal columns. */
// eslint-disable-next-line import-next/no-default-export -- the incumbent's entry is a default export, and it is the whole point of this file
export default function widestLine(string: string): number {
  return widest(string.split('\n'));
}
