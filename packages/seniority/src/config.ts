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
import { ConfigError, type KeyOrigin, type Layer } from './precedence.js';
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
 * Each key of the object at `at` in JSON `text`, and the one-based line it is set on.
 *
 * Text, not a parse tree: a JSON parser that reported positions would *be* a parser, and
 * `JSON.parse` reports none. So this is a scan that knows only what JSON's grammar makes
 * unambiguous — strings, the colon after a key, and the brackets that open and close a level —
 * which is enough to tell a top-level `"out":` from the `"out":` inside a nested object. It is
 * exact about what it can answer and silent about what it cannot, because a wrong line number in
 * an error message is worse than no line number at all (R3, R12): a key written with an escape
 * (`"\u0061"`) is not matched to `a`, and a key set twice is cited where `JSON.parse` takes it
 * from, the last time.
 */
function keyLines(text: string, at: readonly string[]): Map<string, number> {
  const out = new Map<string, number>();
  // One entry per open bracket: the key it was opened under, or `null` for the root or an array element.
  const open: (string | null)[] = [];
  let line = 1;
  // The last string read and its line; a `:` makes it a key. JSON strings hold no raw newline.
  let raw = '';
  let rawLine = 0;
  let key: string | null = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      const end = closingQuote(text, i);
      raw = text.slice(i + 1, end);
      rawLine = line;
      i = end;
      continue;
    }
    switch (c) {
      case '\n':
        line++;
        break;
      case ':':
        key = raw;
        if (isAt(open, at)) out.set(key, rawLine);
        break;
      case '{':
      case '[':
        open.push(key);
        key = null;
        break;
      case '}':
      case ']':
        open.pop();
        break;
      case ',':
        // An element after a comma is opened under no key.
        // Stryker disable next-line all: equivalent through every export — a stale key here reaches only a level under a root array, and `lineOf` reads the root while `packageLayer` refuses a manifest that is not an object
        key = null;
        break;
      default:
    }
  }
  return out;
}

/** The index of the quote that closes the string opening at `start`, stepping over each escaped character whole. */
function closingQuote(text: string, start: number): number {
  let j = start + 1;
  while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
  return j;
}

/** Whether the innermost open object is the one at `at`: below the root, opened under each of its keys in turn. */
const isAt = (open: readonly (string | null)[], at: readonly string[]): boolean => open.length === at.length + 1 && at.every((k, n) => open[n + 1] === k);

/** The line a top-level key is set on, one-based, or `undefined`. See `keyLines` for what it will and will not match. */
export function lineOf(text: string, key: string): number | undefined {
  return keyLines(text, []).get(key);
}

/** Every key's line, for the keys `data` actually has, at `at` within the file's object. */
function linesOf(text: string, data: Record<string, unknown>, at: readonly string[] = []): Record<string, number> | undefined {
  const all = keyLines(text, at);
  const out = new Map<string, number>();
  for (const key of Object.keys(data)) {
    const line = all.get(key);
    if (line !== undefined) out.set(key, line);
  }
  return out.size === 0 ? undefined : Object.fromEntries(out);
}

const readText = (path: string): string | undefined => {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return undefined;
  }
};

/** Every key's line, for the keys the loaded object actually has. JSON only — see `keyLines`. */
function linesFor(path: string, data: Record<string, unknown>): Record<string, number> | undefined {
  if (!path.endsWith('.json')) return undefined;
  const text = readText(path);
  return text === undefined ? undefined : linesOf(text, data);
}

/**
 * The `package.json` field named after a program, as the layer below the config file, with the
 * line each of its keys is set on (R3). Without the line, `explain` could say a value came from
 * `package.json` and not where in it, which is the one file in a project long enough for that to
 * matter.
 *
 * `manifest` is the file already parsed, for a caller that has it (burgee reads the owning
 * package.json once, for `--version` too); the file is then read again only for the lines, and a
 * file that cannot be read gives a layer with none. Without it the file is read and parsed here,
 * and one that is missing or is not JSON is no layer. A field that is not an object is no layer
 * either: the field holds options, and a string or an array there sets none of them.
 */
export function packageLayer(path: string, name: string, manifest?: Record<string, unknown>): Layer | undefined {
  const text = readText(path);
  let data = manifest;
  if (data === undefined) {
    if (text === undefined) return undefined;
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return undefined;
    }
  }
  const field = isObject(data) ? data[name] : undefined;
  if (!isObject(field)) return undefined;
  const lines = text === undefined ? undefined : linesOf(text, field, [name]);
  return { path, data: field, ...(lines === undefined ? {} : { lines }) };
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

/** Where `layer` set `key`: its own path, and its line when it recorded one. */
function originIn(layer: Loaded, key: string): KeyOrigin {
  const line = layer.lines?.[key];
  return layer.origins?.[key] ?? { path: layer.path, ...(line === undefined ? {} : { line }) };
}

/**
 * Load a file and everything it extends, outermost first, the file's own keys winning.
 *
 * `lines` are the **extending file's own** (R3). When there is a chain, `origins` says which
 * file in it set each top-level key — the nearest one, the one whose value or whose half of a
 * merged object is on top — and that file's own line, so `resolve` cites the parent for a value
 * only the parent set. A line number borrowed across files would point confidently at the wrong
 * text; one carried with its own file points at the right one.
 */
export async function loadWithExtends(path: string, options: LoadConfigOptions = {}, seen: string[] = []): Promise<Loaded> {
  if (seen.includes(path)) throw new ConfigError(`config extends itself: ${[...seen, path].join(' → ')}`);
  const own = await loadPath(path, options);
  const parents = own['extends'];
  const specs = extendsList(parents);
  let data: Record<string, unknown> = {};
  const chain: string[] = [];
  const origins = new Map<string, KeyOrigin>();
  for (const spec of specs) {
    // Left to right: a later parent overrides an earlier one; the file itself overrides all.
    const parent = await loadWithExtends(resolveExtends(spec, path), options, [...seen, path]);
    data = deepMerge(data, parent.data);
    chain.push(...parent.chain);
    for (const key of Object.keys(parent.data)) origins.set(key, originIn(parent, key));
  }
  const { extends: _ignored, ...rest } = own;
  const lines = linesFor(path, rest);
  const loaded: Loaded = { path, data: deepMerge(data, rest), chain: [...chain, path], ...(lines === undefined ? {} : { lines }) };
  if (chain.length === 0) return loaded;
  for (const key of Object.keys(rest)) origins.set(key, originIn(loaded, key));
  return { ...loaded, origins: Object.fromEntries(origins) };
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
