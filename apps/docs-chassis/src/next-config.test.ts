/**
 * Lock: a change to the chassis invalidates webpack's persistent cache.
 *
 * `.next/cache` keys a compiled MDX page on the page alone, and CI restores that cache between
 * runs. When #1817 changed the shiki options in `source-config.mjs`, builds over an old cache
 * kept serving pages compiled without the terminal mark, and every site's terminal-block test
 * failed on CI while a clean build passed. The chassis directory is now one of the cache's
 * build dependencies, so editing any file in it starts the cache over.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { docsNextConfig } from './next-config.mjs';

const CHASSIS_SRC = fileURLToPath(new URL('./', import.meta.url));
/** Any app with a row: `docsNextConfig` finds its row by the workspace it runs in. */
const AN_APP = fileURLToPath(new URL('../../docs-paratext/', import.meta.url));

interface WebpackConfig {
  cache?: false | { type: string; buildDependencies?: Record<string, string[]> };
  plugins: unknown[];
}
interface Context {
  webpack: { NormalModuleReplacementPlugin: new (...args: unknown[]) => unknown };
  defaultLoaders: { babel: unknown };
}
type Webpack = (config: WebpackConfig, context: Context) => WebpackConfig;

/** What Next passes the hook, as far as the chassis and fumadocs read it. */
const context: Context = { webpack: { NormalModuleReplacementPlugin: class {} }, defaultLoaders: { babel: 'babel-loader' } };

function webpackHook(): Webpack {
  vi.spyOn(process, 'cwd').mockReturnValue(AN_APP);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  return (docsNextConfig() as unknown as { webpack: Webpack }).webpack;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('webpack’s persistent cache', () => {
  it('lists the chassis directory, the one holding source-config.mjs, as a build dependency', () => {
    const out = webpackHook()({ cache: { type: 'filesystem', buildDependencies: { config: ['next.config.mjs'] } }, plugins: [] }, context);
    const deps = out.cache === false ? undefined : out.cache?.buildDependencies;
    expect(deps?.['docsChassis']).toEqual([CHASSIS_SRC]);
    expect(CHASSIS_SRC.endsWith('/')).toBe(true);
    expect(existsSync(join(CHASSIS_SRC, 'source-config.mjs'))).toBe(true);
  });

  it('keeps the build dependencies Next already set', () => {
    const out = webpackHook()({ cache: { type: 'filesystem', buildDependencies: { config: ['next.config.mjs'] } }, plugins: [] }, context);
    expect(out.cache === false ? undefined : out.cache?.buildDependencies?.['config']).toEqual(['next.config.mjs']);
  });

  it('leaves a build with no persistent cache without one', () => {
    expect(webpackHook()({ cache: false, plugins: [] }, context).cache).toBe(false);
  });
});
