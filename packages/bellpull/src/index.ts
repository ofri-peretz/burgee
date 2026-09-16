/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * bellpull — run another program and get back a result you can read.
 *
 * A bellpull is the cord you pull in one room to ring a bell in another. Request work at a
 * distance; the work happens elsewhere; **someone comes back to you**. That last clause is
 * the package: {@link run} returns a {@link Result} for every outcome a process can have,
 * including the ones the incumbents raise as exceptions.
 *
 * Four things, and the boundaries between them are the design:
 *
 *  - {@link run} — spawn, collect, and come back with a record. A non-zero exit is data.
 *  - {@link whichSync} / {@link searchPath} — resolution that reports **which `PATH` entry
 *    the executable came from**, which is the open position in this layer.
 *  - {@link format} / {@link toJson} / {@link toEvent} — one result, three renderings.
 *  - the `resolvers` plugin host, at `bellpull/plugin`.
 *
 * The drop-in path for `cross-spawn` is `bellpull/cross-spawn` and is not re-exported here:
 * it reads the ambient `process` because its callers expect it to, and this entry does not,
 * so a program importing `bellpull` never picks that up by accident.
 *
 * **Honest scope.** `execa`'s surface is not reproduced — its streaming API and its
 * template-literal form are a different product and are recorded as out of scope in
 * `design.md`. What is here is the result shape and the resolution, which is what the
 * intent's kill gate says to build on.
 */
import { ambientRuntime } from './ambient.js';
import { escapeArgument, escapeCommand } from './escape.js';
import { format, toEvent, toJson, type RunEvent } from './project.js';
import { DEFAULT_GRACE, DEFAULT_TIMEOUT, run, SpawnError, type ExitHost, type Result, type RunOptions } from './run.js';
import { isWindows, pathDelimiter, pathKey, pathOf, type Platform, type Runtime } from './runtime.js';
import { readShebang, shebangCommand } from './shebang.js';
import {
  extensionCandidates,
  NotFoundError,
  pathExtensions,
  runPath,
  searchPath,
  whichAllSync,
  whichOrThrowSync,
  whichSync,
  type Resolution,
  type SearchEntry,
  type WhichOptions,
} from './which.js';

/** The package's own name, kept from the reserved-name release so nothing that read it breaks. */
const name = 'bellpull' as const;

/*
 * Imported and re-exported in one statement rather than twenty `export … from` lines, the
 * way `closeout/src/index.ts` does it: this entry's whole job is to be the package's single
 * public surface, and twenty re-export statements are twenty places for one to be forgotten
 * when a module moves.
 */
export {
  ambientRuntime,
  DEFAULT_GRACE,
  DEFAULT_TIMEOUT,
  escapeArgument,
  escapeCommand,
  extensionCandidates,
  format,
  isWindows,
  name,
  NotFoundError,
  pathDelimiter,
  pathExtensions,
  pathKey,
  pathOf,
  readShebang,
  run,
  runPath,
  searchPath,
  shebangCommand,
  SpawnError,
  toEvent,
  toJson,
  whichAllSync,
  whichOrThrowSync,
  whichSync,
  type ExitHost,
  type Platform,
  type Resolution,
  type Result,
  type RunEvent,
  type RunOptions,
  type Runtime,
  type SearchEntry,
  type WhichOptions,
};
