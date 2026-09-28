/**
 * What clack's `path` prompt offers: the directory entries under what has been typed.
 *
 * Each entry is `join(base, name)`, and `join` writes the platform's separator — `\` on
 * Windows, whatever was typed. clack keeps an entry only if it starts with the text as typed,
 * so on Windows `C:/work/sr` (or a directory closed with `\`) lists nothing, and the prompt
 * can never be answered. Here the typed text is put through `normalize`, the half of `join`
 * that writes the separators, before it is compared; on POSIX that is the text as typed, bar
 * repeated or `./` segments `join` would drop too. The path operations and the filesystem are
 * a host, so the Windows behaviour is held on every platform.
 */
import { existsSync, lstatSync, readdirSync } from 'node:fs';
import { dirname, join, normalize, sep } from 'node:path';

import { type Option } from './clack-core.js';

/** The path operations and filesystem reads the listing needs — `node:path` and `node:fs` unless a test says otherwise. */
export interface PathHost {
  readonly dirname: (at: string) => string;
  readonly join: (...parts: string[]) => string;
  readonly normalize: (at: string) => string;
  readonly sep: string;
  readonly exists: (at: string) => boolean;
  readonly isDirectory: (at: string) => boolean;
  readonly readdir: (at: string) => string[];
}

const NODE_HOST: PathHost = {
  dirname,
  join,
  normalize,
  sep,
  exists: existsSync,
  isDirectory: (at) => lstatSync(at).isDirectory(),
  readdir: (at) => readdirSync(at),
};

/**
 * The entries under what has been typed, as path options; a path that cannot be read lists
 * nothing. A directory typed with its closing separator — `/`, or the platform's — lists its
 * contents; otherwise its parent's entries that start with what was typed.
 */
export function entriesUnder(typed: string, directoriesOnly: boolean, host: PathHost = NODE_HOST): Option<string>[] {
  if (typed === '') return [];
  try {
    const closed = typed.endsWith('/') || typed.endsWith(host.sep);
    const base = host.exists(typed) && host.isDirectory(typed) && (!directoriesOnly || closed) ? typed : host.dirname(typed);
    // clack drops the closing separator from the prefix unless the text is a root; so does this.
    const normal = host.normalize(typed);
    const prefix = closed && host.dirname(normal) !== normal ? normal.slice(0, -1) : normal;
    return host
      .readdir(base)
      .map((name) => host.join(base, name))
      .filter((at) => at.startsWith(prefix) && (!directoriesOnly || host.isDirectory(at)))
      .map((value) => ({ value }));
  } catch {
    return [];
  }
}
