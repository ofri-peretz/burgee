/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */
import { describe, expect, it } from 'vitest';

import { tableCell } from './markdown-cell';

/** How a Markdown reader takes a cell back: each backslash escape is the character after it. */
const readBack = (cell: string): string => cell.replace(/\\(.)/g, '$1');

describe('a Markdown table cell', () => {
  it.each(['plain', 'a | b', 'a \\| b', 'ends in \\', '"quoted" \\"and\\" escaped', 'C:\\path\\to | "x"'])('round-trips %j', (text) => {
    const cell = tableCell(text);
    expect(readBack(cell)).toBe(text);
    // No unescaped `|` is left to end the cell early.
    expect(cell.replace(/\\./g, '')).not.toContain('|');
  });
});
