import { type Kind, type Node } from './schema.js';

/**
 * The type a schema validates, as TypeScript text (gap A-20261118-validator-emit-untyped): what
 * `emit` writes after `v is` in a typed guard, and what `apicontract gen validator` writes beside
 * each validator as `export type`.
 *
 * It says, from the node, what `Infer` says from the builder's types (spec.md R8), kind by kind, so
 * that a schema read from a JSON Schema document at run time gets the type an authored one has. A
 * kind whose static type the caller states (a custom type, an instance of a class) is as wide as the
 * node can say: never narrower than what the guard accepts, so the guard never claims what it has
 * not checked.
 *
 * A schema that names itself is the one place the text cannot be written inline: each lazy schema
 * met again inside itself gets an alias of its own, `<prefix>_<n>`, declared beside the type.
 */

interface TypeText {
  /** The type, with each alias by its name. */
  readonly text: string;
  /** The alias of each schema that names itself, by name, in the order they are finished. */
  readonly aliases: ReadonlyMap<string, string>;
}

/** A name TypeScript can declare a type under. */
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/u;

/** How tightly a type's text binds: what it needs brackets around it to stand where. */
const FUNCTION = 0;
const UNION = 1;
const BOTH = 2;
const TIGHT = 3;

interface Text {
  readonly text: string;
  readonly level: number;
}

interface Typer {
  readonly prefix: string;
  readonly aliases: Map<string, string>;
  /** The alias of each schema that named itself. */
  readonly names: Map<Node, string>;
  /** The schemas a lazy one names that are being written: one met again is one that names itself. */
  readonly open: Set<Node>;
  /** The text of each schema a lazy one names, written once. */
  readonly done: Map<Node, Text>;
}

const tight = (text: string): Text => ({ text, level: TIGHT });

/** The text, in brackets where it binds less tightly than the place it stands needs. */
const at = (type: Text, level: number): string => (type.level >= level ? type.text : `(${type.text})`);

/** Types joined by `|` or `&`; `none` is what no type at all is. */
const joined = (types: readonly Text[], operator: ' | ' | ' & ', none: string): Text => {
  const [only] = types;
  if (types.length === 0) return tight(none);
  if (types.length === 1) return only as Text;
  const level = operator === ' | ' ? UNION : BOTH;
  return { text: types.map((type) => at(type, level)).join(operator), level };
};

const HEX = 16;
const UNIT = 4;

/**
 * Text made safe wherever it ends up: `<`, `>` and `/` cannot close a `<script>` or open a comment,
 * the two Unicode line separators cannot end a line in an older parser, and `«` and `»`, which mark
 * the emitter's annotations, are never a value's. Each is escaped as a JavaScript string escapes it.
 */
const escaped = (text: string): string => text.replaceAll(/[<>/\u2028\u2029«»]/gu, (unit) => `\\u${(unit.codePointAt(0) as number).toString(HEX).padStart(UNIT, '0')}`);

/** A string as the text of a string literal type, escaped as `emit` escapes one. */
const quoted = (value: string): string => escaped(JSON.stringify(value));

/** A value as the literal type of it; a number no literal type can write (`NaN`, the infinities) is `number`. */
const literalOf = (value: unknown): string => {
  if (typeof value === 'string') return quoted(value);
  if (typeof value === 'bigint') return `${String(value)}n`;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'number';
  return value === null || typeof value === 'boolean' ? String(value) : 'undefined';
};

/** What `typeof` names, as the type of the values it names. */
const TYPEOF: ReadonlyMap<unknown, Text> = new Map<unknown, Text>([
  ['string', tight('string')],
  ['number', tight('number')],
  ['bigint', tight('bigint')],
  ['boolean', tight('boolean')],
  ['symbol', tight('symbol')],
  ['undefined', tight('undefined')],
  ['object', { text: 'object | null', level: UNION }],
  ['function', { text: '(...args: never[]) => unknown', level: FUNCTION }],
]);

const field = (typer: Typer, key: string, schema: Node): string => {
  const own = type(typer, schema);
  if (schema.optional === false) return `${quoted(key)}: ${own.text}`;
  // Optional reads `undefined` as absent, so the key may hold it; an exact key may not (parity.md decision 2).
  const undefinedToo = schema.optional === true && !/(?:^|\| )(?:undefined|unknown)$/u.test(own.text);
  return `${quoted(key)}?: ${undefinedToo ? `${at(own, UNION)} | undefined` : own.text}`;
};

const object = (typer: Typer, schema: Node): Text => {
  const fields = schema.fields as readonly Node[];
  const keys = schema.keys as readonly string[];
  const shape = tight(keys.length === 0 ? '{}' : `{ ${keys.map((key, index) => field(typer, key, fields[index] as Node)).join('; ')} }`);
  if (schema.item === null) return shape;
  const rest = tight(`Readonly<Record<string, ${type(typer, schema.item).text}>>`);
  return keys.length === 0 ? rest : joined([shape, rest], ' & ', 'unknown');
};

const record = (typer: Typer, schema: Node): Text => {
  const value = inner(typer, schema).text;
  const key = schema.key === null ? tight('string') : type(typer, schema.key);
  // `RecordOf`: any string as a key, or some of the keys an enum names and no other.
  return tight(key.text === 'string' ? `Record<string, ${value}>` : `{ [K in ${at(key, BOTH)} & string]?: ${value} }`);
};

const tuple = (typer: Typer, schema: Node): Text => {
  const items = (schema.fields as readonly Node[]).map((item) => type(typer, item).text);
  const rest = schema.item === null ? [] : [`...${at(type(typer, schema.item), TIGHT)}[]`];
  return tight(`[${[...items, ...rest].join(', ')}]`);
};

/**
 * A lazy schema: the text of what it names, written once. Met again while that text is being
 * written, it names itself, and stands by an alias declared beside the type.
 */
const later = (typer: Typer, schema: Node): Text => {
  const target = (schema.get as () => Node)();
  const name = typer.names.get(target);
  if (name !== undefined) return tight(name);
  const known = typer.done.get(target);
  if (known !== undefined) return known;
  if (typer.open.has(target)) {
    const alias = `${typer.prefix}_${String(typer.names.size)}`;
    typer.names.set(target, alias);
    return tight(alias);
  }
  typer.open.add(target);
  const text = type(typer, target);
  typer.open.delete(target);
  const alias = typer.names.get(target);
  if (alias === undefined) {
    typer.done.set(target, text);
    return text;
  }
  typer.aliases.set(alias, text.text);
  return tight(alias);
};

/** The type of what a schema that wraps another accepts: the wrapped schema's, since every one of these accepts what it wraps or less. */
const inner = (typer: Typer, schema: Node): Text => type(typer, schema.item as Node);

const members = (typer: Typer, schema: Node): Text[] => (schema.fields as readonly Node[]).map((member) => type(typer, member));

const WRITERS: Readonly<Record<Kind, (typer: Typer, schema: Node) => Text>> = {
  string: () => tight('string'),
  number: () => tight('number'),
  boolean: () => tight('boolean'),
  literal: (_, schema) => tight(literalOf(schema.value)),
  enum: (_, schema) => joined([...(schema.values as ReadonlySet<unknown>)].map((value) => tight(literalOf(value))), ' | ', 'never'),
  array: (typer, schema) => tight(`${at(inner(typer, schema), TIGHT)}[]`),
  object,
  discriminated: (typer, schema) => joined([...(schema.cases as ReadonlyMap<unknown, Node>).values()].map((one) => type(typer, one)), ' | ', 'never'),
  unknown: () => tight('unknown'),
  never: () => tight('never'),
  record,
  tuple,
  nullable: (typer, schema) => joined([inner(typer, schema), tight('null')], ' | ', 'never'),
  nullish: (typer, schema) => joined([inner(typer, schema), tight('null'), tight('undefined')], ' | ', 'never'),
  union: (typer, schema) => joined(members(typer, schema), ' | ', 'never'),
  intersection: (typer, schema) => joined(members(typer, schema), ' & ', 'unknown'),
  lazy: later,
  // The caller states a custom type's type; the node knows only that its test passed.
  custom: () => tight('unknown'),
  bigint: () => tight('bigint'),
  date: () => tight('Date'),
  type: (_, schema) => TYPEOF.get(schema.value) ?? tight('unknown'),
  // The class is a value, which text cannot name: an instance of one is an object, and a promise is a promise.
  instance: (_, schema) => tight(schema.value === Promise ? 'Promise<unknown>' : 'object'),
  refine: inner,
  transform: inner,
  nan: () => tight('number'),
  map: (typer, schema) => tight(`Map<${type(typer, schema.key as Node).text}, ${inner(typer, schema).text}>`),
  set: (typer, schema) => tight(`Set<${inner(typer, schema).text}>`),
  count: inner,
  message: inner,
  pipe: inner,
  preprocess: inner,
  refineAsync: inner,
  transformAsync: inner,
  // A template's type is a template literal type, which this text does not spell out: every value of it is a string.
  template: () => tight('string'),
  startsWith: inner,
  endsWith: inner,
  includes: inner,
  contains: inner,
  unique: inner,
  // Every value the schema refuses: no type says that.
  not: () => tight('unknown'),
  oneOf: (typer, schema) => joined(members(typer, schema), ' | ', 'never'),
  catch: inner,
  codec: inner,
};

function type(typer: Typer, schema: Node): Text {
  // eslint-disable-next-line conventions/consistent-existence-index-check -- Own kinds only: a node whose kind is "constructor" must not be written by what every object inherits
  if (typeof schema.kind !== 'string' || !Object.hasOwn(WRITERS, schema.kind)) {
    throw new TypeError(`cannot write the type of a node of the kind ${typeof schema.kind === 'string' ? quoted(schema.kind) : `a value of the type ${typeof schema.kind}`}: there is no such kind. fix: build the schema with the builders`);
  }
  // eslint-disable-next-line secure-coding/detect-object-injection -- FP ofri-peretz/eslint#1547: a call through a module-built const table, after an Object.hasOwn guard
  return WRITERS[schema.kind](typer, schema);
}

/**
 * The TypeScript type of what the schema accepts, and the aliases it needs: a schema that names
 * itself stands by the alias `<prefix>_<n>`, so declare each beside the type, as
 * `type <name> = <text>;`. `prefix` is `T` unless given; give the name the type is declared under,
 * so that two types in one module have aliases of their own.
 */
const typeOf = (schema: Node, prefix = 'T'): TypeText => {
  if (!IDENTIFIER.test(prefix)) throw new TypeError(`cannot name the aliases of a type ${quoted(String(prefix))}: it is not an identifier. fix: give a name of letters, digits, _ and $ that does not start with a digit`);
  const typer: Typer = { prefix, aliases: new Map(), names: new Map(), open: new Set(), done: new Map() };
  const { text } = type(typer, schema);
  return { text, aliases: typer.aliases };
};

export { escaped, IDENTIFIER, typeOf, type TypeText };
