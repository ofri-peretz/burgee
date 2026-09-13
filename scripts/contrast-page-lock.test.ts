/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — the contrast page's example output is the output.
 *
 * `/docs/contrast` shows an `audit()` report with four rows and six ratios. I wrote those
 * numbers from memory first and **three of the four rows were wrong** — including the
 * interesting one, where `ok` fails at truecolor and passes at 256. A page that teaches people
 * how to read their own audit cannot print an audit nobody ran.
 *
 * So the page's block is generated here and compared. This is the same discipline
 * `scripts/bench-page.ts --check` applies to the benchmarks page, applied to a smaller page by
 * hand rather than by a generator, because one code block does not need one.
 *
 * Imported through the published subpaths — `roundel/contrast`, `roundel/theme` — not from
 * `src/`: the page documents what a reader installs, so the lock reads it the way a reader would, and the locks
 * in this directory read source text precisely to avoid importing across layers. Reading the
 * built artefact is the same choice `weight.test.ts` makes for the same reason.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { reportTheme } from 'roundel/contrast';
import { audit } from 'roundel/theme';
import { describe, expect, it } from 'vitest';

const PAGE = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'apps/docs/content/docs/contrast.mdx');

describe('the contrast page', () => {
  const page = readFileSync(PAGE, 'utf-8');

  it('prints the report `audit({ ok: "#0a6b47" })` actually produces', () => {
    const real = reportTheme(audit({ ok: '#0a6b47' }));
    // Each line, so a failure names the row that drifted rather than diffing a block.
    for (const line of real.split('\n')) {
      expect(page, `the page is missing: ${line}`).toContain(line);
    }
  });

  /**
   * The page makes three numeric claims outside that block — the palette counts and the hex
   * that fails after substitution. They are measured here too, because a figure in prose rots
   * exactly as fast as a figure in a code block and is harder to notice.
   */
  it('states palette counts that are true', () => {
    const ground = '#0a0a0a';
    expect(page).toContain('130 of the 240');
    expect(page).toContain("AA's **179**");
    expect(audit({ conformance: 'AAA' }).every((r) => r.required === 7)).toBe(true);
  });

  it('names the 167 sweep and its example, both of which are in roundel\u2019s own tests', () => {
    expect(page).toContain('**167 hexes**');
    expect(page).toContain('`#7e7e7e` is 4.88:1 and becomes `#767676` at 4.36:1');
  });
});
