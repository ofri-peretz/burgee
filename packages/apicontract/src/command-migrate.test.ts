/** Stub test created by PLAN.md 6.0; lane `ac-kit` replaces it with the command's own tests. */
import { describe, expect, it } from 'vitest';

import { command } from './command-migrate.js';

describe('`migrate` before its lane lands', () => {
  it('is described for --help and the MCP tool list', () => {
    expect(command.description).toBe('Switch from openapi-typescript, openapi-fetch, Hey API or orval: their config in, ours out');
  });

  it('refuses with a fix line naming the lane', () => {
    expect(() => (command.run as () => unknown)()).toThrow('`apicontract migrate` is not implemented yet. fix: it lands in Wave 6 (.sdlc/PLAN.md, lane ac-kit)');
  });
});
