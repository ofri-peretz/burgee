/* eslint-disable maintainability/cognitive-complexity, maintainability/identical-functions, reliability/no-await-in-loop, secure-coding/detect-object-injection -- A port graded by its incumbent's own suite, and the same exemption `eslint.config.mjs` already grants `burgee/commander`, `burgee/yargs`, `flagstaff/ora`, `flagstaff/cli-table3` and `linegauge/wrap` for the same reason: the *shape* is the specification. `lilconfig`'s two explorers are one labelled `dirLoop` each, and 67 of the 77 graded cases turn on the exact order in which that loop touches the filesystem — `access` then `read` then `loader`, one search place at a time, stopping on the first hit. `Promise.all` over the places would read files the incumbent never opens, which eight `options > cache` cases measure directly by counting calls; splitting the loop into helpers to satisfy a complexity budget would reorder those calls. `identical-functions` fires on the sync explorer against the async one, which is lilconfig's own duplication and the thing being reproduced. Object injection is a loader table keyed by an extension that `getOptions` has already validated every member of, at construction time, before any file is touched. */
/**
 * `seniority/lilconfig` — lilconfig 3.1.3's surface (R8, D-006).
 *
 * **Why this is a subpath and not more of the root.** The root export is cosmiconfig's
 * surface, and lilconfig's last case — `npm package api › exports the same things as
 * cosmiconfig` — reads `Object.keys()` of the module it is handed and compares it, key for
 * key, against the real `cosmiconfig` sitting beside it. A root that carried `lilconfig`
 * *and* `cosmiconfig` would fail that case by construction, and the row measured **0 / 77**
 * for two days saying exactly that: `TypeError: lilconfigSync is not a function`, seventy-seven
 * times. D-006 is the general form — every compat row at 100% targets a dedicated drop-in
 * subpath; a row near zero is a row pointed at a package root.
 *
 * So this module exports **four names and no more**: `lilconfig`, `lilconfigSync`,
 * `defaultLoaders`, `defaultLoadersSync`. Adding a fifth runtime export breaks the parity
 * case, which is the one assertion in the suite that grades the *shape* rather than the
 * behaviour. Types are free — they do not survive to the namespace.
 *
 * **What is reproduced, and what is not.** lilconfig is not cosmiconfig with fewer features:
 * it disagrees with it deliberately, and the suite asserts the disagreements side by side.
 * Its `.json` loader is `require`, so an invalid JSON file reports V8's own message rather
 * than cosmiconfig's `JSON Error in <file>:` wrapper; its `load('')` refuses with
 * `load must pass a non-empty string` where cosmiconfig reads the directory and fails on
 * `EISDIR`; its `searchPlaces` validation names the whole *place* (`Missing loader for
 * extension "file.coffee"`) and not the extension. Each of those is a case here, so each is
 * reproduced verbatim. A façade that fixes its host's quirks is not a façade — the same rule
 * `cosmiconfig.ts` states in its own header.
 *
 * **The one divergence, and it is R11 again.** lilconfig defaults `search()`'s starting
 * directory and resolves `load()`'s relative paths against `process.cwd()`. Nothing in
 * seniority names the process, so both go through `node:path`'s own one-argument `resolve`,
 * which is what `cosmiconfig.ts` already does for the same two reasons. That is the same
 * directory by a different spelling, and it is worth saying plainly rather than letting the
 * lock's pattern imply a stronger claim than the package makes.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, extname, join, parse as parsePath, resolve as resolvePath, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

export type LilconfigResult = null | { filepath: string; config: unknown; isEmpty?: boolean };

export type LoaderSync = (filepath: string, content: string) => unknown;
export type Loader = LoaderSync | ((filepath: string, content: string) => Promise<unknown>);
export type Loaders = Record<string, Loader>;
export type LoadersSync = Record<string, LoaderSync>;

export type TransformSync = (result: LilconfigResult) => LilconfigResult;
export type Transform = TransformSync | ((result: LilconfigResult) => Promise<LilconfigResult>);

interface OptionsBase {
  cache?: boolean;
  stopDir?: string;
  searchPlaces?: string[];
  ignoreEmptySearchPlaces?: boolean;
  packageProp?: string | string[];
}

export interface Options extends OptionsBase {
  loaders?: Loaders;
  transform?: Transform;
}

export interface OptionsSync extends OptionsBase {
  loaders?: LoadersSync;
  transform?: TransformSync;
}

interface ClearCaches {
  clearLoadCache: () => void;
  clearSearchCache: () => void;
  clearCaches: () => void;
}

export interface AsyncSearcher extends ClearCaches {
  search: (searchFrom?: string) => Promise<LilconfigResult>;
  load: (filepath: string) => Promise<LilconfigResult>;
}

export interface SyncSearcher extends ClearCaches {
  search: (searchFrom?: string) => LilconfigResult;
  load: (filepath: string) => LilconfigResult;
}

/**
 * lilconfig's places, in its order — thirteen async and ten sync, the difference being every
 * `.mjs`. Deliberately *not* cosmiconfig's list: lilconfig has no `.yaml`, no `.yml`, no
 * `.ts`, and no bare `.${name}rc` at the top level, and three of the suite's cases compare
 * the two lists by the file each one finds first.
 */
function defaultSearchPlaces(name: string, sync: boolean): string[] {
  return [
    'package.json',
    `.${name}rc.json`,
    `.${name}rc.js`,
    `.${name}rc.cjs`,
    ...(sync ? [] : [`.${name}rc.mjs`]),
    `.config/${name}rc`,
    `.config/${name}rc.json`,
    `.config/${name}rc.js`,
    `.config/${name}rc.cjs`,
    ...(sync ? [] : [`.config/${name}rc.mjs`]),
    `${name}.config.js`,
    `${name}.config.cjs`,
    ...(sync ? [] : [`${name}.config.mjs`]),
  ];
}

/**
 * lilconfig's own comment on this, kept because the case it refers to is graded: on a *nix
 * box whose cwd is not under the home directory, `dirname` of a top-level path is `''` and
 * the walk would never terminate. `'/'` is what it should have been.
 */
function parentDir(p: string): string {
  return dirname(p) || sep;
}

/** The directory the walk starts from when the caller names none — see the header on R11. */
function currentDir(): string {
  return resolvePath('');
}

const requireFrom = createRequire(import.meta.url);

const jsonLoader: LoaderSync = (_filepath, content) => JSON.parse(content) as unknown;

/**
 * `require`, and nothing around it. lilconfig passes the bare function as its `.js`, `.json`
 * and `.cjs` sync loader, and two of the suite's cases turn on the consequence: an invalid
 * `.json` reports V8's `Expected ',' or '}' after property value…` rather than cosmiconfig's
 * wrapper, because nothing catches it on the way out.
 */
const requireLoader: LoaderSync = (filepath) =>
  // eslint-disable-next-line node-security/no-dynamic-dependency-loading -- The caller's own config file, by the absolute path `load`/`search` resolved: the feature, not a dependency resolved by name. `cosmiconfig-defaults.ts` carries the same exemption for the same load.
  requireFrom(filepath) as unknown;

const isEsmComplaint = (error: unknown): boolean => {
  const code = (error as { code?: string } | null)?.code;
  if (code === 'ERR_REQUIRE_ESM') return true;
  return error instanceof SyntaxError && error.toString().includes('Cannot use import statement outside a module');
};

/**
 * `import()` first, `require` second, and — when the second only complains that the file is
 * an ES module — the **first** error is what is thrown. `throws for using cjs instead of esm
 * in esm project` asserts on that choice: it wants `module is not defined`, which is what
 * `import()` says about a CJS file in an ESM package, not what `require` says about it.
 */
const dynamicImport: Loader = async (id) => {
  try {
    // eslint-disable-next-line node-security/no-dynamic-dependency-loading -- See `requireLoader`: the caller's own config file, by path.
    const mod = (await import(pathToFileURL(id).href)) as { default?: unknown };
    return mod.default;
  } catch (importError) {
    try {
      return requireLoader(id, '');
    } catch (requireError) {
      // Rethrown as caught: which of the two carries the message the author needs is the
      // entire point of the branch, and wrapping either would bury it.
      // eslint-disable-next-line maintainability/no-missing-error-context, reliability/no-missing-error-context -- see above
      throw isEsmComplaint(requireError) ? importError : requireError;
    }
  }
};

/** lilconfig's sync table. `.json` is `require`, not `JSON.parse` — that difference is graded. */
export const defaultLoadersSync: LoadersSync = Object.freeze({
  '.js': requireLoader,
  '.json': requireLoader,
  '.cjs': requireLoader,
  noExt: jsonLoader,
});

/** lilconfig's async table: `import()` for the three script extensions, `JSON.parse` for data. */
export const defaultLoaders: Loaders = Object.freeze({
  '.js': dynamicImport,
  '.mjs': dynamicImport,
  '.cjs': dynamicImport,
  '.json': jsonLoader,
  noExt: jsonLoader,
});

interface Resolved {
  stopDir: string;
  searchPlaces: string[];
  ignoreEmptySearchPlaces: boolean;
  cache: boolean;
  transform: Transform;
  packageProp: string | string[];
  loaders: Loaders;
}

/**
 * Defaults merged, then every declared search place checked for a loader **at construction
 * time**. Four of the suite's cases call `lilconfigSync(name, options)` and expect the throw
 * before any file is touched, and two of them assert on the wording: the message names the
 * whole *place* — `Missing loader for extension "file.coffee"` — which reads like a slip and
 * is the contract.
 */
function getOptions(name: string, options: Options | OptionsSync, sync: boolean): Resolved {
  const conf: Resolved = {
    stopDir: homedir(),
    searchPlaces: defaultSearchPlaces(name, sync),
    ignoreEmptySearchPlaces: true,
    cache: true,
    transform: (x) => x,
    packageProp: [name],
    ...options,
    loaders: { ...(sync ? defaultLoadersSync : defaultLoaders), ...options.loaders },
  };
  for (const place of conf.searchPlaces) {
    const key = extname(place) || 'noExt';
    const loader = conf.loaders[key];
    if (loader === undefined || loader === null) throw new Error(`Missing loader for extension "${place}"`);
    if (typeof loader !== 'function') throw new Error(`Loader for extension "${place}" is not a function: Received ${typeof loader}.`);
  }
  return conf;
}

/**
 * `packageProp`, lilconfig's way: a plain string that is an own key wins outright, anything
 * else is walked as a path, and a falsy result at the end becomes `null`.
 *
 * **The walk guards `undefined` and not `null`, and that is deliberate on both sides.**
 * `string[] with null in the middle` asserts that `packageProp: 'bar.baz'` over a
 * `package.json` holding `"bar": null` **throws** `Cannot read properties of null (reading
 * 'baz')` — from lilconfig *and* from cosmiconfig, which the case checks one after the other.
 * A `?? ` on the accumulator would return `null` cleanly and fail two graded cases for being
 * tidier than the thing it reproduces.
 */
function getPackageProp(props: string | string[], obj: Record<string, unknown>): unknown {
  if (typeof props === 'string' && props in obj) return obj[props];
  const path = Array.isArray(props) ? props : props.split('.');
  const found = path.reduce<unknown>((acc, prop) => (acc === undefined ? acc : (acc as Record<string, unknown>)[prop]), obj);
  // Upstream writes `|| null`, so every falsy result collapses. Spelled out rather than
  // borrowed, because `||` over an `unknown` is exactly the expression this repository's own
  // lint refuses — and the set of values it collapses is the contract, not an implementation.
  return found === undefined || found === null || found === false || found === '' || found === 0 || (typeof found === 'number' && Number.isNaN(found)) ? null : found;
}

function validateFilePath(filepath: string): void {
  if (!filepath) throw new Error('load must pass a non-empty string');
}

function validateLoader(loader: Loader | undefined, ext: string): asserts loader is Loader {
  if (loader === undefined || loader === null) throw new Error(`No loader specified for extension "${ext}"`);
  if (typeof loader !== 'function') throw new Error('loader is not a function');
}

const makeEmplace =
  (enableCache: boolean) =>
  <T>(c: Map<string, T>, filepath: string, res: T): T => {
    if (enableCache) c.set(filepath, res);
    return res;
  };

/** The async explorer. Its five keys, in this order, are asserted against cosmiconfig's. */
export function lilconfig(name: string, options?: Options): AsyncSearcher {
  const { ignoreEmptySearchPlaces, loaders, packageProp, searchPlaces, stopDir, transform, cache } = getOptions(name, options ?? {}, false);
  const searchCache = new Map<string, LilconfigResult>();
  const loadCache = new Map<string, LilconfigResult>();
  const emplace = makeEmplace(cache);

  return {
    async search(searchFrom = currentDir()): Promise<LilconfigResult> {
      const result: LilconfigResult = { config: null, filepath: '' };
      const visited = new Set<string>();
      let dir = searchFrom;
      dirLoop: while (true) {
        if (cache) {
          const r = searchCache.get(dir);
          if (r !== undefined) {
            for (const p of visited) searchCache.set(p, r);
            return r;
          }
          visited.add(dir);
        }

        for (const searchPlace of searchPlaces) {
          const filepath = join(dir, searchPlace);
          try {
            // Through the module object, never a captured binding: the suite asserts *which*
            // files were read by patching `fs.promises.access` and `fs.promises.readFile`,
            // and a spy replaces the property. Measured once already on cosmiconfig, where
            // the same choice was worth seventy-seven cases.
            await fs.promises.access(filepath);
          } catch {
            continue;
          }
          const content = String(await fs.promises.readFile(filepath));
          const loaderKey = extname(searchPlace) || 'noExt';
          const loader = loaders[loaderKey];

          if (searchPlace === 'package.json') {
            validateLoader(loader, loaderKey);
            const pkg = (await loader(filepath, content)) as Record<string, unknown>;
            const maybeConfig = getPackageProp(packageProp, pkg);
            if (maybeConfig !== null && maybeConfig !== undefined) {
              result.config = maybeConfig;
              result.filepath = filepath;
              break dirLoop;
            }
            continue;
          }

          const isEmpty = content.trim() === '';
          if (isEmpty && ignoreEmptySearchPlaces) continue;

          if (isEmpty) {
            result.isEmpty = true;
            result.config = undefined;
          } else {
            validateLoader(loader, loaderKey);
            result.config = await loader(filepath, content);
          }
          result.filepath = filepath;
          break dirLoop;
        }
        if (dir === stopDir || dir === parentDir(dir)) break dirLoop;
        dir = parentDir(dir);
      }

      const transformed = result.filepath === '' && result.config === null ? await transform(null) : await transform(result);
      if (cache) for (const p of visited) searchCache.set(p, transformed);
      return transformed;
    },

    async load(filepath): Promise<LilconfigResult> {
      validateFilePath(filepath);
      const absPath = resolvePath(filepath);
      if (cache && loadCache.has(absPath)) return loadCache.get(absPath) ?? null;
      const { base, ext } = parsePath(absPath);
      const loaderKey = ext || 'noExt';
      const loader = loaders[loaderKey];
      validateLoader(loader, loaderKey);
      const content = String(await fs.promises.readFile(absPath));

      if (base === 'package.json') {
        const pkg = (await loader(absPath, content)) as Record<string, unknown>;
        return emplace(loadCache, absPath, await transform({ config: getPackageProp(packageProp, pkg), filepath: absPath }));
      }
      const isEmpty = content.trim() === '';
      if (isEmpty && ignoreEmptySearchPlaces) return emplace(loadCache, absPath, await transform({ config: undefined, filepath: absPath, isEmpty: true }));

      // cosmiconfig returns undefined for empty files, and lilconfig follows it here.
      const result: LilconfigResult = { config: isEmpty ? undefined : await loader(absPath, content), filepath: absPath };
      return emplace(loadCache, absPath, await transform(isEmpty ? { ...result, isEmpty, config: undefined } : result));
    },

    clearLoadCache(): void {
      if (cache) loadCache.clear();
    },
    clearSearchCache(): void {
      if (cache) searchCache.clear();
    },
    clearCaches(): void {
      if (cache) {
        loadCache.clear();
        searchCache.clear();
      }
    },
  };
}

/** The sync explorer. Same walk, `fs.accessSync`/`fs.readFileSync`, and `require` for scripts. */
export function lilconfigSync(name: string, options?: OptionsSync): SyncSearcher {
  const { ignoreEmptySearchPlaces, loaders, packageProp, searchPlaces, stopDir, transform, cache } = getOptions(name, options ?? {}, true);
  const searchCache = new Map<string, LilconfigResult>();
  const loadCache = new Map<string, LilconfigResult>();
  const emplace = makeEmplace(cache);
  const transformSync = transform as TransformSync;

  return {
    search(searchFrom = currentDir()): LilconfigResult {
      const result: LilconfigResult = { config: null, filepath: '' };
      const visited = new Set<string>();
      let dir = searchFrom;
      dirLoop: while (true) {
        if (cache) {
          const r = searchCache.get(dir);
          if (r !== undefined) {
            for (const p of visited) searchCache.set(p, r);
            return r;
          }
          visited.add(dir);
        }

        for (const searchPlace of searchPlaces) {
          const filepath = join(dir, searchPlace);
          try {
            fs.accessSync(filepath);
          } catch {
            continue;
          }
          const loaderKey = extname(searchPlace) || 'noExt';
          const loader = loaders[loaderKey] as LoaderSync | undefined;
          const content = String(fs.readFileSync(filepath));

          if (searchPlace === 'package.json') {
            validateLoader(loader, loaderKey);
            const pkg = loader(filepath, content) as Record<string, unknown>;
            const maybeConfig = getPackageProp(packageProp, pkg);
            if (maybeConfig !== null && maybeConfig !== undefined) {
              result.config = maybeConfig;
              result.filepath = filepath;
              break dirLoop;
            }
            continue;
          }

          const isEmpty = content.trim() === '';
          if (isEmpty && ignoreEmptySearchPlaces) continue;

          if (isEmpty) {
            result.isEmpty = true;
            result.config = undefined;
          } else {
            validateLoader(loader, loaderKey);
            result.config = loader(filepath, content);
          }
          result.filepath = filepath;
          break dirLoop;
        }
        if (dir === stopDir || dir === parentDir(dir)) break dirLoop;
        dir = parentDir(dir);
      }

      const transformed = result.filepath === '' && result.config === null ? transformSync(null) : transformSync(result);
      if (cache) for (const p of visited) searchCache.set(p, transformed);
      return transformed;
    },

    load(filepath): LilconfigResult {
      validateFilePath(filepath);
      const absPath = resolvePath(filepath);
      if (cache && loadCache.has(absPath)) return loadCache.get(absPath) ?? null;
      const { base, ext } = parsePath(absPath);
      const loaderKey = ext || 'noExt';
      const loader = loaders[loaderKey] as LoaderSync | undefined;
      validateLoader(loader, loaderKey);
      const content = String(fs.readFileSync(absPath));

      // Upstream does **not** cache this branch — `emplace` is missing from its sync
      // `package.json` path and present in its async one. Reproduced as written: a cache that
      // fills where the host's does not is a divergence a caller can observe.
      if (base === 'package.json') {
        const pkg = loader(absPath, content) as Record<string, unknown>;
        return transformSync({ config: getPackageProp(packageProp, pkg), filepath: absPath });
      }
      const isEmpty = content.trim() === '';
      if (isEmpty && ignoreEmptySearchPlaces) return emplace(loadCache, absPath, transformSync({ filepath: absPath, config: undefined, isEmpty: true }));

      const result: LilconfigResult = { config: isEmpty ? undefined : loader(absPath, content), filepath: absPath };
      return emplace(loadCache, absPath, transformSync(isEmpty ? { ...result, isEmpty, config: undefined } : result));
    },

    clearLoadCache(): void {
      if (cache) loadCache.clear();
    },
    clearSearchCache(): void {
      if (cache) searchCache.clear();
    },
    clearCaches(): void {
      if (cache) {
        loadCache.clear();
        searchCache.clear();
      }
    },
  };
}
