/* eslint-disable reliability/no-await-in-loop -- A port graded by its incumbent's own suite, where the walk is sequential by definition: whether to look one directory higher depends on what this one held, a matcher is awaited once per directory in order and may answer `findUpStop`, and `findDown`'s order — nearest level first, or each branch to the bottom — is what its strategy cases measure. Reading the directories concurrently would call a matcher for directories find-up never reaches. */
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
 * **Graded by find-up 8.0.0's own suite** through `compat-oracle` (`graded-override-targets`
 * R2), so it is find-up 8's surface, whole: `findUp`, `findUpSync`, `findUpMultiple`,
 * `findUpMultipleSync`, a matcher function in place of a name and `findUpStop` to end it,
 * `findDown` and `findDownSync`, and locate-path's `type` and `allowSymlinks`. A name matches
 * a **file** unless `type` says otherwise, the first name that matches in a directory is the
 * one returned, and `cwd` defaults to the process's own — read through `runtime.ts`, the seam
 * every seniority drop-in opens for its incumbent's defaults (D-135). `cwd` and `stopAt` take a
 * `URL` as well as a path.
 *
 * It is not the resolver's walk. `search.ts` is bounded and matches any entry by name, which is
 * what config discovery needs; find-up's walk is neither, and its suite says so.
 */
import { lstatSync, promises, readdirSync, statSync, type Stats } from 'node:fs';
import { dirname, parse, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ambientCwd } from './runtime.js';

/** Return this from a matcher to end the walk with no match. */
export const findUpStop: unique symbol = Symbol('findUpStop');

export type Match = string | typeof findUpStop | undefined;

/** What a matcher may return: a path to check, `findUpStop`, or anything falsy for "not here". */
type MatcherResult = Match | false | null;

export interface Options {
  /** Where to start. Defaults to the process's working directory. */
  readonly cwd?: URL | string;
  /** The highest directory to look in, inclusive. Defaults to the filesystem root. */
  readonly stopAt?: URL | string;
  /** What a name must be to match. Defaults to `'file'`. */
  readonly type?: 'file' | 'directory' | 'both';
  /** Follow a symbolic link to what it points at. Defaults to `true`. */
  readonly allowSymlinks?: boolean;
  /** How many matches `findUpMultiple` collects at most. Defaults to `Infinity`. */
  readonly limit?: number;
}

export interface FindDownOptions {
  /** Where to start. Defaults to the process's working directory. */
  readonly cwd?: URL | string;
  /** How many directories below `cwd` to look. `0` is `cwd` alone; defaults to `1`. */
  readonly depth?: number;
  /** Nearest level first (`'breadth'`, the default) or each branch to the bottom first (`'depth'`). */
  readonly strategy?: 'breadth' | 'depth';
  readonly type?: 'file' | 'directory' | 'both';
  readonly allowSymlinks?: boolean;
}

type Name = string | readonly string[];
type Matcher<R> = (directory: string) => R;

const toPath = (at: URL | string | undefined): string | undefined => (at instanceof URL ? fileURLToPath(at) : at);
const start = (cwd: URL | string | undefined): string => resolve(toPath(cwd) ?? ambientCwd() ?? '');

const isFile = (stat: Stats): boolean => stat.isFile();
const isDirectory = (stat: Stats): boolean => stat.isDirectory();
const isEither = (stat: Stats): boolean => stat.isFile() || stat.isDirectory();

/** locate-path's type check: a name of the wrong kind is refused, not ignored. */
function kind(type: string): (stat: Stats) => boolean {
  if (type === 'file') return isFile;
  if (type === 'directory') return isDirectory;
  if (type === 'both') return isEither;
  throw new Error(`Invalid type specified: ${type}`);
}

/** What is at `path`, or `undefined` — a path that cannot be read is a path that is not there, as locate-path has it. */
function statOf(stat: typeof statSync, path: string): Stats | undefined {
  try {
    return stat(path, { throwIfNoEntry: false });
  } catch {
    return undefined;
  }
}

interface Locate {
  readonly type?: string;
  readonly allowSymlinks?: boolean;
}

/** The first of `names` under `cwd` that is of `type` — `locatePathSync`, in order. */
function locateSync(names: readonly string[], cwd: string, { type = 'file', allowSymlinks = true }: Locate): string | undefined {
  const is = kind(type);
  const stat = allowSymlinks ? statSync : lstatSync;
  return names.find((name) => {
    const found = statOf(stat, resolve(cwd, name));
    return found !== undefined && is(found);
  });
}

/** The same, through `fs.promises`: what `locatePath` awaits, with its order preserved. */
async function locate(names: readonly string[], cwd: string, { type = 'file', allowSymlinks = true }: Locate): Promise<string | undefined> {
  const is = kind(type);
  const stat = allowSymlinks ? promises.stat : promises.lstat;
  const hits = await Promise.all(names.map((name) => stat(resolve(cwd, name)).then(is, () => false)));
  return names[hits.indexOf(true)];
}

/** Where the walk starts, where it stops, and how many matches end it — find-up's three bounds. */
function bounds(options: Options): { from: string; stopAt: string; limit: number } {
  const from = start(options.cwd);
  return { from, stopAt: resolve(from, toPath(options.stopAt) ?? parse(from).root), limit: options.limit ?? Number.POSITIVE_INFINITY };
}

/**
 * One directory's answer, as find-up reads it: `findUpStop` ends the walk, a non-empty path is
 * a match, and anything else is "not here".
 */
function settle(step: MatcherResult, directory: string, matches: string[]): boolean {
  if (step === findUpStop) return true;
  if (typeof step === 'string' && step !== '') matches.push(resolve(directory, step));
  return false;
}

export function findUpMultipleSync(name: Name | Matcher<MatcherResult>, options: Options = {}): string[] {
  const { from, stopAt, limit } = bounds(options);
  const matches: string[] = [];
  // The root is its own parent, so the walk ends there even when `stopAt` is not an ancestor —
  // where find-up itself would spin at the root.
  for (let directory = from, previous = ''; directory !== previous; previous = directory, directory = dirname(directory)) {
    let step: MatcherResult;
    if (typeof name === 'function') {
      const result = name(directory);
      step = typeof result === 'string' ? locateSync([result], directory, options) : result;
    } else step = locateSync(([] as string[]).concat(name), directory, options);
    if (settle(step, directory, matches) || directory === stopAt || matches.length >= limit) return matches;
  }
  return matches;
}

export async function findUpMultiple(name: Name | Matcher<MatcherResult | Promise<MatcherResult>>, options: Options = {}): Promise<string[]> {
  const { from, stopAt, limit } = bounds(options);
  const matches: string[] = [];
  for (let directory = from, previous = ''; directory !== previous; previous = directory, directory = dirname(directory)) {
    let step: MatcherResult;
    if (typeof name === 'function') {
      const result = await name(directory);
      step = typeof result === 'string' ? await locate([result], directory, options) : result;
    } else step = await locate(([] as string[]).concat(name), directory, options);
    if (settle(step, directory, matches) || directory === stopAt || matches.length >= limit) return matches;
  }
  return matches;
}

/** The nearest match walking up, or `undefined`. In a directory, the first name given wins. */
export function findUpSync(name: Name | Matcher<MatcherResult>, options: Options = {}): string | undefined {
  return findUpMultipleSync(name, { ...options, limit: 1 })[0];
}

export async function findUp(name: Name | Matcher<MatcherResult | Promise<MatcherResult>>, options: Options = {}): Promise<string | undefined> {
  return (await findUpMultiple(name, { ...options, limit: 1 }))[0];
}

interface Down {
  start: string;
  depth: number;
  names: readonly string[];
  locate: Locate;
  strategy: string;
}

const down = (name: Name, options: FindDownOptions): Down => ({
  start: start(options.cwd),
  depth: Math.max(0, options.depth ?? 1),
  names: ([] as string[]).concat(name),
  locate: { type: options.type ?? 'file', allowSymlinks: options.allowSymlinks ?? true },
  strategy: options.strategy ?? 'breadth',
});

/** The directories directly under `directory`, or none when it cannot be read. */
function childrenSync(directory: string): string[] {
  try {
    return readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => resolve(directory, entry.name));
  } catch {
    return [];
  }
}

async function children(directory: string): Promise<string[]> {
  try {
    return (await promises.readdir(directory, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => resolve(directory, entry.name));
  } catch {
    return [];
  }
}

/** The first match looking down from `cwd`, `depth` levels at most, nearest level first unless `strategy` is `'depth'`. */
export function findDownSync(name: Name, options: FindDownOptions = {}): string | undefined {
  const d = down(name, options);
  const visit = (directory: string, level: number): string | undefined => {
    const hit = locateSync(d.names, directory, d.locate);
    if (hit !== undefined) return resolve(directory, hit);
    if (level >= d.depth) return undefined;
    for (const child of childrenSync(directory)) {
      const found = visit(child, level + 1);
      if (found !== undefined) return found;
    }
    return undefined;
  };
  if (d.strategy === 'depth') return visit(d.start, 0);
  const queue = [{ directory: d.start, level: 0 }];
  for (let item = queue.shift(); item !== undefined; item = queue.shift()) {
    const hit = locateSync(d.names, item.directory, d.locate);
    if (hit !== undefined) return resolve(item.directory, hit);
    if (item.level < d.depth) for (const child of childrenSync(item.directory)) queue.push({ directory: child, level: item.level + 1 });
  }
  return undefined;
}

export async function findDown(name: Name, options: FindDownOptions = {}): Promise<string | undefined> {
  const d = down(name, options);
  const visit = async (directory: string, level: number): Promise<string | undefined> => {
    const hit = await locate(d.names, directory, d.locate);
    if (hit !== undefined) return resolve(directory, hit);
    if (level >= d.depth) return undefined;
    for (const child of await children(directory)) {
      const found = await visit(child, level + 1);
      if (found !== undefined) return found;
    }
    return undefined;
  };
  if (d.strategy === 'depth') return visit(d.start, 0);
  const queue = [{ directory: d.start, level: 0 }];
  for (let item = queue.shift(); item !== undefined; item = queue.shift()) {
    const hit = await locate(d.names, item.directory, d.locate);
    if (hit !== undefined) return resolve(item.directory, hit);
    if (item.level < d.depth) for (const child of await children(item.directory)) queue.push({ directory: child, level: item.level + 1 });
  }
  return undefined;
}
