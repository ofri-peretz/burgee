/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * R6 — shorten a styled string to `columns` display columns, with the ellipsis **inside**
 * the budget.
 *
 * That last clause is the whole value and the off-by-one every hand-rolled truncator gets
 * wrong: `truncate(s, 10)` must return something ten columns wide, not ten columns plus an
 * ellipsis. `cli-truncate` exists as a package (36 M/wk) essentially to get this right, and
 * pays `slice-ansi` and `string-width` to do it.
 *
 * The ellipsis is measured with `width`, not assumed to be one column: a caller who passes
 * `"..."` has spent three, and a caller who passes an emoji has spent two.
 */
import { slice } from './slice.js';
import { width } from './width.js';

export interface TruncateOptions {
  /** Which end loses characters. Default `'end'`. */
  position?: 'start' | 'middle' | 'end';
  /** The mark that says something was removed. Measured, not assumed. Default `'\u2026'`. */
  ellipsis?: string;
}

/**
 * The longest head of `string` that draws in `keep` columns, and the longest tail.
 *
 * `slice` counts **positions** (every cluster at least one, a lone regional indicator two, as
 * slice-ansi does), and a position is never fewer than the columns it draws, so cutting at
 * `keep` positions can only come up short. It also means a tail cannot start at
 * `total - keep`: with CRLF before it, that position lies one column too early, and the tail
 * came back one column over its budget. Both ends therefore search for the widest cut that
 * fits by `width`. For text without zero-width clusters that is the cut `keep` names.
 */
function fit(string: string, keep: number, end: 'head' | 'tail', total: number): string {
  const head = end === 'head';
  // A head grows with its end position, a tail shrinks as its start moves right, so each
  // searches for the boundary between the cuts that fit and the ones that do not.
  const cut = (at: number): string => (head ? slice(string, 0, at) : slice(string, at));
  let low = head ? keep : total - keep;
  let high = string.length * 2;
  while (low < high) {
    const mid = (low + high + (head ? 1 : 0)) >> 1;
    const fits = width(cut(mid)) <= keep;
    if (head === fits) low = head ? mid : mid + 1;
    else high = head ? mid - 1 : mid;
  }
  return cut(low);
}

export function truncate(string: string, columns: number, options: TruncateOptions = {}): string {
  const { position = 'end', ellipsis = '\u2026' } = options;
  if (columns <= 0) return '';

  const total = width(string);
  if (total <= columns) return string;

  const mark = width(ellipsis);
  // No room for both. The ellipsis alone is the most informative thing that fits, and when
  // even that does not fit the honest answer is nothing rather than a cut-up ellipsis.
  if (mark >= columns) return mark === columns ? ellipsis : '';

  const keep = columns - mark;
  if (position === 'start') return ellipsis + fit(string, keep, 'tail', total);
  if (position === 'end') return fit(string, keep, 'head', total) + ellipsis;

  // Middle: the left half rounds up, so an odd budget spends its extra column on the text
  // the reader meets first.
  const left = Math.ceil(keep / 2);
  return fit(string, left, 'head', total) + ellipsis + fit(string, keep - left, 'tail', total);
}
