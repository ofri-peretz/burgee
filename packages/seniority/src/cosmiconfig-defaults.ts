/**
 * `cosmiconfig`'s declared defaults, reproduced as data (R8).
 *
 * The search-place lists are twenty-one entries for the async explorer and eighteen for the
 * sync one — the difference is every `.mjs`, which a synchronous `require` cannot load. They
 * are written out rather than generated from a shorter rule because the *order* is the
 * contract and a generator would hide it.
 *
 * **The YAML question, answered here rather than hedged.** cosmiconfig maps `.yaml`, `.yml`
 * and extensionless files to `js-yaml`. seniority bundles no format parser (R6, constraint 3;
 * `js-yaml` 264 M + `json5` 205 M + `yaml` 176 M + `ini` 102 M is 747 M/wk deliberately not
 * taken), so `loadYaml` here reads the subset of YAML that is also JSON — which is every
 * JSON document, YAML being a superset — and **refuses the rest by name**, with the option
 * that would supply a real parser. That is a listed divergence, not a silent one: a program
 * whose configs are YAML passes `loaders: { '.yaml': … }` and gets cosmiconfig's behaviour
 * exactly, and a program whose configs are JSON never notices.
 */
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

import { LoaderError, type Loader } from './load.js';

/** `.foorc`, `.foorc.json`, `foo.config.js`, … — the async explorer's twenty-one places, in order. */
export function getDefaultSearchPlaces(moduleName: string): string[] {
  return [
    'package.json',
    `.${moduleName}rc`,
    `.${moduleName}rc.json`,
    `.${moduleName}rc.yaml`,
    `.${moduleName}rc.yml`,
    `.${moduleName}rc.js`,
    `.${moduleName}rc.ts`,
    `.${moduleName}rc.cjs`,
    `.${moduleName}rc.mjs`,
    `.config/${moduleName}rc`,
    `.config/${moduleName}rc.json`,
    `.config/${moduleName}rc.yaml`,
    `.config/${moduleName}rc.yml`,
    `.config/${moduleName}rc.js`,
    `.config/${moduleName}rc.ts`,
    `.config/${moduleName}rc.cjs`,
    `.config/${moduleName}rc.mjs`,
    `${moduleName}.config.js`,
    `${moduleName}.config.ts`,
    `${moduleName}.config.cjs`,
    `${moduleName}.config.mjs`,
  ];
}

/** The same list minus every `.mjs`: a synchronous load cannot import an ES module. */
export function getDefaultSearchPlacesSync(moduleName: string): string[] {
  return getDefaultSearchPlaces(moduleName).filter((place) => !place.endsWith('.mjs'));
}

/** Tried in the user's global config directory, which is always the last directory a `global` search visits. */
export const globalConfigSearchPlaces: string[] = ['config', 'config.json', 'config.yaml', 'config.yml', 'config.js', 'config.ts', 'config.cjs', 'config.mjs'];

/** The same, minus `.mjs`. */
export const globalConfigSearchPlacesSync: string[] = globalConfigSearchPlaces.filter((place) => !place.endsWith('.mjs'));

/**
 * Where cosmiconfig looks for its *own* configuration — the `cosmiconfig` key of a
 * `.config/config.*` or a `package.json`. Internal to 10.0.1 and exported here because the
 * meta explorer is the one part of the option pipeline a caller can observe.
 */
export const metaSearchPlaces: string[] = ['package.json', 'package.yaml', '.config/config.json', '.config/config.yaml', '.config/config.yml', '.config/config.js', '.config/config.ts', '.config/config.cjs', '.config/config.mjs'];

/** The key the loader table uses for a file with no extension at all (`.foorc`). */
export const NO_EXTENSION = 'noExt';

const requireFrom = createRequire(import.meta.url);

/**
 * `require`, with the module cache cleared first so a config edited between two loads is read
 * again. Named `loadJsSync` because `index.test.ts` asserts the loader's function name.
 */
export function loadJsSync(filepath: string): unknown {
  // `Reflect.deleteProperty` rather than `delete cache[key]`: the key is a resolved absolute
  // path, so the computed member access is safe, but a reader should not have to work that
  // out and the reflective form says it without a suppression.
  Reflect.deleteProperty(requireFrom.cache, requireFrom.resolve(filepath));
  // eslint-disable-next-line node-security/no-dynamic-dependency-loading -- The user's own config file, by the absolute path discovery found: the feature (R6, V6), not a dependency resolved by name. It is the same exemption `packages/seniority/src/config.ts` already carries in eslint.config.mjs, for the same load moved here.
  return requireFrom(filepath) as unknown;
}

const isEsmComplaint = (error: unknown): boolean => {
  const code = (error as { code?: string } | null)?.code;
  if (code === 'ERR_REQUIRE_ESM') return true;
  return error instanceof SyntaxError && error.message.includes('Cannot use import statement outside a module');
};

/**
 * `import()`, falling back to `require` — and, when the fallback's complaint is only that the
 * file is an ES module, rethrowing the **original** import error. Without that last step a
 * genuine syntax error in an ESM config is reported as "cannot require an ES module", which
 * sends its author to the wrong problem.
 */
export async function loadJs(filepath: string): Promise<unknown> {
  try {
    // eslint-disable-next-line node-security/no-dynamic-dependency-loading -- See `loadJsSync`: the user's own config file by path.
    const imported = (await import(pathToFileURL(filepath).href)) as { default?: unknown };
    return imported.default;
  } catch (importError) {
    try {
      return loadJsSync(filepath);
    } catch (requireError) {
      // Rethrown as caught, on purpose: the original error carries the stack and the message
      // that name the real problem, and wrapping it would bury both. Which of the two is
      // rethrown is the whole point of the branch.
      // eslint-disable-next-line maintainability/no-missing-error-context, reliability/no-missing-error-context -- see above
      throw isEsmComplaint(requireError) ? importError : requireError;
    }
  }
}

/** `JSON.parse`, with cosmiconfig's own message shape so a caller matching on it still matches. */
export function loadJson(filepath: string, content: string): unknown {
  try {
    return JSON.parse(content);
  } catch (cause) {
    const error = cause instanceof Error ? cause : new Error(String(cause));
    error.message = `JSON Error in ${filepath}:\n${error.message}`;
    throw error;
  }
}

/**
 * Every JSON document is a YAML document, so this reads the overlap and refuses everything
 * past it **by name** (R6). The refusal is `USAGE`, not `CONFIG`: the file may be perfectly
 * good YAML, and the thing that is missing is a parser the program never supplied.
 */
export function loadYaml(filepath: string, content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    throw new LoaderError(
      `no YAML parser for ${filepath}`,
      '.yaml',
      'pass loaders: { ".yaml": yaml.load, ".yml": yaml.load, noExt: yaml.load } — seniority reads the JSON subset of YAML and bundles no format parser',
    );
  }
}

/** The async loader table. Frozen: `index.test.ts` asserts that deleting a key throws. */
export const defaultLoaders: Readonly<Record<string, Loader>> = Object.freeze({
  '.mjs': loadJs,
  '.cjs': loadJs,
  '.js': loadJs,
  '.ts': loadJs,
  '.cts': loadJs,
  '.mts': loadJs,
  '.json': loadJson,
  '.yaml': loadYaml,
  '.yml': loadYaml,
  [NO_EXTENSION]: loadYaml,
});

/** The sync table: no `.mjs`, no `.mts`, and `loadJsSync` in place of `loadJs`. */
export const defaultLoadersSync: Readonly<Record<string, Loader>> = Object.freeze({
  '.cjs': loadJsSync,
  '.js': loadJsSync,
  '.cts': loadJsSync,
  '.ts': loadJsSync,
  '.json': loadJson,
  '.yaml': loadYaml,
  '.yml': loadYaml,
  [NO_EXTENSION]: loadYaml,
});
