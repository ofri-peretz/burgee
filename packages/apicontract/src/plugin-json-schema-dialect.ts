/**
 * Provider dialects (apicontract-gen-validator R4, R7): one function over a table. A table is data
 * (`plugin-json-schema-dialect-<provider>.ts`), and the only place a provider's rules are written,
 * so a provider that changes its documentation is a one-file change.
 *
 * Narrowing never widens: the narrowed schema accepts a subset of what the full schema says, or a
 * constraint it cannot carry is dropped. Each drop and each rewrite is a finding, and is listed on
 * the re-check, a validator for the full schema that checks the model's answer locally.
 */
import { type ContractFinding } from './core/model.js';
import { type Document, KEYWORDS, type Refs } from './plugin-json-schema-build.js';

/** What a dialect does with a keyword: keep it, drop it, say it in `description` instead, or keep it up to a value. */
export type Rule = 'keep' | 'drop' | { readonly rewrite: 'description' } | { readonly atMost: number };

/** What a limit counts, over every subschema of a narrowed schema. */
export type Measure = 'properties' | 'optional' | 'unions' | 'depth' | 'enum';

export interface Limit {
  readonly measure: Measure;
  readonly max: number;
  /** `schema`: each schema on its own. `request`: every generated schema together, as one request sends them. */
  readonly per: 'schema' | 'request';
}

export interface Dialect {
  /** The provider's documentation page the table was read from. */
  readonly source: string;
  /** The date it was read, `YYYY-MM-DD`. */
  readonly read: string;
  /** Every keyword the provider accepts, with what is done to it. A keyword not listed is dropped. */
  readonly keywords: Readonly<Record<string, Rule>>;
  /** The formats the provider accepts; every format when absent. */
  readonly formats?: readonly string[];
  readonly rootMustBeObject: boolean;
  readonly additionalPropertiesFalseRequired: boolean;
  /** Every property required; an optional one is sent as required and nullable. */
  readonly allRequired: boolean;
  /** Whether a schema may refer to itself. Without it a reference that is a cycle is cut. */
  readonly recursion: boolean;
  readonly refs: Refs;
  /** A flat object of primitive properties, as MCP elicitation asks: any other property is dropped. */
  readonly flat: boolean;
  readonly limits: readonly Limit[];
}

export interface Narrowed {
  readonly schema: Document;
  readonly findings: ContractFinding[];
  /** What the narrowed schema no longer says, one line each: the re-check's reason to exist. */
  readonly dropped: string[];
}

type Dict = Readonly<Record<string, unknown>>;

// Stryker disable next-line ConditionalExpression: equivalent, a narrowed document never holds a list where a schema or a map of them stands
const isDict = (value: unknown): value is Dict => typeof value === 'object' && value !== null && !Array.isArray(value);

const token = (key: string): string => key.replaceAll('~', '~0').replaceAll('/', '~1');

const PRIMITIVES: ReadonlySet<unknown> = new Set(['string', 'number', 'integer', 'boolean']);

/** A property MCP elicitation can ask for: a primitive, or a list to pick several of. */
const primitive = (schema: unknown): boolean =>
  isDict(schema) && (PRIMITIVES.has(schema.type) || (schema.type === 'array' && isDict(schema.items) && ('enum' in schema.items || 'anyOf' in schema.items)));

const shown = (value: unknown): string => JSON.stringify(value);

/** The constraints a dialect does not enforce, said after the schema's own `description`. */
const noted = (out: Dict, notes: readonly string[]): Dict => {
  if (notes.length === 0) return out;
  const own = typeof out.description === 'string' ? `${out.description} ` : '';
  return { ...out, description: `${own}(${notes.join('; ')})` };
};

/** Narrow one full 2020-12 document to what the dialect accepts. `undefined` when it cannot be narrowed at all, with the finding that says why. */
export const narrow = (name: string, dialect: Dialect, schema: Document, where: { label: string; at: string }): { narrowed?: Narrowed; findings: ContractFinding[] } => {
  const rules = new Map(Object.entries(dialect.keywords));
  const findings: ContractFinding[] = [];
  const dropped: string[] = [];
  const say = (code: string, path: string, message: string, fix: string): void => {
    findings.push({ code, pointer: where.at, message: `${where.label}: for ${name}, at "${path}" in the document, ${message}`, fix });
  };
  const lose = (path: string, key: string, value: unknown, why: string): void => {
    dropped.push(`${path === '' ? '/' : path}: \`${key}\` ${shown(value)}`);
    say('dialect-dropped', path, `\`${key}\` ${why}, and is left out of the narrowed schema: the re-check holds the answer to it`, `validate the answer with the generated re-check before using it`);
  };

  /** MCP elicitation's flat object: a property that is not a primitive is dropped, and no longer required. */
  const flatten = (out: Dict, path: string): Dict => {
    const kept = Object.entries(out.properties as Dict).filter(([key, value]) => {
      if (primitive(value)) return true;
      lose(`${path}/properties/${token(key)}`, key, value, `is not a primitive, which ${name} cannot ask for`);
      return false;
    });
    const names = new Set(kept.map(([key]) => key));
    const required = Array.isArray(out.required) ? (out.required as string[]).filter((key) => names.has(key)) : undefined;
    return { ...out, properties: Object.fromEntries(kept), ...(required !== undefined && { required }) };
  };

  /** `additionalProperties: false`, with a finding where the schema said something else. */
  const close = (out: Dict, path: string): Dict => {
    if (out.additionalProperties === false) return out;
    if ('additionalProperties' in out) lose(path, 'additionalProperties', out.additionalProperties, `must be \`false\` for ${name}`);
    return { ...out, additionalProperties: false };
  };

  /** Every property required, an optional one as a union with `null`. */
  const requireAll = (out: Dict, path: string): Dict => {
    // Stryker disable next-line ArrayDeclaration: equivalent, an entry in the empty set's place names no property
    const required = new Set(Array.isArray(out.required) ? (out.required as string[]) : []);
    const properties = Object.fromEntries(
      Object.entries(out.properties as Dict).map(([key, value]) => {
        if (required.has(key)) return [key, value];
        dropped.push(`${path}/properties/${token(key)}: optional, sent as \`null\` when absent`);
        say('dialect-rewritten', `${path}/properties/${token(key)}`, `the optional \`${key}\` is written as required and nullable, as ${name} asks: the answer carries \`null\` where the key is absent`, 'drop a `null` the full schema does not allow before re-checking the answer');
        return [key, { anyOf: [value, { type: 'null' }] }];
      }),
    );
    return { ...out, properties, required: Object.keys(properties) };
  };

  const objects = (out: Dict, path: string, root: boolean): Dict => {
    if (out.type !== 'object' && !('properties' in out)) return out;
    const named = isDict(out.properties);
    const flat = dialect.flat && root && named ? flatten(out, path) : out;
    const closed = dialect.additionalPropertiesFalseRequired ? close(flat, path) : flat;
    return dialect.allRequired && named ? requireAll(closed, path) : closed;
  };

  /** A format the dialect lists, or every format where it lists none. */
  const keepFormat = (key: string, value: unknown, path: string): 'keep' | 'drop' => {
    if (key !== 'format' || dialect.formats === undefined || dialect.formats.includes(value as string)) return 'keep';
    lose(path, key, value, `${shown(value)} is not a format ${name} accepts`);
    // Stryker disable next-line StringLiteral: equivalent, a verdict that is neither keep nor said is a drop
    return 'drop';
  };

  /** Whether a keyword stays: `keep`, `drop` (reported), or `said` (moved into `description`, reported). */
  const verdict = (key: string, value: unknown, path: string): 'keep' | 'drop' | 'said' => {
    // The provider is told its dialect by its API, not by `$schema`; nothing is lost without it.
    // Stryker disable next-line StringLiteral: equivalent, a verdict that is neither keep nor said is a drop
    if (key === '$schema') return 'drop';
    // Without recursion every reference is cut, so the schemas they named go with them.
    // Stryker disable next-line StringLiteral: equivalent, a verdict that is neither keep nor said is a drop
    if (key === '$defs') return dialect.recursion ? 'keep' : 'drop';
    if (key === '$ref') {
      if (dialect.recursion) return 'keep';
      lose(path, key, value, `refers to a schema that contains itself, which ${name} does not allow`);
      // Stryker disable next-line StringLiteral: equivalent, a verdict that is neither keep nor said is a drop
      return 'drop';
    }
    const rule = rules.get(key) ?? 'drop';
    if (rule === 'keep') return keepFormat(key, value, path);
    if (rule === 'drop') {
      lose(path, key, value, `is not a keyword ${name} accepts`);
      // Stryker disable next-line StringLiteral: equivalent, a verdict that is neither keep nor said is a drop
      return 'drop';
    }
    if ('rewrite' in rule) {
      dropped.push(`${path === '' ? '/' : path}: \`${key}\` ${shown(value)}`);
      say('dialect-rewritten', path, `\`${key}\` is not a keyword ${name} enforces: it is said in \`description\` instead`, 'validate the answer with the generated re-check before using it');
      return 'said';
    }
    if (typeof value === 'number' && value > rule.atMost) {
      lose(path, key, value, `above ${String(rule.atMost)} is not accepted by ${name}`);
      // Stryker disable next-line StringLiteral: equivalent, a verdict that is neither keep nor said is a drop
      return 'drop';
    }
    return 'keep';
  };

  /** A kept keyword's value, with every schema in it narrowed too. */
  const inner = (key: string, value: unknown, at: string): unknown => {
    const kind = key === '$defs' ? 'map' : KEYWORDS.get(key);
    if (kind === 'schema') return walk(value, at, false);
    if (kind === 'list') return (value as unknown[]).map((item, index) => walk(item, `${at}/${String(index)}`, false));
    if (kind === 'map') return Object.fromEntries(Object.entries(value as Dict).map(([sub, item]) => [sub, walk(item, `${at}/${token(sub)}`, false)]));
    return value;
  };

  function walk(node: unknown, path: string, root: boolean): unknown {
    if (!isDict(node)) return node;
    const verdicts = Object.entries(node).map(([key, value]) => [key, value, verdict(key, value, path)] as const);
    const out = Object.fromEntries(verdicts.filter(([, , kept]) => kept === 'keep').map(([key, value]) => [key, inner(key, value, `${path}/${token(key)}`)]));
    const notes = verdicts.filter(([, , kept]) => kept === 'said').map(([key, value]) => `${key}: ${shown(value)}`);
    return objects(noted(out, notes), path, root);
  }

  const narrowed = walk(schema, '', true) as Dict;
  if (dialect.rootMustBeObject && narrowed.type !== 'object') {
    say('dialect-root-not-object', '', `${name} takes an object at the root, and this schema is not one: no narrowed schema is written for it`, 'wrap the payload in an object property, or generate without a dialect');
    return { findings };
  }
  return { narrowed: { schema: narrowed, findings, dropped }, findings };
};

/** Every subschema of a document, the document first. */
const subschemas = (node: unknown): Dict[] => {
  if (!isDict(node)) return [];
  const inner = Object.entries(node).flatMap(([key, value]) => {
    const kind = key === '$defs' ? 'map' : KEYWORDS.get(key);
    if (kind === 'schema') return subschemas(value);
    if (kind === 'list') return (value as unknown[]).flatMap((item) => subschemas(item));
    if (kind === 'map') return Object.values(value as Dict).flatMap((item) => subschemas(item));
    return [];
  });
  return [node, ...inner];
};

const keysOf = (schema: Dict): string[] => (isDict(schema.properties) ? Object.keys(schema.properties) : []);

/** How deep objects nest under a schema: an object is one level, its properties' objects the next. */
const depth = (node: unknown): number => {
  if (!isDict(node)) return 0;
  const own = node.type === 'object' || 'properties' in node ? 1 : 0;
  const below = Object.entries(node).flatMap(([key, value]) => {
    const kind = KEYWORDS.get(key);
    if (kind === 'schema') return [depth(value)];
    if (kind === 'list') return (value as unknown[]).map((item) => depth(item));
    if (kind === 'map') return Object.values(value as Dict).map((item) => depth(item));
    return [];
  });
  return own + Math.max(0, ...below);
};

const properties = (schema: Document): number => subschemas(schema).reduce((sum, node) => sum + keysOf(node).length, 0);

const optional = (schema: Document): number =>
  subschemas(schema).reduce((sum, node) => {
    // Stryker disable next-line ArrayDeclaration: equivalent, an entry in the empty set's place names no property
    const required = new Set(Array.isArray(node.required) ? (node.required as string[]) : []);
    return sum + keysOf(node).filter((key) => !required.has(key)).length;
  }, 0);

const unions = (schema: Document): number => subschemas(schema).filter((node) => 'anyOf' in node || Array.isArray(node.type)).length;

const enums = (schema: Document): number => subschemas(schema).reduce((sum, node) => sum + (Array.isArray(node.enum) ? node.enum.length : 0), 0);

const MEASURES: ReadonlyMap<Measure, (schema: Document) => number> = new Map<Measure, (schema: Document) => number>([
  ['properties', properties],
  ['optional', optional],
  ['unions', unions],
  ['depth', depth],
  ['enum', enums],
]);

const measure = (limit: Limit, schema: Document): number => (MEASURES.get(limit.measure) as (schema: Document) => number)(schema);

/** The dialect's limits over the narrowed schemas: each schema on its own, and all of them as one request. */
export const overLimits = (name: string, dialect: Dialect, schemas: readonly { readonly label: string; readonly at: string; readonly schema: Document }[]): ContractFinding[] =>
  dialect.limits.flatMap((limit) => {
    const fix = `split the payloads across requests, or simplify them: ${name} refuses a request over the limit`;
    if (limit.per === 'request') {
      const total = schemas.reduce((sum, { schema }) => sum + measure(limit, schema), 0);
      if (total <= limit.max) return [];
      return [{ code: 'dialect-limit', pointer: '', message: `the generated schemas have ${String(total)} ${limit.measure} together, and ${name} takes at most ${String(limit.max)} in one request`, fix }];
    }
    return schemas.flatMap(({ label, at, schema }) => {
      const count = measure(limit, schema);
      return count <= limit.max ? [] : [{ code: 'dialect-limit', pointer: at, message: `${label}: ${String(count)} ${limit.measure}, and ${name} takes at most ${String(limit.max)}`, fix }];
    });
  });
