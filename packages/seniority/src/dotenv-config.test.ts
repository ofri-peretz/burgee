/**
 * `seniority/dotenv/config` — `import 'dotenv/config'`. Importing it is the call, so each case
 * imports a fresh copy over a `config` it can watch.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const config = vi.fn();

async function load(env: Record<string, string | undefined> | undefined): Promise<typeof import('./dotenv-config.js')> {
  vi.resetModules();
  config.mockClear();
  vi.doMock('./dotenv.js', () => ({ config }));
  vi.doMock('./runtime.js', () => ({ ambientEnv: () => env }));
  return await import('./dotenv-config.js');
}

afterEach(() => {
  vi.doUnmock('./dotenv.js');
  vi.doUnmock('./runtime.js');
  vi.resetModules();
});

describe('importing it loads the environment, quietly unless asked', () => {
  it.each([
    [{}, true],
    [{ DOTENV_QUIET: 'false' }, 'false'],
    [{ DOTENV_CONFIG_QUIET: 'false' }, 'false'],
    [{ DOTENV_QUIET: '', DOTENV_CONFIG_QUIET: 'true' }, ''],
    [{ DOTENV_QUIET: 'true', DOTENV_CONFIG_QUIET: 'false' }, 'true'],
    [undefined, true],
  ] as const)('with %j it calls config({ quiet: %j })', async (env, quiet) => {
    await load(env);
    expect(config).toHaveBeenCalledTimes(1);
    expect(config).toHaveBeenCalledWith({ quiet });
  });
});
