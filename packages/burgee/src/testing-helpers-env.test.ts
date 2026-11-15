/**
 * cli-testing-harness R7 — `swapEnv` leaves `process.env` byte-identical, including after a run
 * that throws.
 *
 * Its own file because the mutation run cannot hold it: under a mutation runner restoring the
 * env reorders its keys (Stryker's forced `threads` pool; oxmutate's dry run fails it too,
 * measured 2026-11-14), so `scripts/mutation.ts` skips this file. It used to live in
 * `testing-helpers.test.ts`, and skipping that whole file to lose these two cases cost every
 * kill the rest of it makes.
 */
import { describe, expect, it } from 'vitest';

import { swapEnv } from './testing.js';

describe('swapEnv (R7 lock)', () => {
  it('leaves process.env byte-identical after a run, even one that throws', () => {
    const before = JSON.stringify(process.env);
    const restore = swapEnv({ ONLY: 'this' });
    try {
      expect(process.env.ONLY).toBe('this');
      expect(process.env.PATH).toBeUndefined();
      throw new Error('the run failed');
    } catch {
      // the harness restores in finally; so does this test
    } finally {
      restore();
    }
    expect(JSON.stringify(process.env)).toBe(before);
  });

  it('is a no-op without an env to inject', () => {
    const before = JSON.stringify(process.env);
    swapEnv(undefined)();
    expect(JSON.stringify(process.env)).toBe(before);
  });
});
