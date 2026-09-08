/**
 * The plugin host (R2, R3, R4). A plugin is one plain object — `{ name, spinners, glyphs,
 * tokens, components }` — validated against `schema.json`, the same file that ships in the
 * tarball, and kept in one registry every component reads. A contribution without a static
 * projection is refused here, at the door, which is what makes a third-party plugin safe by
 * construction (U3, U4). Nothing in this file writes to a stream.
 */
import { builtins } from './builtins.js';
import schema from './schema.json' with { type: 'json' };

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
}

export const CONTRACT = 1;

/** The whole plugin contract. Keys another package in the family understands are kept for it. */
export interface Plugin {
  name: string;
  contract?: typeof CONTRACT;
  tokens?: Record<string, `#${string}`>;
  glyphs?: Record<string, string>;
  spinners?: Record<string, SpinnerDef>;
  components?: Record<string, Omit<Component, 'name'>>;
}

export type PluginErrorCode = 'E_PLUGIN_SCHEMA' | 'E_NO_STATIC_PROJECTION' | 'E_PLUGIN_CONTRACT' | 'E_UNKNOWN_SPINNER';

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
  components: Map<string, Component>;
}

const registry: Registry = { plugins: [], tokens: new Map(), glyphs: new Map(), spinners: new Map(), components: new Map() };

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
  for (const [name, def] of Object.entries(plugin.spinners ?? {})) registry.spinners.set(name, def);
  for (const [name, component] of Object.entries(plugin.components ?? {})) registry.components.set(name, { ...component, name });
}

/** What has been registered, read-only: the docs gallery and `flagstaff check` are projections of this. */
export function registered(): Readonly<Registry> {
  return registry;
}

/** A spinner by name, or a refusal that lists the names that exist. */
export function lookupSpinner(name: string): SpinnerDef {
  const def = registry.spinners.get(name);
  if (def === undefined) {
    throw new PluginError('E_UNKNOWN_SPINNER', `no spinner named ${JSON.stringify(name)}`, `use one of ${[...registry.spinners.keys()].join(', ')}, or register a plugin that defines it`);
  }
  return def;
}

/** A glyph by meaning; the built-ins define every meaning the built-in components use. */
export function glyph(meaning: string): string {
  return registry.glyphs.get(meaning) ?? '';
}

register(builtins);
