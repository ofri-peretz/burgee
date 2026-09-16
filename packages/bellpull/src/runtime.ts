/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * The structural `Runtime` shape (design R10, Y9): the part of the ambient world this
 * package reads, declared rather than reached for.
 *
 * Every function in the core takes one. Nothing here imports `node:process`, and nothing
 * here reads a global — `ambient.ts` is the single file that does, and it is imported only
 * by the façades that have to behave like an incumbent that reads `process` itself.
 *
 * That split is not tidiness. Executable resolution is the one operation in this package
 * whose answer depends entirely on ambient state: `PATH`, the current directory, the
 * platform, and on POSIX the effective uid and gid. A function that reads those itself can
 * only be tested on the machine it is running on, which is precisely why "which binary
 * actually ran" is unanswerable in CI today (intent, constraint 3). Taking them as an
 * argument makes a Windows `PATHEXT` walk testable from a Mac.
 */

/** A platform string, as `process.platform` spells it. Only `win32` is ever special-cased. */
export type Platform = string;

/**
 * The ambient state this package reads. Structural on purpose: a caller may pass Node's own
 * `process`, a fake, or an object assembled from a container's environment.
 */
export interface Runtime {
  /** `process.platform`. `win32` selects `PATHEXT`, backslashes and the cmd.exe rules. */
  readonly platform: Platform;
  /** The environment. `PATH` (or whichever case Windows used) is read out of it. */
  readonly env: Readonly<Record<string, string | undefined>>;
  /** The working directory a relative command or `cwd` option is resolved against. */
  readonly cwd: string;
  /** Effective uid, where the platform has one. Absent means "do not check ownership". */
  readonly uid?: number | undefined;
  /** Effective gid, where the platform has one. */
  readonly gid?: number | undefined;
}

/** Whether this runtime plays by Windows' rules. Cygwin and msys announce themselves in `OSTYPE`. */
export function isWindows(runtime: Runtime): boolean {
  const ostype = runtime.env['OSTYPE'];
  return runtime.platform === 'win32' || ostype === 'cygwin' || ostype === 'msys';
}

/**
 * The key `PATH` is spelled under in this environment.
 *
 * `path-key`, 244.9 M downloads a week, is this function. Windows environment variables are
 * case-insensitive but a plain JavaScript object's keys are not, so an environment copied
 * out of `process.env` on Windows can carry `Path`, and a lookup for `PATH` misses it. The
 * last matching key wins, which is what `path-key` does and what the shell does.
 */
export function pathKey(runtime: Runtime): string {
  if (!isWindows(runtime)) return 'PATH';
  return Object.keys(runtime.env).reverse().find((key) => key.toUpperCase() === 'PATH') ?? 'Path';
}

/** The `PATH` value for this runtime, under whichever key it is spelled. */
export function pathOf(runtime: Runtime): string {
  return runtime.env[pathKey(runtime)] ?? '';
}

/** The separator between `PATH` entries: `;` on Windows, `:` everywhere else. */
export function pathDelimiter(runtime: Runtime): string {
  return isWindows(runtime) ? ';' : ':';
}
