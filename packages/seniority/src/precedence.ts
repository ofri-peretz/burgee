import { explanation, renderExplanation } from './explain.js';

/**
 * One precedence order, fixed and not configurable (commander-env V1–V3, V5):
 *
 *     flag > env > config file > package.json field > default
 *
 * `resolve` is pure — it takes the layers and returns the values with their provenance —
 * which is what makes `--explain` trustworthy and `meta.provenance` cheap. Env applies
 * only to the options the running command declares (yargs #873), never to a sibling's.
 */
/**
 * What resolution needs to know about an option, and no more.
 *
 * burgee's `OptionSpec` carries eighteen fields — choices, schema, placeholder,
 * deprecation, the lot. Resolving a value reads three of them. Declaring those
 * three here is what lets any program use seniority with its OWN option type:
 * TypeScript's structural typing accepts a richer spec with no adapter, no
 * import, and no dependency pointing back up the stack.
 */
export interface OptionSpec {
  /** Only `'boolean'` changes how the environment is read; everything else stays text. */
  type?: string;
  /** Environment variable consulted when the flag is absent (V2). */
  env?: string;
  default?: unknown;
}

/**
 * The precedence, highest first — **the one declaration** (R1, R14).
 *
 * The design's R1 wrote this array as `['flag','env','project','home','pkg','default']` and
 * the shipped union said `'flag'|'env'|'config'|'package'|'default'`. Those are two
 * spellings of one fact, and a plugin cannot register against two. The shipped five win:
 * they are what `provenance.source` already prints for every user of 0.1.0, and the
 * project/home split the design wanted is carried more precisely by `location` — which
 * names the actual file — than a second source kind ever could.
 *
 * `Source` is generated from this array rather than written beside it, so the drift cannot
 * come back: adding a kind means adding it here.
 */
export const ORDER = ['flag', 'env', 'config', 'package', 'default'] as const;

/** The five seniority resolves itself. */
export type BuiltinSource = (typeof ORDER)[number];

/**
 * An **open** union (R13, PLAN D5). A plugin's source is a `Source` seniority has never
 * heard of; `(string & {})` keeps the five as completions while admitting the rest, so the
 * `sources` host of PLAN 1.3 is the additive change it reads as rather than a type break.
 */
export type Source = BuiltinSource | (string & {});

/**
 * Where each built-in sits, spaced by ten so a plugin source has somewhere to go between
 * two of them. Lower wins. The gaps are the whole point: a plugin picks a rank, and that is
 * the only lever it gets — it cannot renumber these, so the built-in order stays the fixed
 * thing this package's first paragraph promises.
 */
const RANK_STEP = 10;
export const RANK: Readonly<Record<BuiltinSource, number>> = Object.freeze(
  Object.fromEntries(ORDER.map((source, i) => [source, i * RANK_STEP])) as Record<BuiltinSource, number>,
);

/**
 * A layer contributed by something other than the five — the `sources` plugin host, already
 * read, so `resolve` stays pure over what it is handed (R2, R11).
 */
export interface SourceLayer {
  /** The kind `--explain` prints and `provenance.source` carries: the plugin's own name for it. */
  source: string;
  /** Where a person would look — a path, a URL, a variable set. */
  location: string;
  /** Against `RANK`; strictly between `RANK.flag` and `RANK.default`. */
  rank: number;
  data: Record<string, unknown>;
}

export interface Provenance {
  source: Source;
  /** The env name, the config file, or `package.json` — where a person would look. */
  location?: string;
  /** The line within `location`, when the layer recorded one (R3). A file source may; an env name cannot. */
  line?: number;
}

export interface Candidate {
  source: Source;
  location: string;
  /** `undefined` when the layer had nothing for this option. */
  value: unknown;
  /** The line in `location` that set it, when the layer knows (R3). */
  line?: number;
}

export interface Layer {
  path: string;
  data: Record<string, unknown>;
  /**
   * Key → the line in `path` that sets it, when the loader could tell (R3, R12). Optional
   * everywhere: a `.js` config has no line a parser can hand back without a parser, and a
   * missing line is reported as a missing line rather than as line zero.
   */
  lines?: Record<string, number>;
}

export interface Layers {
  /** What the user typed: only options present on the command line. */
  flags: Record<string, unknown>;
  env: Record<string, string | undefined>;
  /** With a prefix, an option without `env:` reads `PREFIX_OPTION_NAME` (R2). */
  envPrefix?: string;
  config?: Layer;
  /** The `package.json` field named after the program, when present. */
  pkg?: Layer;
  /** Plugin-contributed sources, already read — see `seniority/plugin`'s `sources()`. */
  sources?: readonly SourceLayer[];
}

export interface Resolution {
  values: Record<string, unknown>;
  provenance: Record<string, Provenance>;
  candidates: Record<string, Candidate[]>;
}

/** A value that cannot be used as configured: exit CONFIG (3), never a stack (E1, E3). */
export class ConfigError extends Error {
  constructor(
    message: string,
    readonly hint?: string,
  ) {
    super(message);
  }
}

/** `region` → `REGION`, `dryRun` → `DRY_RUN`, `log-level` → `LOG_LEVEL` (yargs #2005: never camel-cased back). */
export function screaming(name: string): string {
  return name
    .replaceAll(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replaceAll('-', '_')
    .toUpperCase();
}

export function envName(name: string, spec: OptionSpec, prefix: string | undefined): string | undefined {
  if (spec.env !== undefined) return spec.env;
  return prefix === undefined ? undefined : `${prefix}_${screaming(name)}`;
}

const TRUE = new Set(['1', 'true', 'yes']);
const FALSE = new Set(['0', 'false', 'no']);

/** Booleans from env accept one spelling each way (R7). */
export function envBoolean(raw: string): boolean | undefined {
  const v = raw.trim().toLowerCase();
  if (TRUE.has(v)) return true;
  if (FALSE.has(v)) return false;
  return undefined;
}

function fromEnv(name: string, spec: OptionSpec, layers: Layers): Candidate | undefined {
  const variable = envName(name, spec, layers.envPrefix);
  if (variable === undefined) return undefined;
  // `PREFIX_NO_X` is a second spelling of one fact (yargs #2501): rejected, with the one spelling named.
  if (spec.type === 'boolean' && layers.envPrefix !== undefined) {
    const negated = `${layers.envPrefix}_NO_${screaming(name)}`;
    if (layers.env[negated] !== undefined) {
      throw new ConfigError(`${negated} is not supported`, `set ${variable}=false instead`);
    }
  }
  const raw = layers.env[variable];
  if (raw === undefined) return { source: 'env', location: variable, value: undefined };
  // Strings and numbers arrive as text and are checked after resolution (S3); only booleans parse here.
  if (spec.type !== 'boolean') return { source: 'env', location: variable, value: raw };
  const parsed = envBoolean(raw);
  if (parsed === undefined) throw new ConfigError(`${variable}="${raw}" is not a boolean`, `use ${variable}=true or ${variable}=false`);
  return { source: 'env', location: variable, value: parsed };
}

/** A file layer's candidate, carrying the line when the loader recorded one (R3). */
function fromLayer(source: BuiltinSource, name: string, layer: Layer): Candidate {
  const line = layer.lines?.[name];
  return { source, location: layer.path, value: layer.data[name], ...(line === undefined ? {} : { line }) };
}

function candidatesFor(name: string, spec: OptionSpec, layers: Layers): Candidate[] {
  const out: { rank: number; candidate: Candidate }[] = [
    { rank: RANK.flag, candidate: { source: 'flag', location: `--${name}`, value: layers.flags[name] } },
  ];
  const env = fromEnv(name, spec, layers);
  if (env !== undefined) out.push({ rank: RANK.env, candidate: env });
  if (layers.config !== undefined) out.push({ rank: RANK.config, candidate: fromLayer('config', name, layers.config) });
  if (layers.pkg !== undefined) out.push({ rank: RANK.package, candidate: fromLayer('package', name, layers.pkg) });
  out.push({ rank: RANK.default, candidate: { source: 'default', location: 'default', value: spec.default } });
  for (const s of layers.sources ?? []) out.push({ rank: s.rank, candidate: { source: s.source, location: s.location, value: s.data[name] } });
  // Stable (ES2019), and every built-in was pushed before any plugin source, in `ORDER`: a
  // plugin that ties with one of them loses, so a rank a host failed to refuse still cannot
  // displace a built-in.
  return out.sort((a, b) => a.rank - b.rank).map((r) => r.candidate);
}

/** Every declared option, resolved through the layers; a missing required one is left undefined for the caller to report. */
export function resolve(specs: Record<string, OptionSpec>, layers: Layers): Resolution {
  const values = new Map<string, unknown>();
  const provenance = new Map<string, Provenance>();
  const candidates = new Map<string, Candidate[]>();
  for (const [name, spec] of Object.entries(specs)) {
    const list = candidatesFor(name, spec, layers);
    candidates.set(name, list);
    const winner = list.find((c) => c.value !== undefined);
    if (winner === undefined) continue;
    values.set(name, winner.value);
    provenance.set(name, winner.source === 'default' ? { source: 'default' } : { source: winner.source, location: winner.location, ...(winner.line === undefined ? {} : { line: winner.line }) });
  }
  return { values: Object.fromEntries(values), provenance: Object.fromEntries(provenance), candidates: Object.fromEntries(candidates) };
}

/**
 * `--explain <option>`: the winning source and every candidate it beat, or that was unset (V3).
 *
 * The text is a **rendering of the record** (R4, Y5), not a second implementation of it —
 * `explain.ts` owns `explanation()`, and this is `renderExplanation` over it. The record is
 * what `--json` and the agent event are made of; `explain.test.ts` asserts the three agree
 * by construction rather than by review.
 */
export function explain(name: string, resolution: Resolution): string {
  return renderExplanation(explanation(name, resolution));
}
