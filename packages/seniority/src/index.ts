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
  resolve,
  screaming,
  type Candidate,
  type Layer,
  type Layers,
  type OptionSpec,
  type Provenance,
  type Resolution,
  type Source,
} from './precedence.js';

export { candidates, deepMerge, discover, loadWithExtends, type Discovery, type Loaded } from './config.js';
