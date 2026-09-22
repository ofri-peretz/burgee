/**
 * `burgee/config` — the configuration layer, by itself.
 *
 * Precedence, provenance and `--explain` come from `seniority`, the package whose job that
 * is. They were re-exported from the root barrel until the barrel's cost was measured
 * (see `index.ts`): 3,135 bundled bytes on the startup path of every program, for a
 * surface a program only touches when it wants to read or explain its own configuration.
 */
export { ConfigError, envName, resolve, screaming, type Candidate, type Layers, type Provenance, type Resolution, type Source } from 'seniority/precedence';
export { explain } from 'seniority/explain';
