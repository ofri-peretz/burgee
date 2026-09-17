/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — the roadmap checker can see a requirement however the design declares it.
 *
 * `designGap()` read `- **R<n>**` bullets and nothing else, and reported *"the design lists
 * no requirements"* for two designs that are full of them: `burgee`, whose **114**
 * requirements are numbered `B1`…`Z5` across twenty families, and `compat-oracle`, which
 * uses `C1`–`C6` beside `R1`–`R4` and declares them as table rows.
 *
 * So the largest design in the repository and the one that decides every published
 * compatibility number each scored the same as a design containing nothing. **A checker that
 * cannot see a requirement can never report it missing** — the quiet half of the failure
 * `plan-progress.ts` has now hit five times, a condition false for a reason that has nothing
 * to do with its step.
 *
 * Both halves are pinned, because a pattern loosened once is a pattern loosened again: it
 * must **find** a requirement in either shape and under any family letter, and it must not
 * mistake a status row, a heading or an ordinary capitalised word for a declaration.
 */
import { describe, expect, it } from 'vitest';

import { ID, REQUIREMENT, STATUS_ROW } from './plan-progress.js';

/** `matchAll` on a `g` regex is stateful; each case gets its own read. */
const declared = (text: string): string[] => [...new Set([...text.matchAll(new RegExp(REQUIREMENT.source, 'gm'))].map((m) => (m[1] ?? m[2]) as string))];
const built = (text: string): string[] => [...text.matchAll(new RegExp(STATUS_ROW.source, 'gm'))].map((m) => m[1] as string);

describe('a requirement is found however it is declared', () => {
  it('finds a bullet — the shape that always worked', () => {
    expect(declared('- **R1** the width layer\n- **R2** the wrap façade')).toEqual(['R1', 'R2']);
  });

  it('finds a table row — seniority and compat-oracle declare this way', () => {
    expect(declared('| C1 | the control runs first | measured |\n| R4 | the ratchet only rises | measured |')).toEqual(['C1', 'R4']);
  });

  it("finds a family that is not R — burgee's N6, J3, U5 and the other seventeen letters", () => {
    expect(declared('- **N6** every command declares its effects\n- **U5** no heavier than what it replaces\n| J3 | one explicit opt-in | — |')).toEqual(['N6', 'U5', 'J3']);
  });

  it('is not fooled by prose that merely mentions an id', () => {
    expect(declared('The R9 bar is restated as D1\u2019s, and N6 stays open.')).toEqual([]);
  });

  it('requires the status to be the second cell, not anywhere in the row', () => {
    expect(built('| R1 | **Built** | src/width.ts | width.test.ts |')).toEqual(['R1']);
    expect(built('| R2 | **Not built** | nothing yet | — |'), 'Not built must not read as built').toEqual([]);
    expect(built('| R3 | not this lane\u2019s | **Built** elsewhere | — |'), 'a `Built` in a later cell is prose, not a status').toEqual([]);
  });

  it("reads every id out of a `## What shipped (…)` heading, whatever its family", () => {
    const heading = '## What shipped (N1, N2, J4 — the engine surface — 2026-09-16)';
    const inner = /^## What shipped \(([^)]*)\)/m.exec(heading)?.[1] ?? '';
    expect([...inner.matchAll(new RegExp(ID.source, 'g'))].map((m) => m[0])).toEqual(['N1', 'N2', 'J4']);
  });
});
