/**
 * seniority — which source outranks the others.
 *
 * One resolution for flags, environment, config files, a `package.json` field and declared
 * defaults, in a fixed order, with **provenance**: every value can say where it came from.
 * That last part is the whole reason this is a package rather than a function — `--explain`
 * is only trustworthy if the thing that picked the value is the thing that reports it.
 *
 *     flag  >  env  >  config file  >  package.json field  >  default
 *
 * The order is not configurable. A precedence a program can rearrange is a precedence
 * nobody can reason about from the outside.
 *
 * `resolve` is pure — layers in, values and provenance out — so it can be tested without a
 * filesystem, an environment, or a process. `discover` is the half that does touch the
 * disk, and it is a separate import for exactly that reason.
 *
 * Zero dependencies; Node builtins only.
 */
export {
  ConfigError,
  envBoolean,
  envName,
  explain,
  ORDER,
  RANK,
  resolve,
  screaming,
  type BuiltinSource,
  type Candidate,
  type Layer,
  type Layers,
  type OptionSpec,
  type Provenance,
  type Resolution,
  type Source,
  type SourceLayer,
} from './precedence.js';

export { candidates, deepMerge, discover, lineOf, loadWithExtends, type Discovery, type Loaded, type LoadConfigOptions } from './config.js';

export {
  explanation,
  explanationEvent,
  explanationJson,
  renderExplanation,
  type Explanation,
  type ExplanationEvent,
  type ExplanationJson,
} from './explain.js';

export { defaultLoaders as builtinLoaders, loaderFor, LoaderError, loadPath, NOT_BUNDLED, type Loader, type LoadOptions } from './load.js';

export { search, searchAll, WALK_LIMIT, type Found, type SearchOptions } from './search.js';

export { check, validate, type Shape, type Violation } from './validate.js';

/**
 * **`cosmiconfig`'s surface (R8, Y3).** The root export is what `cosmiconfig`'s own suite is
 * pointed at, so these names are the compatibility claim rather than a convenience: a program
 * changes `from 'cosmiconfig'` to `from 'seniority'` and nothing else.
 *
 * `defaultLoaders` is cosmiconfig's table, not seniority's own four — those are exported above
 * as `builtinLoaders`, because one of the two names has to give way and the one the suite
 * grades is the one that keeps it.
 */
export {
  cosmiconfig,
  cosmiconfigSync,
  Explorer,
  ExplorerSync,
  type CommonOptions,
  type Config,
  type CosmiconfigResult,
  type Loaders,
  type Options,
  type OptionsSync,
  type PublicExplorer,
  type PublicExplorerSync,
  type SearchStrategy,
  type Transform,
} from './cosmiconfig.js';

export {
  defaultLoaders,
  defaultLoadersSync,
  getDefaultSearchPlaces,
  getDefaultSearchPlacesSync,
  globalConfigSearchPlaces,
  globalConfigSearchPlacesSync,
  metaSearchPlaces,
} from './cosmiconfig-defaults.js';

/** `cosmiconfig/src/util`'s two exported helpers: its own suite imports them by name. */
export { decodeFileContent, getPropertyByPath } from './cosmiconfig-util.js';

/**
 * The `sources` plugin host is `seniority/plugin`, not here (`plugin-contract` R5a). It
 * keeps a registry, which the root export deliberately does not: a program that only
 * resolves should not carry one, and a program that hosts plugins imports the subpath.
 */
