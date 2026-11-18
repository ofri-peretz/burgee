/** Stub test created by PLAN.md 6.0; lane `ac-agents` replaces it with the command's own tests. */
import { describe, expect, it } from 'vitest';

import { command } from './command-explain.js';

describe('`explain` before its lane lands', () => {
  it('is described for --help and the MCP tool list', () => {
    expect(command.description).toBe('One operation, message or tool, fully resolved and size-capped for an agent');
  });

  it('refuses with a fix line naming the lane', () => {
    expect(() => (command.run as () => unknown)()).toThrow('`apicontract explain` is not implemented yet. fix: it lands in Wave 6 (.sdlc/PLAN.md, lane ac-agents)');
  });
});
