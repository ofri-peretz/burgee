/**
 * dotenv 18's `lib/config-options.js`: how it reads a boolean, and the defaults an environment
 * carries. Shared by `config()` and `dotenv run`, and published by neither — dotenv does not
 * export them either.
 */
import { ambientEnv } from './runtime.js';

/** dotenv's `parseBoolean`: a string is true unless it spells false; anything else by truthiness. */
export function truthy(value: unknown): boolean {
  if (typeof value === 'string') return !['false', '0', 'no', 'off', ''].includes(value.toLowerCase());
  return Boolean(value);
}

/** What an environment can say: two strings and four booleans. */
export interface EnvOptions {
  encoding?: string;
  path?: string;
  quiet?: boolean;
  debug?: boolean;
  override?: boolean;
  fast?: boolean;
}

/** The six `DOTENV_*` defaults dotenv 18 reads, each also accepted under its older `DOTENV_CONFIG_*` name. */
const ENV_OPTIONS = ['ENCODING', 'PATH', 'QUIET', 'DEBUG', 'OVERRIDE', 'FAST'] as const;

/**
 * dotenv's `optionsFromEnv`. The shorter name wins over the older one, an empty value is still
 * a value, `ENCODING` and `PATH` stay strings and the other four are read as booleans. The
 * process's own environment when handed none, through the seam (D-135); none at all without one.
 */
export function optionsFromEnv(env: Record<string, string | undefined> = ambientEnv() ?? {}): EnvOptions {
  const options: Record<string, string | boolean> = {};
  for (const name of ENV_OPTIONS) {
    const value = env[`DOTENV_${name}`] ?? env[`DOTENV_CONFIG_${name}`];
    if (value === undefined) continue;
    options[name.toLowerCase()] = name === 'ENCODING' || name === 'PATH' ? value : truthy(value);
  }
  return options;
}
