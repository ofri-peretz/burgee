/**
 * The process, as an ink program sees it: the decisions ink makes from the environment, and
 * the console it patches so `console.log` lands above the live frame. The reads themselves are
 * the package's runtime seam's (`../runtime.ts`); the console is this file's, and it is the one
 * file under `src/ink/` that touches it (R15's lock names it).
 */
import { Console } from 'node:console';
import { platform } from 'node:os';
import { PassThrough } from 'node:stream';

import { outputMode } from 'roundel/policy';

import { isProcessStdin, onceBeforeExit, processCwd as cwd, processEnv, processStreams as defaultStreams } from '../runtime.js';

export { cwd, defaultStreams, isProcessStdin, onceBeforeExit };

/**
 * A Windows console scrolls when the bottom-right cell is written, which desynchronizes the
 * incremental erase of a frame that fills the viewport (ink#969). Read once at load, as ink does.
 */
export const isWindowsConsole = platform() === 'win32';

/**
 * Whether ink takes its CI path: is-in-ci's rule, which ink's suite is graded under. It is
 * not roundel's `ci` mode — ink reads `CI=false` and `CI=0` as *not* CI, and a CI terminal
 * as CI — and where the two disagree the suite decides (constraint 1,
 * D-20261005-controlroom-ink-drop-in).
 */
export function isInCi(env: NodeJS.ProcessEnv = processEnv()): boolean {
  return env['CI'] !== '0' && env['CI'] !== 'false' && ('CI' in env || 'CONTINUOUS_INTEGRATION' in env || Object.keys(env).some((key) => key.startsWith('CI_')));
}

/** ink's `INK_SCREEN_READER`, and roundel's accessible mode (`CLI_ACCESSIBLE`), which the family reads everywhere. */
export function screenReaderByDefault(env: NodeJS.ProcessEnv = processEnv()): boolean {
  return env['INK_SCREEN_READER'] === 'true' || outputMode({ env, isTTY: { stdout: false } }) === 'accessible';
}

/** `DEV=true`: ink connects React DevTools, when the package is installed. */
export const devtoolsRequested = (env: NodeJS.ProcessEnv = processEnv()): boolean => env['DEV'] === 'true';

const resolveDimension = (value: number | undefined, fallback: number | undefined, defaultValue: number): number => {
  if (value !== undefined && value > 0) return value;
  return fallback !== undefined && fallback > 0 ? fallback : defaultValue;
};

interface Sized {
  readonly columns?: number | undefined;
  readonly rows?: number | undefined;
}

/**
 * terminal-size's answer, short of a subprocess: the first of stdout and stderr that knows both
 * its columns and its rows, then `COLUMNS` and `LINES`, then 80 × 24. Its `tput` and
 * `stty < /dev/tty` probes are left out: they answer only on a controlling terminal, which is
 * exactly where a stream already knows its size.
 */
export function terminalSize(env: NodeJS.ProcessEnv = processEnv(), streams: readonly Sized[] = [defaultStreams().stdout, defaultStreams().stderr]): { columns: number; rows: number } {
  for (const stream of streams) if (stream.columns && stream.rows) return { columns: stream.columns, rows: stream.rows };
  if (env['COLUMNS'] && env['LINES']) return { columns: Number.parseInt(env['COLUMNS'], 10), rows: Number.parseInt(env['LINES'], 10) };
  return { columns: 80, rows: 24 };
}

/** ink's `getWindowSize`: the stream's own size, else terminal-size's, else 80 × 24. */
export function windowSize(stream: { columns?: number | undefined; rows?: number | undefined }): { columns: number; rows: number } {
  const columns = stream.columns ?? 0;
  const rows = stream.rows ?? 0;
  if (columns && rows) return { columns, rows };
  const fallback = terminalSize();
  return { columns: resolveDimension(columns, fallback.columns, 80), rows: resolveDimension(rows, fallback.rows, 24) };
}

/** React's captured console call, replayed on the console as it stands now. */
export function replayConsole(methodName: string, args: unknown[]): void {
  const method: unknown = Reflect.get(console, methodName);
  if (typeof method === 'function') Reflect.apply(method, console, args);
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
