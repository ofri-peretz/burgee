/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * The benchmarks' one door to a subprocess, and it is `bellpull/cross-spawn` (bellpull criterion 4).
 *
 * `bellpull`'s intent names this suite and `compat-oracle` as the package's only internal users
 * and says both spawn through it. `scripts/dogfood-spawn-lock.test.ts` refuses a
 * `node:child_process` import anywhere in `benchmarks/` outside a test file and the measured
 * fixtures, so every axis spawns from here.
 *
 * A copy of `packages/compat-oracle/src/spawn.ts`, as `scratch-dir.ts` is a copy of the root's:
 * this workspace does not import from outside itself. It differs in one line, on purpose: the
 * oracle loads bellpull on its first spawn, because `vendor-suite.ts` must load from a checkout
 * with nothing installed, and nothing here has that constraint, so the import is static.
 *
 * **What changes for a measurement: nothing that reaches a ratio.** On POSIX `bellpull/cross-spawn`
 * hands the call to `node:child_process` unchanged after normalising the arguments; the B2, B3 and
 * B5 timings wrap that call, so both sides of every ratio pay the same normalisation, once per
 * spawn. On Windows it is what lets `npm`, a `.cmd`, start at all.
 */
import crossSpawn, { type ChildProcess, type SpawnOptions, type SpawnSyncReturns } from 'bellpull/cross-spawn';

/** Options with a text encoding: the result's `stdout` and `stderr` are strings. */
export type TextOptions = SpawnOptions & { encoding: 'utf8' };

/** `spawnSync`, through bellpull: the result, never a throw. */
export function spawnSync(file: string, args: readonly string[], options: TextOptions): SpawnSyncReturns<string>;
export function spawnSync(file: string, args: readonly string[], options?: SpawnOptions): SpawnSyncReturns<Buffer | string>;
export function spawnSync(file: string, args: readonly string[], options?: SpawnOptions): SpawnSyncReturns<Buffer | string> {
  // A property read off the default, not a named binding, as bellpull's own doc asks: a test that
  // mocks the exports object then sees its mock.
  return crossSpawn.sync(file, args, options);
}

/** `spawn`, through bellpull: the `ChildProcess`, as `node:child_process` returns it. */
export function spawn(file: string, args: readonly string[], options?: SpawnOptions): ChildProcess {
  return crossSpawn.spawn(file, args, options);
}

/** What `execFile` throws: an `Error` carrying the whole `spawnSync` result, as `execFileSync`'s does. */
export type ExecError = Error & Partial<SpawnSyncReturns<Buffer | string>>;

/**
 * `execFileSync(file, args, options)`, through bellpull: stdout, or a throw — Node's own rule from
 * `lib/child_process.js`, as `compat-oracle/src/spawn.ts` writes it and for the reasons it gives.
 */
export function execFile(file: string, args: readonly string[], options: TextOptions): string;
export function execFile(file: string, args: readonly string[], options?: SpawnOptions): Buffer | string;
export function execFile(file: string, args: readonly string[], options: SpawnOptions = {}): Buffer | string {
  const result = spawnSync(file, args, options);
  // Null when stderr was not piped, and undefined when nothing started: both are nothing printed.
  const stderr = (result.stderr as Buffer | string | null | undefined) ?? '';
  if (options.stdio === undefined && stderr.length > 0) process.stderr.write(stderr);
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
