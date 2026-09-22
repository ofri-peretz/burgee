/**
 * The plugin host for seniority's half of the contract (`plugin-contract` R1, R5a, R6, R7, R8).
 *
 * A plugin is one plain object shared by the whole family. This file keeps the key seniority
 * understands — `sources`, a resolution source — and **ignores every other key without
 * complaining**, which is what makes the same object work on any subset of the family that
 * is installed. A plugin written for flagstaff registers here and contributes nothing; its
 * `spinners` and `components` are not seniority's business and are not an error.
 *
 * **Nothing here imports another layer, and the shape is declared rather than imported.**
 * Types erase, so an import would cost nothing at run time — and it would still put another
 * package in seniority's dependency story, which is the one thing the family promises it
 * does not do.
 *
 * **A plugin adds a source; it cannot reorder the five.** `rank` slots a source between two
 * built-ins and nothing else: below `RANK.flag`, so what the user typed on the command line
 * always wins, and above `RANK.default`, so a declared default stays the floor. Both bounds
 * are refused at the door rather than clamped, because a source silently demoted to last
 * looks like it worked and the author debugs the wrong thing. "The order is not
 * configurable" survives extension exactly this far, and no further.
 *
 * **Reading happens here, not in `resolve`.** `resolve` is pure over the layers it is
 * handed (R2) and nothing in this package reads `process.*` (R11) — so `sources(runtime)`
 * is the seam: the caller passes its own `{ env, cwd }`, this file calls each `read`, and
 * what `resolve` receives is data.
 */
import { RANK, type SourceLayer } from './precedence.js';

/**
 * The plugin contract version. One number for the family — the same `1` flagstaff declares,
 * written out rather than imported for the reason in the file comment above.
 */
export const CONTRACT = 1;

/**
 * What a source is handed. Declared structurally and deliberately small: `env` and `cwd` are
 * what a vault, a CI variable set or a remote config needs, and anything a plugin could do
 * with `process` directly it should be given instead (R11, Y9).
 */
export interface SourceRuntime {
  env: Record<string, string | undefined>;
  cwd: string;
}

/** What a `read` returns when it has something to say. */
export interface SourceRead {
  values: Record<string, unknown>;
  /** Where a person would look. Falls back to the source's `location`, then to its name. */
  location?: string;
}

/**
 * One source a plugin contributes, keyed in `sources` by the name `--explain` prints.
 *
 * Exactly one of `values` and `read`. `values` is the data-first form R7 asks for — a source
 * that is a constant is inspectable without being run — and `read` is the dynamic form R5a
 * names, for the vault or the remote config that has to go and look.
 */
export interface SourceSpec {
  /** Against `RANK`: strictly between `RANK.flag` and `RANK.default`. */
  rank: number;
  values?: Record<string, unknown>;
  location?: string;
  read?: (runtime: SourceRuntime) => SourceRead | undefined;
}

/**
 * The keys seniority reads. Declared structurally: any object with these fields is a plugin
 * here, whatever else it carries.
 */
export interface Plugin {
  name: string;
  contract?: number;
  sources?: Record<string, SourceSpec>;
}

export type PluginErrorCode = 'E_PLUGIN_SCHEMA' | 'E_PLUGIN_CONTRACT' | 'E_NO_CONTRIBUTION';

/** A refused plugin says what is wrong and what to do about it — the family's one vocabulary. */
export class PluginError extends Error {
  constructor(
    readonly code: PluginErrorCode,
    message: string,
    readonly fix: string,
  ) {
    super(message);
    this.name = 'PluginError';
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Refuse a plugin that cannot contribute a source, at the door. */
export function validate(plugin: unknown): asserts plugin is Plugin {
  if (!isRecord(plugin)) throw new PluginError('E_PLUGIN_SCHEMA', 'a plugin is a plain object', 'export an object, not a function or an array');
  if (typeof plugin['name'] !== 'string' || plugin['name'] === '') {
    throw new PluginError('E_PLUGIN_SCHEMA', 'a plugin needs a name', 'add `name: "…"` — it is how a refused source is reported');
  }
  const contract = plugin['contract'];
  if (contract !== undefined && (!Number.isInteger(contract) || (contract as number) > CONTRACT)) {
    throw new PluginError('E_PLUGIN_CONTRACT', `plugin "${plugin['name']}" declares contract ${String(contract)}; this seniority knows ${CONTRACT}`, 'upgrade seniority, or lower the plugin’s contract');
  }
  validateSources(plugin['sources'], plugin['name']);
}

function validateSources(sources: unknown, name: string): void {
  if (sources === undefined) return;
  if (!isRecord(sources)) throw new PluginError('E_PLUGIN_SCHEMA', `plugin "${name}": sources must be an object`, 'map a source name to `{ rank, values }` or `{ rank, read }`');
  for (const [source, spec] of Object.entries(sources)) validateSource(source, spec, name);
}

function validateSource(source: string, spec: unknown, name: string): void {
  const where = `plugin "${name}": source "${source}"`;
  if (!isRecord(spec)) throw new PluginError('E_PLUGIN_SCHEMA', `${where} is not an object`, 'a source is `{ rank, values }` or `{ rank, read }`');
  const rank = spec['rank'];
  if (!Number.isInteger(rank) || (rank as number) <= RANK.flag || (rank as number) >= RANK.default) {
    throw new PluginError(
      'E_PLUGIN_SCHEMA',
      `${where} has rank ${String(rank)}`,
      `a rank is an integer strictly between ${RANK.flag} (flag) and ${RANK.default} (default) — a source may not beat what the user typed, nor sink below the declared default`,
    );
  }
  const hasValues = spec['values'] !== undefined;
  const hasRead = spec['read'] !== undefined;
  if (hasValues === hasRead) {
    throw new PluginError('E_PLUGIN_SCHEMA', `${where} declares ${hasValues ? 'both `values` and `read`' : 'neither `values` nor `read`'}`, 'one source gives one answer: static `values`, or a `read(runtime)` that fetches them');
  }
  if (hasValues && !isRecord(spec['values'])) throw new PluginError('E_PLUGIN_SCHEMA', `${where}: values must be an object`, 'map an option name to its value');
  if (hasRead && typeof spec['read'] !== 'function') throw new PluginError('E_PLUGIN_SCHEMA', `${where}: read must be a function`, 'read(runtime) returns `{ values, location? }`, or undefined when it has nothing');
  if (spec['location'] !== undefined && typeof spec['location'] !== 'string') {
    throw new PluginError('E_PLUGIN_SCHEMA', `${where}: location must be a string`, 'name the file, URL or variable set a person would go and look at');
  }
}

const order: Plugin[] = [];

/**
 * Register a plugin. Later wins at an equal rank, like ESLint flat config: the array is
 * ordered, a caller reads it top to bottom, and the last word on a source is the one nearest
 * the program.
 */
export function register(plugin: unknown): void {
  validate(plugin);
  order.push(plugin);
}

/** Forget every registered plugin. For tests, and for a program that re-registers at runtime. */
export function reset(): void {
  order.length = 0;
}

/** The plugins registered, in registration order. */
export function registered(): readonly Plugin[] {
  return order;
}

/**
 * Every registered source, read against this runtime and sorted by rank — the array
 * `resolve` takes as `layers.sources`.
 *
 * A source whose `read` returns `undefined` had nothing for this run and contributes no
 * candidate at all, which is different from contributing an empty one: `--explain` should
 * not list a vault that was never reachable as a source that was consulted and lost.
 */
export function sources(runtime: SourceRuntime): SourceLayer[] {
  const out: SourceLayer[] = [];
  for (const plugin of order) {
    for (const [source, spec] of Object.entries(plugin.sources ?? {})) {
      const got = spec.values === undefined ? spec.read?.(runtime) : { values: spec.values };
      if (got === undefined) continue;
      out.push({ source, location: got.location ?? spec.location ?? source, rank: spec.rank, data: got.values });
    }
  }
  return out.sort((a, b) => a.rank - b.rank);
}
