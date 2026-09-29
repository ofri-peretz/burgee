/**
 * `processRuntime()` where there is no `process` — a bundle running in a browser or a worker.
 *
 * `runtime.ts` reads the global once, at import, and guards every read of it: that is the
 * only reason `roundel/chalk` can be imported somewhere node is not. The guard is checked by
 * importing a fresh copy of the module with the global removed.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('processRuntime without a process', () => {
  it('is an empty environment, no arguments and no terminal, rather than a TypeError', async () => {
    vi.resetModules();
    vi.stubGlobal('process', undefined);
    const { processRuntime } = await import('./runtime.js');
    vi.unstubAllGlobals();
    expect(processRuntime()).toEqual({ env: {}, argv: [], isTTY: { stdout: false } });
    expect(processRuntime('stderr')).toEqual({ env: {}, argv: [], isTTY: { stdout: false } });
  });
});
