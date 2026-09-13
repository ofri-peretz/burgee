/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * R7 — the widest of many lines, in one pass, allocating nothing per line.
 *
 * Every caller that draws a box or a table needs this, and every one of them writes
 * `Math.max(...lines.map(width))` — which builds an array it throws away and blows the call
 * stack on a large enough table, because a spread is an argument list and V8 stops somewhere
 * around 125,000. Taking an `Iterable` also means a generator works, so a caller measuring a
 * file does not have to hold it.
 */
import { width } from './width.js';

export function widest(lines: Iterable<string>): number {
  let max = 0;
  for (const line of lines) {
    const measured = width(line);
    if (measured > max) max = measured;
  }
  return max;
}
