/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Telling "that program does not exist" from "that program ran and failed" — on Windows,
 * where the platform will not tell you.
 *
 * Going through `cmd.exe` costs one piece of information. `cmd.exe` exits **1** when it
 * cannot find the command, and a program that ran and exited 1 exits 1 as well, so the
 * caller gets the same number for a typo and for a failing test suite. `cross-spawn` fixes
 * this by remembering something `cmd.exe` cannot: whether resolution found a file at all
 * (`parsed.file`). Exit 1 with nothing resolved is an ENOENT; exit 1 with a resolved file is
 * a result.
 *
 * None of this applies off Windows, where `spawn` raises a real `ENOENT` from the kernel and
 * both functions here return nothing.
 */
import { isWindows, type Runtime } from './runtime.js';
import { type Parsed } from './spawn-args.js';

/**
 * The error Node itself would have raised, rebuilt from what the caller asked for.
 *
 * Every field is the *original* command and arguments, not the escaped `cmd.exe /d /s /c`
 * line this package constructed: `cross-spawn`'s suite asserts `err.path` matches the name
 * the caller wrote and that neither `message` nor `syscall` contains the string `undefined`
 * — which is what a rebuilt error looks like when a field was forgotten.
 */
export interface SpawnNotFoundError extends Error {
  code: 'ENOENT';
  errno: 'ENOENT';
  syscall: string;
  path: string;
  spawnargs: string[];
}

export function notFoundError(original: Parsed['original'], syscall: 'spawn' | 'spawnSync'): SpawnNotFoundError {
  return Object.assign(new Error(`${syscall} ${original.command} ENOENT`), {
    code: 'ENOENT' as const,
    errno: 'ENOENT' as const,
    syscall: `${syscall} ${original.command}`,
    path: original.command,
    spawnargs: original.args,
  });
}

/** Exit 1 from `cmd.exe` with nothing resolved: the command was never found. */
export function verifyENOENT(status: number | null, parsed: Parsed, runtime: Runtime, syscall: 'spawn' | 'spawnSync'): SpawnNotFoundError | undefined {
  if (!isWindows(runtime)) return undefined;
  if (status !== 1 || parsed.file !== undefined) return undefined;
  return notFoundError(parsed.original, syscall);
}

/** The narrow part of a `ChildProcess` this needs: a re-emittable event emitter. */
export interface EmitterLike {
  emit: (event: string, ...args: unknown[]) => boolean;
}

/**
 * Turn the child's `exit` into an `error` when the exit was really a missing command.
 *
 * Wrapping `emit` is `cross-spawn`'s mechanism and it is kept, because the alternative —
 * listening for `exit` and emitting `error` from the listener — fires *after* every listener
 * the caller registered, so a caller's `exit` handler would already have run on an exit that
 * never happened. Replacing `emit` puts the decision in front of all of them.
 *
 * A no-op off Windows, so the wrapper is not installed at all and a POSIX child keeps Node's
 * own `emit`.
 */
export function hookChildProcess(child: EmitterLike, parsed: Parsed, runtime: Runtime): void {
  if (!isWindows(runtime)) return;
  const original = child.emit.bind(child);
  child.emit = (event: string, ...args: unknown[]): boolean => {
    if (event === 'exit') {
      const error = verifyENOENT(args[0] as number | null, parsed, runtime, 'spawn');
      if (error !== undefined) return original('error', error);
    }
    return original(event, ...args);
  };
}
