/**
 * Config discovery, in one fixed order (commander-env V6, V7), loaded only when a program
 * opts into config (K6):
 *
 *   --config <path>  >  MYTOOL_CONFIG  >  ./mytool.config.{json,mjs,js,cjs}  >  package.json#mytool  >  $XDG_CONFIG_HOME/mytool/config.json
 *
 * An explicit file that is missing is a CONFIG exit; a discovered one that is missing is
 * silence. `extends` is resolved relative to the extending file (or through node_modules),
 * deep-merged left to right, cycles rejected. No YAML: JSON and JavaScript cover the
 * cases, and a parser would be a dependency (K1).
 */
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, resolve } from 'node:path';

import { loadPath, type Loader } from './load.js';
import { ConfigError, type Layer } from './precedence.js';
import { search } from './search.js';

export interface Discovery {
  name: string;
  cwd: string;
  env: Record<string, string | undefined>;
  /** `--config <path>`. */
  explicit?: string;
  /** `--no-config`. */
  disabled?: boolean;
  /** Extra loaders, by extension, merged over the four builtins (R6). */
  loaders?: Readonly<Record<string, Loader>>;
  /**
   * The extensions tried in the current directory, in order. Defaults to the four Node can
   * read; a program that injected a `.yaml` loader adds `.yaml` here. The two are separate
   * because supplying a parser and asking discovery to look for that format are different
   * decisions, and a program may want either without the other.
   */
  extensions?: readonly string[];
  /**
   * Walk up from `cwd` looking for the same names (R5). **Off by default**: a config found
   * in a directory the user did not name is the kind of surprise `--explain` exists to
   * prevent, so it is a program's decision rather than an ambient behaviour.
   */
  upward?: boolean;
  /** The highest directory an upward walk may look in, inclusive. Defaults to the filesystem root (Y10). */
  stopAt?: string;
}

export interface Loaded extends Layer {
  /** The files merged, outermost first — what `--explain` shows. */
  chain: string[];
}

/** Options that reach a load, threaded through `extends` so every file in a chain reads the same way. */
export interface LoadConfigOptions {
  loaders?: Readonly<Record<string, Loader>>;
}

const EXTENSIONS = ['.json', '.mjs', '.js', '.cjs'];
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Objects merge recursively; anything else, the later value wins. */
export function deepMerge(base: Record<string, unknown>, over: Record<string, unknown>): Record<string, unknown> {
  const out = new Map<string, unknown>(Object.entries(base));
  for (const [k, v] of Object.entries(over)) {
    const prev = out.get(k);
    out.set(k, isObject(prev) && isObject(v) ? deepMerge(prev, v) : v);
  }
  return Object.fromEntries(out);
}

/**
 * The line a top-level key is set on, one-based, or `undefined`.
 *
 * Text, not a parse tree: a JSON parser that reported positions would *be* a parser, and
 * `JSON.parse` reports none. The scan is exact about what it can answer — a `"key":` on a
 * line — and silent about what it cannot, because a wrong line number in an error message
 * is worse than no line number at all (R3, R12).
 */
export function lineOf(text: string, key: string): number | undefined {
  const needle = `"${key}"`;
  for (const [i, line] of text.split('\n').entries()) {
    const at = line.indexOf(needle);
    if (at !== -1 && line.slice(at + needle.length).trimStart().startsWith(':')) return i + 1;
  }
  return undefined;
}

/** Every key's line, for the keys the loaded object actually has. JSON only — see `lineOf`. */
function linesFor(path: string, data: Record<string, unknown>): Record<string, number> | undefined {
  if (!path.endsWith('.json')) return undefined;
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return undefined;
  }
  const out = new Map<string, number>();
  for (const key of Object.keys(data)) {
    const line = lineOf(text, key);
    if (line !== undefined) out.set(key, line);
  }
  return out.size === 0 ? undefined : Object.fromEntries(out);
}

function resolveExtends(spec: string, from: string): string {
  if (spec.startsWith('.') || isAbsolute(spec)) return resolve(dirname(from), spec);
  try {
    return createRequire(from).resolve(spec);
  } catch {
    throw new ConfigError(`${from} extends "${spec}", which cannot be resolved`, 'use a relative path or an installed package');
  }
}

function extendsList(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  return Array.isArray(value) ? value.map(String) : [];
}

/**
 * Load a file and everything it extends, outermost first, the file's own keys winning.
 *
 * The lines reported are the **extending file's own** (R3). A value a parent set and the
 * child did not override is cited through `chain` at the parent's path; a line number
 * borrowed across files would point confidently at the wrong text.
 */
export async function loadWithExtends(path: string, options: LoadConfigOptions = {}, seen: string[] = []): Promise<Loaded> {
  if (seen.includes(path)) throw new ConfigError(`config extends itself: ${[...seen, path].join(' → ')}`);
  const own = await loadPath(path, options);
  const parents = own['extends'];
  const specs = extendsList(parents);
  let data: Record<string, unknown> = {};
  const chain: string[] = [];
  for (const spec of specs) {
    // Left to right: a later parent overrides an earlier one; the file itself overrides all.
    const parent = await loadWithExtends(resolveExtends(spec, path), options, [...seen, path]);
    data = deepMerge(data, parent.data);
    chain.push(...parent.chain);
  }
  const { extends: _ignored, ...rest } = own;
  const lines = linesFor(path, rest);
  return { path, data: deepMerge(data, rest), chain: [...chain, path], ...(lines === undefined ? {} : { lines }) };
}

const userConfigDir = (env: Record<string, string | undefined>): string | undefined => {
  const base = env['XDG_CONFIG_HOME'] ?? (env['HOME'] === undefined ? undefined : join(env['HOME'], '.config'));
  return base;
};

/** The discovery order as candidate paths, first hit wins; each entry says why it was tried. */
export function candidates(d: Discovery): { path: string; reason: string }[] {
  const out: { path: string; reason: string }[] = [];
  const fromEnv = d.env[`${d.name.toUpperCase().replaceAll('-', '_')}_CONFIG`];
  if (fromEnv !== undefined) out.push({ path: resolve(d.cwd, fromEnv), reason: `${d.name.toUpperCase().replaceAll('-', '_')}_CONFIG` });
  for (const ext of d.extensions ?? EXTENSIONS) out.push({ path: join(d.cwd, `${d.name}.config${ext}`), reason: 'current directory' });
  const user = userConfigDir(d.env);
  if (user !== undefined) out.push({ path: join(user, d.name, 'config.json'), reason: 'user config directory' });
  return out;
}

/**
 * Discover and load. `package.json#<name>` is not a file here — the engine reads the
 * owning package.json itself and treats the field as its own layer, below config.
 */
export async function discover(d: Discovery): Promise<Loaded | undefined> {
  if (d.disabled === true) return undefined;
  const options: LoadConfigOptions = d.loaders === undefined ? {} : { loaders: d.loaders };
  if (d.explicit !== undefined) {
    const path = resolve(d.cwd, d.explicit);
    if (!existsSync(path)) throw new ConfigError(`config file not found: ${path}`, 'check --config, or drop it to use discovery');
    return await loadWithExtends(path, options);
  }
  const found = candidates(d)
    .map((c) => c.path)
    .find((path) => existsSync(path));
  if (found !== undefined) return await loadWithExtends(found, options);
  // The bounded walk, and only when the program asked for it (R5, Y10).
  if (d.upward !== true) return undefined;
  const names = (d.extensions ?? EXTENSIONS).map((ext) => `${d.name}.config${ext}`);
  const up = search(names, { cwd: d.cwd, ...(d.stopAt === undefined ? {} : { stopAt: d.stopAt }) });
  return up === undefined ? undefined : await loadWithExtends(up.path, options);
}
