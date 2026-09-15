/**
 * `seniority/find-up` — the override target for `find-up` and the three packages under it
 * (R8, and the second "rejected alternative" in the design).
 *
 * `find-up` → `locate-path` → `p-locate` → `path-exists` is **809 M/wk**, measured
 * 2026-09-09, for an upward walk that is thirty lines. Publishing that walk as a *product*
 * would be four audiences this family has no edge with; publishing it as an **override
 * target** takes the tree out of an installation without taking on its maintenance. That is
 * the whole purpose of this file: it exists so a program can say "`find-up` is seniority",
 * not so anyone adopts it on its merits.
 *
 * The walk itself is `search.ts` — bounded, symlink-cycle-safe, injectable (R5, Y10) — and
 * this is the naming layer over it.
 */
import { search, searchAll, type SearchOptions } from './search.js';

export interface FindUpOptions {
  /** Where to start. Defaults to the caller's own directory being passed in; there is no ambient cwd here (R11). */
  cwd: string;
  /** The highest directory to look in, inclusive. Defaults to the filesystem root. */
  stopAt?: string;
}

const toSearch = (options: FindUpOptions): SearchOptions => ({ cwd: options.cwd, ...(options.stopAt === undefined ? {} : { stopAt: options.stopAt }) });

/** The nearest match walking up from `cwd`, or `undefined`. Proximity outranks the order of the names. */
export function findUpSync(name: string | readonly string[], options: FindUpOptions): string | undefined {
  return search(name, toSearch(options))?.path;
}

/** Every match on the way up, nearest first. `find-up`'s `findUpMultiple`. */
export function findUpMultipleSync(name: string | readonly string[], options: FindUpOptions): string[] {
  return searchAll(name, toSearch(options)).map((found) => found.path);
}

/**
 * The async spellings, which are the ones `find-up` itself publishes.
 *
 * They are `async` over a synchronous body on purpose. `fs.existsSync` in a bounded loop is
 * faster than the promise machinery for a walk this short — and a program that migrated from
 * `find-up` awaits these, so the signature has to match even where the work does not need it.
 */
export async function findUp(name: string | readonly string[], options: FindUpOptions): Promise<string | undefined> {
  const found = await Promise.resolve(search(name, toSearch(options)));
  return found?.path;
}

export async function findUpMultiple(name: string | readonly string[], options: FindUpOptions): Promise<string[]> {
  const found = await Promise.resolve(searchAll(name, toSearch(options)));
  return found.map((entry) => entry.path);
}
