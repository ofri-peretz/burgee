/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — seniority's truth-table page is the one `TRUTH_TABLE` generates (seniority R1,
 * criterion 2). A generated page nobody regenerates is a hand-written page with a header that
 * says otherwise.
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

// eslint-disable-next-line import-next/no-relative-packages -- by path, as truth-table-page.ts reads it: the lock compares against the source, not a dist/
import { TRUTH_TABLE } from '../packages/seniority/src/truth-table.js';

import { PAGE, render } from './truth-table-page.js';

describe('the truth-table page', () => {
  it('is what TRUTH_TABLE generates — run `npm run truth-table:page`', () => {
    expect(readFileSync(PAGE, 'utf8')).toBe(render());
  });

  it('has one table row per row of the table, so no combination is left off the page', () => {
    const rows = render()
      .split('\n')
      .filter((l) => /^\| (?:set|·) /u.test(l));
    expect(rows).toHaveLength(TRUTH_TABLE.length);
  });
});
