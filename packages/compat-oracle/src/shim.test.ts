/**
 * The one line that decides what a suite grades: `COMPAT_TARGET`, or commander when unset —
 * the control, which proves the gate before it grades anything of ours.
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

it('grades commander itself when no target is named', async () => {
  vi.stubEnv('COMPAT_TARGET', undefined);
  const { default: loaded } = await import('./shim.js');
  expect(loaded).toBe(await import('commander'));
});

it('grades whatever COMPAT_TARGET names', async () => {
  vi.stubEnv('COMPAT_TARGET', 'node:path');
  const { default: loaded } = await import('./shim.js');
  expect(loaded).toBe(await import('node:path'));
});
