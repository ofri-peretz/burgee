/**
 * The one door to the process (Y9, D-135). Two functions, and what matters about each is
 * *when* it reads: the environment object is the live one, and the working directory is asked
 * for at the call, so a program that `chdir`s before loading its `.env` gets the new one.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ambientCwd, ambientEnv, ambientProcess } from './runtime.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the runtime seam', () => {
  it('hands back the process’s own environment object, not a copy', () => {
    expect(ambientEnv()).toBe(process.env);
  });

  it('asks the process for its working directory at the call, not at import', () => {
    vi.spyOn(process, 'cwd').mockReturnValue('/moved/here');
    expect(ambientCwd()).toBe('/moved/here');
  });
});

describe('the command line’s view of the process', () => {
  it('is the process itself, so a signal handler it installs is a real one', () => {
    expect(ambientProcess()).toBe(process);
  });
});

/** A fresh copy of the seam, read while `globalThis.process` is `host`. */
async function under(host: unknown): Promise<typeof import('./runtime.js')> {
  vi.resetModules();
  vi.stubGlobal('process', host);
  try {
    return await import('./runtime.js');
  } finally {
    vi.unstubAllGlobals();
  }
}

describe('a runtime with no process, or one without a working directory', () => {
  it('reads no environment and no directory where there is no process', async () => {
    const fresh = await under(undefined);
    expect(fresh.ambientEnv()).toBeUndefined();
    expect(fresh.ambientCwd()).toBeUndefined();
  });

  it('reads no directory from a process that cannot report one', async () => {
    const fresh = await under({ env: { A: '1' } });
    expect(fresh.ambientEnv()).toEqual({ A: '1' });
    expect(fresh.ambientCwd()).toBeUndefined();
  });
});
