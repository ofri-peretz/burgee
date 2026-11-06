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

describe('processRuntime with a process', () => {
  it('reads whether the stream it is asked about, stdout by default, is a terminal', async () => {
    const { processRuntime } = await import('./runtime.js');
    const was = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
    try {
      Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
      expect(processRuntime().isTTY.stdout).toBe(true);
      expect(processRuntime('stdout').isTTY.stdout).toBe(true);
      Object.defineProperty(process.stdout, 'isTTY', { value: undefined, configurable: true });
      expect(processRuntime().isTTY.stdout).toBe(false);
    } finally {
      if (was === undefined) Reflect.deleteProperty(process.stdout, 'isTTY');
      else Object.defineProperty(process.stdout, 'isTTY', was);
    }
  });
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
