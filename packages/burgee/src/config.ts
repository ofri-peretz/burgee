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
import { pathToFileURL } from 'node:url';

import { ConfigError, type Layer } from './precedence.js';

export interface Discovery {
  name: string;
  cwd: string;
  env: Record<string, string | undefined>;
  /** `--config <path>`. */
  explicit?: string;
  /** `--no-config`. */
  disabled?: boolean;
}

export interface Loaded extends Layer {
  /** The files merged, outermost first — what `--explain` shows. */
  chain: string[];
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

async function loadFile(path: string): Promise<Record<string, unknown>> {
  if (path.endsWith('.json')) {
    try {
      const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
      if (!isObject(parsed)) throw new ConfigError(`${path} must contain an object`);
      return parsed;
    } catch (cause) {
      if (cause instanceof ConfigError) throw cause;
      throw new ConfigError(`${path} is not valid JSON`, cause instanceof Error ? cause.message : undefined);
    }
  }
  const mod = (await import(pathToFileURL(path).href)) as { default?: unknown };
  const value = typeof mod.default === 'function' ? await (mod.default as () => unknown)() : mod.default;
  if (!isObject(value)) throw new ConfigError(`${path} must export an object (or a function returning one)`);
  return value;
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

/** Load a file and everything it extends, outermost first, the file's own keys winning. */
export async function loadWithExtends(path: string, seen: string[] = []): Promise<Loaded> {
  if (seen.includes(path)) throw new ConfigError(`config extends itself: ${[...seen, path].join(' → ')}`);
  const own = await loadFile(path);
  const parents = own['extends'];
  const specs = extendsList(parents);
  let data: Record<string, unknown> = {};
  const chain: string[] = [];
  for (const spec of specs) {
    // Left to right: a later parent overrides an earlier one; the file itself overrides all.
    const parent = await loadWithExtends(resolveExtends(spec, path), [...seen, path]);
    data = deepMerge(data, parent.data);
    chain.push(...parent.chain);
  }
  const { extends: _ignored, ...rest } = own;
  return { path, data: deepMerge(data, rest), chain: [...chain, path] };
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
  for (const ext of EXTENSIONS) out.push({ path: join(d.cwd, `${d.name}.config${ext}`), reason: 'current directory' });
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
  if (d.explicit !== undefined) {
    const path = resolve(d.cwd, d.explicit);
    if (!existsSync(path)) throw new ConfigError(`config file not found: ${path}`, 'check --config, or drop it to use discovery');
    return await loadWithExtends(path);
  }
  const found = candidates(d)
    .map((c) => c.path)
    .find((path) => existsSync(path));
  if (found === undefined) return undefined;
  return await loadWithExtends(found);
}
