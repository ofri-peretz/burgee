/**
 * The process, as an Ink program sees it — the drop-in's counterpart of `runtime.ts`, and the
 * one file under `src/ink/` that names it. Ink's defaults are the real streams, its console
 * is patched so `console.log` lands above the live frame, and `waitUntilExit()` settles when
 * the event loop drains (`beforeExit`). Each of those is the process's, so each is here.
 */
import { Console } from 'node:console';
import process from 'node:process';
import { PassThrough } from 'node:stream';

import { outputMode } from 'roundel/policy';

export const defaultStreams = (): { stdout: NodeJS.WriteStream; stdin: NodeJS.ReadStream; stderr: NodeJS.WriteStream } => ({
  stdout: process.stdout,
  stdin: process.stdin,
  stderr: process.stderr,
});

export const isProcessStdin = (stream: unknown): boolean => stream === process.stdin;

export const cwd = (): string => process.cwd();

/**
 * Whether Ink takes its CI path: is-in-ci's rule, which Ink's suite is graded under. It is
 * not roundel's `ci` mode — Ink reads `CI=false` and `CI=0` as *not* CI, and a CI terminal
 * as CI — and where the two disagree the suite decides (constraint 1,
 * D-20261005-controlroom-ink-writes).
 */
export function isInCi(env: NodeJS.ProcessEnv = process.env): boolean {
  return env['CI'] !== '0' && env['CI'] !== 'false' && ('CI' in env || 'CONTINUOUS_INTEGRATION' in env || Object.keys(env).some((key) => key.startsWith('CI_')));
}

/** Ink's `INK_SCREEN_READER`, and roundel's accessible mode (`CLI_ACCESSIBLE`), which the family reads everywhere. */
export function screenReaderByDefault(env: NodeJS.ProcessEnv = process.env): boolean {
  return env['INK_SCREEN_READER'] === 'true' || outputMode({ env, isTTY: { stdout: false } }) === 'accessible';
}

export function onceBeforeExit(handler: () => void): () => void {
  process.once('beforeExit', handler);
  return () => process.off('beforeExit', handler);
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
