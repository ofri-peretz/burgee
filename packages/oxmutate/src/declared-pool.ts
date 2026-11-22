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
  // Stryker disable next-line ConditionalExpression: without the guard `path.resolve(root, undefined)` throws inside the try, and the catch answers the same
  if (found === undefined) return undefined;
  try {
    // eslint-disable-next-line node-security/no-dynamic-dependency-loading -- the project's own Vite, found from its root, as config.ts loads it for the `mutate` block
    const vite = (await import(resolveEsm('vite', root))) as { loadConfigFromFile: (env: { command: string; mode: string }, file: string, root: string, logLevel: string) => Promise<{ config: { test?: { pool?: unknown } } } | null> };
    // Stryker disable next-line StringLiteral: the log level only decides whether Vite prints, and a config that loads prints nothing at any level
    const loaded = await vite.loadConfigFromFile({ command: 'serve', mode: 'test' }, path.resolve(root, found), root, 'silent');
    // Stryker disable next-line OptionalChaining: a null result or a config with no `test` throws here, and the catch below answers the same
    const pool = loaded?.config.test?.pool;
    return typeof pool === 'string' ? pool : undefined;
  // Stryker disable next-line BlockStatement: an empty catch leaves the function to return nothing, which is undefined too
  } catch {
    return undefined;
  }
}
