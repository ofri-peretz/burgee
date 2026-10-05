/**
 * The process, as an Ink program sees it: the decisions ink makes from the environment, and
 * the console it patches so `console.log` lands above the live frame. The reads themselves are
 * the package's runtime seam's (`../runtime.ts`); the console is this file's, and it is the one
 * file under `src/ink/` that touches it (R15's lock names it).
 */
import { Console } from 'node:console';
import { PassThrough } from 'node:stream';

import { outputMode } from 'roundel/policy';

import { isProcessStdin, onceBeforeExit, processCwd as cwd, processEnv, processStreams as defaultStreams } from '../runtime.js';

export { cwd, defaultStreams, isProcessStdin, onceBeforeExit };

/**
 * Whether Ink takes its CI path: is-in-ci's rule, which Ink's suite is graded under. It is
 * not roundel's `ci` mode — Ink reads `CI=false` and `CI=0` as *not* CI, and a CI terminal
 * as CI — and where the two disagree the suite decides (constraint 1,
 * D-20261005-controlroom-ink-drop-in).
 */
export function isInCi(env: NodeJS.ProcessEnv = processEnv()): boolean {
  return env['CI'] !== '0' && env['CI'] !== 'false' && ('CI' in env || 'CONTINUOUS_INTEGRATION' in env || Object.keys(env).some((key) => key.startsWith('CI_')));
}

/** Ink's `INK_SCREEN_READER`, and roundel's accessible mode (`CLI_ACCESSIBLE`), which the family reads everywhere. */
export function screenReaderByDefault(env: NodeJS.ProcessEnv = processEnv()): boolean {
  return env['INK_SCREEN_READER'] === 'true' || outputMode({ env, isTTY: { stdout: false } }) === 'accessible';
}

const CONSOLE_METHODS = ['assert', 'count', 'countReset', 'debug', 'dir', 'dirxml', 'error', 'group', 'groupCollapsed', 'groupEnd', 'info', 'log', 'table', 'time', 'timeEnd', 'timeLog', 'trace', 'warn'] as const;

/** patch-console's contract: every console method formats as before and hands the text to `callback`. */
export function patchConsole(callback: (stream: 'stdout' | 'stderr', data: string) => void): () => void {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  stdout.write = (data: string): boolean => {
    callback('stdout', data);
    return true;
  };
  stderr.write = (data: string): boolean => {
    callback('stderr', data);
    return true;
  };
  const internal = new Console(stdout, stderr);
  const target = globalThis.console as unknown as Record<string, unknown>;
  const original = new Map(CONSOLE_METHODS.map((method) => [method, target[method]]));
  for (const method of CONSOLE_METHODS) target[method] = (internal as unknown as Record<string, unknown>)[method];
  return () => {
    for (const [method, fn] of original) target[method] = fn;
  };
}
