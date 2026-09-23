/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * `bellpull/node-which` — the drop-in for node-which 7 (`which(cmd, opts)`, a
 * promise, and `which.sync`), graded by node-which's own suite in `compat-oracle` (R9).
 *
 * node-which's semantics, not bellpull's: a command with a slash is checked as given; Windows
 * searches the working directory first and tries `PATHEXT`'s extensions in both cases; a
 * quoted `PATH` part is unquoted; `./cmd` keeps its `./`; `all` returns every hit and
 * `nothrow` returns `null` instead of the `ENOENT` error. Joining uses the host's own
 * `path`, as upstream does.
 *
 * **The search reads the platform at call time**, where upstream reads it at load: its suite
 * flips `process.platform` per case and reloads the module to see it. Deciding per call gives
 * the same answers without a reload. Executability is bellpull's own check — the mode bits
 * off Windows, the extension on it — judged by the platform at load, as `isexe`'s is.
 */
import { delimiter, join, posix, sep } from 'node:path';

import { ambientRuntime } from './ambient.js';
import { isExecutable } from './executable.js';

export interface NodeWhichOptions {
  /** Return every match rather than the first. */
  all?: boolean;
  /** Return `null` rather than throwing when nothing is found. */
  nothrow?: boolean;
  /** Search this instead of `PATH`. */
  path?: string;
  /** Use these extensions instead of `PATHEXT`, on Windows. */
  pathExt?: string;
  /** Split `path` and `pathExt` on this instead of the platform's delimiter. */
  delimiter?: string;
}

type Found = string | string[] | null;

/**
 * node-which's error: its message and `code: 'ENOENT'`, which is all its suite asserts. Local
 * rather than `which.js`'s `NotFoundError`, which would bring the whole resolution module into
 * an entry that uses none of it.
 */
class NotFound extends Error {
  readonly code = 'ENOENT';
  constructor(cmd: string) {
    super(`not found: ${cmd}`);
  }
}

// Upstream's own two patterns — a slash of either kind the host knows, and a leading `./` —
// as literals chosen by the host's separator, which is all upstream's construction varies on.
const SLASH = sep === posix.sep ? /\// : /[/\\]/;
const RELATIVE = sep === posix.sep ? /^\.\// : /^\.[/\\]/;
const WINDOWS_EXTENSIONS = ['.EXE', '.CMD', '.BAT', '.COM'];

interface Plan {
  dirs: string[];
  exts: string[];
  /** The extension list executability is judged against on Windows; `undefined` off it. */
  judge: string[] | undefined;
}

function plan(cmd: string, opt: NodeWhichOptions): Plan {
  const runtime = ambientRuntime();
  const windows = runtime.platform === 'win32';
  const split = opt.delimiter ?? delimiter;
  const pathEnv = opt.path ?? runtime.env['PATH'] ?? '';
  const dirs = SLASH.test(cmd) ? [''] : [...(windows ? [runtime.cwd] : []), ...pathEnv.split(split)];
  if (!windows) return { dirs, exts: [''], judge: undefined };
  const listed = (opt.pathExt ?? runtime.env['PATHEXT'] ?? '') || WINDOWS_EXTENSIONS.join(split);
  const judge = listed.split(split);
  const exts = judge.flatMap((e) => [e, e.toLowerCase()]);
  if (cmd.includes('.') && exts[0] !== '') exts.unshift('');
  return { dirs, exts, judge };
}

function candidates(cmd: string, opt: NodeWhichOptions): { paths: string[]; judge: string[] | undefined } {
  const { dirs, exts, judge } = plan(cmd, opt);
  const paths = dirs.flatMap((raw) => {
    const part = /^".*"$/.test(raw) ? raw.slice(1, -1) : raw;
    const prefix = part === '' && RELATIVE.test(cmd) ? cmd.slice(0, 2) : '';
    const base = prefix + join(part, cmd);
    return exts.map((ext) => base + ext);
  });
  return { paths, judge };
}

function settle(cmd: string, opt: NodeWhichOptions, found: string[]): Found {
  if (opt.all === true && found.length > 0) return found;
  if (opt.nothrow === true) return null;
  throw new NotFound(cmd);
}

/**
 * The platform executability is judged by, fixed at load. node-which's search reads the
 * platform per call, but `isexe` picks its Windows or POSIX check once, when it is loaded —
 * so a program that changes `process.platform` later (its suite does, per case) searches like
 * the new platform and judges files like the real one. Mirrored, not improved: that split is
 * the behaviour the suite pins.
 */
const LOADED_ON = ambientRuntime().platform;

function whichSync(cmd: string, opt: NodeWhichOptions = {}): Found {
  const { paths, judge } = candidates(cmd, opt);
  const runtime = { ...ambientRuntime(), platform: LOADED_ON };
  const found: string[] = [];
  for (const p of paths) {
    if (!isExecutable(p, runtime, judge ?? [])) continue;
    if (opt.all !== true) return p;
    found.push(p);
  }
  return settle(cmd, opt, found);
}

/** node-which's `which`: the same search, answered as a promise. */
async function which(cmd: string, opt: NodeWhichOptions = {}): Promise<Found> {
  return whichSync(cmd, opt);
}

which.sync = whichSync;

// node-which's entry is a default export, so the drop-in's has to be.
// eslint-disable-next-line import-next/no-default-export -- the incumbent's entry is a default export, and matching it is the point of this file
export default which;
