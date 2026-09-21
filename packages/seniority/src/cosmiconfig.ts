/**
 * `cosmiconfig`'s surface, reproduced (R8, Y3).
 *
 * This is the drop-in half of the package: `cosmiconfig(name).search()` here answers what
 * `cosmiconfig(name).search()` there answers, graded by cosmiconfig's own suite rather than
 * by ours (`compat-oracle`, host `cosmiconfig`). The native API — `resolve`, `explain`,
 * `ORDER` — is the other half and is what a program migrating *to* seniority moves onto;
 * this exists so that moving is one line rather than a rewrite.
 *
 * Three things are reproduced deliberately even though they read like accidents, because a
 * façade that fixes its host's quirks is not a façade:
 *
 * - `#validateConfig` reports the whole **search place** where it says "extension", so
 *   `.foorc.things` is described as `extension ".foorc.things"`. Two of cosmiconfig's own
 *   cases assert that string.
 * - a meta config (`.config/config.json`'s `cosmiconfig` key) **outranks the program's own
 *   options**, which is the opposite of how every other option merge in this family works.
 * - `searchStrategy` is never validated. An unknown value yields no directories at all.
 *
 * Two things are **not** reproduced, and both are listed rather than hidden:
 *
 * - **YAML.** `loadYaml` reads the JSON subset and refuses the rest by name (see
 *   `cosmiconfig-defaults.ts`). Constraint 3: no format parser is bundled.
 * - **The global config directory is computed, not read from the environment.** cosmiconfig
 *   asks `env-paths`, which reads `XDG_CONFIG_HOME` and `APPDATA`; nothing in seniority reads
 *   `process.*` (R11), so the directory is derived from `os.homedir()` and the platform and
 *   is overridable through `globalConfigDir`. On every platform with those variables unset —
 *   which is the normal case, and every case on macOS — the two agree exactly.
 */
/**
 * **Reached through the module object, never through a named binding.** cosmiconfig's suite
 * asserts *which files were read* by spying on `fs.readFileSync` and `fsPromises.readFile` —
 * 98 of its cases do — and a spy patches the property, not a binding captured at import.
 * Measured 2026-09-15: with `import { readFile } from 'node:fs/promises'` the same
 * implementation scored 109 / 241, because 22 of `caches.test.ts`'s 27 cases saw an empty
 * call list. The property access at call time is the compatibility surface.
 */
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import { homedir, platform } from 'node:os';
import { basename, dirname, extname, join, resolve as resolvePath } from 'node:path';

import {
  defaultLoaders,
  defaultLoadersSync,
  getDefaultSearchPlaces,
  getDefaultSearchPlacesSync,
  globalConfigSearchPlaces,
  globalConfigSearchPlacesSync,
  metaSearchPlaces,
  NO_EXTENSION,
} from './cosmiconfig-defaults.js';
import { decodeFileContent, emplace, getPropertyByPath, mergeAll, removeUndefinedValuesFromObject } from './cosmiconfig-util.js';
import { type Loader } from './load.js';

export type Config = unknown;
export type CosmiconfigResult = { config: Config; filepath: string; isEmpty?: boolean } | null;
export type Transform = (result: CosmiconfigResult) => CosmiconfigResult | Promise<CosmiconfigResult>;
export type SearchStrategy = 'none' | 'project' | 'global';
export type Loaders = Record<string, Loader>;

export interface CommonOptions {
  packageProp?: string | string[];
  searchPlaces: string[];
  ignoreEmptySearchPlaces: boolean;
  stopDir?: string;
  cache: boolean;
  mergeImportArrays: boolean;
  mergeSearchPlaces: boolean;
  searchStrategy: SearchStrategy;
  /**
   * seniority's one addition: the directory a `global` search ends in. cosmiconfig derives it
   * from the environment through `env-paths`; this package takes it as an argument so nothing
   * here reads `process.*` (R11), and defaults it from `os.homedir()` and the platform.
   */
  globalConfigDir?: string;
}

export interface Options extends CommonOptions {
  loaders: Loaders;
  transform: Transform;
}
export type OptionsSync = Options;

/** What the explorer is actually constructed with — the caller's options plus what `cosmiconfig()` worked out. */
interface InternalOptions extends Options {
  moduleName: string;
  metaConfigFilePath: string | null;
  applyPackagePropertyPathToConfiguration?: boolean;
}

export interface PublicExplorer {
  search: (from?: string) => Promise<CosmiconfigResult>;
  load: (filepath: string) => Promise<CosmiconfigResult>;
  clearLoadCache: () => void;
  clearSearchCache: () => void;
  clearCaches: () => void;
}

export interface PublicExplorerSync {
  search: (from?: string) => CosmiconfigResult;
  load: (filepath: string) => CosmiconfigResult;
  clearLoadCache: () => void;
  clearSearchCache: () => void;
  clearCaches: () => void;
}

interface Dir {
  path: string;
  isGlobalConfig: boolean;
}

/** `transform`'s default. The name is asserted: `index.test.ts` matches it against `/identity/`. */
function identity(x: CosmiconfigResult): CosmiconfigResult {
  return x;
}

/** `extension ".foorc.things"` or `files without extensions` — cosmiconfig's own wording. */
function getExtensionDescription(extension: string): string {
  return extension === '' ? 'files without extensions' : `extension "${extension}"`;
}

/** The four the search swallows: a place that is not there, or not readable, is not a failure. */
const SKIPPABLE: ReadonlySet<string> = new Set(['ENOENT', 'EISDIR', 'ENOTDIR', 'EACCES']);
const isSkippable = (error: unknown): boolean => SKIPPABLE.has(String((error as { code?: string } | null)?.code));

// eslint-disable-next-line conventions/consistent-existence-index-check -- cosmiconfig's own `hasOwn` is `Object.prototype.hasOwnProperty`, and the difference matters here: `'$import' in loaded` would be true for an object that merely inherits the key, which is how a prototype-polluted config would start importing files.
const hasOwn = (o: unknown, key: string): boolean => typeof o === 'object' && o !== null && Object.hasOwn(o, key);

/** `env-paths(name, { suffix: '' }).config`, computed from the platform rather than read from the environment. */
function defaultGlobalConfigDir(moduleName: string): string {
  const home = homedir();
  if (platform() === 'darwin') return join(home, 'Library', 'Preferences', moduleName);
  if (platform() === 'win32') return join(home, 'AppData', 'Roaming', moduleName, 'Config');
  return join(home, '.config', moduleName);
}

/** Everything both explorers share: the config, the caches, and the parts that touch no filesystem. */
abstract class ExplorerBase {
  protected readonly config: InternalOptions;
  protected loadCache?: Map<string, unknown>;
  protected searchCache?: Map<string, unknown>;
  protected loadingMetaConfig = false;

  constructor(options: InternalOptions) {
    this.config = options;
    if (options.cache) {
      this.loadCache = new Map();
      this.searchCache = new Map();
    }
    this.validateConfig();
  }

  /**
   * Every search place must have a loader, checked once at construction rather than on the
   * miss that would otherwise report it as "no config found".
   */
  private validateConfig(): void {
    for (const place of this.config.searchPlaces) {
      const loader = this.loaderFor(extname(place));
      // The description takes the whole place, not the extension — cosmiconfig's own wording,
      // asserted by two of its cases, so it is reproduced rather than corrected.
      if (loader === undefined) throw new Error(`Missing loader for ${getExtensionDescription(place)}.`);
      if (typeof loader !== 'function') throw new Error(`Loader for ${getExtensionDescription(place)} is not a function: Received ${typeof loader}.`);
    }
  }

  /** `loaders['.json']`, falling back to the undocumented-but-real `loaders.default` catch-all. */
  protected loaderFor(extension: string): Loader | undefined {
    const table = this.config.loaders;
    return table[extension === '' ? NO_EXTENSION : extension] ?? table['default'];
  }

  clearLoadCache(): void {
    this.loadCache?.clear();
  }

  clearSearchCache(): void {
    this.searchCache?.clear();
  }

  clearCaches(): void {
    this.clearLoadCache();
    this.clearSearchCache();
  }

  /** `null` for nothing, `{ isEmpty: true }` for a file with no content, `{ config, filepath }` otherwise. */
  protected toCosmiconfigResult(filepath: string, config: Config): CosmiconfigResult {
    if (config === null) return null;
    if (config === undefined) return { filepath, config: undefined, isEmpty: true };
    const extracted =
      this.config.applyPackagePropertyPathToConfiguration === true || this.loadingMetaConfig ? getPropertyByPath(config, this.config.packageProp ?? this.config.moduleName) : config;
    if (extracted === undefined) return { filepath, config: undefined, isEmpty: true };
    return { config: extracted, filepath };
  }

  /** A `$import` may not be a non-string, may not name its own file, and may not close a ring. */
  protected validateImports(containingFilePath: string, imports: readonly unknown[], importStack: readonly string[]): void {
    const fileDirectory = dirname(containingFilePath);
    for (const importPath of imports) {
      if (typeof importPath !== 'string') throw new Error(`${containingFilePath}: Key $import must contain a string or a list of strings`);
      const fullPath = resolvePath(fileDirectory, importPath);
      if (fullPath === containingFilePath) throw new Error(`Self-import detected in ${containingFilePath}`);
      const idx = importStack.indexOf(fullPath);
      if (idx !== -1) {
        const chain = [...importStack, fullPath].map((p, i) => `${String(i + 1)}. ${p}`).join('\n');
        throw new Error(`Circular import detected:\n${chain} (same as ${String(idx + 1)}.)`);
      }
    }
  }

  protected getSearchPlacesForDir(dir: Dir, globalPlaces: readonly string[]): string[] {
    return (dir.isGlobalConfig ? globalPlaces : this.config.searchPlaces).map((place) => join(dir.path, place));
  }

  protected getGlobalConfigDir(): string {
    return this.config.globalConfigDir ?? defaultGlobalConfigDir(this.config.moduleName);
  }

  /** Up from `startDir` to `stopDir` inclusive, then the global directory, always last. */
  protected *getGlobalDirs(startDir: string): Generator<Dir> {
    const stopDir = resolvePath(this.config.stopDir ?? homedir());
    yield { path: startDir, isGlobalConfig: false };
    let currentDir = startDir;
    while (currentDir !== stopDir) {
      const parentDir = dirname(currentDir);
      if (parentDir === currentDir) break;
      yield { path: parentDir, isGlobalConfig: false };
      currentDir = parentDir;
    }
    yield { path: this.getGlobalConfigDir(), isGlobalConfig: true };
  }

  /** The file whose basename is `package` is the one whose named property is the config. */
  protected extractPackageProp(filepath: string, extension: string, loaded: unknown): unknown {
    if (basename(filepath, extension) !== 'package') return loaded;
    return getPropertyByPath(loaded, this.config.packageProp ?? this.config.moduleName) ?? null;
  }
}

/** The asynchronous explorer. */
export class Explorer extends ExplorerBase {
  async load(filepath: string): Promise<CosmiconfigResult> {
    const at = resolvePath(filepath);
    const run = async (): Promise<CosmiconfigResult> => await this.config.transform(await this.readConfiguration(at));
    return this.loadCache === undefined ? await run() : await (emplace(this.loadCache, at, run) as Promise<CosmiconfigResult>);
  }

  async search(from = ''): Promise<CosmiconfigResult> {
    const meta = await this.searchMetaConfig();
    if (meta !== null) return meta;
    const start = resolvePath(from);
    const dirs = this.directories(start);
    const first = await dirs.next();
    if (first.done === true) throw new Error(`Could not find any folders to iterate through (start from ${start})`);
    let currentDir = first.value;
    const step = async (): Promise<CosmiconfigResult> => {
      const found = await this.scan(currentDir);
      // Transformed here rather than inside `scan`, so the one `await` the search places loop
      // needs is the read and nothing else. `transform` still runs exactly once per `search()`
      // — on the hit, or on `null` at the end — which `failed-files.test.ts` asserts.
      if (found !== undefined) return await this.config.transform(found);
      const next = await dirs.next();
      if (next.done === true) return await this.config.transform(null);
      currentDir = next.value;
      return this.searchCache === undefined ? await step() : await (emplace(this.searchCache, currentDir.path, step) as Promise<CosmiconfigResult>);
    };
    return this.searchCache === undefined ? await step() : await (emplace(this.searchCache, start, step) as Promise<CosmiconfigResult>);
  }

  /** A `metaConfigFilePath` that loads to something non-empty short-circuits the whole search. */
  private async searchMetaConfig(): Promise<CosmiconfigResult> {
    const at = this.config.metaConfigFilePath;
    if (at === null) return null;
    this.loadingMetaConfig = true;
    try {
      const config = await this.load(at);
      return config !== null && config.isEmpty !== true ? config : null;
    } finally {
      this.loadingMetaConfig = false;
    }
  }

  /** One directory's places, in order; `undefined` means "nothing here, keep walking". Untransformed. */
  private async scan(dir: Dir): Promise<CosmiconfigResult | undefined> {
    if (!(await isDirectoryAsync(dir.path))) return undefined;
    for (const filepath of this.getSearchPlacesForDir(dir, globalConfigSearchPlaces)) {
      try {
        // eslint-disable-next-line reliability/no-await-in-loop -- The search places are an ORDERED list and the first hit wins (R1). Reading them concurrently would load files the order says are never reached — a `.js` config that runs as a side effect of being imported, on a path the search would have stopped short of — and would report the wrong one in a directory holding two.
        const result = await this.readConfiguration(filepath);
        if (result !== null && !(result.isEmpty === true && this.config.ignoreEmptySearchPlaces)) return result;
      } catch (error) {
        if (isSkippable(error)) continue;
        throw error;
      }
    }
    return undefined;
  }

  private async readConfiguration(filepath: string, importStack: readonly string[] = []): Promise<CosmiconfigResult> {
    const contents = decodeFileContent(await fsPromises.readFile(filepath));
    return this.toCosmiconfigResult(filepath, await this.loadWithImports(filepath, contents, importStack));
  }

  private async loadWithImports(filepath: string, contents: string, importStack: readonly string[]): Promise<unknown> {
    const loaded = await this.loadConfiguration(filepath, contents);
    if (!hasOwn(loaded, '$import')) return loaded;
    const { $import: imports, ...ownContent } = loaded as Record<string, unknown>;
    const importPaths = Array.isArray(imports) ? (imports as unknown[]) : [imports];
    const newStack = [...importStack, filepath];
    this.validateImports(filepath, importPaths, newStack);
    const fileDirectory = dirname(filepath);
    const imported = await Promise.all(importPaths.map(async (p) => (await this.readConfiguration(resolvePath(fileDirectory, String(p)), newStack))?.config));
    return mergeAll([...imported, ownContent], { mergeArrays: this.config.mergeImportArrays });
  }

  private async loadConfiguration(filepath: string, contents: string): Promise<unknown> {
    if (contents.trim() === '') return undefined;
    const extension = extname(filepath);
    const loader = this.loaderFor(extension);
    if (loader === undefined) throw new Error(`No loader specified for ${getExtensionDescription(extension)}`);
    try {
      return this.extractPackageProp(filepath, extension, await loader(filepath, contents));
    } catch (error) {
      annotate(error, filepath);
      throw error;
    }
  }

  private async *directories(startDir: string): AsyncGenerator<Dir> {
    if (this.config.searchStrategy === 'none') {
      yield { path: startDir, isGlobalConfig: false };
      return;
    }
    if (this.config.searchStrategy === 'global') {
      yield* this.getGlobalDirs(startDir);
      return;
    }
    if (this.config.searchStrategy !== 'project') return;
    let currentDir = startDir;
    for (;;) {
      yield { path: currentDir, isGlobalConfig: false };
      // eslint-disable-next-line reliability/no-await-in-loop -- The walk is sequential by definition: whether to look one directory higher depends on whether this one holds a package manifest, which is the `project` strategy.
      if (await hasPackageManifestAsync(currentDir)) return;
      const parentDir = dirname(currentDir);
      if (parentDir === currentDir) return;
      currentDir = parentDir;
    }
  }
}

/** The synchronous explorer. Same decisions, `readFileSync` and `statSync`, and no `.mjs` anywhere. */
export class ExplorerSync extends ExplorerBase {
  load(filepath: string): CosmiconfigResult {
    const at = resolvePath(filepath);
    const run = (): CosmiconfigResult => this.config.transform(this.readConfiguration(at)) as CosmiconfigResult;
    return this.loadCache === undefined ? run() : (emplace(this.loadCache, at, run) as CosmiconfigResult);
  }

  search(from = ''): CosmiconfigResult {
    const meta = this.searchMetaConfig();
    if (meta !== null) return meta;
    const start = resolvePath(from);
    const dirs = this.directories(start);
    const first = dirs.next();
    if (first.done === true) throw new Error(`Could not find any folders to iterate through (start from ${start})`);
    let currentDir = first.value;
    const step = (): CosmiconfigResult => {
      const found = this.scan(currentDir);
      if (found !== undefined) return this.config.transform(found) as CosmiconfigResult;
      const next = dirs.next();
      if (next.done === true) return this.config.transform(null) as CosmiconfigResult;
      currentDir = next.value;
      return this.searchCache === undefined ? step() : (emplace(this.searchCache, currentDir.path, step) as CosmiconfigResult);
    };
    return this.searchCache === undefined ? step() : (emplace(this.searchCache, start, step) as CosmiconfigResult);
  }

  private searchMetaConfig(): CosmiconfigResult {
    const at = this.config.metaConfigFilePath;
    if (at === null) return null;
    this.loadingMetaConfig = true;
    try {
      const config = this.load(at);
      return config !== null && config.isEmpty !== true ? config : null;
    } finally {
      this.loadingMetaConfig = false;
    }
  }

  private scan(dir: Dir): CosmiconfigResult | undefined {
    if (!isDirectorySync(dir.path)) return undefined;
    for (const filepath of this.getSearchPlacesForDir(dir, globalConfigSearchPlacesSync)) {
      try {
        const result = this.readConfiguration(filepath);
        if (result !== null && !(result.isEmpty === true && this.config.ignoreEmptySearchPlaces)) return result;
      } catch (error) {
        if (isSkippable(error)) continue;
        throw error;
      }
    }
    return undefined;
  }

  private readConfiguration(filepath: string, importStack: readonly string[] = []): CosmiconfigResult {
    const contents = decodeFileContent(fs.readFileSync(filepath));
    return this.toCosmiconfigResult(filepath, this.loadWithImports(filepath, contents, importStack));
  }

  private loadWithImports(filepath: string, contents: string, importStack: readonly string[]): unknown {
    const loaded = this.loadConfiguration(filepath, contents);
    if (!hasOwn(loaded, '$import')) return loaded;
    const { $import: imports, ...ownContent } = loaded as Record<string, unknown>;
    const importPaths = Array.isArray(imports) ? (imports as unknown[]) : [imports];
    const newStack = [...importStack, filepath];
    this.validateImports(filepath, importPaths, newStack);
    const fileDirectory = dirname(filepath);
    const imported = importPaths.map((p) => this.readConfiguration(resolvePath(fileDirectory, String(p)), newStack)?.config);
    return mergeAll([...imported, ownContent], { mergeArrays: this.config.mergeImportArrays });
  }

  private loadConfiguration(filepath: string, contents: string): unknown {
    if (contents.trim() === '') return undefined;
    const extension = extname(filepath);
    const loader = this.loaderFor(extension);
    if (loader === undefined) throw new Error(`No loader specified for ${getExtensionDescription(extension)}`);
    try {
      return this.extractPackageProp(filepath, extension, loader(filepath, contents));
    } catch (error) {
      annotate(error, filepath);
      throw error;
    }
  }

  private *directories(startDir: string): Generator<Dir> {
    if (this.config.searchStrategy === 'none') {
      yield { path: startDir, isGlobalConfig: false };
      return;
    }
    if (this.config.searchStrategy === 'global') {
      yield* this.getGlobalDirs(startDir);
      return;
    }
    if (this.config.searchStrategy !== 'project') return;
    let currentDir = startDir;
    for (;;) {
      yield { path: currentDir, isGlobalConfig: false };
      if (hasPackageManifestSync(currentDir)) return;
      const parentDir = dirname(currentDir);
      if (parentDir === currentDir) return;
      currentDir = parentDir;
    }
  }
}

/** Which file a loader failed on. cosmiconfig writes it onto the error; a caller reads `error.filepath`. */
function annotate(error: unknown, filepath: string): void {
  if (typeof error === 'object' && error !== null) (error as { filepath?: string }).filepath = filepath;
}

async function isDirectoryAsync(path: string): Promise<boolean> {
  try {
    return (await fsPromises.stat(path)).isDirectory();
  } catch {
    return false;
  }
}

function isDirectorySync(path: string): boolean {
  try {
    return fs.statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** `project` stops at the first directory holding a package manifest, in this order. */
const PACKAGE_MANIFESTS = ['package.json', 'package.yaml'];

async function hasPackageManifestAsync(dir: string): Promise<boolean> {
  const found = await Promise.all(PACKAGE_MANIFESTS.map(async (name) => await exists(async () => await fsPromises.stat(join(dir, name)))));
  return found.includes(true);
}

function hasPackageManifestSync(dir: string): boolean {
  return PACKAGE_MANIFESTS.some((name) => {
    try {
      fs.statSync(join(dir, name));
      return true;
    } catch {
      return false;
    }
  });
}

async function exists(probe: () => Promise<unknown>): Promise<boolean> {
  try {
    await probe();
    return true;
  } catch {
    return false;
  }
}

/** `stopDir` is only meaningful to a `global` walk, so supplying it with any other strategy is refused. */
function validateOptions(options: Partial<Options>): void {
  if (options.searchStrategy !== undefined && options.searchStrategy !== 'global' && options.stopDir !== undefined && options.stopDir !== '') {
    throw new Error('Can not supply `stopDir` option with `searchStrategy` other than "global"');
  }
}

/**
 * cosmiconfig's own configuration, read before the caller's options are merged.
 *
 * It is a whole extra `ExplorerSync` per `cosmiconfig()` call — which is why `cosmiconfigSync`
 * constructs two and `cosmiconfig` constructs one of each, a count `index.test.ts` asserts.
 */
function readMetaConfig(): { config: Record<string, unknown>; filepath: string } | null {
  const metaExplorer = new ExplorerSync({
    moduleName: 'cosmiconfig',
    stopDir: resolvePath(''),
    searchPlaces: metaSearchPlaces,
    ignoreEmptySearchPlaces: false,
    applyPackagePropertyPathToConfiguration: true,
    loaders: { ...defaultLoaders },
    transform: identity,
    cache: true,
    metaConfigFilePath: null,
    mergeImportArrays: true,
    mergeSearchPlaces: true,
    searchStrategy: 'none',
  });
  const metaConfig = metaExplorer.search();
  if (metaConfig === null) return null;
  const config = (metaConfig.config ?? {}) as Record<string, unknown>;
  if (config['loaders'] !== undefined) throw new Error('Can not specify loaders in meta config file');
  if (config['searchStrategy'] !== undefined) throw new Error('Can not specify searchStrategy in meta config file');
  return { config: removeUndefinedValuesFromObject({ mergeSearchPlaces: true, ...config }), filepath: metaConfig.filepath };
}

/** `{name}` in a meta config's search place is the name `cosmiconfig()` was called with — and only the first occurrence. */
function getResolvedSearchPlaces(moduleName: string, toolDefined: string[], userConfigured: Record<string, unknown>): string[] {
  const places = (userConfigured['searchPlaces'] as string[] | undefined)?.map((place) => place.replace('{name}', moduleName));
  if (userConfigured['mergeSearchPlaces'] === true) return [...(places ?? []), ...toolDefined];
  return places ?? toolDefined;
}

function mergeOptions(moduleName: string, options: Partial<Options>, defaults: InternalOptions): InternalOptions {
  validateOptions(options);
  const supplied = removeUndefinedValuesFromObject(options);
  const loaders = { ...defaults.loaders, ...options.loaders };
  const meta = readMetaConfig();
  if (meta === null) return { ...defaults, ...supplied, loaders };
  // The meta config outranks the program's own options. That is cosmiconfig's decision, not
  // this package's — seniority's native order puts the program's declaration above a file.
  return {
    ...defaults,
    ...supplied,
    metaConfigFilePath: meta.filepath,
    ...meta.config,
    searchPlaces: getResolvedSearchPlaces(moduleName, options.searchPlaces ?? defaults.searchPlaces, meta.config),
    loaders,
  } as InternalOptions;
}

function defaultsFor(moduleName: string, options: Partial<Options>, sync: boolean): InternalOptions {
  return {
    moduleName,
    searchPlaces: sync ? getDefaultSearchPlacesSync(moduleName) : getDefaultSearchPlaces(moduleName),
    ignoreEmptySearchPlaces: true,
    cache: true,
    transform: identity,
    loaders: { ...(sync ? defaultLoadersSync : defaultLoaders) },
    metaConfigFilePath: null,
    mergeImportArrays: true,
    mergeSearchPlaces: true,
    searchStrategy: options.stopDir === undefined ? 'none' : 'global',
  };
}

/**
 * Five **bound** methods, and not the explorer itself.
 *
 * The binding is load-bearing rather than tidy: `caches.test.ts` writes
 * `const search = cosmiconfig('foo').search` and calls it detached, so an unbound method
 * would lose `this` and take the whole file with it.
 */
function publish<E extends Explorer | ExplorerSync>(explorer: E): {
  search: E['search'];
  load: E['load'];
  clearLoadCache: () => void;
  clearSearchCache: () => void;
  clearCaches: () => void;
} {
  return {
    search: explorer.search.bind(explorer) as E['search'],
    load: explorer.load.bind(explorer) as E['load'],
    clearLoadCache: explorer.clearLoadCache.bind(explorer),
    clearSearchCache: explorer.clearSearchCache.bind(explorer),
    clearCaches: explorer.clearCaches.bind(explorer),
  };
}

/** The asynchronous entry. */
export function cosmiconfig(moduleName: string, options: Readonly<Partial<Options>> = {}): PublicExplorer {
  return publish(new Explorer(mergeOptions(moduleName, options, defaultsFor(moduleName, options, false))));
}

/** The synchronous entry. Constructs `ExplorerSync` twice — once for the meta config, once for the search. */
export function cosmiconfigSync(moduleName: string, options: Readonly<Partial<OptionsSync>> = {}): PublicExplorerSync {
  return publish(new ExplorerSync(mergeOptions(moduleName, options, defaultsFor(moduleName, options, true))));
}
