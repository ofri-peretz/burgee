/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */
/**
 * Each npm description opens with the words people type (`.sdlc/intents/npm-search/` spec R3).
 *
 * npm search matches exact words with no stemming, and a person scanning results reads the first
 * few. So every published package's description carries its primary phrase from `PHRASES`, in
 * order and adjacent, within its first eight words. Where in those eight words does not matter:
 * position had no measurable effect on rank (`.sdlc/research/npm-search-rank-2026-11-15.md`).
 *
 * Proven red on the descriptions as they stood on 2026-11-15, before R2 rewrote them: 9
 * failures (bellpull, caique, closeout, controlroom, flagstaff, linegauge, paratext, roundel,
 * seniority). burgee ("A CLI framework") and oxmutate ("Mutation testing") already led with
 * theirs.
 */
import { describe, expect, it } from 'vitest';

import { PHRASES, opensWith, publishedDescriptions, words } from './npm-search-rank.js';
import { named } from './positioning-audit.js';

const DESCRIPTIONS = publishedDescriptions();

describe('every published package has one phrase row, and every row a published package', () => {
  it('names no published package without a row', () => {
    expect([...DESCRIPTIONS.keys()].filter((p) => !(p in PHRASES))).toEqual([]);
  });
  it('names no row without a published package', () => {
    expect(Object.keys(PHRASES).filter((p) => !DESCRIPTIONS.has(p))).toEqual([]);
  });
});

describe("each description's first eight words carry its primary phrase", () => {
  it.each(Object.entries(PHRASES))('%s', (pkg, { primary }) => {
    const description = DESCRIPTIONS.get(pkg) ?? '';
    expect(opensWith(description, primary), `"${primary}" is not in the first eight words: ${words(description).slice(0, 8).join(' ')}`).toBe(true);
  });
});

describe('a primary phrase names no incumbent (positioning R7)', () => {
  it.each(Object.entries(PHRASES))('%s', (_pkg, { primary }) => {
    expect(named(primary)).toEqual([]);
  });
});

describe('the matcher, against fixtures', () => {
  it('matches words in order and adjacent, across punctuation', () => {
    expect(opensWith('Terminal UI (TUI) framework: keyboard-driven', 'tui framework')).toBe(true);
  });
  it('does not match words that are apart', () => {
    expect(opensWith('Hyperlinks in the terminal', 'terminal hyperlinks')).toBe(false);
  });
  it('does not stem', () => {
    expect(opensWith('Terminal hyperlink support', 'terminal hyperlinks')).toBe(false);
  });
  it('does not look past the eighth word', () => {
    expect(opensWith('one two three four five six seven exit hook', 'exit hook')).toBe(false);
  });
});
