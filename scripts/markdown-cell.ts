/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Text as one Markdown table cell. A `|` would end the cell, so it is escaped, and so is the
 * backslash that escapes it: otherwise a cell holding `a\|b` reads back as `a|b` plus a stray
 * cell, and one ending in `\` swallows the next separator.
 */
export function tableCell(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
}
