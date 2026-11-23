import { describe, expect, it } from 'vitest';

import { FRESH_FROM_COVER_MS, FRESH_START_MS, STATIC_FRESH_FROM_COVER_MS, STATIC_PER_COVER, STATIC_UNIT_MS, WARM_BLOWUP, WARM_UNIT_MS, freshIsCheaper, staticFreshIsCheaper } from './fresh-first.js';

describe('which mutants run fresh straight away', () => {
  it('turns at the cover time where a fresh worker costs what the warm run does', () => {
    expect(FRESH_FROM_COVER_MS).toBeCloseTo((FRESH_START_MS - WARM_UNIT_MS) / (WARM_BLOWUP - 1), 10);
    // 49 ms, from the measured start of a worker (250), a unit's share (20) and the armed run's blow-up (5.7).
    expect(Math.round(FRESH_FROM_COVER_MS)).toBe(49);
    // The exact turn, so that none of the three measured figures can move by a millisecond unseen: (250 - 20) / (5.7 - 1).
    expect(FRESH_FROM_COVER_MS).toBeCloseTo(48.9362, 3);
    expect(freshIsCheaper(FRESH_FROM_COVER_MS - 1)).toBe(false);
    expect(freshIsCheaper(FRESH_FROM_COVER_MS + 1)).toBe(true);
    // Equal cost is warm: the side with the verified default.
    expect(freshIsCheaper(FRESH_FROM_COVER_MS)).toBe(false);
  });

  it('keeps every measured fast file warm and the one slow file fresh', () => {
    // The largest total test time of any file measured outside pathe's glob.spec.ts (pathe index.spec.ts, 29 ms) ...
    for (const cover of [0, 1, 4, 9, 17, 29]) expect(freshIsCheaper(cover)).toBe(false);
    // ... and glob.spec.ts, whose 36 tests took 3,395 ms in the dry run; so does one of its mutants covered by a single 94 ms test.
    for (const cover of [94, 443, 3395]) expect(freshIsCheaper(cover)).toBe(true);
  });
});

describe('which static mutants run fresh straight away', () => {
  it('turns at the cover time where a fresh worker costs what the live static run does', () => {
    expect(STATIC_FRESH_FROM_COVER_MS).toBeCloseTo((FRESH_START_MS - STATIC_UNIT_MS) / STATIC_PER_COVER, 10);
    expect(Math.round(STATIC_FRESH_FROM_COVER_MS)).toBe(278);
    expect(STATIC_FRESH_FROM_COVER_MS).toBeCloseTo(278.2609, 3);
    expect(staticFreshIsCheaper(STATIC_FRESH_FROM_COVER_MS - 1)).toBe(false);
    expect(staticFreshIsCheaper(STATIC_FRESH_FROM_COVER_MS + 1)).toBe(true);
    expect(staticFreshIsCheaper(STATIC_FRESH_FROM_COVER_MS)).toBe(false);
  });

  it('keeps the measured ufo cover live and pathe’s glob.spec.ts cover fresh', () => {
    // ufo: about 50 ms of tests in the files that load its static values; 145 ms a mutant live.
    expect(staticFreshIsCheaper(50)).toBe(false);
    // pathe: 3,442 ms, 1,700 ms a mutant live.
    expect(staticFreshIsCheaper(3442)).toBe(true);
    // The line through the two points gives back their measured cost.
    expect(Math.round(STATIC_UNIT_MS + STATIC_PER_COVER * 50)).toBe(145);
    expect(Math.round(STATIC_UNIT_MS + STATIC_PER_COVER * 3442)).toBe(1705);
  });
});
