/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Shebang reading — `shebang-regex` (published 2021-08-13) and `shebang-command` (2019-09-06)
 * in fifteen lines, because Windows has no kernel support for `#!`.
 *
 * On POSIX the kernel reads the first line of an executable file and runs the interpreter
 * named there. Windows does not, so a `.sh`-less script with `#!/usr/bin/env node` at the
 * top is not executable at all — `cross-spawn` reads the line itself and rewrites the spawn
 * into `node <script> <args…>`. That is the second of the two things it does, and the
 * reason `should support shebang in executables with /usr/bin/env` is in its suite.
 */
import { closeSync, openSync, readSync } from 'node:fs';

/** How much of the file to read. `shebang-command`'s own number, and longer than any shebang. */
const HEADER_BYTES = 150;

/**
 * The interpreter a `#!` line names, or `undefined`.
 *
 * `#!/usr/bin/env node` is `node`: `env` is a launcher, so its *argument* is the interpreter
 * and the path in front of it is discarded. `#!/bin/sh -e` is `sh -e` — the flag is kept,
 * because dropping it changes what the script does.
 */
export function shebangCommand(source: string): string | undefined {
  const line = /^#!(.*)/.exec(source);
  if (line === null) return undefined;
  const [path, argument] = line[0].replace(/#! ?/, '').split(' ');
  if (path === undefined) return undefined;
  const binary = path.split('/').pop();
  if (binary === 'env') return argument;
  if (binary === undefined || binary === '') return undefined;
  return argument === undefined ? binary : `${binary} ${argument}`;
}

/**
 * The interpreter the file at `file` declares, or `undefined` — for a file that is not there,
 * is not readable, is a directory, or simply has no shebang.
 *
 * Every one of those is the same answer to the caller ("no interpreter to use"), so they are
 * one return rather than four. The distinction that matters — whether the file exists —
 * belongs to resolution, which has already been done by the time this is asked.
 */
export function readShebang(file: string): string | undefined {
  const buffer = Buffer.alloc(HEADER_BYTES);
  let fd;
  try {
    fd = openSync(file, 'r');
    readSync(fd, buffer, 0, HEADER_BYTES, 0);
  } catch {
    return undefined;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
  return shebangCommand(buffer.toString());
}
