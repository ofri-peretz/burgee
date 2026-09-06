import { describe, expect, it } from 'vitest';

import { ExitCode } from './index.js';

// E1 lock: the contract in design.md, pinned. A changed number here is a breaking
// change for every agent that branches on it.
describe('ExitCode (E1)', () => {
  it('matches the design contract exactly', () => {
    expect(ExitCode).toEqual({
      OK: 0,
      RUNTIME: 1,
      USAGE: 2,
      CONFIG: 3,
      CANCELLED: 4,
      SIGINT: 130,
    });
  });

  it('has no two names sharing a code', () => {
    const codes = Object.values(ExitCode);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
