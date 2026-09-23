/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/** Executability, shared by bellpull's `which` family and its node-which drop-in. */
import { statSync, type Stats } from 'node:fs';

import { isWindows, type Runtime } from './runtime.js';

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
export function isExecutable(file: string, runtime: Runtime, pathExt: string[]): boolean {
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
