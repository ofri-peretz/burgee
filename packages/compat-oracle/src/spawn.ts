/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * The oracle's one door to a subprocess, and it is `bellpull/cross-spawn` (bellpull criterion 4).
 *
 * `bellpull`'s intent names `compat-oracle` and the benchmarks as its only internal users, and says
 * both spawn through it. Every spawn here — git for a vendor, npm for a suite's pins, node for a
 * graded suite — goes through this file, and `scripts/dogfood-spawn-lock.test.ts` refuses a
 * `node:child_process` import anywhere else in `src/` or `benchmarks/`.
 *
 * **What that buys, measured.** `npm` is `npm.cmd` on Windows, a batch file `spawnSync` will not
 * start without a shell since CVE-2024-27980. `upstream.ts` used to work around it by running npm
 * through a shell there (#1180), and `installSuiteDeps` did not, so every `suiteDeps` host's
 * end-to-end test was skipped on Windows. bellpull resolves the `.cmd` through `PATHEXT` and quotes
 * it for `cmd.exe` itself — cross-spawn's 68-case suite grades that, 68 / 68 — so neither the
 * shell nor the skip is needed.
 *
 * **Why the package is loaded on the first spawn and not at import.** `scripts/vendor-suite.ts`
 * imports `vendor.ts` and `upstream.ts` by path, and must load from a checkout with nothing
 * installed (`scripts/vendor-suite-resolution.test.ts`): a bare `import 'bellpull/cross-spawn'` at
 * the top of this file is `Cannot find package` there before the script can print its usage. The
 * package is ESM, and `require()` of ESM is synchronous on every Node this repository supports, so
 * the oracle's call sites stay synchronous. The type import below is erased.
 *
 * **Behaviour is `node:child_process`'s, on purpose.** On POSIX `bellpull/cross-spawn` is a
 * pass-through to `spawnSync`, and `execFile` below is Node's own `execFileSync` written over it:
 * the same return value, the same throw on a non-zero exit or a failure to start, the same
 * `status`, `stdout` and `stderr` on the thrown error, and stderr echoed to ours when the caller
 * did not choose `stdio`. The callers' `catch` blocks read those fields and were not changed.
 */
import { writeSync } from 'node:fs';
import { createRequire } from 'node:module';

// `import type`, never `import { type … }`: under `verbatimModuleSyntax` the inline form compiles to
// `import {} from 'bellpull/cross-spawn'`, a static load, which is the one thing this file must not do.
// eslint-disable-next-line import-next/consistent-type-specifier-style -- see the line above
import type { ChildProcess, SpawnOptions, SpawnSyncReturns } from 'bellpull/cross-spawn';

type CrossSpawn = typeof import('bellpull/cross-spawn');

/**
 * Where a child's stderr is echoed, as a file descriptor rather than `process.stderr`: the same
 * bytes on the same stream, and no `process` read in a module outside the package's seam
 * (`packages/burgee/src/process-reference-lock.test.ts`).
 */
const STDERR_FD = 2;

/** Options with a text encoding: the result's `stdout` and `stderr` are strings. */
export type TextOptions = SpawnOptions & { encoding: 'utf8' };

/** `bellpull/cross-spawn`, loaded from wherever this module is. Node caches it after the first call. */
const crossSpawn = (): CrossSpawn => createRequire(import.meta.url)('bellpull/cross-spawn') as CrossSpawn;

/** `spawnSync`, through bellpull: the result, never a throw. */
export function spawnSync(file: string, args: readonly string[], options: TextOptions): SpawnSyncReturns<string>;
export function spawnSync(file: string, args: readonly string[], options?: SpawnOptions): SpawnSyncReturns<Buffer | string>;
export function spawnSync(file: string, args: readonly string[], options?: SpawnOptions): SpawnSyncReturns<Buffer | string> {
  return crossSpawn().sync(file, args, options);
}

/** `spawn`, through bellpull: the `ChildProcess`, as `node:child_process` returns it. */
export function spawn(file: string, args: readonly string[], options?: SpawnOptions): ChildProcess {
  return crossSpawn().spawn(file, args, options);
}

/** What `execFile` throws: an `Error` carrying the whole `spawnSync` result, as `execFileSync`'s does. */
export type ExecError = Error & Partial<SpawnSyncReturns<Buffer | string>>;

/**
 * `execFileSync(file, args, options)`, through bellpull: stdout, or a throw.
 *
 * Node's own rule, line for line (`lib/child_process.js`): a failure to start throws the spawn's
 * error with the result assigned onto it; a non-zero exit, or death by a signal, throws
 * `Command failed: <file> <args>` with stderr appended; and when the caller left `stdio` alone the
 * child's stderr is written to ours, because that is what `execFileSync` does with it.
 */
export function execFile(file: string, args: readonly string[], options: TextOptions): string;
export function execFile(file: string, args: readonly string[], options?: SpawnOptions): Buffer | string;
export function execFile(file: string, args: readonly string[], options: SpawnOptions = {}): Buffer | string {
  const result = spawnSync(file, args, options);
  // Null when stderr was not piped, and undefined when nothing started: both are nothing printed.
  const stderr = (result.stderr as Buffer | string | null | undefined) ?? '';
  if (options.stdio === undefined && stderr.length > 0) writeSync(STDERR_FD, Buffer.from(stderr));
  // Stryker disable next-line ConditionalExpression: no spawn reports an error with status 0 — a timeout, ENOBUFS or a missing program leaves it null on POSIX, and bellpull's Windows ENOENT is status 1 — so dropping the error check changes no outcome a child can produce
  if (result.error === undefined && result.status === 0) return result.stdout;
  const detail = stderr.length > 0 ? `\n${stderr.toString()}` : '';
  const failed = carrying(result.error ?? new Error(`Command failed: ${[file, ...args].join(' ')}${detail}`), result);
  throw failed;
}

/**
 * `error` with the result's fields on it, as `execFileSync` assigns them: the caller's `catch` reads
 * them. Its `error` field only when the spawn failed, where Node's points back at the error itself.
 */
function carrying(error: Error, result: SpawnSyncReturns<Buffer | string>): ExecError {
  const { pid, output, stdout, stderr, status, signal } = result;
  const carried: ExecError = Object.assign(error, { pid, output, stdout, stderr, status, signal });
  if (result.error !== undefined) carried.error = result.error;
  return carried;
}
