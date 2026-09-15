/**
 * Loading a config file (R6).
 *
 * Four loaders are built in, and they are exactly the four formats Node itself can read:
 * `.json` through `JSON.parse`, and `.js` / `.mjs` / `.cjs` through the module loader.
 * Everything else — `.yaml`, `.yml`, `.json5`, `.toml`, `.ini` — is **accepted from the
 * caller and never bundled**. Bundling YAML alone would make this the largest package in the
 * family and put every release behind a spec's cadence; `js-yaml` 264 M + `json5` 205 M +
 * `yaml` 176 M + `ini` 102 M is 747 M/wk deliberately not taken (constraint 3).
 *
 * The consequence has to be a *loud* one. An extension nobody supplied a loader for is a
 * `USAGE`-class error naming the extension and the option that would supply it — never a
 * file quietly skipped, which is how a program ends up reading its defaults and nobody
 * knowing why.
 */
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { pathToFileURL } from 'node:url';

import { ConfigError } from './precedence.js';

/** What a loader is handed and what it gives back. The same shape `cosmiconfig` uses, so a caller's loader ports unchanged. */
export type Loader = (filepath: string, content: string) => unknown;

/** `2`, from the family's exit-code contract (E1): bad *usage*, not a bad config file. */
const USAGE = 2;

/**
 * A format nobody declared a loader for.
 *
 * `USAGE` and not `CONFIG` on purpose. `CONFIG` (3) tells the user their configuration file
 * is wrong, and sends them to read a file that may be perfectly good; the mistake is the
 * program's, one line up, where it did not declare the loader it needs. Carrying the code on
 * the error rather than choosing it at the exit is what lets a façade report it correctly
 * without this package owning a process.
 */
export class LoaderError extends Error {
  readonly exitCode = USAGE;
  constructor(
    message: string,
    readonly extension: string,
    readonly hint: string,
  ) {
    super(message);
    this.name = 'LoaderError';
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const loadJson: Loader = (filepath, content) => {
  try {
    return JSON.parse(content);
  } catch (cause) {
    throw new ConfigError(`${filepath} is not valid JSON`, cause instanceof Error ? cause.message : undefined);
  }
};

/**
 * The module loader, reached through `import()` so one loader covers all three spellings.
 *
 * It returns a promise, which is the one place this file is asynchronous — `readFileSync`
 * is fast and bounded, `import()` is neither and cannot be made so. A default that is a
 * function is called and awaited, so a config may compute itself.
 */
const loadJs: Loader = (filepath) =>
  // eslint-disable-next-line node-security/no-dynamic-dependency-loading -- Loading the user's own config file IS the feature (R6, V6, yargs #2234): the specifier is a path the caller discovered or typed, never a dependency resolved by name. The same exemption `packages/seniority/src/config.ts` carries in eslint.config.mjs, for the same import moved here.
  import(pathToFileURL(filepath).href).then(async (mod: { default?: unknown }) => {
    const value = typeof mod.default === 'function' ? await (mod.default as () => unknown)() : mod.default;
    return value;
  });

/** The four Node can read unaided. Frozen: one caller's `loaders['.json'] = …` must not reach another's. */
export const defaultLoaders: Readonly<Record<string, Loader>> = Object.freeze({
  '.json': loadJson,
  '.js': loadJs,
  '.mjs': loadJs,
  '.cjs': loadJs,
});

/**
 * The formats a caller may supply and this package will not bundle, listed so the refusal can
 * name them and so a reader can see the 747 M/wk that is being declined rather than missed.
 */
export const NOT_BUNDLED: readonly string[] = Object.freeze(['.yaml', '.yml', '.json5', '.toml', '.ini']);

export interface LoadOptions {
  /** Merged over `defaultLoaders`; a caller may add a format or replace a builtin. */
  loaders?: Readonly<Record<string, Loader>>;
}

/** The loader for a path, or the `USAGE` refusal that names what is missing. */
export function loaderFor(filepath: string, loaders: Readonly<Record<string, Loader>> = {}): Loader {
  const extension = extname(filepath);
  if (extension === '') {
    throw new LoaderError(
      `no loader for a file with no extension: ${filepath}`,
      '',
      'pass loaders: { "": (filepath, content) => … } — seniority reads no format by guessing at its content',
    );
  }
  const loader = loaders[extension] ?? defaultLoaders[extension];
  if (loader === undefined) {
    throw new LoaderError(`no loader for "${extension}"`, extension, `pass loaders: { "${extension}": (filepath, content) => … } — seniority bundles no format parser`);
  }
  return loader;
}

/**
 * Read one file and parse it. The object check is here rather than in each loader so a
 * caller's loader cannot be the reason a non-object reaches the resolver.
 */
export async function loadPath(filepath: string, options: LoadOptions = {}): Promise<Record<string, unknown>> {
  const loader = loaderFor(filepath, options.loaders ?? {});
  const content = loader === defaultLoaders['.js'] ? '' : readFileSync(filepath, 'utf8');
  const value: unknown = await loader(filepath, content);
  if (!isObject(value)) throw new ConfigError(`${filepath} must contain an object (or export one, or a function returning one)`);
  return value;
}
