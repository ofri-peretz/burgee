/**
 * The JSON Schema walker the plugin host validates with, in its own module so the lock that asks
 * whether the family schema describes every host (`scripts/plugin-schema-coverage-lock.test.ts`)
 * walks with the same code a plugin is refused by — not a second walker that could disagree.
 * Not a published subpath: nothing outside this package imports it.
 */
export interface JsonSchema {
  type?: string;
  const?: unknown;
  required?: string[];
  properties?: Record<string, JsonSchema>;
  additionalProperties?: JsonSchema | boolean;
  items?: JsonSchema;
  minItems?: number;
  minLength?: number;
  minimum?: number;
  maximum?: number;
  pattern?: string;
  $ref?: string;
}

const DEFS_PREFIX = '#/$defs/';

function typeOf(value: unknown): string {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  return typeof value;
}

export type Problem = string | undefined;

/** A schema document: the node the walk starts at, carrying the `$defs` its `$ref`s name. */
export type Root = JsonSchema & { $defs?: Record<string, JsonSchema> };

function checkScalar(value: unknown, node: JsonSchema, path: string): Problem {
  if (node.const !== undefined && value !== node.const) return `${path}: expected ${JSON.stringify(node.const)}, got ${JSON.stringify(value)}`;
  if (typeof value === 'string') {
    if (node.minLength !== undefined && value.length < node.minLength) return `${path}: must not be empty`;
    // The pattern is schema.json's own, shipped with the package; nothing here compiles an input.
    // eslint-disable-next-line secure-coding/detect-non-literal-regexp -- the pattern comes from the bundled schema, never from the plugin
    if (node.pattern !== undefined && !new RegExp(node.pattern).test(value)) return `${path}: ${JSON.stringify(value)} does not match ${node.pattern}`;
  }
  if (typeof value === 'number' && node.minimum !== undefined && value < node.minimum) return `${path}: must be at least ${node.minimum}`;
  if (typeof value === 'number' && node.maximum !== undefined && value > node.maximum) return `${path}: must be at most ${node.maximum}`;
  return undefined;
}

function checkArray(value: unknown[], node: JsonSchema, path: string, root: Root): Problem {
  if (node.minItems !== undefined && value.length < node.minItems) return `${path}: needs at least ${node.minItems} item(s)`;
  const { items } = node;
  if (items === undefined) return undefined;
  for (const [i, item] of value.entries()) {
    const problem = check(item, items, `${path}[${i}]`, root);
    if (problem !== undefined) return problem;
  }
  return undefined;
}

const isSchema = (x: unknown): x is JsonSchema => typeof x === 'object' && x !== null;

function checkObject(record: Record<string, unknown>, node: JsonSchema, path: string, root: Root): Problem {
  for (const key of node.required ?? []) {
    if (!(key in record)) return `${path}.${key}: required`;
  }
  for (const [key, child] of Object.entries(record)) {
    const rule = node.properties?.[key] ?? (isSchema(node.additionalProperties) ? node.additionalProperties : undefined);
    if (rule === undefined) {
      if (node.additionalProperties === false) return `${path}.${key}: not allowed`;
      continue;
    }
    const problem = check(child, rule, `${path}.${key}`, root);
    if (problem !== undefined) return problem;
  }
  return undefined;
}

/**
 * The subset of JSON Schema the family schema uses, walked by hand: a validator is a dependency
 * the package will not carry. `root` is the document `$ref`s resolve against — flagstaff's own
 * fragment at run time, the whole family schema when a lock asks whether it describes a plugin.
 */
export function check(value: unknown, node: JsonSchema, path: string, root: Root = node as Root): Problem {
  if (node.$ref !== undefined) {
    const def = root.$defs?.[node.$ref.slice(DEFS_PREFIX.length)];
    return def === undefined ? `${path}: unknown $ref ${node.$ref}` : check(value, def, path, root);
  }
  const actual = typeOf(value);
  if (node.type !== undefined && actual !== node.type && !(node.type === 'number' && actual === 'integer')) {
    return `${path}: expected ${node.type}, got ${actual}`;
  }
  if (Array.isArray(value)) return checkArray(value, node, path, root);
  if (actual === 'object') return checkObject(value as Record<string, unknown>, node, path, root);
  return checkScalar(value, node, path);
}
