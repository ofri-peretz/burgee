/**
 * `init` with the package manager and the disk stubbed: how the install is run (its streams and
 * its deadline, Y10), the name a nameless directory gets, and the error a failed install is.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { init, InstallError } from './init.js';

const run = vi.hoisted(() => vi.fn(() => Promise.resolve({ ok: true, code: 0 })));
vi.mock('bellpull', async (original) => ({ ...(await original<Record<string, unknown>>()), run }));

const written = vi.hoisted(() => new Map<string, string>());
vi.mock('node:fs', async (original) => {
  const fs = await original<typeof import('node:fs')>();
  return { ...fs, existsSync: () => false, mkdirSync: () => undefined, writeFileSync: (at: string, text: string) => written.set(at, text) };
});

beforeEach(() => {
  written.clear();
  run.mockClear();
});

describe('init, stubbed', () => {
  it('runs the install with no stdin, its stdout held, its stderr the user’s, and ten minutes to finish', async () => {
    await init({ dir: '/work/demo', typed: undefined, force: false, install: true, env: {} });
    expect(run).toHaveBeenCalledWith('npm', ['install'], expect.objectContaining({ stdio: ['ignore', 'pipe', 'inherit'], timeout: 600_000 }));
  });

  it('names the package my-cli when the directory has no name of its own', async () => {
    await init({ dir: '/', typed: undefined, force: false, install: false, env: {} });
    const manifest = [...written].find(([at]) => at.endsWith('package.json'))?.[1];
    expect(JSON.parse(String(manifest))).toMatchObject({ name: 'my-cli' });
  });

  it('a failed install is an InstallError by name', () => {
    expect(new InstallError('npm install', 1, 'cd x && npm install').name).toBe('InstallError');
  });
});
