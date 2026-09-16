/* eslint-disable maintainability/identical-functions -- a seam over a global is a list of one-line pass-throughs; that is its shape, not a lapse in it. The rule's advice, "extract to a reusable function", would collapse ten named capabilities into one stringly-typed read('argv'): every call site would lose its type, and the lock this file exists to satisfy would read worse, not better. Here the duplication IS the interface. */
import { type ExitCode } from './exit-code.js';

/** Anything that accepts text; `process.stdout` satisfies it, so does an array push. */
export interface Writer {
  write(chunk: string): unknown;
}

/**
 * Time, as the layers above the parser see it (R14 of `cli-output-stack`). `now` is
 * monotonic milliseconds from an arbitrary origin; `schedule` runs `fn` after `ms` and
 * hands back the cancel. Typed structurally so the output stack can accept a `Runtime`
 * without importing one.
 */
export interface Clock {
  now(): number;
  schedule(fn: () => void, ms: number): () => void;
}

/**
 * The world, as the layers above the parser see it (design R1 of
 * `cli-testing-harness`). Nothing above the parser reads `process.*` directly; it
 * reads its `Runtime`, so a test can substitute every part of it.
 */
export interface Runtime {
  argv: string[];
  env: Record<string, string | undefined>;
  cwd: string;
  stdin: NodeJS.ReadableStream;
  stdout: Writer;
  stderr: Writer;
  isTTY: { stdin: boolean; stdout: boolean; stderr: boolean };
  /** Ends the run with an E1 code. In the real runtime this never returns. */
  exit(code: ExitCode): never;
  /** `performance.now` and `setTimeout` in the real runtime; a manual tick in the harness. */
  clock: Clock;
}

const ARGV_PROGRAM_AND_SCRIPT = 2;

/**
 * The one place in the layer that names `process` — the whole of Y9. Every other file in
 * this package reads it through `host` or through an injected `Runtime`, which is what
 * `process-reference-lock.test.ts` enforces.
 *
 * **Every member is a getter, and that is the load-bearing decision.** burgee's commander
 * and yargs front-ends do not wrap those packages, they *reproduce their process contracts*,
 * and the incumbents' own suites grade exactly that contract: yargs' swaps `process.argv`,
 * `process.exit` and `process.env` per test; commander's grades `process.argv` when `parse()`
 * is called bare, `process.exit` with no `exitOverride`, and `process.env` for `Option.env()`.
 * A seam that captured those at import — which is what `processRuntime` below does, and what
 * it did for the whole object before this file grew a second export — would hand such a test
 * the value from before its own swap, and the row would drop from 1360 / 804.
 *
 * Getters rather than paratext's `processRuntime()` function shape, because these are read in
 * expression position all over both front-ends (`host.stdout.columns`, `host.env[name]`), and
 * a function would put a call on every one of them; the getter keeps the port reading the way
 * the upstream reads, which is the thing yargs' whole-help-screen assertions compare.
 *
 * Reads are live; *when* a call site reads is unchanged by this file. Two of them capture on
 * purpose and still do — `shim.ts`'s `stdColumns` and `mainFilename` are values in
 * `PlatformShim`, not thunks, and were evaluated at import before the seam existed.
 */
export const host = {
  /** Raw and unsliced: commander and yargs each do their own `from`-dependent slicing. */
  get argv(): string[] {
    return process.argv;
  },
  get env(): Record<string, string | undefined> {
    return process.env;
  },
  cwd(): string {
    return process.cwd();
  },
  get stdin(): NodeJS.ReadStream {
    return process.stdin;
  },
  get stdout(): NodeJS.WriteStream {
    return process.stdout;
  },
  get stderr(): NodeJS.WriteStream {
    return process.stderr;
  },
  /**
   * The terminal's width, or undefined when there is no terminal to ask. Guarded on
   * `process` itself because cliui's upstream is guarded there: `getWindowWidth` is reached
   * from a bundle that may have no process at all, and a bare read would be a ReferenceError
   * rather than the 80-column fallback.
   */
  get columns(): number | undefined {
    if (typeof process === 'undefined') return undefined;
    return process.stdout?.columns;
  },
  get exitCode(): number | string | null | undefined {
    return process.exitCode;
  },
  get platform(): string {
    return process.platform;
  },
  get execPath(): string {
    return process.execPath;
  },
  get execArgv(): string[] {
    return process.execArgv;
  },
  get versions(): NodeJS.ProcessVersions {
    return process.versions;
  },
  /** Electron sets this on the process object; yargs' bin detection asks for it by name. */
  get defaultApp(): boolean {
    // Electron sets this; Node's own `Process` type has never declared it, so there is no
    // shape to narrow to — `Reflect.get` asks the object rather than asserting about it.
    return Reflect.get(process, 'defaultApp') === true;
  },
  exit(code?: number): never {
    return process.exit(code) as never;
  },
  emitWarning(warning: string | Error, type?: string): void {
    process.emitWarning(warning, type as string);
  },
  nextTick(fn: (...args: unknown[]) => void, ...args: unknown[]): void {
    process.nextTick(fn, ...args);
  },
  on(event: string, listener: (...args: unknown[]) => void): void {
    process.on(event, listener);
  },
};

/**
 * The real `Runtime`, for a caller that injects none.
 *
 * `argv`, `env` and `cwd` are getters for the reason the block above gives; `isTTY` is one
 * too, because a stream's `isTTY` is a property of whatever stream is installed *now*, and
 * the harness swaps streams. `stdin`/`stdout`/`stderr` likewise.
 */
export const processRuntime: Runtime = {
  get argv(): string[] {
    return host.argv.slice(ARGV_PROGRAM_AND_SCRIPT);
  },
  get env(): Record<string, string | undefined> {
    return host.env;
  },
  get cwd(): string {
    return host.cwd();
  },
  get stdin(): NodeJS.ReadableStream {
    return host.stdin;
  },
  get stdout(): Writer {
    return host.stdout;
  },
  get stderr(): Writer {
    return host.stderr;
  },
  get isTTY(): { stdin: boolean; stdout: boolean; stderr: boolean } {
    return {
      stdin: Boolean(host.stdin.isTTY),
      stdout: Boolean(host.stdout.isTTY),
      stderr: Boolean(host.stderr.isTTY),
    };
  },
  exit(code): never {
    return host.exit(code);
  },
  clock: {
    now: () => performance.now(),
    schedule(fn, ms) {
      const handle = setTimeout(fn, ms);
      return () => clearTimeout(handle);
    },
  },
};
