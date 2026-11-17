import { base64, date, datetime, duration, email, hostname, ipv4, ipv6, regex, time, uuid } from './formats.js';
import {
  annotate,
  type AnySchema,
  array,
  boolean,
  contains,
  type Format,
  intersection,
  lazy,
  literal,
  type Meta,
  never,
  type Node,
  not,
  number,
  object,
  oneOf,
  optional,
  properties,
  record,
  type Schema,
  string,
  tuple,
  union,
  unique,
  unknown,
} from './schema.js';

/**
 * The JSON Schema reader (spec.md R13): a JSON Schema document as a schema of this library, and
 * beside it every place where the schema's verdict may differ from the document's. The contract is
 * the writer's turned round: `findings` is empty exactly when `check` accepts a JSON value if and
 * only if the document does.
 *
 * Every keyword is read the way the specification applies it: a keyword about strings binds strings
 * only, so `{ "minLength": 2 }` still accepts `7`. That is why a schema without `type` becomes a
 * union of one branch for each JSON type, each carrying the keywords that bind it.
 *
 * Formats are asserted, as ajv asserts them by default; the specification makes them annotations
 * unless a validator opts in. A format this library has no reading of is a finding.
 */

type ImportDraft = '2020-12' | 'draft-07' | 'openapi-3.0';

interface ImportOptions {
  /**
   * The dialect the document is written in. Read from its `$schema` when it is not given, and
   * 2020-12 when neither says. `openapi-3.0` is an OpenAPI 3.0 Schema Object: `nullable` adds `null`,
   * `exclusiveMinimum` and `exclusiveMaximum` are booleans, and a `$ref` silences its siblings.
   */
  readonly draft?: ImportDraft;
  /** Formats by the name the document gives them, beside and over the ones this library reads. */
  readonly formats?: Readonly<Record<string, Format>>;
}

/** One place where the schema's verdict may differ from the document's. */
interface ImportFinding {
  /** JSON Pointer into the document, to the schema the keyword is in. */
  readonly path: string;
  /** The keyword that is not read, or not read as the document means it. */
  readonly keyword: string;
  readonly message: string;
}

interface Imported {
  readonly schema: Schema<unknown>;
  readonly findings: ImportFinding[];
}

/** The formats this library reads, by the name JSON Schema gives them. */
const FORMATS: ReadonlyMap<string, Format> = /* @__PURE__ */ new Map<string, Format>([
  ['date', date],
  ['date-time', datetime],
  ['time', time],
  ['duration', duration],
  ['email', email],
  ['hostname', hostname],
  ['ipv4', ipv4],
  ['ipv6', ipv6],
  ['uuid', uuid],
  ['regex', regex],
  // Not a JSON Schema format, but OpenAPI's `byte`: base 64.
  ['byte', base64],
]);

/** Keywords the specification defines that this reader does not apply: each one present is a finding, and is left out. */
const UNREAD: ReadonlySet<string> = /* @__PURE__ */ new Set(['unevaluatedProperties', 'unevaluatedItems', '$dynamicRef', '$recursiveRef', 'contentSchema']);

type Json = Readonly<Record<string, unknown>>;

interface Reader {
  readonly root: unknown;
  readonly draft: ImportDraft;
  readonly findings: ImportFinding[];
  readonly formats: ReadonlyMap<string, Format>;
  /** The schema each `$ref` stands for, by the pointer it names, made once. */
  readonly refs: Map<string, Node>;
  /** The objects being read, from the root down: one met again without a `$ref` is a document that holds itself. */
  readonly inside: Set<unknown>;
}

const shown = (value: unknown): string => {
  if (typeof value === 'string') return JSON.stringify(value);
  return (typeof value === 'object' && value !== null) || typeof value === 'function' ? `a value of the type ${typeof value}` : String(value);
};

const isJson = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);

const token = (key: string | number): string => `/${String(key).replaceAll('~', '~0').replaceAll('/', '~1')}`;

/** Options with what is not given left out: a builder's options are exact, and `undefined` is not "not given" to them. */
type Given<T> = { [K in keyof T]?: Exclude<T[K], undefined> };

const given = <T extends object>(options: T): Given<T> => Object.fromEntries(Object.entries(options).filter(([, value]) => value !== undefined)) as Given<T>;

const lose = (reader: Reader, path: string, keyword: string, message: string): void => {
  reader.findings.push({ path, keyword, message });
};

/** A document that is not JSON Schema is refused, never read as something else. */
function invalid(path: string, what: string): never {
  throw new TypeError(`cannot read the JSON Schema at "${path}": ${what}. fix: correct the document, or validate it against its dialect's meta-schema first`);
}

/** A keyword whose value must be a number: `undefined` when it is absent. */
const numberAt = (schema: Json, key: string, path: string): number | undefined => {
  const value = schema[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) invalid(path, `"${key}" is ${shown(value)}, not a number`);
  return value;
};

/** A keyword whose value must be a count: a whole number, zero or more. */
const countAt = (schema: Json, key: string, path: string): number | undefined => {
  const value = numberAt(schema, key, path);
  if (value !== undefined && (!Number.isInteger(value) || value < 0)) invalid(path, `"${key}" is ${String(value)}, not a whole number of zero or more`);
  return value;
};

/** A keyword whose value must be a list of schemas. */
const listAt = (schema: Json, key: string, path: string): readonly unknown[] | undefined => {
  const value = schema[key];
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length === 0) invalid(path, `"${key}" is ${shown(value)}, not a list of one schema or more`);
  return value;
};

/** A keyword whose value must be a list of strings. */
const namesAt = (value: unknown, path: string, key: string): string[] => {
  if (!Array.isArray(value) || !value.every((name) => typeof name === 'string')) invalid(path, `"${key}" is ${shown(value)}, not a list of strings`);
  return value as string[];
};

/** Only the members given: an object or an intersection of every schema that is not `unknown`. */
const all = (members: readonly Node[]): Node => {
  const kept = members.filter((member) => member.kind !== 'unknown');
  if (kept.length === 0) return unknown();
  return kept.length === 1 ? (kept[0] as Node) : intersection(kept as AnySchema[]);
};

/**
 * A JSON value as a schema that accepts it and nothing else, by JSON's own equality: numbers by
 * value, arrays item by item, objects key by key in any order. Built of nodes, not a test of a
 * function, so it can be written out as code.
 */
const constant = (value: unknown, path: string): Node => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return literal(value);
  if (Array.isArray(value)) return tuple(value.map((item, index) => constant(item, `${path}${token(index)}`)) as AnySchema[]);
  if (isJson(value)) return object(Object.fromEntries(Object.entries(value).map(([key, member]) => [key, constant(member, `${path}${token(key)}`)])) as Record<string, AnySchema>, { unknown: 'strict' });
  invalid(path, `${shown(value)} is not a JSON value`);
};

/** The JSON types a schema allows: its `type`, with `null` added where OpenAPI 3.0's `nullable` is true. `null` when it names none. */
const typesOf = (reader: Reader, schema: Json, path: string): Set<string> | null => {
  const { type } = schema;
  if (type === undefined) return null;
  const names = typeof type === 'string' ? [type] : namesAt(type, path, 'type');
  const known = new Set(['null', 'boolean', 'object', 'array', 'number', 'integer', 'string']);
  const strange = names.find((name) => !known.has(name));
  if (strange !== undefined) invalid(path, `"type" names ${JSON.stringify(strange)}, which is no JSON type`);
  const out = new Set(names);
  if (reader.draft === 'openapi-3.0' && schema['nullable'] === true) out.add('null');
  return out;
};

/** The pattern a document gives, read as ECMA-262 under the `u` flag, as JSON Schema says. A pattern the engine cannot read is refused. */
const patternOf = (value: unknown, path: string): RegExp => {
  if (typeof value !== 'string') invalid(path, `"pattern" is ${shown(value)}, not a string`);
  try {
    // eslint-disable-next-line secure-coding/detect-non-literal-regexp -- the pattern is the document's, as JSON Schema means it to be, and is run as ajv runs it: a document is trusted as code is
    return new RegExp(value, 'u');
  } catch {
    invalid(path, `"pattern" ${JSON.stringify(value)} is not a regular expression`);
  }
};

const STRING_KEYS = ['minLength', 'maxLength', 'pattern', 'format'] as const;

const stringBranch = (reader: Reader, schema: Json, path: string): Node => {
  const name = schema['format'];
  let format: Format | undefined;
  if (name !== undefined) {
    if (typeof name !== 'string') invalid(path, `"format" is ${shown(name)}, not a string`);
    format = reader.formats.get(name);
    if (format === undefined) lose(reader, path, 'format', `the format ${JSON.stringify(name)} is not one this library reads, and is not checked: pass a reading of it in \`formats\``);
  }
  return string(given({
    min: countAt(schema, 'minLength', path),
    max: countAt(schema, 'maxLength', path),
    pattern: schema['pattern'] === undefined ? undefined : patternOf(schema['pattern'], path),
    format,
  }));
};

const NUMBER_KEYS = ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf'] as const;

/** An exclusive bound as a number. OpenAPI 3.0 writes it as draft-04 did: a boolean that makes `minimum` or `maximum` exclusive. */
const exclusive = (reader: Reader, schema: Json, key: 'exclusiveMinimum' | 'exclusiveMaximum', path: string): { inclusive: number | undefined; exclusive: number | undefined } => {
  const bound = key === 'exclusiveMinimum' ? 'minimum' : 'maximum';
  const value = schema[key];
  if (reader.draft === 'openapi-3.0' && typeof value === 'boolean') {
    const at = numberAt(schema, bound, path);
    return value ? { inclusive: undefined, exclusive: at } : { inclusive: at, exclusive: undefined };
  }
  return { inclusive: numberAt(schema, bound, path), exclusive: numberAt(schema, key, path) };
};

const numberBranch = (reader: Reader, schema: Json, path: string, int: boolean): Node => {
  const low = exclusive(reader, schema, 'exclusiveMinimum', path);
  const high = exclusive(reader, schema, 'exclusiveMaximum', path);
  const step = numberAt(schema, 'multipleOf', path);
  if (step !== undefined && !(step > 0)) invalid(path, `"multipleOf" is ${String(step)}, not a number above zero`);
  if (step !== undefined && !Number.isInteger(step)) {
    lose(reader, path, 'multipleOf', `a multiple of ${String(step)} is read within one rounding error, so 0.3 is a multiple of 0.1; a validator that tests the bare remainder refuses it`);
  }
  return number(given({ min: low.inclusive, max: high.inclusive, gt: low.exclusive, lt: high.exclusive, multipleOf: step, int }));
};

const ARRAY_KEYS = ['items', 'prefixItems', 'additionalItems', 'minItems', 'maxItems', 'uniqueItems', 'contains', 'minContains', 'maxContains'] as const;

/**
 * An array's items: the schemas of its first items, which bind only the items that are there, and
 * the schema of the items after them. A tuple of this library is closed and needs every item it
 * names, so "the first two items, if they are there" is a union of a tuple for each length.
 */
const itemsOf = (reader: Reader, schema: Json, path: string): Node => {
  // 2020-12 names the first items `prefixItems` and the rest `items`; before it, `items` is a list for the first and `additionalItems` the rest, or one schema for all.
  const listed = reader.draft === '2020-12' ? 'prefixItems' : 'items';
  const first = Array.isArray(schema[listed]) ? (schema[listed] as readonly unknown[]) : [];
  const restKey = reader.draft !== '2020-12' && first.length > 0 ? 'additionalItems' : 'items';
  const rest = schema[restKey] === undefined ? unknown() : read(reader, schema[restKey], `${path}/${restKey}`);
  if (first.length === 0) return array(rest as AnySchema);
  const prefix = first.map((item, index) => read(reader, item, `${path}/${listed}/${String(index)}`) as AnySchema);
  const shorter = prefix.map((_, length) => tuple(prefix.slice(0, length)));
  return union([...shorter, tuple(prefix, { rest: rest as AnySchema })]);
};

const arrayBranch = (reader: Reader, schema: Json, path: string): Node => {
  let out = itemsOf(reader, schema, path);
  const [min, max] = [countAt(schema, 'minItems', path), countAt(schema, 'maxItems', path)];
  if (min !== undefined || max !== undefined) out = out.kind === 'array' ? array(out.item as AnySchema, given({ min, max })) : intersection([out as AnySchema, array(unknown(), given({ min, max }))]);
  if (schema['uniqueItems'] === true) out = unique(out as Schema<unknown[]>);
  if (schema['contains'] !== undefined) {
    // Draft-07 has no `minContains` or `maxContains`: there they are keywords it does not know, and are ignored.
    const counted = reader.draft === '2020-12';
    out = contains(
      out as Schema<unknown[]>,
      read(reader, schema['contains'], `${path}/contains`) as AnySchema,
      given({ min: counted ? countAt(schema, 'minContains', path) : undefined, max: counted ? countAt(schema, 'maxContains', path) : undefined }),
    );
  }
  return out;
};

const OBJECT_KEYS = ['properties', 'required', 'additionalProperties', 'propertyNames', 'minProperties', 'maxProperties', 'dependentRequired', 'dependentSchemas', 'dependencies', 'patternProperties'] as const;

/** "When the object has the key `key`, so-and-so holds": no such key, or so-and-so. */
const when = (key: string, then: Node): Node => union([not(object({ [key]: unknown() })), then as AnySchema]);

/** One key of `dependentRequired`, `dependentSchemas` or `dependencies`: "no such key, or what it brings", which is more keys or a schema. */
const dependent = (reader: Reader, keyword: string, entry: readonly [string, unknown], at: string): Node => {
  const [key, then] = entry;
  if (keyword === 'dependentRequired' || (keyword === 'dependencies' && Array.isArray(then))) {
    return when(key, object(Object.fromEntries(namesAt(then, at, key).map((name) => [name, unknown()]))));
  }
  return when(key, read(reader, then, at));
};

/** The keys of `dependentRequired`, `dependentSchemas` and draft-07's `dependencies`, each as "no such key, or what it brings". */
const dependents = (reader: Reader, schema: Json, path: string): Node[] => {
  // Each dialect has its own: 2020-12 split draft-07's `dependencies` in two, and OpenAPI 3.0 has neither.
  const keywords = { '2020-12': ['dependentRequired', 'dependentSchemas'], 'draft-07': ['dependencies'], 'openapi-3.0': [] }[reader.draft];
  return keywords.flatMap((keyword) => {
    const value = schema[keyword];
    if (value === undefined) return [];
    if (!isJson(value)) invalid(path, `"${keyword}" is ${shown(value)}, not an object`);
    return Object.entries(value).map((entry) => dependent(reader, keyword, entry, `${path}/${keyword}${token(entry[0])}`));
  });
};

/**
 * What `additionalProperties` holds the keys `properties` does not name to: `null` where it allows
 * any value, `false` where it allows none. Beside `patternProperties` it is not applied, since which
 * keys it binds depends on the patterns, which are not read.
 */
const restOf = (reader: Reader, schema: Json, path: string): AnySchema | false | null => {
  const rest = schema['additionalProperties'];
  if (schema['patternProperties'] !== undefined) {
    lose(reader, path, 'patternProperties', 'keys matched by a pattern are not held to its schema, and additionalProperties beside it is not applied: the schema accepts more than the document');
    return null;
  }
  if (rest === false) return false;
  return rest === undefined || rest === true ? null : (read(reader, rest, `${path}/additionalProperties`) as AnySchema);
};

/**
 * An object's named keys and their schemas: each in `properties`, optional unless `required` names
 * it; and each key `required` names that `properties` does not, which is still one of the others
 * and so held to what `additionalProperties` says of them.
 */
const shapeOf = (reader: Reader, schema: Json, rest: AnySchema | false | null, path: string): Record<string, AnySchema> => {
  const named = schema['properties'] ?? {};
  if (!isJson(named)) invalid(path, `"properties" is ${shown(named)}, not an object`);
  const required = new Set(schema['required'] === undefined ? [] : namesAt(schema['required'], path, 'required'));
  const shape: Record<string, AnySchema> = {};
  for (const [key, member] of Object.entries(named)) {
    const field = read(reader, member, `${path}/properties${token(key)}`) as AnySchema;
    shape[key] = required.has(key) ? field : optional(field);
  }
  const other = rest === false ? never() : (rest ?? unknown());
  // eslint-disable-next-line conventions/consistent-existence-index-check -- own keys only: the shape is built here, and a key named "toString" is one more key
  for (const key of required) if (!Object.hasOwn(shape, key)) shape[key] = other;
  return shape;
};

/** The object, and what it does with the keys `properties` does not name. */
const closed = (shape: Record<string, AnySchema>, rest: AnySchema | false | null): Node => {
  if (rest === false) return object(shape, { unknown: 'strict' });
  return rest === null ? object(shape) : object(shape, { unknown: rest });
};

const objectBranch = (reader: Reader, schema: Json, path: string): Node => {
  const rest = restOf(reader, schema, path);
  let out = closed(shapeOf(reader, schema, rest, path), rest);
  const names = schema['propertyNames'] === undefined ? [] : [record(unknown(), { key: read(reader, schema['propertyNames'], `${path}/propertyNames`) as Schema<string> })];
  const [min, max] = [countAt(schema, 'minProperties', path), countAt(schema, 'maxProperties', path)];
  if (min !== undefined || max !== undefined) out = properties(out as Schema<object>, given({ min, max }));
  return all([out, ...names, ...dependents(reader, schema, path)]);
};

/** The branch for `null`. */
const nothing = (): Node => literal(null);

/** Whether the schema has a keyword that binds values of one JSON type. */
const has = (schema: Json, keys: readonly string[]): boolean => keys.some((key) => schema[key] !== undefined);

/**
 * The part of a schema that depends on the type of the value: one branch for each type it allows,
 * each with the keywords that bind that type. A schema that names no type allows every one, and
 * the keywords still bind only their own.
 */
const typed = (reader: Reader, schema: Json, path: string): Node => {
  const types = typesOf(reader, schema, path);
  if (types === null && !has(schema, [...STRING_KEYS, ...NUMBER_KEYS, ...ARRAY_KEYS, ...OBJECT_KEYS])) return unknown();
  const allows = (name: string): boolean => types === null || types.has(name);
  // A type's branch, with its keywords where it has some and bare where it has none.
  const branch = (keys: readonly string[], build: () => Node, bare: () => Node): Node => (has(schema, keys) ? build() : bare());
  const choices: [boolean, () => Node][] = [
    [allows('null'), nothing],
    [allows('boolean'), boolean],
    [allows('number'), () => branch(NUMBER_KEYS, () => numberBranch(reader, schema, path, false), number)],
    [!allows('number') && allows('integer'), () => numberBranch(reader, schema, path, true)],
    [allows('string'), () => branch(STRING_KEYS, () => stringBranch(reader, schema, path), string)],
    [allows('array'), () => branch(ARRAY_KEYS, () => arrayBranch(reader, schema, path), () => array(unknown()))],
    [allows('object'), () => branch(OBJECT_KEYS, () => objectBranch(reader, schema, path), () => object({}))],
  ];
  const branches = choices.filter(([yes]) => yes).map(([, make]) => make());
  return branches.length === 1 ? (branches[0] as Node) : union(branches as AnySchema[]);
};

/** `if`, `then` and `else` (draft-07 on): the value passes `if` and `then`, or fails `if` and passes `else`. A branch not given is `true`. */
const conditional = (reader: Reader, schema: Json, path: string): Node[] => {
  if (schema['if'] === undefined || reader.draft === 'openapi-3.0') return [];
  const part = (keyword: string): AnySchema => (schema[keyword] === undefined ? unknown() : (read(reader, schema[keyword], `${path}/${keyword}`) as AnySchema));
  const condition = part('if');
  return [union([all([condition, part('then')]) as AnySchema, all([not(condition), part('else')]) as AnySchema])];
};

/** The keywords that bind a value whatever its type: `enum`, `const`, the four combinations, and `if`. */
const applied = (reader: Reader, schema: Json, path: string): Node[] => {
  const out: Node[] = [];
  if (schema['const'] !== undefined) out.push(constant(schema['const'], `${path}/const`));
  if (schema['enum'] !== undefined) {
    const values = schema['enum'];
    if (!Array.isArray(values)) invalid(path, `"enum" is ${shown(values)}, not a list`);
    out.push(values.length === 0 ? never() : union(values.map((value, index) => constant(value, `${path}/enum/${String(index)}`)) as AnySchema[]));
  }
  const members = (keyword: string): AnySchema[] | undefined => listAt(schema, keyword, path)?.map((member, index) => read(reader, member, `${path}/${keyword}/${String(index)}`) as AnySchema);
  const allOf = members('allOf');
  if (allOf !== undefined) out.push(all(allOf));
  const anyOf = members('anyOf');
  if (anyOf !== undefined) out.push(union(anyOf));
  const exactly = members('oneOf');
  if (exactly !== undefined) out.push(oneOf(exactly));
  if (schema['not'] !== undefined) out.push(not(read(reader, schema['not'], `${path}/not`) as AnySchema));
  return [...out, ...conditional(reader, schema, path)];
};

/** What the schema says about itself, which validates nothing: kept on the node, as `annotate` keeps it. */
const meta = (schema: Json): Meta | null => {
  const out: { -readonly [K in keyof Meta]?: Meta[K] } = {};
  if (typeof schema['title'] === 'string') out.title = schema['title'];
  if (typeof schema['description'] === 'string') out.description = schema['description'];
  if (Array.isArray(schema['examples'])) out.examples = schema['examples'];
  if (schema['readOnly'] === true) out.readOnly = true;
  return Object.keys(out).length === 0 ? null : out;
};

/** The part of the document a JSON Pointer fragment names (RFC 6901 §6), or `undefined` where there is none. */
const resolve = (root: unknown, fragment: string): unknown => {
  let at = root;
  for (const part of fragment.split('/').slice(1)) {
    const key = decodeURIComponent(part).replaceAll('~1', '/').replaceAll('~0', '~');
    if (Array.isArray(at)) at = /^(?:0|[1-9]\d*)$/u.test(key) ? (at[Number(key)] as unknown) : undefined;
    // eslint-disable-next-line conventions/consistent-existence-index-check -- own keys only: a pointer to "constructor" names nothing the document wrote
    else at = isJson(at) && Object.hasOwn(at, key) ? at[key] : undefined;
  }
  return at;
};

/**
 * The schema a `$ref` names, as a lazy schema made once for each pointer: that is what lets a
 * schema name itself. Only a pointer into this document is read; a reference to another document,
 * or to an anchor, is a finding and accepts every value.
 */
const referenced = (reader: Reader, ref: unknown, path: string): Node => {
  if (typeof ref !== 'string') invalid(path, `"$ref" is ${shown(ref)}, not a string`);
  if (ref !== '#' && !ref.startsWith('#/')) {
    lose(reader, path, '$ref', `the reference ${JSON.stringify(ref)} is not a JSON Pointer into this document, and is not followed: the schema accepts any value there`);
    return unknown();
  }
  const known = reader.refs.get(ref);
  if (known !== undefined) return known;
  const target = resolve(reader.root, ref.slice(1));
  if (target === undefined) invalid(path, `"$ref" ${JSON.stringify(ref)} names nothing in the document`);
  let made: Node | undefined;
  // A reference is read when it is first used, from a fresh stack: the object it names may be one being read, which is how a schema names itself.
  const node = lazy(() => (made ??= read({ ...reader, inside: new Set() }, target, ref.slice(1))) as AnySchema);
  reader.refs.set(ref, node);
  return node;
};

function read(reader: Reader, schema: unknown, path: string): Node {
  if (schema === true) return unknown();
  if (schema === false) return never();
  if (!isJson(schema)) invalid(path, `a schema is an object or a boolean, and this is ${Array.isArray(schema) ? 'an array' : shown(schema)}`);
  if (reader.inside.has(schema)) invalid(path, 'the document holds itself without a $ref, so it has no end');
  reader.inside.add(schema);
  try {
    for (const keyword of UNREAD) {
      if (schema[keyword] !== undefined) lose(reader, path, keyword, `the keyword "${keyword}" is not read: the schema accepts more than the document`);
    }
    const ref = schema['$ref'] === undefined ? null : referenced(reader, schema['$ref'], path);
    // Before 2020-12, and in OpenAPI 3.0, a `$ref` is the whole of its schema: what stands beside it is ignored.
    const parts = ref !== null && reader.draft !== '2020-12' ? [ref] : [...(ref === null ? [] : [ref]), typed(reader, schema, path), ...applied(reader, schema, path)];
    const out = all(parts);
    const about = meta(schema);
    return about === null ? out : annotate(out as AnySchema, about);
  } finally {
    reader.inside.delete(schema);
  }
}

/** The dialect a document says it is written in, by its `$schema`; a dialect this reader does not know is read as 2020-12, with a finding. */
const dialectOf = (reader: Pick<Reader, 'findings'>, document: unknown): ImportDraft => {
  const uri = isJson(document) ? document['$schema'] : undefined;
  if (uri === undefined) return '2020-12';
  if (typeof uri === 'string' && uri.includes('draft-07')) return 'draft-07';
  if (typeof uri === 'string' && uri.includes('2020-12')) return '2020-12';
  reader.findings.push({ path: '', keyword: '$schema', message: `the dialect ${shown(uri)} is not one this library reads: the document is read as 2020-12` });
  return '2020-12';
};

const DRAFTS: ReadonlySet<unknown> = /* @__PURE__ */ new Set(['2020-12', 'draft-07', 'openapi-3.0']);

/**
 * A schema of this library from a JSON Schema document (2020-12 or draft-07) or an OpenAPI 3.0
 * Schema Object, and every place where it may give another verdict than the document. A document
 * that is not JSON Schema is refused with a `TypeError` and a `fix:` line.
 *
 * Only pointers into the document itself are followed by `$ref`: bundle a document that spans
 * files first. The schema is data like any other, so it can be emitted as code with `emit`.
 */
const fromJsonSchema = (document: unknown, options: ImportOptions = {}): Imported => {
  const findings: ImportFinding[] = [];
  if (options.draft !== undefined && !DRAFTS.has(options.draft)) throw new TypeError(`cannot read the dialect ${shown(options.draft)}. fix: ask for '2020-12', 'draft-07' or 'openapi-3.0'`);
  const draft = options.draft ?? dialectOf({ findings }, document);
  const formats = new Map([...FORMATS, ...Object.entries(options.formats ?? {})]);
  const reader: Reader = { root: document, draft, findings, formats, refs: new Map(), inside: new Set() };
  const schema = read(reader, document, '') as Schema<unknown>;
  // Every reference is read now, not at the first `check`: a document that is wrong behind a `$ref` is refused here, and its findings are in this list.
  const done = new Set<Node>();
  for (let more = [...reader.refs.values()]; more.length > 0; more = [...reader.refs.values()].filter((ref) => !done.has(ref))) {
    for (const ref of more) {
      done.add(ref);
      (ref.get as () => Node)();
    }
  }
  return { schema, findings };
};

export { fromJsonSchema, type ImportDraft, type Imported, type ImportFinding, type ImportOptions };
