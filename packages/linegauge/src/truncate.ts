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
  if (position === 'start') return ellipsis + slice(string, total - keep);
  if (position === 'end') return slice(string, 0, keep) + ellipsis;

  // Middle: the left half rounds up, so an odd budget spends its extra column on the text
  // the reader meets first.
  const left = Math.ceil(keep / 2);
  return slice(string, 0, left) + ellipsis + slice(string, total - (keep - left));
}
