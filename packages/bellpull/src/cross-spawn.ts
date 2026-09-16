/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * `bellpull/cross-spawn` — the drop-in path for `cross-spawn` (design R7, Y3).
 *
 * Graded by `cross-spawn`'s own 68-case suite in `compat-oracle` (`hosts.ts`,
 * `target: 'bellpull/cross-spawn'`). The suite runs every case four times — `spawn`,
 * `spawn-force-shell`, `sync`, `sync-force-shell` — so a divergence in one path cannot hide
 * behind the other three.
 *
 * ## What a drop-in means here, and the one thing it means most
 *
 * **On POSIX this is a pass-through, and that is the correct implementation.**
 * `cross-spawn`'s own `parseNonShell` returns immediately off Windows; its `hookChildProcess`
 * does too. Everything it is famous for — `npm.cmd`, `PATHEXT`, shebangs, caret escaping —
 * is Windows-only, because on POSIX the kernel already does all of it. A façade that
 * "improved" on that by resolving the command itself would change the error a caller sees
 * (`err.path` would be a resolved path, not the name they wrote), change the process tree,
 * and break the incumbent's suite in four places. Being identical is the product.
 *
 * So what this file adds over `node:child_process` is exactly what `cross-spawn` adds:
 * argument normalisation and cloning, the Windows parse in `spawn-args.ts`, and the ENOENT
 * reconstruction in `enoent.ts`.
 *
 * ## It reads the ambient process, on purpose
 *
 * The core (`run.ts`, `which.ts`) takes a `Runtime` argument and reads no global — Y9. A
 * drop-in cannot: `cross-spawn`'s callers pass a command and some arguments, and the package
 * reads `process.env` and `process.platform` itself. Requiring a runtime here would mean
 * every migrating caller edits every call site, which is the definition of not a drop-in.
 * `ambient.ts` is where that read lives, once.
 *
 * ## Default export
 *
 * `module.exports = spawn` with `spawn`, `sync`, `_parse` and `_enoent` hung off it, because
 * that is what `require('cross-spawn')` gives today and a migration must not have to change
 * how the value is called.
 */
import { spawn as nodeSpawn, spawnSync as nodeSpawnSync, type ChildProcess, type SpawnSyncReturns } from 'node:child_process';

import { ambientRuntime } from './ambient.js';
import { hookChildProcess, notFoundError, verifyENOENT } from './enoent.js';
import { parse as parseArgs, type Parsed, type SpawnOptions } from './spawn-args.js';

/** Arguments, or the options object in their place — Node's own overload. */
type ArgsOrOptions = readonly unknown[] | SpawnOptions | null | undefined;

/** `cross-spawn._parse`: exported because its suite and its ecosystem both reach for it. */
function parse(command: string, args?: ArgsOrOptions, options?: SpawnOptions | null): Parsed {
  return parseArgs(command, args, options, ambientRuntime());
}

/**
 * `cross-spawn(command, args?, options?)` — a `ChildProcess`, spawned the way the platform
 * needs.
 */
function spawn(command: string, args?: ArgsOrOptions, options?: SpawnOptions | null): ChildProcess {
  const runtime = ambientRuntime();
  const parsed = parseArgs(command, args, options, runtime);
  const child = nodeSpawn(parsed.command, parsed.args, parsed.options as never);
  hookChildProcess(child, parsed, runtime);
  return child;
}

/**
 * `cross-spawn.sync(command, args?, options?)`.
 *
 * The missing-command case is put back onto `result.error` rather than thrown: `spawnSync`
 * reports a failure to start that way and a drop-in that threw would turn a value the caller
 * inspects into control flow they did not write.
 */
function sync(command: string, args?: ArgsOrOptions, options?: SpawnOptions | null): SpawnSyncReturns<Buffer | string> {
  const runtime = ambientRuntime();
  const parsed = parseArgs(command, args, options, runtime);
  const result = nodeSpawnSync(parsed.command, parsed.args, parsed.options as never);
  // Assigned only when there is one: under `exactOptionalPropertyTypes` writing `undefined`
  // into an optional field is not the same as leaving it out, and `spawnSync`'s own contract
  // is that `error` is absent on success rather than present and undefined.
  const missing = result.error ?? verifyENOENT(result.status, parsed, runtime, 'spawnSync');
  if (missing !== undefined) result.error = missing;
  return result;
}

/** `cross-spawn._enoent`, the shape its dependants import. */
const _enoent = { hookChildProcess, verifyENOENT, notFoundError };

/**
 * The callable default, with the named exports hung off it.
 *
 * `compat-oracle` re-exports `default` under the name `'module.exports'`, which is what a
 * CommonJS `require()` of this module returns whole — so the vendored suite's
 * `const spawn = require('../../shim.mjs')` gets this function and `spawn.sync` finds the
 * property below, exactly as it does from `cross-spawn` itself.
 */
const crossSpawn = Object.assign(spawn, { spawn, sync, parse, _parse: parse, _enoent });

export { _enoent, crossSpawn, parse, spawn, sync, type Parsed, type SpawnOptions };

// eslint-disable-next-line import-next/no-default-export -- the incumbent's entry is a default export and Y3 is the whole point of this file
export default crossSpawn;
