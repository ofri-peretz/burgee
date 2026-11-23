import { describe, expect, it } from 'vitest';

import { protect, toText } from './protect.js';

const GATES = ['REVIEW.md', 'scripts/*-lock.test.ts'];

describe('protect', () => {
  it('flags gate files changed together with code', () => {
    expect(protect(['REVIEW.md', 'src/a.ts', 'scripts/x-lock.test.ts'], GATES)).toEqual({ gates: ['REVIEW.md', 'scripts/x-lock.test.ts'], code: ['src/a.ts'], flagged: true });
  });

  it('does not flag gates alone, code alone, or nothing', () => {
    expect(protect(['REVIEW.md'], GATES).flagged).toBe(false);
    expect(protect(['src/a.ts'], GATES)).toEqual({ gates: [], code: ['src/a.ts'], flagged: false });
    expect(protect([], GATES).flagged).toBe(false);
  });

  it('prints the gates and the fix, saying when observe mode does not fail', () => {
    const flagged = protect(['REVIEW.md', 'src/a.ts'], GATES);
    expect(toText(flagged, 'r', false)).toBe(
      ['r changes 1 gate file(s) together with 1 other file(s) (observe mode: not failing):', '  gate: REVIEW.md', 'fix: land the gate change in its own pull request first, so the code is judged by a gate it did not change'].join('\n'),
    );
    expect(toText(flagged, 'r', true).split('\n')[0]).toBe('r changes 1 gate file(s) together with 1 other file(s):');
    expect(toText(protect([], GATES), 'r', true)).toBe('r does not change a gate together with the code it judges');
  });
});
