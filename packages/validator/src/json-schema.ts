import { type Kind, type Node, type Rule, type Schema } from './schema.js';

/**
 * The JSON Schema writer (spec.md R2, R10, R13): a node as a JSON Schema document, and beside it
 * every place where the document says less than the node does. Nothing is dropped silently
 * (intent.md Z10): a rule or a map of the caller's, a kind JSON has no value for, a behaviour only
 * `parse` has, each is a finding with a pointer to where in the document it would have stood.
 *
 * The document describes what `check` accepts of a JSON value. It runs nothing the schema carries
 * but the function a lazy schema names itself by: no test, no map, no getter and no `toJSON`.
 */

type Draft = '2020-12' | 'draft-07';

interface ExportOptions {
  /** The dialect to write. They differ in how a tuple is written and where shared schemas are kept. */
  readonly draft?: Draft;
}

/** A JSON Schema, as plain data. */
type JsonSchema = Readonly<Record<string, unknown>>;

/** One place where the document says less than the schema. */
interface Finding {
  /** JSON Pointer into the document, to the schema that stands for the node; `''` is the root. */
  readonly path: string;
  /**
   * What was lost: `not-json`, `custom`, `refine`, `transform`, `format`, `pattern`, `coerce`,
   * `strip`, `multipleOf`, `default`, `enum`, `tag`, `meta`, `pipe`, `preprocess`.
   */
  readonly keyword: string;
  readonly message: string;
}

interface Exported {
  readonly schema: JsonSchema;
  readonly findings: Finding[];
}

interface Dialect {
  readonly uri: string;
  /** The keyword shared schemas are kept under. */
  readonly defs: string;
  /** Whether a tuple's items are `prefixItems` and its rest `items`, or `items` and `additionalItems`. */
  readonly prefix: boolean;
}

const DIALECTS: Readonly<Record<Draft, Dialect>> = {
  '2020-12': { uri: 'https://json-schema.org/draft/2020-12/schema', defs: '$defs', prefix: true },
  'draft-07': { uri: 'http://json-schema.org/draft-07/schema#', defs: 'definitions', prefix: false },
};

interface Writer {
  readonly dialect: Dialect;
  readonly findings: Finding[];
  /** The name of each schema a lazy node pointed at, and what was written for it. */
  readonly names: Map<Node, string>;
  readonly shared: Map<string, JsonSchema>;
}

/** What no JSON value matches. */
const NOTHING: JsonSchema = Object.freeze({ not: {} });

const lose = (writer: Writer, path: string, keyword: string, message: string): void => {
  writer.findings.push({ path, keyword, message });
};

/**
 * A value for a message, without running anything of it: a string in quotes, an object or a
 * function by the name of its type, which is all that can be said of one without calling its `toString`.
 */
const shown = (value: unknown): string => {
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'bigint') return `${String(value)}n`;
  return (typeof value === 'object' && value !== null) || typeof value === 'function' ? `a value of the type ${typeof value}` : String(value);
};

/** A key, a tag or a name as the string it has to be. A node is data and may have been built by hand: what is not a string is refused, not turned into one. */
const named = (value: unknown): string => {
  if (typeof value !== 'string') {
    throw new TypeError(`cannot export the key or name ${shown(value)}: it is not a string. fix: build the schema with the builders`);
  }
  return value;
};

const token = (key: unknown): string => `/${named(key).replaceAll('~', '~0').replaceAll('/', '~1')}`;

/** A bound as a number, refused in the same way when it is not one. */
const bound = (value: unknown): number => {
  if (typeof value !== 'number') {
    throw new TypeError(`cannot export the bound ${shown(value)}: it is not a number. fix: build the schema with the builders, or give the node numeric bounds`);
  }
  return value;
};

/** The two bounds of a length, under the keywords for them; a bound nobody set is not written. Each is held to be a number before it is compared, since comparing runs what an object carries. */
const sized = (schema: Node, low: string, high: string): JsonSchema => {
  const [min, max] = [bound(schema.min), bound(schema.max)];
  return { ...(min > 0 && { [low]: min }), ...(max < Number.MAX_VALUE && { [high]: max }) };
};

/** Stands for a value that is no JSON data. */
const NOT_DATA = Symbol('not JSON data');

/** The members of a plain object or an array as JSON data, read by their descriptors so that no getter runs. */
const members = (value: object, inside: ReadonlySet<unknown>): unknown => {
  const out = Object.entries(Object.getOwnPropertyDescriptors(value))
    // An array's `length` is not enumerable, so what is left of one is its items.
    .filter(([, slot]) => slot.enumerable === true)
    .map(([key, slot]) => [key, 'value' in slot ? data(slot.value, inside) : NOT_DATA] as const);
  if (out.some(([, member]) => member === NOT_DATA)) return NOT_DATA;
  return Array.isArray(value) ? out.map(([, member]) => member) : Object.fromEntries(out);
};

/**
 * A value as JSON data, or `NOT_DATA`: null, a string, a boolean, a finite number, or an array or
 * plain object of those, copied. Nothing of the value is run, and one that holds itself is refused.
 */
function data(value: unknown, inside: ReadonlySet<unknown>): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : NOT_DATA;
  // eslint-disable-next-line secure-coding/no-improper-type-validation -- null was answered on the first line, and an array is wanted here
  if (typeof value !== 'object' || inside.has(value)) return NOT_DATA;
  const proto: unknown = Object.getPrototypeOf(value);
  if (proto !== null && proto !== Object.prototype && !Array.isArray(value)) return NOT_DATA;
  // An array with a hole has fewer members than its length, and JSON has no hole.
  if (Array.isArray(value) && Object.keys(value).length !== value.length) return NOT_DATA;
  return members(value, new Set(inside).add(value));
}

const NONE: ReadonlySet<unknown> = new Set();

/** A pattern's source, for `pattern`. JSON Schema has no flags: any but `u` and `d`, which change no verdict here, is a finding. */
const source = (writer: Writer, pattern: unknown, path: string): string => {
  if (!(pattern instanceof RegExp)) {
    throw new TypeError('cannot export a pattern that is not a RegExp. fix: build the schema with `string({ pattern })`');
  }
  const flags = pattern.flags.replaceAll(/[du]/gu, '');
  if (flags !== '') lose(writer, path, 'pattern', `the pattern ${shown(pattern.source)} has the flags "${flags}", which JSON Schema cannot carry: the document has the pattern without them`);
  return pattern.source;
};

const string = (writer: Writer, schema: Node, path: string): JsonSchema => {
  const patterns: string[] = [];
  if (schema.pattern !== null) patterns.push(source(writer, schema.pattern, path));
  const rule = schema.rule as Rule | null;
  if (rule !== null && rule.pattern !== null) patterns.push(source(writer, rule.pattern, path));
  const isNamed = rule !== null && rule.pattern === null;
  if (isNamed) lose(writer, path, 'format', `the format ${shown(rule.name)} is a function, which JSON Schema cannot carry: the document names it, and a validator that does not know the name will not check it`);
  const [first, second] = patterns;
  return {
    type: 'string',
    ...sized(schema, 'minLength', 'maxLength'),
    ...(first !== undefined && second === undefined && { pattern: first }),
    ...(second !== undefined && { allOf: patterns.map((pattern) => ({ pattern })) }),
    ...(isNamed && { format: named(rule.name) }),
  };
};

/** `parse` reads this value from a string; the document describes what `check` accepts, which is the value itself. */
const coerced = (writer: Writer, schema: Node, path: string): void => {
  if (schema.coerce) lose(writer, path, 'coerce', 'parse reads this value from a string, and JSON Schema has no coercion: the document describes the value after it is read');
};

const number = (writer: Writer, schema: Node, path: string): JsonSchema => {
  coerced(writer, schema, path);
  const [min, max, above, below, step] = [schema.min, schema.max, schema.above, schema.below, schema.step].map(bound) as [number, number, number, number, number];
  if (!Number.isInteger(step)) {
    lose(writer, path, 'multipleOf', `a multiple of ${String(step)} is read here within one rounding error, so that 0.3 is a multiple of 0.1; a validator that tests the bare remainder refuses it`);
  }
  return {
    type: schema.int ? 'integer' : 'number',
    ...(min > -Number.MAX_VALUE && { minimum: min }),
    ...(max < Number.MAX_VALUE && { maximum: max }),
    ...(above > Number.NEGATIVE_INFINITY && { exclusiveMinimum: above }),
    ...(below < Number.POSITIVE_INFINITY && { exclusiveMaximum: below }),
    ...(step !== 0 && { multipleOf: step }),
  };
};

const boolean = (writer: Writer, schema: Node, path: string): JsonSchema => {
  coerced(writer, schema, path);
  return { type: 'boolean' };
};

/** A kind, or a value, that no JSON document holds: the document refuses every value there, and says so here. */
const notJson = (writer: Writer, path: string, what: string): JsonSchema => {
  lose(writer, path, 'not-json', `${what} is not a JSON value: the document accepts nothing here`);
  return NOTHING;
};

const literal = (writer: Writer, schema: Node, path: string): JsonSchema => {
  const { value } = schema;
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || Number.isFinite(value)) return { const: value };
  return notJson(writer, path, `the literal ${shown(value)}`);
};

const member = (writer: Writer, schema: Node, path: string): JsonSchema => {
  const all = [...(schema.values as ReadonlySet<unknown>)];
  const kept = all.filter((value) => value === null || typeof value === 'string' || typeof value === 'boolean' || Number.isFinite(value));
  if (kept.length < all.length) lose(writer, path, 'enum', `${String(all.length - kept.length)} of the enum's members are not JSON values, and are left out`);
  return { enum: kept };
};

const array = (writer: Writer, schema: Node, path: string): JsonSchema => ({
  type: 'array',
  items: write(writer, schema.item as Node, `${path}/items`),
  ...sized(schema, 'minItems', 'maxItems'),
});

/**
 * A tuple is closed (parity.md decision 12), so the keyword for what follows its items is always
 * written: `false`, or the schema for the rest. The two drafts name the two keywords differently,
 * and neither allows an empty list of items.
 */
const tuple = (writer: Writer, schema: Node, path: string): JsonSchema => {
  const fields = schema.fields as readonly Node[];
  const [first, rest] = writer.dialect.prefix ? ['prefixItems', 'items'] : ['items', 'additionalItems'];
  if (fields.length === 0) return schema.item === null ? { type: 'array', maxItems: 0 } : { type: 'array', items: write(writer, schema.item, `${path}/items`) };
  return {
    type: 'array',
    [first as string]: fields.map((field, index) => write(writer, field, `${path}/${first as string}/${String(index)}`)),
    [rest as string]: schema.item === null ? false : write(writer, schema.item, `${path}/${rest as string}`),
    minItems: fields.length,
  };
};

const object = (writer: Writer, schema: Node, path: string): JsonSchema => {
  const keys = schema.keys as readonly string[];
  const fields = schema.fields as readonly Node[];
  const required = keys.filter((_, index) => (fields[index] as Node).optional === false);
  if (schema.unknown === 'strip') lose(writer, path, 'strip', 'parse leaves out the keys this object does not name, and JSON Schema has no such thing: the document allows them, as check does');
  return {
    type: 'object',
    properties: Object.fromEntries(keys.map((key, index) => [named(key), write(writer, fields[index] as Node, `${path}/properties${token(key)}`)])),
    ...(required.length > 0 && { required }),
    ...(schema.unknown === 'strict' && { additionalProperties: false }),
    ...(schema.item !== null && { additionalProperties: write(writer, schema.item, `${path}/additionalProperties`) }),
  };
};

const record = (writer: Writer, schema: Node, path: string): JsonSchema => ({
  type: 'object',
  ...(schema.key !== null && { propertyNames: write(writer, schema.key, `${path}/propertyNames`) }),
  additionalProperties: write(writer, schema.item as Node, `${path}/additionalProperties`),
});

/** Whether a case already says, in its own shape, that its tag is this value: then the case stands as it is. */
const says = (one: Node, tag: string, value: unknown): boolean => {
  if (one.kind !== 'object') return false;
  const field = (one.fields as readonly Node[])[(one.keys as readonly string[]).indexOf(tag)];
  return field?.kind === 'literal' && field.value === value && field.optional === false;
};

/**
 * One case is picked by the tag and no other is tried, which is `oneOf` over cases that each pin
 * the tag: a case that does not pin it itself is written beside the schema that does.
 */
const cases = (writer: Writer, schema: Node, path: string): JsonSchema => {
  const tag = named(schema.tag);
  const oneOf: JsonSchema[] = [];
  for (const [value, one] of schema.cases as ReadonlyMap<unknown, Node>) {
    const at = `${path}/oneOf/${String(oneOf.length)}`;
    if (typeof value !== 'string' && typeof value !== 'boolean' && !Number.isFinite(value)) {
      lose(writer, path, 'tag', `the case under the tag ${shown(value)} is left out: that tag is not a JSON value`);
    } else if (says(one, tag, value)) oneOf.push(write(writer, one, at));
    else oneOf.push({ allOf: [{ type: 'object', properties: { [tag]: { const: value } }, required: [tag] }, write(writer, one, `${at}/allOf/1`)] });
  }
  return oneOf.length === 0 ? NOTHING : { oneOf };
};

const orNull = (writer: Writer, schema: Node, path: string): JsonSchema => ({ anyOf: [write(writer, schema.item as Node, `${path}/anyOf/0`), { type: 'null' }] });

/** The members of a union or an intersection under a keyword. JSON Schema allows neither keyword an empty list. */
const listed = (writer: Writer, schema: Node, at: { path: string; keyword: string; none: JsonSchema }): JsonSchema => {
  const fields = schema.fields as readonly Node[];
  return fields.length === 0 ? at.none : { [at.keyword]: fields.map((field, index) => write(writer, field, `${at.path}/${at.keyword}/${String(index)}`)) };
};

/**
 * A lazy schema is a reference to what it names, written once under a name of its own: that is
 * what lets a schema that names itself be a finite document.
 */
const later = (writer: Writer, schema: Node): JsonSchema => {
  const target = (schema.get as () => Node)();
  let name = writer.names.get(target);
  if (name === undefined) {
    name = `s${String(writer.names.size)}`;
    writer.names.set(target, name);
    writer.shared.set(name, write(writer, target, `/${writer.dialect.defs}/${name}`));
  }
  return { $ref: `#/${writer.dialect.defs}/${name}` };
};

const custom = (writer: Writer, schema: Node, path: string): JsonSchema => {
  lose(writer, path, 'custom', `the custom type ${shown((schema.rule as Rule).name)} is a function, which JSON Schema cannot carry: the document accepts any value here`);
  return {};
};

const refined = (writer: Writer, schema: Node, path: string): JsonSchema => {
  const at = (schema.keys as readonly string[]).map((key) => token(key)).join('');
  lose(writer, path, 'refine', `the rule ${shown((schema.rule as Rule).name)}${at === '' ? '' : `, reported at ${at},`} is a function, which JSON Schema cannot carry: the document has the schema without it`);
  return write(writer, schema.item as Node, path);
};

const mapped = (writer: Writer, schema: Node, path: string): JsonSchema => {
  lose(writer, path, 'transform', 'the transform is a function, which JSON Schema cannot carry: the document describes what goes in, not what parse hands out');
  return write(writer, schema.item as Node, path);
};

/**
 * A count of keys is `minProperties` and `maxProperties`, which bind only an object: beside an
 * object's or a record's own keywords they say all there is to say, and beside anything else the
 * document also has to ask for an object, as `check` does.
 */
const counted = (writer: Writer, schema: Node, path: string): JsonSchema => {
  const bounds = sized(schema, 'minProperties', 'maxProperties');
  const inner = schema.item as Node;
  if (inner.kind === 'object' || inner.kind === 'record') return { ...write(writer, inner, path), ...bounds };
  return { allOf: [write(writer, inner, `${path}/allOf/0`), { type: 'object', ...bounds }] };
};

const piped = (writer: Writer, schema: Node, path: string): JsonSchema => {
  lose(writer, path, 'pipe', 'the second schema of the pipe reads what parse makes of the first, which JSON Schema cannot say: the document describes what goes in, the first schema alone');
  return write(writer, schema.item as Node, path);
};

const before = (writer: Writer, schema: Node, path: string): JsonSchema => {
  lose(writer, path, 'preprocess', 'parse runs a function on the value before it is validated, which JSON Schema cannot carry: the document describes the value after the function has run');
  return write(writer, schema.item as Node, path);
};

const WRITERS: Readonly<Record<Kind, (writer: Writer, schema: Node, path: string) => JsonSchema>> = {
  string,
  number,
  boolean,
  literal,
  enum: member,
  array,
  object,
  discriminated: cases,
  unknown: () => ({}),
  never: () => NOTHING,
  record,
  tuple,
  nullable: orNull,
  // `undefined` is not a JSON value, and a key that may be absent is not required: among JSON values nullish is nullable.
  nullish: orNull,
  union: (writer, schema, path) => listed(writer, schema, { path, keyword: 'anyOf', none: NOTHING }),
  intersection: (writer, schema, path) => listed(writer, schema, { path, keyword: 'allOf', none: {} }),
  lazy: later,
  custom,
  bigint: (writer, _, path) => notJson(writer, path, 'a bigint'),
  date: (writer, _, path) => notJson(writer, path, 'a Date'),
  type: (writer, schema, path) => notJson(writer, path, `a ${named(schema.value)}`),
  instance: (writer, _, path) => notJson(writer, path, 'an instance of a class'),
  refine: refined,
  transform: mapped,
  nan: (writer, _, path) => notJson(writer, path, 'NaN'),
  map: (writer, _, path) => notJson(writer, path, 'a Map'),
  set: (writer, _, path) => notJson(writer, path, 'a Set'),
  count: counted,
  // The words a schema has for its issues change no verdict: the document is the schema's own.
  message: (writer, schema, path) => write(writer, schema.item as Node, path),
  pipe: piped,
  preprocess: before,
};

/** A schema with more keywords beside it. In draft-07 a `$ref` silences its siblings, so there it is put under `allOf`. */
const beside = (writer: Writer, schema: JsonSchema, more: JsonSchema): JsonSchema => {
  if (Object.keys(more).length === 0) return schema;
  return '$ref' in schema && !writer.dialect.prefix ? { allOf: [schema], ...more } : { ...schema, ...more };
};

/** One annotation as JSON data under its keyword; one that is no JSON data is a finding, and is left out. */
const noted = (writer: Writer, path: string, keyword: string, value: unknown): JsonSchema => {
  if (value === undefined) return {};
  const copy = data(value, NONE);
  if (copy !== NOT_DATA) return { [keyword]: copy };
  lose(writer, path, keyword === 'default' ? 'default' : 'meta', `the ${keyword} is not JSON data, and is left out`);
  return {};
};

/** What a schema says about itself and its default, which validate nothing: `title`, `description`, `examples`, `default`. */
const annotations = (writer: Writer, schema: Node, path: string): JsonSchema => ({
  ...noted(writer, path, 'title', schema.meta?.title),
  ...noted(writer, path, 'description', schema.meta?.description),
  ...noted(writer, path, 'examples', schema.meta?.examples),
  ...noted(writer, path, 'default', schema.default),
});

function write(writer: Writer, schema: Node, path: string): JsonSchema {
  // eslint-disable-next-line conventions/consistent-existence-index-check -- Own kinds only: a node whose kind is "constructor" must not be written by what every object inherits
  if (typeof schema.kind !== 'string' || !Object.hasOwn(WRITERS, schema.kind)) {
    throw new TypeError(`cannot export a node of the kind ${shown(schema.kind)}: there is no such kind. fix: build the schema with the builders`);
  }
  return beside(writer, WRITERS[schema.kind](writer, schema, path), annotations(writer, schema, path));
}

/**
 * The schema as a JSON Schema document, and every place where the document says less than the
 * schema: `findings` is empty exactly when a JSON value passes the document if and only if `check`
 * accepts it.
 *
 * A node that no builder makes is refused with a `TypeError` and a `fix:` line, never half written.
 */
const toJsonSchema = <T>(schema: Schema<T, unknown>, options: ExportOptions = {}): Exported => {
  const { draft = '2020-12' } = options;
  // eslint-disable-next-line conventions/consistent-existence-index-check -- Own drafts only, for the same reason
  if (typeof draft !== 'string' || !Object.hasOwn(DIALECTS, draft)) {
    throw new TypeError(`cannot export to the draft ${shown(draft)}. fix: ask for '2020-12' or 'draft-07'`);
  }
  const writer: Writer = { dialect: DIALECTS[draft], findings: [], names: new Map(), shared: new Map() };
  try {
    const body = write(writer, schema, '');
    const shared = writer.shared.size === 0 ? {} : { [writer.dialect.defs]: Object.fromEntries(writer.shared) };
    return { schema: beside(writer, body, { $schema: writer.dialect.uri, ...shared }), findings: writer.findings };
  } catch (error) {
    if (error instanceof TypeError && error.message.includes(' fix: ')) throw error;
    throw new TypeError(`cannot export this schema to JSON Schema: a node in it is not what a builder makes (${error instanceof Error ? error.message : shown(error)}). fix: build the schema with the builders`, { cause: error });
  }
};

export { type Draft, type Exported, type ExportOptions, type Finding, type JsonSchema, toJsonSchema };
