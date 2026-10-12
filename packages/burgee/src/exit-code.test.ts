import { describe, expect, it } from 'vitest';

import { kindOf } from './error-kinds.js';
import { ExitCode, isExitCode } from './index.js';

// E1 lock: the contract in spec.md, pinned. A changed number here is a breaking
// change for every agent that branches on it.
describe('ExitCode (E1)', () => {
  it('matches the design contract exactly', () => {
    expect(ExitCode).toEqual({
      OK: 0,
      RUNTIME: 1,
      USAGE: 2,
      CONFIG: 3,
      CANCELLED: 4,
      AUTH: 5,
      TIMEOUT: 6,
      SIGINT: 130,
    });
  });

  it('has no two names sharing a code', () => {
    const codes = Object.values(ExitCode);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('recognises only the eight codes', () => {
    expect(isExitCode(ExitCode.SIGINT)).toBe(true);
    expect(isExitCode(ExitCode.OK)).toBe(true);
    expect(isExitCode(ExitCode.AUTH)).toBe(true);
    expect(isExitCode(ExitCode.TIMEOUT)).toBe(true);
    // 7, not `AUTH + 1` — that was 6 and became `TIMEOUT` (D-20261011-timeout-exit-code), the
    // second time a case asserting an unknown code came to assert a known one. 7 is the first
    // code `defineError` hands to authors, so the contract can never grow into it.
    expect(isExitCode(ExitCode.TIMEOUT + 1)).toBe(false);
    expect(isExitCode('2')).toBe(false);
  });
});

/**
 * clispec-conformance R2 — every code but OK is a failure, and every failure has a word: the
 * name lower-cased, `SIGINT` as `interrupted`. A code added to the contract without a kind fails
 * here, because the name is where the kind comes from.
 */
describe('every exit code has a kind (R2)', () => {
  it.each(Object.entries(ExitCode).filter(([name]) => name !== 'OK'))('%s has a snake_case kind', (_name, code) => {
    expect(kindOf(code)).toMatch(/^[a-z][a-z0-9_]*$/);
  });

  it('names them as the contract does, and OK is no failure', () => {
    expect(Object.values(ExitCode).map(kindOf)).toEqual([undefined, 'runtime', 'usage', 'config', 'cancelled', 'auth', 'timeout', 'interrupted']);
    // A code outside the contract has no kind of the contract's: a defined error carries its own.
    expect(kindOf(10)).toBeUndefined();
  });
});
