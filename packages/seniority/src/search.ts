/**
 * The bounded upward walk (R5, Y10).
 *
 * `find-up` → `locate-path` → `p-locate` → `path-exists` is **809 M/wk** for this, measured
 * 2026-09-09. It is thirty lines and it is not a product, so it is not published as one — but
 * it is exported as a function, because `seniority/find-up`'s override target needs something
 * callable, and because a program that wants the walk without the resolver should not have to
 * take the resolver.
 *
 * Three properties the four packages above do not have between them:
 *
 * - **It stops.** `stopAt`, `WALK_LIMIT` and the filesystem root, whichever comes first
 *   (Y10). A CLI's start-up must not be able to hang on a deep tree or a mounted loop.
 * - **A symlink cycle is refused, not survived by accident.** Directories are compared by
 *   their real path, so a link that points back at an ancestor ends the walk rather than
 *   spinning it up to the limit and reporting a miss that took 64 stats.
 * - **It is injectable.** `exists` and `realpath` default to `node:fs`, which is what makes
 *   the walk testable without a filesystem and what keeps `resolve` pure (R2, R11).
 */
import { existsSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * How many directories one walk may visit.
 *
 * A number rather than "until the root" alone, because the root is not the only way a walk
 * ends badly: a bind mount, a container overlay or a deliberately deep fixture tree all
 * present as an ancestor chain that is long rather than infinite. Sixty-four is far past any
 * real repository — a monorepo package sits six or seven directories down — and small enough
 * that the worst case is imperceptible.
 */
export const WALK_LIMIT = 64;

export interface SearchOptions {
  /** Where the walk starts. The first directory checked, not the first one above it. */
  cwd: string;
  /** The highest directory the walk may look in, inclusive. Defaults to the filesystem root. */
  stopAt?: string;
  /** Directories to visit at most. Defaults to `WALK_LIMIT`; a smaller number wins. */
  limit?: number;
  /** Injected for tests and for a caller with its own filesystem. Defaults to `existsSync`. */
  exists?: (path: string) => boolean;
  /** Injected the same way. Defaults to `realpathSync`, and a path that cannot be resolved is used as written. */
  realpath?: (path: string) => string;
}

export interface Found {
  /** The file, absolute. */
  path: string;
  /** The directory it was found in, absolute. */
  dir: string;
  /** How many steps up from `cwd` — `0` is `cwd` itself. What `--explain` prints as "found N levels up". */
  depth: number;
}

const defaultExists = (path: string): boolean => existsSync(path);

const defaultRealpath = (path: string): string => {
  try {
    return realpathSync(path);
  } catch {
    // A directory that does not exist has no real path, and that is not an error here: the
    // walk is allowed to pass through a missing ancestor on its way to one that is there.
    return path;
  }
};

const asList = (names: string | readonly string[]): readonly string[] => (typeof names === 'string' ? [names] : names);

/**
 * Every directory the walk visits, nearest first — the walk itself, with the matching left
 * to the caller. Exported for `searchAll` and `search`; not part of the package's surface.
 */
function* upward(options: SearchOptions): Generator<{ dir: string; depth: number }> {
  const realpath = options.realpath ?? defaultRealpath;
  const limit = Math.min(options.limit ?? WALK_LIMIT, WALK_LIMIT);
  const ceiling = options.stopAt === undefined ? undefined : realpath(resolve(options.stopAt));
  const seen = new Set<string>();
  let dir = resolve(options.cwd);
  for (let depth = 0; depth < limit; depth += 1) {
    const real = realpath(dir);
    // The cycle check. A link that points at an ancestor resolves to a real path already
    // visited, and the walk ends there rather than climbing the same ring to the limit.
    if (seen.has(real)) return;
    seen.add(real);
    yield { dir, depth };
    if (ceiling !== undefined && real === ceiling) return;
    const up = dirname(dir);
    // At the filesystem root the parent is the directory itself, which is where the chain
    // stops repeating — the one termination condition neither the limit nor the ceiling
    // can express.
    if (up === dir) return;
    dir = up;
  }
}

/** Every match on the way up, nearest directory first and, within a directory, in the order given. */
export function searchAll(names: string | readonly string[], options: SearchOptions): Found[] {
  const list = asList(names);
  const exists = options.exists ?? defaultExists;
  const out: Found[] = [];
  for (const { dir, depth } of upward(options)) {
    for (const name of list) {
      const path = join(dir, name);
      if (exists(path)) out.push({ path, dir, depth });
    }
  }
  return out;
}

/**
 * The nearest match, or `undefined`.
 *
 * **Proximity outranks the name.** Every name is checked in one directory before the walk
 * steps up, so a `.apprc` beside you wins over an `app.config.json` two directories above
 * even when the caller listed the latter first. That is the question an upward walk is
 * being asked; ordering by name instead would answer a different one silently.
 */
export function search(names: string | readonly string[], options: SearchOptions): Found | undefined {
  const list = asList(names);
  const exists = options.exists ?? defaultExists;
  for (const { dir, depth } of upward(options)) {
    for (const name of list) {
      const path = join(dir, name);
      if (exists(path)) return { path, dir, depth };
    }
  }
  return undefined;
}
