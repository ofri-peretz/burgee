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
 * A tail is the cut from column `total - keep`. `slice` counts `width`'s columns since
 * slice-ansi 10 (burgee#1392), so what is left from there draws in at most `keep`, and one
 * column earlier would take a wide cluster the cut rounds past. Until then `slice` counted
 * **positions** — every cluster at least one, a lone regional indicator two — and a tail cut
 * there came back one column over its budget with CRLF before it, which is why the tail used to
 * be searched for as the head is. That search could no longer move off its first guess, so it
 * is gone.
 *
 * A head still searches for the widest cut that fits by `width`: a zero-width cluster at `keep`
 * goes to the next slice, and the cut that keeps it is a column later.
 */
function fit(string: string, keep: number, end: 'head' | 'tail', total: number): string {
  if (end === 'tail') return slice(string, total - keep);
  let low = keep;
  // Stryker disable next-line NumericLiteral: any bound at or past the widest prefix finds the same one, and no string is wider than twice its length
  let high = string.length * 2;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (width(slice(string, 0, mid)) <= keep) low = mid;
    else high = mid - 1;
  }
  return slice(string, 0, low);
}

export function truncate(string: string, columns: number, options: TruncateOptions = {}): string {
  const { position = 'end', ellipsis = '\u2026' } = options;
  // Stryker disable next-line EqualityOperator,ConditionalExpression: a budget of 0 or less reaches `mark >= columns` below and comes back empty there too
  if (columns <= 0) return '';

  const total = width(string);
  if (total <= columns) return string;

  const mark = width(ellipsis);
  // No room for both. The ellipsis alone is the most informative thing that fits, and when
  // even that does not fit the honest answer is nothing rather than a cut-up ellipsis.
  if (mark >= columns) return mark === columns ? ellipsis : '';

  const keep = columns - mark;
  if (position === 'start') return ellipsis + fit(string, keep, 'tail', total);
  // Stryker disable next-line StringLiteral: `fit` only asks whether its end is 'tail', so any other spelling is the head
  if (position === 'end') return fit(string, keep, 'head', total) + ellipsis;

  // Middle: the left half rounds up, so an odd budget spends its extra column on the text
  // the reader meets first.
  const left = Math.ceil(keep / 2);
  // Stryker disable next-line StringLiteral: `fit` only asks whether its end is 'tail', so any other spelling is the head
  return fit(string, left, 'head', total) + ellipsis + fit(string, keep - left, 'tail', total);
}
