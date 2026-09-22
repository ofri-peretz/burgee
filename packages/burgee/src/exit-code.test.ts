import { describe, expect, it } from 'vitest';

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
      SIGINT: 130,
    });
  });

  it('has no two names sharing a code', () => {
    const codes = Object.values(ExitCode);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('recognises only the seven codes', () => {
    expect(isExitCode(ExitCode.SIGINT)).toBe(true);
    expect(isExitCode(ExitCode.OK)).toBe(true);
    expect(isExitCode(ExitCode.AUTH)).toBe(true);
    // 6, not `CANCELLED + 1` — that was 5 and became `AUTH` when E6 landed, so the case
    // asserting an unknown code was asserting a known one. The next free number instead.
    expect(isExitCode(ExitCode.AUTH + 1)).toBe(false);
    expect(isExitCode('2')).toBe(false);
  });
});
