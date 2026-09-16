/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * The one place in this package that reaches for the ambient `process` — the same role
 * `closeout/src/ambient.ts` plays one layer over, and written the same way for the same
 * reason.
 *
 * Y9 says `env` and `cwd` are arguments. They are, everywhere in the core. But a **drop-in**
 * has to behave like the package it replaces, and `cross-spawn` reads `process.env`,
 * `process.cwd()` and `process.platform` itself: a program that migrates to
 * `bellpull/cross-spawn` and then has to start passing a runtime has not had a drop-in.
 * So the façade calls this, and the core never does.
 *
 * **Read off `globalThis`, never declared.** `declare const process` is a type-level promise
 * with no runtime binding — it compiles, it type-checks, it ships, and then it throws
 * `ReferenceError` for everyone who imported it. `undefined` is a real answer here (a
 * runtime with no `process` at all), and the caller says what it means in its own words.
 */
import { type Runtime } from './runtime.js';

/** The half of `process` this package reads. */
interface ProcessLike {
  platform?: string;
  env?: Record<string, string | undefined>;
  cwd?: () => string;
  getuid?: () => number;
  getgid?: () => number;
}

function ambientProcess(): ProcessLike | undefined {
  const candidate: unknown = Reflect.get(globalThis, 'process');
  return typeof candidate === 'object' && candidate !== null ? (candidate as ProcessLike) : undefined;
}

/**
 * The runtime of the process this is running in, or a runtime that admits it knows nothing.
 *
 * A missing `process` yields `platform: ''`, an empty environment and `cwd: '.'`. Every one
 * of those is a truthful answer that makes resolution fail rather than guess: an empty
 * `PATH` finds nothing, and finding nothing is the correct result when there is no
 * environment to look in.
 *
 * `uid`/`gid` are only read where the platform has them. On Windows `process.getuid` is
 * absent, and `undefined` is what tells `which.ts` to skip the ownership half of the
 * executable-bit check rather than compare against a number nobody supplied.
 */
export function ambientRuntime(): Runtime {
  const p = ambientProcess();
  return {
    platform: typeof p?.platform === 'string' ? p.platform : '',
    env: p?.env ?? {},
    cwd: typeof p?.cwd === 'function' ? p.cwd() : '.',
    uid: typeof p?.getuid === 'function' ? p.getuid() : undefined,
    gid: typeof p?.getgid === 'function' ? p.getgid() : undefined,
  };
}
