/** Stub test created by PLAN.md 6.0; lane `ac-diff` replaces it with the command's own tests. */
import { describe, expect, it } from 'vitest';

import { command } from './command-diff.js';

describe('`diff` before its lane lands', () => {
  it('is described for --help and the MCP tool list', () => {
    expect(command.description).toBe('What a contract change breaks, and for whom, under the compatibility mode you pick');
  });

  it('refuses with a fix line naming the lane', () => {
    expect(() => (command.run as () => unknown)()).toThrow('`apicontract diff` is not implemented yet. fix: it lands in Wave 6 (.sdlc/PLAN.md, lane ac-diff)');
  });
});
