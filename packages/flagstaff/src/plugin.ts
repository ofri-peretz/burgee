/**
 * The plugin host (R2, R3, R4). A plugin is one plain object — `{ name, spinners, borders,
 * glyphs, tokens, components }` — validated against `schema.json`, the same file that ships in the
 * tarball, and kept in one registry every component reads. A contribution without a static
 * projection is refused here, at the door, which is what makes a third-party plugin safe by
 * construction (U3, U4). Nothing in this file writes to a stream.
 */
import { builtins } from './builtins.js';
import schema from './schema.json' with { type: 'json' };

/** A border style, in cli-boxes' shape exactly, so that corpus imports unchanged. */
export interface BorderStyle {
  topLeft: string;
  top: string;
  topRight: string;
  left: string;
  right: string;
  bottomLeft: string;
  bottom: string;
  bottomRight: string;
}

/** A spinner style, in cli-spinners' shape plus the projection a pipe prints. */
export interface SpinnerDef {
  frames: string[];
  interval: number;
  static: string;
}

/** What the loop hoists: a static projection, and optionally the animated form. */
export interface Component<S = unknown> {
  name: string;
  static(state: S): string;
  frame?(t: number, state: S): string;
  /** Milliseconds between repaints when `frame` is given; `DEFAULT_INTERVAL` otherwise. */
  interval?: number;
  /**
   * The two states this component is *shown* with by `flagstaff check` and the docs gallery.
   * The loop never reads it: a component's real state comes from the program. Declared here
   * because a grader that invents a state renders the wrong thing and says `ok` (#59).
   */
  sample?: { running: S; done: S };
}

export const CONTRACT = 1;

/** The whole plugin contract. Keys another package in the family understands are kept for it. */
export interface Plugin {
  name: string;
  contract?: typeof CONTRACT;
  tokens?: Record<string, `#${string}`>;
  glyphs?: Record<string, string>;
  spinners?: Record<string, SpinnerDef>;
  borders?: Record<string, BorderStyle>;
  components?: Record<string, Omit<Component, 'name'>>;
}

export type PluginErrorCode = 'E_PLUGIN_SCHEMA' | 'E_NO_STATIC_PROJECTION' | 'E_PLUGIN_CONTRACT' | 'E_UNKNOWN_SPINNER' | 'E_UNKNOWN_BORDER';

/** A refused plugin says what is wrong, where, and what to do about it. */
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

interface JsonSchema {
  type?: string;
  const?: unknown;
  required?: string[];
  properties?: Record<string, JsonSchema>;
  additionalProperties?: JsonSchema | boolean;
  items?: JsonSchema;
  minItems?: number;
  minLength?: number;
  minimum?: number;
  pattern?: string;
  $ref?: string;
}

const DEFS_PREFIX = '#/$defs/';
const ROOT = schema as JsonSchema & { $defs: Record<string, JsonSchema> };

function typeOf(value: unknown): string {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  return typeof value;
}

type Problem = string | undefined;

function checkScalar(value: unknown, node: JsonSchema, path: string): Problem {
  if (node.const !== undefined && value !== node.const) return `${path}: expected ${JSON.stringify(node.const)}, got ${JSON.stringify(value)}`;
  if (typeof value === 'string') {
    if (node.minLength !== undefined && value.length < node.minLength) return `${path}: must not be empty`;
    // The pattern is schema.json's own, shipped with the package; nothing here compiles an input.
    // eslint-disable-next-line secure-coding/detect-non-literal-regexp -- the pattern comes from the bundled schema, never from the plugin
    if (node.pattern !== undefined && !new RegExp(node.pattern).test(value)) return `${path}: ${JSON.stringify(value)} does not match ${node.pattern}`;
  }
  if (typeof value === 'number' && node.minimum !== undefined && value < node.minimum) return `${path}: must be at least ${node.minimum}`;
  return undefined;
}

function checkArray(value: unknown[], node: JsonSchema, path: string): Problem {
  if (node.minItems !== undefined && value.length < node.minItems) return `${path}: needs at least ${node.minItems} item(s)`;
  const { items } = node;
  if (items === undefined) return undefined;
  for (const [i, item] of value.entries()) {
    const problem = check(item, items, `${path}[${i}]`);
    if (problem !== undefined) return problem;
  }
  return undefined;
}

const isSchema = (x: unknown): x is JsonSchema => typeof x === 'object' && x !== null;

function checkObject(record: Record<string, unknown>, node: JsonSchema, path: string): Problem {
  for (const key of node.required ?? []) {
    if (!(key in record)) return `${path}.${key}: required`;
  }
  for (const [key, child] of Object.entries(record)) {
    const rule = node.properties?.[key] ?? (isSchema(node.additionalProperties) ? node.additionalProperties : undefined);
    if (rule === undefined) {
      if (node.additionalProperties === false) return `${path}.${key}: not allowed`;
      continue;
    }
    const problem = check(child, rule, `${path}.${key}`);
    if (problem !== undefined) return problem;
  }
  return undefined;
}

/** The subset of JSON Schema `schema.json` uses, walked by hand: a validator is a dependency the package will not carry. */
function check(value: unknown, node: JsonSchema, path: string): Problem {
  if (node.$ref !== undefined) {
    const def = ROOT.$defs[node.$ref.slice(DEFS_PREFIX.length)];
    return def === undefined ? `${path}: unknown $ref ${node.$ref}` : check(value, def, path);
  }
  const actual = typeOf(value);
  if (node.type !== undefined && actual !== node.type && !(node.type === 'number' && actual === 'integer')) {
    return `${path}: expected ${node.type}, got ${actual}`;
  }
  if (Array.isArray(value)) return checkArray(value, node, path);
  if (actual === 'object') return checkObject(value as Record<string, unknown>, node, path);
  return checkScalar(value, node, path);
}

const NO_STATIC = /\.(?:spinners|components)\.([^.]+)\.static: required$/;

/**
 * Refuse what the schema refuses, and say why. A missing `static` gets its own code and
 * fix, because it is the one mistake a plugin author makes on purpose (U3).
 */
export function validate(plugin: unknown): asserts plugin is Plugin {
  const problem = check(plugin, ROOT, 'plugin');
  if (problem !== undefined) {
    const missing = NO_STATIC.exec(problem);
    if (missing) {
      throw new PluginError(
        'E_NO_STATIC_PROJECTION',
        `${missing[1]} has no static projection`,
        'give it a `static`: the text a pipe, an agent or a screen reader gets instead of the animation',
      );
    }
    throw new PluginError('E_PLUGIN_SCHEMA', problem, 'compare the object against flagstaff/schema.json');
  }
  const { contract, components = {} } = plugin as Plugin;
  if (contract !== undefined && contract > CONTRACT) {
    throw new PluginError('E_PLUGIN_CONTRACT', `plugin declares contract ${contract}; this flagstaff knows ${CONTRACT}`, `upgrade flagstaff, or set contract: ${CONTRACT}`);
  }
  for (const [name, component] of Object.entries(components)) {
    if (typeof component.static !== 'function') {
      throw new PluginError('E_NO_STATIC_PROJECTION', `${name} has no static projection`, 'make `static` a function of the state that returns the text a pipe prints');
    }
  }
}

/** Maps, not records: a plugin's keys are its author's, and a Map cannot be polluted by one. */
interface Registry {
  plugins: string[];
  tokens: Map<string, `#${string}`>;
  glyphs: Map<string, string>;
  spinners: Map<string, SpinnerDef>;
  borders: Map<string, BorderStyle>;
  components: Map<string, Component>;
}

const registry: Registry = { plugins: [], tokens: new Map(), glyphs: new Map(), spinners: new Map(), borders: new Map(), components: new Map() };

/**
 * Stored contributions are frozen copies: what the registry holds cannot be edited by a
 * caller who kept a reference — including the plugin author, whose object stays their own.
 * `Object.freeze` returns `Readonly<T>`, which a `SpinnerDef` field will not accept; the
 * value is the same object, so the type it went in as is the type it comes back as.
 */
function frozen<T>(value: T): T {
  Object.freeze(value);
  return value;
}

/**
 * A component's `sample` is the one nested object the contract lets a plugin hold, and it is
 * plain data — the schema admits objects, arrays, strings, numbers and booleans, nothing that
 * can carry behaviour. A shallow freeze would leave the author's own object shared by
 * reference, so editing it after `register()` would write back through the registry. This
 * copies it to whatever depth it has, and freezes each level on the way out.
 */
function deepFrozen<T>(value: T, seen = new WeakMap<object, unknown>()): T {
  if (value === null || typeof value !== 'object') return value;
  // A sample may be circular — nothing forbids it, and a plugin that builds one by accident
  // should get a refusal from `check`, not a stack overflow from the registry. The map both
  // terminates the walk and preserves the shape: the copy points at its own copy.
  const already = seen.get(value);
  if (already !== undefined) return already as T;
  // `Object.entries` reads an array's indices as string keys, and assigning them back onto an
  // array literal rebuilds it — so one loop covers both shapes.
  const copy = (Array.isArray(value) ? [] : {}) as Record<string, unknown>;
  seen.set(value, copy);
  for (const [k, v] of Object.entries(value)) copy[k] = deepFrozen(v, seen);
  return frozen(copy) as T;
}

/**
 * The only wiring (R4, U9): validate, then keep every key this package understands. A later
 * plugin's entry replaces an earlier one of the same name, so a user overrides a built-in
 * by registering their own — the built-ins go through this same door first.
 */
export function register(plugin: unknown): void {
  validate(plugin);
  registry.plugins.push(plugin.name);
  for (const [name, hex] of Object.entries(plugin.tokens ?? {})) registry.tokens.set(name, hex);
  for (const [name, text] of Object.entries(plugin.glyphs ?? {})) registry.glyphs.set(name, text);
  for (const [name, def] of Object.entries(plugin.spinners ?? {})) registry.spinners.set(name, frozen({ ...def, frames: frozen([...def.frames]) }));
  for (const [name, style] of Object.entries(plugin.borders ?? {})) registry.borders.set(name, frozen({ ...style }));
  for (const [name, component] of Object.entries(plugin.components ?? {})) registry.components.set(name, frozen({ ...deepFrozen(component), name }));
}

/**
 * A copy of what has been registered — the docs gallery and `flagstaff check` are
 * projections of this. A copy rather than the registry itself, because `Readonly<T>` freezes
 * the property bindings and not the `Map`s behind them: handing the live registry out made
 * `set`, `delete` and `clear` a second door beside `register()`, through which a spinner
 * with no `static` — or a component with no projection at all — could be put in without
 * ever meeting `validate()` (#58). U3's refusal has to be structural to mean anything, so
 * there is one way in. The values are the frozen objects `register()` stored, so nothing
 * reached through here writes back.
 */
export function registered(): Readonly<Registry> {
  return {
    plugins: [...registry.plugins],
    tokens: new Map(registry.tokens),
    glyphs: new Map(registry.glyphs),
    spinners: new Map(registry.spinners),
    borders: new Map(registry.borders),
    components: new Map(registry.components),
  };
}

/**
 * One named thing out of the registry, or a refusal that lists what is there. The listing
 * is the whole point: "no spinner named 'moonn'" with the eighty that do exist beside it
 * is a typo fixed in one read, and a program that registered nothing learns that too.
 */
function lookup<T>(from: Map<string, T>, kind: string, code: PluginErrorCode, name: string): T {
  const found = from.get(name);
  if (found === undefined) {
    throw new PluginError(code, `no ${kind} named ${JSON.stringify(name)}`, `use one of ${[...from.keys()].join(', ')}, or register a plugin that defines it`);
  }
  return found;
}

/** A spinner by name, or a refusal that lists the names that exist. */
export function lookupSpinner(name: string): SpinnerDef {
  return lookup(registry.spinners, 'spinner', 'E_UNKNOWN_SPINNER', name);
}

/** A border by name, for `box()`; every style the built-ins ship is registered like any other. */
export function lookupBorder(name: string): BorderStyle {
  return lookup(registry.borders, 'border', 'E_UNKNOWN_BORDER', name);
}

/** A glyph by meaning; the built-ins define every meaning the built-in components use. */
export function glyph(meaning: string): string {
  return registry.glyphs.get(meaning) ?? '';
}

register(builtins);
