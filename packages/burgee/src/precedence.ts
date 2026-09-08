/**
 * One precedence order, fixed and not configurable (commander-env V1–V3, V5):
 *
 *     flag > env > config file > package.json field > default
 *
 * `resolve` is pure — it takes the layers and returns the values with their provenance —
 * which is what makes `--explain` trustworthy and `meta.provenance` cheap. Env applies
 * only to the options the running command declares (yargs #873), never to a sibling's.
 */
import { type OptionSpec } from './manifest.js';

export type Source = 'flag' | 'env' | 'config' | 'package' | 'default';

export interface Provenance {
  source: Source;
  /** The env name, the config file, or `package.json` — where a person would look. */
  location?: string;
}

export interface Candidate {
  source: Source;
  location: string;
  /** `undefined` when the layer had nothing for this option. */
  value: unknown;
}

export interface Layer {
  path: string;
  data: Record<string, unknown>;
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
  if (spec.type === 'string') return { source: 'env', location: variable, value: raw };
  const parsed = envBoolean(raw);
  if (parsed === undefined) throw new ConfigError(`${variable}="${raw}" is not a boolean`, `use ${variable}=true or ${variable}=false`);
  return { source: 'env', location: variable, value: parsed };
}

function candidatesFor(name: string, spec: OptionSpec, layers: Layers): Candidate[] {
  const out: Candidate[] = [{ source: 'flag', location: `--${name}`, value: layers.flags[name] }];
  const env = fromEnv(name, spec, layers);
  if (env !== undefined) out.push(env);
  if (layers.config !== undefined) out.push({ source: 'config', location: layers.config.path, value: layers.config.data[name] });
  if (layers.pkg !== undefined) out.push({ source: 'package', location: layers.pkg.path, value: layers.pkg.data[name] });
  out.push({ source: 'default', location: 'default', value: spec.default });
  return out;
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
    provenance.set(name, winner.source === 'default' ? { source: 'default' } : { source: winner.source, location: winner.location });
  }
  return { values: Object.fromEntries(values), provenance: Object.fromEntries(provenance), candidates: Object.fromEntries(candidates) };
}

const describe = (c: Candidate): string => {
  switch (c.source) {
    case 'flag':
      return `flag ${c.location}`;
    case 'env':
      return `env ${c.location}`;
    case 'config':
      return `config file ${c.location}`;
    case 'package':
      return `package.json field in ${c.location}`;
    case 'default':
      return 'default';
  }
};

/** `--explain <option>`: the winning source and every candidate it beat, or that was unset (V3). */
export function explain(name: string, resolution: Resolution): string {
  const list = resolution.candidates[name];
  if (list === undefined) return `${name} is not an option of this command\n`;
  const winner = list.find((c) => c.value !== undefined);
  const head = winner === undefined ? `${name} is unset` : `${name} = ${JSON.stringify(winner.value)}   from ${describe(winner)}`;
  const rest = list
    .filter((c) => c !== winner)
    .map((c) => `${describe(c)} ${c.value === undefined ? '(unset)' : JSON.stringify(c.value)}`);
  return `${head}\n${rest.length === 0 ? '' : `         candidates: ${rest.join(', ')}\n`}`;
}
