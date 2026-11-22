import { existsSync } from 'node:fs';
import path from 'node:path';

import { VITE_CONFIGS } from './config.js';
import { resolveEsm } from './resolve.js';

/**
 * The `test.pool` the project's own Vite config asks for (`forks` for tests that call
 * `process.chdir`, which a worker thread refuses), read with the project's own Vite as `config.ts`
 * reads the `mutate` block. Undefined when there is no config, no Vite, or no `pool`: the run then
 * uses threads, which it stops runaway mutants in.
 */
export async function declaredPool(root: string, file?: string): Promise<string | undefined> {
  const found = file ?? VITE_CONFIGS.map((f) => path.join(root, f)).find((f) => existsSync(f));
  if (found === undefined) return undefined;
  try {
    // eslint-disable-next-line node-security/no-dynamic-dependency-loading -- the project's own Vite, found from its root, as config.ts loads it for the `mutate` block
    const vite = (await import(resolveEsm('vite', root))) as { loadConfigFromFile: (env: { command: string; mode: string }, file: string, root: string, logLevel: string) => Promise<{ config: { test?: { pool?: unknown } } } | null> };
    const loaded = await vite.loadConfigFromFile({ command: 'serve', mode: 'test' }, path.resolve(root, found), root, 'silent');
    const pool = loaded?.config.test?.pool;
    return typeof pool === 'string' ? pool : undefined;
  } catch {
    return undefined;
  }
}
