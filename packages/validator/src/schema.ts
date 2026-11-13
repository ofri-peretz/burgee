/**
 * A schema is data (spec.md R1): every builder returns one frozen node, a kind and its constraints.
 * `check`, `issues`, `parse`, the code emitter and, later, the JSON Schema writer all read that node.
 *
 * Every node has the same members in the same order, whatever its kind, so the engine reading
 * them sees one object shape.
 */

import {
  isAnything,
  isArray,
  isBigint,
  isBoolean,
  isCase,
  isClosed,
  isCustom,
  isDate,
  isEvery,
  isInstance,
  isLater,
  isLiteral,
  isMember,
  isNothing,
  isNullable,
  isNullish,
  isNumber,
  isObject,
  isRecord,
  isString,
  isTuple,
  isTypeOf,
  isUnion,
} from './check.js';

export type Check = (schema: Node, value: unknown) => boolean;

export type Kind =
  | 'string'
  | 'number'
  | 'boolean'
  | 'literal'
  | 'enum'
  | 'array'
  | 'object'
  | 'discriminated'
  | 'unknown'
  | 'never'
  | 'record'
  | 'tuple'
  | 'nullable'
  | 'nullish'
  | 'union'
  | 'intersection'
  | 'lazy'
  | 'custom'
  | 'bigint'
  | 'date'
  | 'type'
  | 'instance';

/** A predicate a node names (spec.md R10). It is the only kind of function a node may hold, beside `check` and `get`. */
export type Test = (value: unknown) => boolean;

/** A named rule, as data (spec.md R11): a string's format, or the whole of a custom type. One of `pattern` and `test` is set. */
export interface Rule {
  readonly name: string;
  readonly pattern: RegExp | null;
  readonly test: Test | null;
}

/** What a schema says about itself. Carried on the node and read back; validation ignores it. */
export interface Meta {
  readonly title?: string;
  readonly description?: string;
  readonly examples?: readonly unknown[];
}

/** What an object does with a key its shape does not name. `strip` is `keep` to `check`: only `parse` leaves the key out. */
export type Unknown = 'keep' | 'strict' | 'strip';

export interface Node {
  readonly kind: Kind;
  /** The kind's own check, put here by the builder so that a bundle carries only the kinds it builds. It captures nothing. */
  readonly check: Check;
  /** Length for a string or an array, value for a number. */
  readonly min: number;
  readonly max: number;
  /** A number's exclusive bounds: the infinities when there are none. */
  readonly above: number;
  readonly below: number;
  /** What a number must be a multiple of; zero when it need not be. */
  readonly step: number;
  readonly int: boolean;
  /** On a number: `parse` reads it from a string that is a JSON number. */
  readonly coerce: boolean;
  readonly pattern: RegExp | null;
  /** A string's format, or a custom type's predicate. */
  readonly rule: Rule | null;
  /**
   * The literal's value; a bigint's two bounds, lowest first; the name `typeof` gives the values of
   * a `type` node; the class an `instance` node's values are instances of.
   */
  readonly value: unknown;
  /** The enum's members; on an object that closes or strips, its keys. */
  readonly values: ReadonlySet<unknown> | null;
  /** The array's element, the record's value, the schema of an object's unnamed keys or of a tuple's items past its last, or what `nullable` and `nullish` wrap. */
  readonly item: Node | null;
  /** The record's key. */
  readonly key: Node | null;
  /** The object's keys and, in the same order, their schemas. */
  readonly keys: readonly string[] | null;
  /** An object's fields, a tuple's items, or the members of a union or an intersection. */
  readonly fields: readonly Node[] | null;
  /** On an object's field: the key may be absent. `'exact'` is absent or a value, and never `undefined`. */
  readonly optional: boolean | 'exact';
  /** What `parse` puts where `undefined` arrived; `undefined` when there is none. */
  readonly default: unknown;
  readonly unknown: Unknown;
  /** The discriminated union's key and its cases by that key's value: a string, a number or a boolean (parity.md decision 9). */
  readonly tag: string | null;
  readonly cases: ReadonlyMap<unknown, Node> | null;
  /** A lazy node's schema, asked for when it is read: what lets a schema name itself. */
  readonly get: (() => Node) | null;
  readonly meta: Meta | null;
}

/**
 * What stands where a schema's output type would, when its output is its input. That is nearly
 * every schema, and it is why the type of an object is worked out once and not twice: measured
 * 2026-11-13 with TypeScript 6.0.3 on 200 copies of the order schema, carrying a second, equal
 * type cost 725 instantiations a schema against 420, and this costs 461.
 */
export interface Same {
  readonly '~same': never;
}

/**
 * A node that validates a `T`, and from which `parse` produces an `O`: `Same` unless a default
 * fills a key or a transform maps a value somewhere inside. The types live only in the type system.
 */
export interface Schema<T, O = Same> extends Node {
  readonly '~type': T;
  readonly '~out': O;
}

/** Any schema at all: the constraint for a function that takes one and does not care for its types. */
export type AnySchema = Schema<unknown, unknown>;

/** The output type that a schema's two types stand for. */
export type Out<T, O> = [O] extends [Same] ? T : O;

/**
 * A field whose key may be absent. `F` is what the key may hold when it is there, which for
 * `optional` is the schema's own type or `undefined` (parity.md decision 2), and `G` is what it
 * may hold coming out of `parse` beside the schema's output: `undefined`, or for an exact key nothing.
 */
export interface OptionalSchema<T, O = Same, F = T | undefined, G = undefined> extends Schema<T, O> {
  readonly '~optional': F;
  readonly '~absent': G;
}

/**
 * A field whose key may be absent going in, and is always there coming out of `parse`: an optional
 * with a default. Its output type is always written out, which is what tells an object that its
 * own output is not its input.
 */
export interface DefaultedSchema<T, O = T> extends Schema<T, O> {
  readonly '~optional': T | undefined;
}

/**
 * What `check` accepts, and narrows to: the input. `parse` reads a little more where a schema asks
 * for coercion (a number from a string), which no type can say, so the input type is `check`'s.
 */
export type Infer<S extends AnySchema> = S['~type'];
/** The same as `Infer`, under the name that pairs with `InferOutput`. */
export type InferInput<S extends AnySchema> = S['~type'];
/** What `parse` produces: the input with every default filled and every transform applied. */
export type InferOutput<S extends AnySchema> = Out<S['~type'], S['~out']>;

export type Shape = Readonly<Record<string, AnySchema>>;
type MayBeAbsent = Readonly<Record<'~optional', unknown>>;
type MayStayAbsent = Readonly<Record<'~absent', unknown>>;
type OptionalKeys<S extends Shape> = { [K in keyof S]: S[K] extends MayBeAbsent ? K : never }[keyof S];
type AbsentKeys<S extends Shape> = { [K in keyof S]: S[K] extends MayStayAbsent ? K : never }[keyof S];
export type Flat<T> = { [K in keyof T]: T[K] };
export type ObjectOf<S extends Shape> = Flat<
  { [K in Exclude<keyof S, OptionalKeys<S>>]: S[K]['~type'] } & { [K in OptionalKeys<S>]?: (S[K] & MayBeAbsent)['~optional'] }
>;
/** The output type of one schema. */
type OutOf<S> = S extends Schema<infer T, infer O> ? Out<T, O> : never;
/** An object as `parse` produces it, where that is not what went in: a key with a default is always there. */
export type ObjectFull<S extends Shape> = Flat<
  { [K in Exclude<keyof S, AbsentKeys<S>>]: OutOf<S[K]> } & { [K in AbsentKeys<S>]?: OutOf<S[K]> | (S[K] & MayStayAbsent)['~absent'] }
>;
/** An object's output type: `Same` when every field's is, and only otherwise worked out. */
export type ObjectOut<S extends Shape> = [S[keyof S]['~out']] extends [Same] ? Same : ObjectFull<S>;

type Schemas = readonly AnySchema[];
/** A tuple of schemas as the tuple of what they validate. */
export type TupleOf<T extends Schemas> = { -readonly [K in keyof T]: T[K]['~type'] };
export type TupleFull<T extends Schemas> = { -readonly [K in keyof T]: OutOf<T[K]> };
export type TupleOut<T extends Schemas> = [T[number]['~out']] extends [Same] ? Same : TupleFull<T>;
/** What every one of the schemas validates at once. */
export type AllOf<T extends Schemas> = T extends readonly [Schema<infer First, unknown>, ...infer Rest extends Schemas] ? First & AllOf<Rest> : unknown;
type AllFull<T extends Schemas> = T extends readonly [infer First, ...infer Rest extends Schemas] ? OutOf<First> & AllFull<Rest> : unknown;
export type AllOut<T extends Schemas> = [T[number]['~out']] extends [Same] ? Same : AllFull<T>;
/** The output type of a union of schemas, given as the union of their types. */
export type AnyOut<M extends AnySchema> = [M['~out']] extends [Same] ? Same : OutOf<M>;

type Part = { readonly [K in keyof Node]?: Node[K] | undefined };

/**
 * A node of a kind: every member a node has, in the one order every node has them, each at what it
 * is when the kind does not use it, and then the members the builder set. One left `undefined`
 * keeps its default.
 *
 * Written out as one literal, not spread from a shared base object: read side by side three times on
 * the order schema, 2026-11-13, the literal was never slower and 1% to 2% faster (4.05M to 4.12M
 * validations a second against 3.98M to 4.07M), and it is nine bytes smaller gzipped.
 */
const node = <S extends AnySchema>(kind: Kind, check: Check, part: Part): S => {
  const out: Record<string, unknown> = {
    kind,
    check,
    min: -Number.MAX_VALUE,
    max: Number.MAX_VALUE,
    above: Number.NEGATIVE_INFINITY,
    below: Number.POSITIVE_INFINITY,
    step: 0,
    int: false,
    coerce: false,
    pattern: null,
    rule: null,
    value: undefined,
    values: null,
    item: null,
    key: null,
    keys: null,
    fields: null,
    optional: false,
    default: undefined,
    unknown: 'keep',
    tag: null,
    cases: null,
    get: null,
    meta: null,
  };
  // eslint-disable-next-line secure-coding/detect-object-injection -- `part` is written by the builders in this file, member by member; no caller's key reaches it
  for (const [name, value] of Object.entries(part)) if (value !== undefined) out[name] = value;
  // eslint-disable-next-line reliability/no-unsafe-type-narrowing -- `~type` exists only in the type system: the node carries no member for it
  return Object.freeze(out) as unknown as S;
};

/** A global or sticky pattern remembers where it stopped, so the same input would pass, then fail. */
const stateless = (pattern: RegExp): RegExp => {
  if (pattern.global || pattern.sticky) {
    throw new TypeError(`pattern ${String(pattern)} keeps state between tests. fix: remove its g and y flags`);
  }
  return pattern;
};

/**
 * A string format, as data (spec.md R11): a name and either a pattern or a test. Nothing is
 * registered anywhere; a format is a value a program keeps and hands to `string({ format })`.
 */
export type Format =
  | { readonly name: string; readonly pattern: RegExp }
  | { readonly name: string; readonly test: (value: string) => boolean };

const ruleOf = (format: Format): Rule =>
  Object.freeze({
    name: format.name,
    pattern: 'pattern' in format ? stateless(format.pattern) : null,
    // A format's test is only ever handed a string: `check` asks `typeof` first.
    test: 'test' in format ? (format.test as Test) : null,
  });

export interface StringOptions {
  /** Code points, not UTF-16 units (parity.md decision 4). */
  readonly min?: number;
  readonly max?: number;
  readonly length?: number;
  readonly pattern?: RegExp;
  readonly format?: Format;
}

export const string = (options: StringOptions = {}): Schema<string> =>
  node('string', isString, {
    min: options.length ?? options.min ?? 0,
    max: options.length ?? options.max,
    pattern: options.pattern === undefined ? null : stateless(options.pattern),
    rule: options.format === undefined ? null : ruleOf(options.format),
  });

export interface NumberOptions {
  readonly min?: number;
  readonly max?: number;
  /** Exclusive bounds: the bound itself fails. */
  readonly gt?: number;
  readonly lt?: number;
  /** Above zero; `negative` is below zero. Zero is neither. */
  readonly positive?: boolean;
  readonly negative?: boolean;
  /** See `isMultiple` in check.ts for what a multiple of a fraction is. */
  readonly multipleOf?: number;
  readonly int?: boolean;
  /** `parse` reads the number from a string that is a JSON number. `check` never does. */
  readonly coerce?: boolean;
}

/** A finite number: `NaN` and the infinities fail, as they do in JSON. */
export const number = (options: NumberOptions = {}): Schema<number> => {
  const step = options.multipleOf ?? 0;
  if (options.multipleOf !== undefined && !(step > 0 && step < Number.POSITIVE_INFINITY)) {
    throw new TypeError(`multipleOf ${String(step)} has no multiples to test. fix: give a finite number above zero`);
  }
  return node('number', isNumber, {
    min: options.min,
    max: options.max,
    above: Math.max(options.gt ?? Number.NEGATIVE_INFINITY, options.positive === true ? 0 : Number.NEGATIVE_INFINITY),
    below: Math.min(options.lt ?? Number.POSITIVE_INFINITY, options.negative === true ? 0 : Number.POSITIVE_INFINITY),
    step,
    int: options.int,
    coerce: options.coerce,
  });
};

export const boolean = (): Schema<boolean> => node('boolean', isBoolean, {});

export const literal = <const T extends string | number | bigint | boolean | null | undefined>(value: T): Schema<T> =>
  node('literal', isLiteral, { value });

/** Only `undefined`: the literal with no value. As an object's field it is a key that must be absent or `undefined`, so mark it `optional`. */
export const undefinedOf = (): Schema<undefined> => node('literal', isLiteral, {});

export const enumOf = <const T extends readonly (string | number)[]>(values: T): Schema<T[number]> =>
  node('enum', isMember, { values: new Set(values) });

type EnumObject = Readonly<Record<string, string | number>>;

/**
 * The values of a TypeScript `enum`. A numeric enum compiles to an object that also maps each
 * number back to its name (`{ A: 0, 0: 'A' }`), and those names are not values: `0` is accepted
 * and `'A'` is not. A key is such a way back when its value is a name whose own value is that key;
 * to the type, it is a key that is a number.
 */
export const nativeEnum = <const T extends EnumObject>(members: T): Schema<T[keyof T & string]> =>
  node('enum', isMember, {
    values: new Set(Object.keys(members).filter((key) => members[String(members[key])] !== Number(key)).map((key) => members[key])),
  });

export interface BigintOptions {
  readonly min?: bigint;
  readonly max?: bigint;
}

/**
 * A bigint. Its bounds are bigints, which a double cannot hold, so they are kept as given, in
 * `value`; a bound nobody set is an infinity, which every bigint is inside.
 */
export const bigint = (options: BigintOptions = {}): Schema<bigint> =>
  node('bigint', isBigint, { value: Object.freeze([options.min ?? Number.NEGATIVE_INFINITY, options.max ?? Number.POSITIVE_INFINITY]) });

/** A `Date` that is a time: `new Date(NaN)` fails, and so does a string or a number that could be read as one. */
export const date = (): Schema<Date> => node('date', isDate, {});

export const symbol = (): Schema<symbol> => node('type', isTypeOf, { value: 'symbol' });

/** A value made by `new` of a class, or of one that extends it. The emitted code takes the class as a hook: text cannot hold it. */
export const instanceOf = <T>(type: abstract new (...args: never[]) => T): Schema<T> => node('instance', isInstance, { value: type });

/** Accepts every value. `any` is the same node with the type that switches checking off. */
export const unknown = (): Schema<unknown> => node('unknown', isAnything, {});

export const any = (): Schema<any> => node('unknown', isAnything, {});

/** Accepts no value. */
export const never = (): Schema<never> => node('never', isNothing, {});

export interface ArrayOptions {
  readonly min?: number;
  readonly max?: number;
}

export const array = <T, O>(item: Schema<T, O>, options: ArrayOptions = {}): Schema<T[], [O] extends [Same] ? Same : O[]> =>
  node('array', isArray, { item, min: options.min ?? 0, max: options.max });

interface TupleBuilder {
  <const T extends Schemas>(items: T): Schema<TupleOf<T>, TupleOut<T>>;
  <const T extends Schemas, R, RO>(
    items: T,
    options: { readonly rest: Schema<R, RO> },
  ): Schema<[...TupleOf<T>, ...R[]], [T[number]['~out'] | RO] extends [Same] ? Same : [...TupleFull<T>, ...Out<R, RO>[]]>;
}

/**
 * Exactly these items, in this order: one more or one fewer fails (parity.md decision 12). With
 * `rest`, any number of further items, each matching that schema.
 */
export const tuple: TupleBuilder = (items: Schemas, options: { readonly rest?: AnySchema } = {}): Schema<never> =>
  node('tuple', isTuple, { fields: [...items], item: options.rest });

export interface RecordOptions<K extends string = string> {
  /** What every key must be. A key is always a string, so this is a string schema or an enum of strings. */
  readonly key?: Schema<K>;
}

/** A record's type: any string as a key, or, when its keys are an enum, some of those and no other. */
export type RecordOf<K extends string, V> = string extends K ? Record<string, V> : { [P in K]?: V };

/**
 * An object with any keys, each value matching one schema. With an enum for `key` only its members
 * are keys, and none of them has to be there: `recordOf` is the record that needs every one.
 */
export const record = <V, O, K extends string = string>(value: Schema<V, O>, options: RecordOptions<K> = {}): Schema<RecordOf<K, V>, [O] extends [Same] ? Same : RecordOf<K, O>> =>
  node('record', isRecord, { item: value, key: options.key });

/** A record with exactly these keys, every one of them there, each value matching one schema: a closed object, written once. */
export const recordOf = <const K extends string, V, O>(keys: readonly K[], value: Schema<V, O>): Schema<Record<K, V>, [O] extends [Same] ? Same : Record<K, O>> =>
  node('object', isClosed, { keys: [...keys], fields: keys.map(() => value), values: new Set(keys), unknown: 'strict' });

export interface OptionalOptions<T> {
  /**
   * What `parse` puts where the value is absent or `undefined`. It is handed out as it is, never
   * copied and never checked: freeze an object you give here. `check` and the inferred type still
   * describe the input, where the key may be absent.
   */
  readonly default?: T;
}

interface OptionalBuilder {
  <T, O>(schema: Schema<T, O>): OptionalSchema<T, O>;
  /** With a default the key is always there in what `parse` produces, so the output type has it required. */
  <T, O>(schema: Schema<T, O>, options: { readonly default: T }): DefaultedSchema<T, Out<T, O>>;
  <T, O>(schema: Schema<T, O>, options: OptionalOptions<T>): OptionalSchema<T, O>;
}

/**
 * Marks an object's field as one that may be absent or `undefined`. It says that of the key, not of
 * the value: anywhere else (at the root, in an array, a tuple or a record) the schema is what it
 * was, so `check(optional(string()), undefined)` is false and the type says so. A value that may
 * itself be `undefined` is `nullish`, or a union with `literal(undefined)`.
 */
export const optional: OptionalBuilder = <T, O>(schema: Schema<T, O>, options: OptionalOptions<T> = {}): OptionalSchema<T, O> =>
  Object.freeze({ ...schema, optional: true, default: options.default }) as OptionalSchema<T, O>;

/**
 * Marks an object's field as one that may be absent and, when it is there, is not `undefined`
 * (`optional` reads `undefined` as absent, parity.md decision 2). A key the prototype holds counts
 * as there, as it does for a required field (decision 3).
 */
export const exactOptional = <T, O>(schema: Schema<T, O>): OptionalSchema<T, O, T, never> =>
  Object.freeze({ ...schema, optional: 'exact' }) as OptionalSchema<T, O, T, never>;

/** `T` or `null`. */
export const nullable = <T, O>(schema: Schema<T, O>): Schema<T | null, [O] extends [Same] ? Same : O | null> => node('nullable', isNullable, { item: schema });

/** `T`, `null` or `undefined`; as an object's field, the key may be absent. */
export const nullish = <T, O>(schema: Schema<T, O>): OptionalSchema<T | null | undefined, [O] extends [Same] ? Same : O | null | undefined, T | null | undefined> =>
  node('nullish', isNullish, { item: schema, optional: true });

export interface ObjectOptions<U> {
  /**
   * Keys the shape does not name: `'keep'` allows them and leaves them alone (the default, parity.md
   * decision 1), `'strict'` refuses them, `'strip'` allows them and `parse` leaves them out of its
   * output, and a schema is what each of their values must match.
   */
  readonly unknown?: U;
}

interface ObjectBuilder {
  <const S extends Shape>(shape: S, options?: ObjectOptions<Unknown>): Schema<ObjectOf<S>, ObjectOut<S>>;
  <const S extends Shape, U, UO>(
    shape: S,
    options: { readonly unknown: Schema<U, UO> },
  ): Schema<ObjectOf<S> & Readonly<Record<string, U>>, [S[keyof S]['~out'] | UO] extends [Same] ? Same : ObjectFull<S> & Readonly<Record<string, Out<U, UO>>>>;
}

export const object: ObjectBuilder = (shape: Shape, options: ObjectOptions<Unknown | AnySchema> = {}): Schema<never> => {
  const { unknown: mode = 'keep' } = options;
  const keys = Object.keys(shape);
  const fields = Object.values(shape);
  if (mode === 'keep') return node('object', isObject, { keys, fields });
  const values = new Set(keys);
  if (mode === 'strip') return node('object', isObject, { keys, fields, values, unknown: mode });
  return node('object', isClosed, mode === 'strict' ? { keys, fields, values, unknown: mode } : { keys, fields, values, item: mode });
};

type Cases = Readonly<Record<string, AnySchema>>;

/** The value a case is picked by: what the literal under `tag` in a case's own shape says. */
const tagOf = (tag: string, one: Node, index: number): unknown => {
  const field = one.fields?.[one.keys?.indexOf(tag) ?? -1];
  const value: unknown = field?.kind === 'literal' ? field.value : undefined;
  if (typeof value !== 'string' && typeof value !== 'boolean' && !Number.isFinite(value)) {
    throw new TypeError(`case ${String(index)} of the union on "${tag}" names no tag. fix: make it an object with "${tag}" a literal string, number or boolean`);
  }
  return value;
};

/** The cases by their tag, in the order given. Two cases under one tag would leave the first unreachable. */
const casesOf = (tag: string, cases: readonly Node[]): ReadonlyMap<unknown, Node> => {
  const out = new Map<unknown, Node>();
  for (const [index, one] of cases.entries()) {
    const value = tagOf(tag, one, index);
    if (out.has(value)) throw new TypeError(`case ${String(index)} of the union on "${tag}" repeats the tag of an earlier case. fix: give each case its own tag`);
    out.set(value, one);
  }
  return out;
};

/**
 * One object schema per value of `tag`, which is the case's key in `cases` and so a string. The
 * case is picked by that value, never by trying each.
 */
export const discriminated = <const C extends Cases>(tag: string, cases: C): Schema<C[keyof C]['~type'], AnyOut<C[keyof C]>> =>
  node('discriminated', isCase, { tag, cases: new Map(Object.entries(cases)) });

/**
 * The same, for tags that are strings, numbers or booleans (parity.md decision 9): each case is an
 * object whose `tag` key is a literal, and that literal is its tag. A builder of its own, so that a
 * program whose tags are all strings does not carry the reading of them.
 */
export const discriminatedBy = <const C extends Schemas>(tag: string, cases: C): Schema<C[number]['~type'], AnyOut<C[number]>> =>
  node('discriminated', isCase, { tag, cases: casesOf(tag, cases) });

/** What any one member accepts. The members are tried in order, and the first to accept decides what `parse` returns. */
export const union = <const T extends Schemas>(members: T): Schema<T[number]['~type'], AnyOut<T[number]>> =>
  node('union', isUnion, { fields: [...members] });

/** What every member accepts. */
export const intersection = <const T extends Schemas>(members: T): Schema<AllOf<T>, AllOut<T>> =>
  node('intersection', isEvery, { fields: [...members] });

/**
 * A schema asked for when it is read, which is what lets one name itself or another that names it
 * back: `const Tree: Schema<Tree> = object({ kids: array(lazy(() => Tree)) })`.
 */
export const lazy = <T, O = Same>(get: () => Schema<T, O>): Schema<T, O> => node('lazy', isLater, { get });

/** A type that is whatever a named predicate says it is (spec.md R10). The static type is the caller's to state. */
export const custom = <T>(name: string, test: Test): Schema<T> =>
  node('custom', isCustom, { rule: Object.freeze({ name, pattern: null, test }) });

/** The same schema with a title, a description or examples on it. Nothing that validates reads them. */
export const annotate = <S extends AnySchema>(schema: S, meta: Meta): S =>
  Object.freeze({ ...schema, meta: Object.freeze({ ...schema.meta, ...meta }) });
