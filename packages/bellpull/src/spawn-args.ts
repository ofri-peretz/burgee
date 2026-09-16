/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * What to actually spawn — design R6, and `cross-spawn`'s `lib/parse.js` as a specification.
 *
 * Given what a caller asked for, this decides what `child_process` should be handed. On
 * POSIX that is **nothing at all**: the kernel resolves the command against `PATH`, reads
 * shebangs itself, and takes arguments as an array with no interpreter in between. Rewriting
 * any of it would be this package inventing a difference where the platform has none — and
 * it is why the POSIX branch below is one early return, exactly as `cross-spawn`'s is.
 *
 * On Windows the platform has all of the differences, and they are the package:
 *
 *  - a `.cmd` or `.bat` is a script, not an image, so it needs `cmd.exe`;
 *  - a file with a `#!` line has no kernel support, so the interpreter has to be found and
 *    put in front (see `shebang.ts`);
 *  - anything going through `cmd.exe` needs quoting and escaping first (see `escape.ts`);
 *  - a `.exe` or `.com` needs none of it, and must not be given a shell — a shell would
 *    change the process tree, which `should NOT spawn a shell for a .exe` grades by asserting
 *    the child's parent pid.
 *
 * ## Normalisation is also a contract
 *
 * `spawn(cmd, options)` — arguments omitted — is Node's own signature, and `cross-spawn`'s
 * suite grades it twice: `should handle optional spawn optional arguments correctly` calls
 * it with options in the args position *and* with an explicit `null` for args. Both must
 * work. The args array and the options object are also **cloned**, because
 * `should not mutate args nor options` asserts the caller's own values come back untouched
 * — a façade that pushed an interpreter onto the caller's array would corrupt a caller that
 * reuses it, which is the kind of bug that only shows up on the second call.
 */
import { win32 } from 'node:path';

import { escapeArgument, escapeCommand, isCmdShim, isDirectlyExecutable } from './escape.js';
import { isWindows, type Runtime } from './runtime.js';
import { readShebang } from './shebang.js';
import { whichSync } from './which.js';

/** Options a caller may pass through to `child_process`, plus the two this reads. */
export interface SpawnOptions {
  cwd?: string | undefined;
  env?: Record<string, string | undefined> | undefined;
  /**
   * Hand the whole thing to a shell. Off by default and **documented as the injection
   * surface it is**: with it on, an argument is text in a command line and a `;` or a `&`
   * in caller-supplied data is another command. Nothing in this package turns it on to
   * solve a Windows problem — that is what `escape.ts` is for.
   */
  shell?: boolean | string | undefined;
  /** `cross-spawn`'s own test hook: take the `cmd.exe` path even for a `.exe`. */
  forceShell?: boolean | undefined;
  windowsVerbatimArguments?: boolean | undefined;
  [key: string]: unknown;
}

/** What was asked for and what will be run. Mirrors `cross-spawn`'s `parsed` exactly. */
export interface Parsed {
  command: string;
  args: string[];
  options: SpawnOptions;
  /**
   * The resolved executable, or `undefined` when nothing resolved. Windows-only, and the
   * flag `enoent.ts` reads: `cmd.exe` exits 1 for a command it could not find, which is
   * indistinguishable from a command that ran and failed unless somebody remembered whether
   * the file was there.
   */
  file: string | undefined;
  /** What the caller wrote, kept for the error message: it names their command, not ours. */
  original: { command: string; args: string[] };
}

/** Node's own `(command, args?, options?)` with args and options both optional. */
export function normalizeArguments(
  command: string,
  args?: readonly unknown[] | SpawnOptions | null,
  options?: SpawnOptions | null,
): { command: string; args: string[]; options: SpawnOptions } {
  let list: readonly unknown[] | null | undefined;
  let opts = options;
  if (args !== null && args !== undefined && !Array.isArray(args)) {
    opts = args as SpawnOptions;
    list = null;
  } else {
    list = args as readonly unknown[] | null | undefined;
  }
  return {
    command,
    // Cloned, and stringified: `should handle non-string arguments` passes the number 1234
    // and expects `1234` on stdout. Node coerces too, but doing it here means the escaped
    // form and the spawned form agree on Windows.
    args: list === null || list === undefined ? [] : [...list].map((a) => `${a as string}`),
    // Cloned, so `forceShell` and `windowsVerbatimArguments` are set on ours, never theirs.
    options: { ...opts },
  };
}

/**
 * Resolve the command, following one shebang if there is one.
 *
 * The interpreter is resolved in turn — `#!/usr/bin/env node` names `node`, which is itself
 * a `PATH` lookup — and the script becomes the interpreter's first argument.
 */
function detectShebang(parsed: Parsed, runtime: Runtime): string | undefined {
  // The spawn's own `env` decides the `PATH` the child would be found on, so resolution has
  // to use it too — `should support shebang…` puts the fixtures directory on `options.env`'s
  // PATH and nowhere else, and resolving against the parent's would miss it.
  const effective: Runtime = parsed.options.env === undefined ? runtime : { ...runtime, env: parsed.options.env };
  // Twice, as `cross-spawn` does: once honouring `PATHEXT`, then once with it disabled, so
  // an extensionless script on Windows is found rather than passed over for not being `.EXE`.
  const resolve = (): string | undefined =>
    whichSync(parsed.command, { runtime: effective, cwd: parsed.options.cwd })?.path ??
    whichSync(parsed.command, { runtime: effective, cwd: parsed.options.cwd, pathExt: '' })?.path;

  parsed.file = resolve();
  if (parsed.file === undefined) return undefined;

  const interpreter = readShebang(parsed.file);
  if (interpreter === undefined) return parsed.file;

  parsed.args.unshift(parsed.file);
  parsed.command = interpreter;
  parsed.file = resolve();
  return parsed.file;
}

/**
 * Decide what to spawn.
 *
 * POSIX returns immediately; `shell: true` returns immediately too, because then the caller
 * has asked for Node's own shell handling and second-guessing it would give them a third
 * escaping dialect on top of the two already in play.
 */
export function parse(
  command: string,
  args: readonly unknown[] | SpawnOptions | null | undefined,
  options: SpawnOptions | null | undefined,
  runtime: Runtime,
): Parsed {
  const normalized = normalizeArguments(command, args, options);
  const parsed: Parsed = {
    ...normalized,
    file: undefined,
    original: { command: normalized.command, args: [...normalized.args] },
  };

  if (parsed.options.shell === true || typeof parsed.options.shell === 'string') return parsed;
  if (!isWindows(runtime)) return parsed;

  const commandFile = detectShebang(parsed, runtime);
  // A `.exe` or `.com` is an image Windows loads directly. Everything else — a `.cmd`, a
  // `.bat`, a script we just put an interpreter in front of, a name that resolved to
  // nothing — goes through `cmd.exe`.
  const needsShell = commandFile === undefined || !isDirectlyExecutable(commandFile);
  if (parsed.options.forceShell !== true && !needsShell) return parsed;

  const doubleEscape = commandFile !== undefined && isCmdShim(commandFile);
  // `foo/bar` is a path Windows understands only as `foo\bar`; without this the spawn is an
  // ENOENT that looks like a missing program.
  //
  // `win32.normalize`, not the ambient `normalize`: the platform is an argument here (Y9),
  // so the path dialect has to be chosen by that argument rather than by the machine the
  // code happens to be running on. On Windows the two are the same function; on a Mac the
  // ambient one is posix and leaves the slashes alone, which is a Windows bug that only
  // ever reproduces on Windows — the exact class this package models its way out of.
  parsed.command = escapeCommand(win32.normalize(parsed.command));
  parsed.args = parsed.args.map((argument) => escapeArgument(argument, doubleEscape));

  const line = [parsed.command, ...parsed.args].join(' ');
  parsed.args = ['/d', '/s', '/c', `"${line}"`];
  parsed.command = runtime.env['comspec'] ?? runtime.env['COMSPEC'] ?? 'cmd.exe';
  // The arguments are escaped already; without this Node would quote them a second time.
  parsed.options.windowsVerbatimArguments = true;
  return parsed;
}
