/**
 * `ctxOf` on its own, with no MCP server registered: the call it reads by symbol is absent, so
 * the run has no client to cancel it and `ctx.progress` tells nothing. The symbol is taken off
 * for the test, since a server loaded anywhere in the worker registers it.
 */
import { Readable } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { ctxOf } from './ctx.js';
import { detachedTeardown } from './shutdown.js';

describe('ctxOf with no MCP server loaded', () => {
  it('builds a context whose signal never aborts and whose progress does nothing', () => {
    const key = Symbol.for('burgee.mcp');
    const server: unknown = Reflect.get(globalThis, key);
    Reflect.deleteProperty(globalThis, key);
    try {
      const ctx = ctxOf({ env: {}, stdin: Readable.from([]), out: {}, teardown: detachedTeardown() });
      expect(ctx.signal.aborted).toBe(false);
      expect(ctx.progress({ progress: 1 } as never)).toBeUndefined();
    } finally {
      if (server !== undefined) Reflect.set(globalThis, key, server);
    }
  });
});
