/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Executable resolution — design R3, intent constraint 3, and the open position in this
 * layer: `which` (290 M/wk) + `isexe` (243.7 M/wk) + `path-key` (244.9 M/wk) is 779 M
 * downloads a week across three packages, and neither zero-dependency rival in the spawn
 * layer resolves at all.
 *
 * ## What is different here, and why it is the whole point
 *
 * `which` returns a path. This returns **the path and the `PATH` entry it came from**:
 *
 * ```ts
 * whichSync('node', { runtime })  // → { path: '/opt/homebrew/bin/node', from: '/opt/homebrew/bin', ext: '' }
 * ```
 *
 * "Which binary actually ran" is unanswerable in CI today, and it is half the reason a build
 * differs between two machines: two `node`s on `PATH`, a version manager's shim in front of
 * a system install, a `node_modules/.bin` entry that is only there on one runner. A resolver
 * that knows the answer and throws it away is why every such investigation starts with
 * `echo $PATH`.
 *
 * ## Security
 *
 * Three rules, and each of them is a thing this package is asked not to be fooled by:
 *
 *  1. **A command carrying a path separator is never searched on `PATH`.** `./foo`,
 *     `dir/foo` and (on Windows) `dir\foo` name a file; searching `PATH` for them would let
 *     a directory on `PATH` answer for a path the caller wrote out. This matches `which`'s
 *     own rule and POSIX's.
 *  2. **An empty `PATH` entry does not mean the current directory.** POSIX says a zero-length
 *     entry is `.`, and a `PATH` like `/usr/bin:` therefore puts whatever is in the working
 *     directory on the search path — the oldest privilege-escalation trick there is. The
 *     entry is skipped, and {@link searchPath} reports it as skipped rather than silently.
 *  3. **The answer is always absolute.** A relative hit is resolved against the `cwd` it was
 *     searched from before it is returned, so the value cannot mean something different by
 *     the time a caller spawns it.
 *
 * Rule 2 is the one that diverges from `which`, deliberately. `which` joins an empty entry
 * onto the command and stats the result, which resolves against the process's directory.
 * `bellpull/cross-spawn` keeps that path closed too, and the divergence is invisible to
 * `cross-spawn`'s suite because it never puts an empty entry on `PATH`.
 */
import { statSync, type Stats } from 'node:fs';
import { delimiter as nodeDelimiter, posix, sep, win32 } from 'node:path';

import { isWindows, pathDelimiter, pathOf, type Runtime } from './runtime.js';

/**
 * The path dialect this runtime speaks.
 *
 * Selected by the runtime rather than inherited from the machine, for the same reason
 * `spawn-args.ts` picks `win32.normalize`: `isAbsolute('C:\\tools')` is `false` under posix
 * and `true` under win32, so a resolver using the ambient module would refuse every Windows
 * `PATH` entry when modelled from a Mac and accept them when run on Windows. A rule that
 * only holds on the platform you cannot test on is not a rule.
 *
 * Running natively, the two are the same object, so this costs nothing where it matters.
 */
type PathOps = Pick<typeof posix, 'isAbsolute' | 'join' | 'resolve'>;

const pathOps = (runtime: Runtime): PathOps => (isWindows(runtime) ? win32 : posix);

/** Where an executable was found, and what found it. */
export interface Resolution {
  /** The absolute path of the file that would be executed. */
  path: string;
  /**
   * The `PATH` entry it was found under, or `''` when the command carried its own path and
   * `PATH` was never consulted. This is the field no incumbent returns.
   */
  from: string;
  /**
   * The extension appended from `PATHEXT` to find it — `.CMD`, `.EXE`. Always `''` off
   * Windows, where the file is executable or it is not.
   */
  ext: string;
}

export interface WhichOptions {
  /** The ambient state. Required in spirit; defaulted only by the façades. */
  runtime: Runtime;
  /** Override the `PATH` string. Overrides `runtime.env`'s, as `which`'s `path` does. */
  path?: string | undefined;
  /** Override `PATHEXT`. `''` disables extension expansion entirely. */
  pathExt?: string | undefined;
  /** Resolve relative entries and relative commands against this instead of `runtime.cwd`. */
  cwd?: string | undefined;
}

/** The extensions Windows runs without being told to, when `PATHEXT` says nothing. */
const DEFAULT_PATHEXT = '.EXE;.CMD;.BAT;.COM';

/** `Error` with the `code` a caller switches on, and the command it could not find. */
export class NotFoundError extends Error {
  readonly code = 'ENOENT';
  constructor(readonly command: string) {
    super(`not found: ${command}`);
    this.name = 'NotFoundError';
  }
}

/** Whether a command names a file rather than something to look up. */
function carriesPath(command: string, windows: boolean): boolean {
  return command.includes('/') || (windows && command.includes('\\'));
}

/**
 * Is this file something the current user can execute?
 *
 * This is `isexe`, 243.7 M downloads a week, in two branches. On Windows the question is
 * about the *name*: a file is executable when its extension is in `PATHEXT`, because the
 * filesystem carries no execute bit. Everywhere else it is about the mode, and the mode has
 * to be read against the caller's own uid and gid — a file that is `rwx------` and owned by
 * somebody else is not executable by us, and reporting it as the answer would send the
 * caller to a `EACCES` instead of on to the next `PATH` entry.
 *
 * A `uid` of 0 can execute anything with any execute bit set at all, which is why root sees
 * a different `PATH` answer from everyone else and why that has to be modelled rather than
 * assumed away.
 */
function isExecutable(file: string, runtime: Runtime, pathExt: string[]): boolean {
  let stat;
  try {
    stat = statSync(file);
  } catch {
    // Absent, or a directory component of it is. Either way: not this one.
    return false;
  }
  return isWindows(runtime) ? executableByName(file, stat, pathExt) : executableByMode(stat, runtime);
}

/** Windows: the extension decides, because the filesystem carries no execute bit. */
function executableByName(file: string, stat: Stats, pathExt: string[]): boolean {
  if (!stat.isFile() && !stat.isSymbolicLink()) return false;
  if (pathExt.length === 0) return true;
  const lower = file.toLowerCase();
  return pathExt.some((ext) => ext === '' || lower.endsWith(ext.toLowerCase()));
}

/**
 * POSIX: the mode decides, read against *this* caller's uid and gid.
 *
 * A file that is `rwx------` and owned by somebody else is not executable by us, and
 * reporting it as the answer would send the caller to an `EACCES` instead of on to the next
 * `PATH` entry. A `uid` of 0 runs anything anybody may run, which is why root sees a
 * different answer from everyone else and why that has to be modelled rather than assumed
 * away.
 */
const OTHER = 0o001;
const GROUP = 0o010;
const OWNER = 0o100;

function executableByMode(stat: Stats, runtime: Runtime): boolean {
  if (!stat.isFile()) return false;
  const { mode, uid, gid } = stat;
  if ((mode & OTHER) !== 0) return true;
  if ((mode & GROUP) !== 0 && runtime.gid !== undefined && gid === runtime.gid) return true;
  if ((mode & OWNER) !== 0 && runtime.uid !== undefined && uid === runtime.uid) return true;
  return (mode & (OWNER | GROUP)) !== 0 && runtime.uid === 0;
}

/**
 * The `PATHEXT` list for this runtime, as an array. `['']` off Windows: no expansion.
 *
 * Exported because it is the one half of Windows resolution that can be *checked* from
 * another platform: which extensions are tried, and in what order, is policy, whereas
 * whether `C:\\tools\\npm.cmd` exists is a fact about a filesystem that is not here.
 */
export function pathExtensions(options: WhichOptions): string[] {
  const { runtime } = options;
  if (!isWindows(runtime)) return [''];
  const declared = options.pathExt ?? runtime.env['PATHEXT'] ?? DEFAULT_PATHEXT;
  // An explicit empty `PATHEXT` means "try the name exactly as written" — `cross-spawn`
  // uses it for its second resolution attempt, to find an extensionless script.
  if (declared === '') return [''];
  return declared.split(';').filter((ext) => ext !== '');
}

/**
 * The extensions tried for this command, in order.
 *
 * On Windows a command that already carries a dot may be complete as written, so the empty
 * extension goes first — `which` does the same, and `whoami.cmd` on `PATH` depends on it.
 */
export function extensionCandidates(command: string, options: WhichOptions): string[] {
  const exts = pathExtensions(options);
  if (!isWindows(options.runtime)) return exts;
  return command.includes('.') && exts[0] !== '' ? ['', ...exts] : exts;
}

/** One directory to search, and whether it was skipped and why. */
export interface SearchEntry {
  /** The entry as it appeared on `PATH`, before quotes were stripped or it was resolved. */
  raw: string;
  /** The absolute directory that will be searched, when it will be. */
  dir?: string;
  /** Why it will not be, when it will not: a reader can see the hole rather than infer it. */
  skipped?: 'empty' | 'relative';
}

/**
 * The directories this runtime would search, in order — the static projection of resolution
 * (PRINCIPLES rule 6).
 *
 * A caller, or an agent, reads what *would* happen without running anything. It is also
 * where the two refusals above become visible: an entry dropped for being empty or relative
 * is listed with the reason, so a `PATH` that silently does less than its author expected
 * says so.
 */
export function searchPath(options: WhichOptions): SearchEntry[] {
  const { runtime } = options;
  const p = pathOps(runtime);
  const against = p.resolve(runtime.cwd, options.cwd ?? '.');
  const raw = (options.path ?? pathOf(runtime)).split(pathDelimiter(runtime));
  const entries: SearchEntry[] = [];

  // Windows searches the working directory before `PATH`, and does so whatever `PATH` says.
  // That is the platform's rule, not a courtesy we extend: a `.bat` beside the script runs
  // on Windows and does not on POSIX, and a resolver that hid the difference would report a
  // path that does not match what `cmd.exe` would have run.
  if (isWindows(runtime)) entries.push({ raw: against, dir: against });

  for (const entry of raw) {
    // A quoted entry is how Windows carries a directory with a semicolon in it.
    const unquoted = /^".*"$/.test(entry) ? entry.slice(1, -1) : entry;
    if (unquoted === '') {
      entries.push({ raw: entry, skipped: 'empty' });
      continue;
    }
    if (!p.isAbsolute(unquoted)) {
      entries.push({ raw: entry, skipped: 'relative' });
      continue;
    }
    entries.push({ raw: entry, dir: unquoted });
  }
  return entries;
}

/**
 * Every place `command` resolves to, best first. Empty when it resolves nowhere.
 *
 * `all` in `which`'s API; here it is the primitive and the single answer is the first of it,
 * because "there are two `node`s on this `PATH`" is the finding an investigation wants and
 * throwing away everything after the first is what stops it being available.
 */
export function whichAllSync(command: string, options: WhichOptions): Resolution[] {
  const { runtime } = options;
  const p = pathOps(runtime);
  const windows = isWindows(runtime);
  const against = p.resolve(runtime.cwd, options.cwd ?? '.');
  const exts = pathExtensions(options);
  const candidates = extensionCandidates(command, options);
  const found: Resolution[] = [];

  const consider = (file: string, from: string, ext: string): void => {
    if (!isExecutable(file, runtime, exts)) return;
    found.push({ path: p.resolve(against, file), from, ext });
  };

  if (carriesPath(command, windows)) {
    // Rule 1: the caller named a file. `PATH` is not consulted, and `from` is empty to say
    // so — a reader must be able to tell "found in /usr/bin" from "you told me where it is".
    for (const ext of candidates) consider(p.resolve(against, command + ext), '', ext);
    return found;
  }

  for (const entry of searchPath(options)) {
    if (entry.dir === undefined) continue;
    for (const ext of candidates) consider(p.join(entry.dir, command + ext), entry.dir, ext);
  }
  return found;
}

/**
 * Where `command` resolves to, or `undefined`.
 *
 * The non-throwing form, because "it is not installed" is an ordinary answer that a caller
 * branches on — the same argument the `Result` in `run.ts` makes about a non-zero exit.
 */
export function whichSync(command: string, options: WhichOptions): Resolution | undefined {
  return whichAllSync(command, options)[0];
}

/**
 * Where `command` resolves to, throwing {@link NotFoundError} when it resolves nowhere.
 *
 * `which`'s own shape, for the callers that want it — and the one place in this package
 * where not finding something is an exception, because the caller asked a question that has
 * no other answer.
 */
export function whichOrThrowSync(command: string, options: WhichOptions): Resolution {
  const found = whichSync(command, options);
  if (found === undefined) throw new NotFoundError(command);
  return found;
}

/**
 * `PATH` with every `node_modules/.bin` from `cwd` upward in front of it — `npm-run-path`'s
 * contract (104 M/wk, 2 dependencies, last published 2024-08-26).
 *
 * Twelve lines rather than a sibling dependency (design R4): the walk stops at the
 * filesystem root, which `resolve` of `'..'` reports by returning its own argument.
 */
export function runPath(options: WhichOptions): string {
  const { runtime } = options;
  const p = pathOps(runtime);
  const parts: string[] = [];
  let dir = p.resolve(runtime.cwd, options.cwd ?? '.');
  for (;;) {
    parts.push(p.join(dir, 'node_modules', '.bin'));
    const up = p.resolve(dir, '..');
    if (up === dir) break;
    dir = up;
  }
  const existing = options.path ?? pathOf(runtime);
  const d = pathDelimiter(runtime);
  return existing === '' ? parts.join(d) : [...parts, existing].join(d);
}

/* `node:path`'s own delimiter and separator, re-exported for a caller assembling a `PATH`
 * for the platform it is on rather than one it is describing. */
export { nodeDelimiter as delimiter, sep };
