/**
 * Test-side helpers shared by `commander-harness` and `yargs-testing` (design R2,
 * R5, R7 of `cli-testing-harness`). This is the second and last file in the layer
 * that may touch `process`, because swapping `process.env` for the duration of a run
 * is the one thing a harness cannot avoid: commander reads `Option#env()` from
 * `process.env` at parse time (commander #2549), and yargs' `.env()` likewise.
 */
import { Readable } from 'node:stream';

import { ExitCode, isExitCode } from './exit-code.js';
import { type Runtime } from './runtime.js';

export interface RunOptions {
  argv: string[];
  env?: Record<string, string>;
  stdin?: string | Readable;
  cwd?: string;
  /** `true` = every stream is a TTY; an object sets each; default: none is. */
  tty?: boolean | Partial<Runtime['isTTY']>;
}

export interface RunResult {
  code: ExitCode;
  stdout: string;
  stderr: string;
  /** Parsed stdout when `--json` was in argv and stdout parsed; see `finish`. */
  json?: unknown;
  durationMs: number;
}

/** Thrown by `fakeRuntime.exit` so a handler that exits unwinds to the harness. */
export class RuntimeExit extends Error {
  constructor(readonly code: ExitCode) {
    super(`runtime.exit(${code})`);
    this.name = 'RuntimeExit';
  }
}

export interface FakeRuntime extends Runtime {
  out: string[];
  err: string[];
}

function ttyOf(tty: RunOptions['tty']): Runtime['isTTY'] {
  if (tty === true) return { stdin: true, stdout: true, stderr: true };
  if (tty === false || tty === undefined) return { stdin: false, stdout: false, stderr: false };
  return { stdin: false, stdout: false, stderr: false, ...tty };
}

/** A `Runtime` whose every part is under the test's control. */
export function fakeRuntime(opts: RunOptions): FakeRuntime {
  const out: string[] = [];
  const err: string[] = [];
  const stdin = typeof opts.stdin === 'string' ? Readable.from([opts.stdin]) : (opts.stdin ?? Readable.from([]));
  return {
    argv: opts.argv,
    env: { ...(opts.env ?? {}) },
    cwd: opts.cwd ?? '/',
    stdin,
    stdout: { write: (s: string) => out.push(s) },
    stderr: { write: (s: string) => err.push(s) },
    isTTY: ttyOf(opts.tty),
    exit(code) {
      throw new RuntimeExit(code);
    },
    out,
    err,
  };
}

/**
 * Replace `process.env` with `env` for the duration of a run and hand back the
 * restore function. Both are keyed on the same object, so `finally` restoring it is
 * exact: a lock asserts equality before and after, including when the run throws.
 */
const noop = (): void => undefined;

export function swapEnv(env: Record<string, string> | undefined): () => void {
  if (!env) return noop;
  const saved = { ...process.env };
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, env);
  return () => {
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, saved);
  };
}

const CONSOLE_METHODS = ['log', 'info', 'debug', 'warn', 'error'] as const;

const into =
  (sink: string[]) =>
  (...args: unknown[]): void => {
    sink.push(`${args.map(String).join(' ')}\n`);
  };

/**
 * Route `console.*` into the fake runtime while a run lasts. Hosts print through
 * `console` in a few paths a public seam does not cover (yargs' help printer, a
 * handler that never met the output layer); a harness that let those reach the real
 * terminal would be measuring the wrong thing.
 */
export function captureConsole(rt: FakeRuntime): () => void {
  const saved = Object.fromEntries(CONSOLE_METHODS.map((m) => [m, console[m]])) as Record<(typeof CONSOLE_METHODS)[number], (...args: unknown[]) => void>;
  console.log = into(rt.out);
  console.info = into(rt.out);
  console.debug = into(rt.out);
  console.warn = into(rt.err);
  console.error = into(rt.err);
  return () => {
    for (const m of CONSOLE_METHODS) console[m] = saved[m];
  };
}

/** Strip ANSI escape sequences — the decision from the intent: `stdout` stays raw. */
export function stripAnsi(text: string): string {
  return text.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '');
}

/**
 * Assemble the result (R2). `json` is set only when `--json` was in argv and stdout
 * parsed; a parse failure turns the run into `RUNTIME` with the parse error on
 * stderr, so a broken envelope cannot pass a test by accident.
 */
export function finish(rt: FakeRuntime, code: ExitCode, startedAt: number): RunResult {
  const stdout = rt.out.join('');
  const stderr = rt.err.join('');
  const result: RunResult = { code, stdout, stderr, durationMs: performance.now() - startedAt };
  if (rt.argv.includes('--json')) {
    try {
      result.json = JSON.parse(stdout);
    } catch (e) {
      return { ...result, code: ExitCode.RUNTIME, stderr: `${stderr}--json output did not parse: ${(e as Error).message}\n` };
    }
  }
  return result;
}

/** The E1 code an unwound error carries, or `RUNTIME` when it carries none. */
export function codeOf(e: unknown): ExitCode {
  if (e instanceof RuntimeExit) return e.code;
  const exitCode = (e as { exitCode?: unknown } | null)?.exitCode;
  return isExitCode(exitCode) ? exitCode : ExitCode.RUNTIME;
}
