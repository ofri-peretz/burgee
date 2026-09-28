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
function head(string: string, keep: number): string {
  let low = keep;
  let high = string.length * 2;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (width(slice(string, 0, mid)) <= keep) low = mid;
    else high = mid - 1;
  }
  return slice(string, 0, low);
}

function tail(string: string, keep: number, total: number): string {
  let low = total - keep;
  let high = string.length * 2;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (width(slice(string, mid)) <= keep) high = mid;
    else low = mid + 1;
  }
  return slice(string, low);
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
  if (position === 'start') return ellipsis + tail(string, keep, total);
  if (position === 'end') return head(string, keep) + ellipsis;

  // Middle: the left half rounds up, so an odd budget spends its extra column on the text
  // the reader meets first.
  const left = Math.ceil(keep / 2);
  return head(string, left) + ellipsis + tail(string, keep - left, total);
}
