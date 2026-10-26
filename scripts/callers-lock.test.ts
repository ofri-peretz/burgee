/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * The caller matrix is a registry over tests that exist (`.sdlc/intents/caller-matrix/`, R3).
 *
 * `examples/conformance/src/callers.ts` says, for every feature and every caller, which test
 * holds the cell — or why it does not apply, or that nothing holds it yet. A registry is only
 * worth what stops it lying, so this fails on three things:
 *
 *   1. a cell naming a test file that does not exist, or a title that file does not contain;
 *   2. a feature or a caller with no cell;
 *   3. more `missing` cells than {@link MISSING_CEILING}. The ceiling may only fall: a test written
 *      for a missing cell lowers it in the same change.
 *
 * A test title is the address because every restatement table in `.sdlc/` already cites checks
 * as `file › "title"`. A title is found as a string literal that is the first argument of an
 * `it(…)` or `test(…)` call — `it.each(…)(…)` and `it.skipIf(…)(…)` included — so a
 * parameterised title matches by its template.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// eslint-disable-next-line import-next/no-relative-packages -- by path: the registry sits beside the conformance suite it indexes, a private workspace the root does not depend on
import { CALLERS, type Cell, FEATURES, MATRIX } from '../examples/conformance/src/callers';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

/**
 * The count of `{ missing: true }` cells. 5 when the registry was first filled, 2026-10-25; 0 since
 * 2026-10-26, when the five were written (errors × accessible; prompts, spinner, table, box × program).
 * Only ever lowered — and at 0, a feature or caller added without its tests is a red build.
 */
const MISSING_CEILING = 0;

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The nearest call head at or before the `(` at `at`: `describe`, `it` or `test`, followed by `(`, `.` or `<`. */
function callHeadBefore(source: string, at: number): string | undefined {
  const heads = [...source.slice(0, at + 1).matchAll(/\b(describe|it|test)(?=[.(<])/g)];
  return heads.at(-1)?.[1];
}

/** Does `source` hold a test (not a describe) titled exactly `title`? */
function holdsTest(source: string, title: string): boolean {
  const literal = new RegExp(`\\(\\s*(['"\`])${escape(title)}\\1\\s*,`, 'g');
  for (const m of source.matchAll(literal)) {
    const head = callHeadBefore(source, m.index);
    if (head === 'it' || head === 'test') return true;
  }
  return false;
}

/** Why a cell is not held, or undefined when it is. */
function cellProblem(cell: Cell | undefined): string | undefined {
  if (cell === undefined) return 'no cell';
  if (!('test' in cell)) return undefined;
  const file = join(ROOT, cell.test);
  if (!existsSync(file)) return `${cell.test} does not exist`;
  return holdsTest(readFileSync(file, 'utf8'), cell.name) ? undefined : `${cell.test} has no test titled "${cell.name}"`;
}

const features = Object.keys(FEATURES) as (keyof typeof FEATURES)[];
const callers = Object.keys(CALLERS) as (keyof typeof CALLERS)[];
const cells = features.flatMap((f) => callers.map((c) => ({ f, c, cell: MATRIX[f]?.[c] as Cell | undefined })));

describe('the caller matrix (caller-matrix R3)', () => {
  it('has a cell for every feature and every caller, and nothing besides', () => {
    expect(Object.keys(MATRIX).sort()).toEqual([...features].sort());
    for (const f of features) expect(Object.keys(MATRIX[f]).sort(), f).toEqual([...callers].sort());
  });

  it('names, in every held cell, a test file that exists and a test title that file contains', () => {
    const problems = cells.flatMap(({ f, c, cell }) => {
      const why = cellProblem(cell);
      return why === undefined ? [] : [`${f} × ${c}: ${why}`];
    });
    expect(problems).toEqual([]);
  });

  it('gives a reason for every cell that does not apply', () => {
    const silent = cells.filter(({ cell }) => cell !== undefined && 'na' in cell && cell.na.trim() === '').map(({ f, c }) => `${f} × ${c}`);
    expect(silent).toEqual([]);
  });

  it(`has no more missing cells than the ceiling, ${MISSING_CEILING}, which only falls`, () => {
    const missing = cells.filter(({ cell }) => cell !== undefined && 'missing' in cell).map(({ f, c }) => `${f} × ${c}`);
    expect(missing.length, missing.join(', ')).toBeLessThanOrEqual(MISSING_CEILING);
  });
});

describe('how a title is found', () => {
  it('matches an it() and a test() title, and a parameterised one by its template', () => {
    expect(holdsTest("it('does a thing', () => {})", 'does a thing')).toBe(true);
    expect(holdsTest('test("does a thing", () => {})', 'does a thing')).toBe(true);
    expect(holdsTest("it.each(['a', 'b'])('%s does a thing', (x) => {})", '%s does a thing')).toBe(true);
    expect(holdsTest("it.each<Mode>([\n  'a',\n])('%s does a thing', (x) => {})", '%s does a thing')).toBe(true);
  });

  it('does not take a describe title, a prefix of a title, or a title in prose', () => {
    expect(holdsTest("describe('does a thing', () => {})", 'does a thing')).toBe(false);
    expect(holdsTest("it('does a thing well', () => {})", 'does a thing')).toBe(false);
    expect(holdsTest("// it('does a thing'\nconst x = 'does a thing';", 'does a thing')).toBe(false);
  });
});
