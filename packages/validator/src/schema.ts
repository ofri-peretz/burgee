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
  isCounted,
  isCustom,
  isDate,
  isEvery,
  isInstance,
  isLater,
  isLiteral,
  isMap,
  isMapped,
  isMember,
  isNan,
  isNothing,
  isNullable,
  isNullish,
  isNumber,
  isObject,
  isRecord,
  isRefined,
  isSet,
  isString,
  isTuple,
  isTypeOf,
  isUnion,
} from './check.js';
import { BEFORE, BIGINT, COUNTED, CUSTOM, DATE, EVERY, INSTANCE, LATER, MAP, MAPPED, NAN, NEVER, NULLABLE, NULLISH, PIPED, RECORD, REFINED, SET, TUPLE, TYPE, UNION, UNKNOWN, WORDED } from './own.js';

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
  | 'instance'
  | 'refine'
  | 'transform'
  | 'nan'
  | 'map'
  | 'set'
  | 'count'
  | 'message'
  | 'pipe'
  | 'preprocess';

/** A predicate a node names (spec.md R10). Beside `check`, `get` and a transform's map, it is the only kind of function a node may hold. */
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

export interface Issue {
  /** JSON Pointer to the value that failed; `''` is the root. */
  readonly path: string;
  /**
   * What failed: `type`, `min`, `max`, `gt`, `lt`, `integer`, `multipleOf`, `pattern`, `format`,
   * `literal`, `enum`, `required`, `unknown`, `key`, `length`, `tag`, `union`, `never`, `custom`,
   * `date`, `instance`, `undefined`, `refine`, `minProperties`, `maxProperties`.
   */
  readonly keyword: string;
  /** What was expected and what arrived, ending in a `fix:` line; or the words a schema was given with `message`. */
  readonly message: string;
}

/** One failed expectation at one place, before it is put into words: what a message is made from. */
export interface Miss {
  readonly path: string;
  readonly keyword: string;
  /** What was expected, in English: the message reads "expected <expected>, got …". */
  readonly expected: string;
  /** The value that arrived. */
  readonly got: unknown;
  /** What to do about it, in English: the message ends "fix: <fix>". */
  readonly fix: string;
}

export interface IssueOptions {
  /** Stop at the first issue. */
  readonly first?: boolean;
  /**
   * The message for an issue, in your words or your language. It is asked about every issue of
   * every schema, and what it returns is the whole message. Where it returns nothing the message
   * stays as it was, with its `fix:` line: a map can cover the keywords it knows and leave the rest.
   */
  readonly message?: (miss: Miss) => string | null | undefined;
}

/**
 * Where a walk of `issues` is, and where it writes. It also holds the two things of `issues` that a
 * reader calls, the way into a schema inside this one and the writing down of an issue, so that a
 * reader a node carries imports neither and a bundle without `issues` does not carry them.
 */
export interface Walk {
  readonly found: Issue[];
  readonly first: boolean;
  readonly message: IssueOptions['message'];
  readonly visit: Reader;
  readonly add: (walk: Walk, miss: Miss) => void;
}

/** What `issues` runs for a kind: it writes down every reason `got` is not what the schema describes. */
export type Reader = (walk: Walk, schema: Node, got: unknown, path: string) => void;

/** One walk of `parse` over a value. It makes two: one before `check`, and one after it when there is a transform to run. */
export interface Pass {
  /** The walk after `check`: every value is one its schema accepted, and transforms run. */
  late: boolean;
  /** Every object and array the schema describes is rebuilt, changed or not. */
  readonly copy: boolean;
  /** Set by the first walk when it meets a transform: what makes the second worth making. */
  met: boolean;
  /** The way of `parse` into a schema inside this one, handed over as a walk's `visit` is. */
  readonly fill: Filler;
  /** Where the walk is: the keys from the root to the member being filled. */
  readonly at: unknown[];
  /** What the walk after `check` found wrong: the issues of a pipe's second schema. One of them fails the parse. */
  readonly failed: Issue[];
  /** `parse` itself and the options it was called with, for a schema that parses what another produced. */
  readonly parse: (schema: Node, value: unknown, options: IssueOptions) => { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly issues: Issue[] };
  readonly options: IssueOptions;
  /** Set by `parseAsync` alone: a schema that has to be awaited refuses a walk without it. */
  readonly wait?: boolean;
}

/** What `parse` runs for a kind: the value the schema makes of `value`, which is `value` itself when nothing changed. */
export type Filler = (schema: Node, value: unknown, pass: Pass) => unknown;

/**
 * What a kind brings for `issues` and for `parse`, when they do not know the kind themselves. They
 * know the eight kinds the design's first step named (string, number, boolean, literal, enum, array,
 * object, discriminated); every other kind's builder puts this on its node, as it puts `check`.
 * So `issues` and `parse` do not grow with the number of kinds, and a bundle carries the reading
 * of the kinds it builds.
 */
export interface Own {
  readonly issues: Reader;
  readonly fill: Filler;
}

export interface Node {
  readonly kind: Kind;
  /** The kind's own check, put here by the builder so that a bundle carries only the kinds it builds. It captures nothing. */
  readonly check: Check;
  /** Length for a string or an array, value for a number, size for a set, the number of keys for a count of them. */
  readonly min: number;
  readonly max: number;
  /** A number's exclusive bounds: the infinities when there are none. */
  readonly above: number;
  readonly below: number;
  /** What a number must be a multiple of; zero when it need not be. */
  readonly step: number;
  readonly int: boolean;
  /** `parse` reads the value from a string: a number from a JSON number, a boolean from `true` or `false`, a date from an RFC 3339 date or date-time. */
  readonly coerce: boolean;
  readonly pattern: RegExp | null;
  /** A string's format, a custom type's predicate, or a refinement's rule: its name is what the rule expects. */
  readonly rule: Rule | null;
  /**
   * The literal's value; a bigint's two bounds, lowest first; the name `typeof` gives the values of
   * a `type` node; the class an `instance` node's values are instances of; a transform's map; the
   * function a `preprocess` node runs first; the words of a `message` node, one string or one a keyword.
   */
  readonly value: unknown;
  /** The enum's members; on an object that closes or strips, its keys; on a refinement, the keys its rule reads. */
  readonly values: ReadonlySet<unknown> | null;
  /**
   * The array's or the set's element, the record's or the map's value, the schema of an object's
   * unnamed keys or of a tuple's items past its last, or what a schema that wraps another wraps: for
   * a pipe, its first schema.
   */
  readonly item: Node | null;
  /** The record's or the map's key; a pipe's second schema. */
  readonly key: Node | null;
  /** The object's keys and, in the same order, their schemas; on a refinement, the path its issue is reported at. */
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
  /** The kind's own reading for `issues` and `parse`; null for the eight kinds they read themselves. */
  readonly own: Own | null;
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
    above: -Infinity,
    below: Infinity,
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
    own: null,
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
  if (options.multipleOf !== undefined && !(step > 0 && step < Infinity)) {
    throw new TypeError(`multipleOf ${String(step)} has no multiples to test. fix: give a finite number above zero`);
  }
  return node('number', isNumber, {
    min: options.min,
    max: options.max,
    above: Math.max(options.gt ?? -Infinity, options.positive === true ? 0 : -Infinity),
    below: Math.min(options.lt ?? Infinity, options.negative === true ? 0 : Infinity),
    step,
    int: options.int,
    coerce: options.coerce,
  });
};

export interface BooleanOptions {
  /** `parse` reads the boolean from the string `true` or `false`, exactly. `check` never does. */
  readonly coerce?: boolean;
}

export const boolean = (options: BooleanOptions = {}): Schema<boolean> => node('boolean', isBoolean, { coerce: options.coerce });

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
  node('bigint', isBigint, { own: BIGINT, value: Object.freeze([options.min ?? -Infinity, options.max ?? Infinity]) });

export interface DateOptions {
  /**
   * `parse` reads the date from a string that is, whole, an RFC 3339 date-time (`2020-01-01T00:00:00Z`,
   * with any offset and any fraction) or full-date (`2020-01-01`, read as midnight UTC). `check` never does.
   */
  readonly coerce?: boolean;
}

/** A `Date` that is a time: `new Date(NaN)` fails, and so does a string or a number that could be read as one. */
export const date = (options: DateOptions = {}): Schema<Date> => node('date', isDate, { coerce: options.coerce, own: DATE });

export const symbol = (): Schema<symbol> => node('type', isTypeOf, { value: 'symbol', own: TYPE });

/**
 * Any function. What it takes and returns is not checked, since that cannot be known without
 * calling it: typebox reads a function schema the same way, and zod, valibot and arktype wrap the
 * function to check each call, which is another thing than validating a value.
 */
export const func = (): Schema<(...args: never[]) => unknown> => node('type', isTypeOf, { value: 'function', own: TYPE });

/** A value made by `new` of a class, or of one that extends it. The emitted code takes the class as a hook: text cannot hold it. */
export const instanceOf = <T>(type: abstract new (...args: never[]) => T): Schema<T> => node('instance', isInstance, { value: type, own: INSTANCE });

/**
 * A `Promise`. What it resolves to is not checked: that is only known later, and `check` answers
 * now. valibot, arktype and typebox read a promise schema the same way.
 */
export const promise = (): Schema<Promise<unknown>> => node('instance', isInstance, { value: Promise, own: INSTANCE });

/** `NaN`, and no other number: `number()` refuses it, as JSON does. */
export const nan = (): Schema<number> => node('nan', isNan, { own: NAN });

/** Only `undefined`, typed `void`: what a function that returns nothing returns. The same node as `undefinedOf`. */
export const voidOf = (): Schema<void> => node('literal', isLiteral, {});

/**
 * An integer every double can tell from its neighbours: from `Number.MIN_SAFE_INTEGER` to
 * `Number.MAX_SAFE_INTEGER`, so 2 ** 53 fails (parity.md decision 5: `number({ int: true })` is any
 * integer-valued double). The safe range is put into the node's own two bounds, so `check` tests
 * nothing it did not test already, and a builder of its own, so `number` is no larger for it.
 */
export const safeInteger = (options: Omit<NumberOptions, 'int'> = {}): Schema<number> => {
  const whole = number({ ...options, int: true });
  return Object.freeze({ ...whole, min: Math.max(whole.min, Number.MIN_SAFE_INTEGER), max: Math.min(whole.max, Number.MAX_SAFE_INTEGER) });
};

/** Accepts every value. `any` is the same node with the type that switches checking off. */
export const unknown = (): Schema<unknown> => node('unknown', isAnything, { own: UNKNOWN });

export const any = (): Schema<any> => node('unknown', isAnything, { own: UNKNOWN });

/** Accepts no value. */
export const never = (): Schema<never> => node('never', isNothing, { own: NEVER });

export interface ArrayOptions {
  readonly min?: number;
  readonly max?: number;
}

export const array = <T, O>(item: Schema<T, O>, options: ArrayOptions = {}): Schema<T[], [O] extends [Same] ? Same : O[]> =>
  node('array', isArray, { item, min: options.min ?? 0, max: options.max });

/** A `Map` whose keys match one schema and whose values match another. */
export const mapOf = <K, KO, V, VO>(key: Schema<K, KO>, value: Schema<V, VO>): Schema<Map<K, V>, [KO | VO] extends [Same] ? Same : Map<Out<K, KO>, Out<V, VO>>> =>
  node('map', isMap, { key, item: value, own: MAP });

/** A `Set` whose members each match one schema; `min` and `max` bound its size. */
export const setOf = <T, O>(item: Schema<T, O>, options: ArrayOptions = {}): Schema<Set<T>, [O] extends [Same] ? Same : Set<O>> =>
  node('set', isSet, { item, min: options.min ?? 0, max: options.max, own: SET });

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
  node('tuple', isTuple, { fields: [...items], item: options.rest, own: TUPLE });

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
  node('record', isRecord, { item: value, key: options.key, own: RECORD });

/** A record with exactly these keys, every one of them there, each value matching one schema: a closed object, written once. */
export const recordOf = <const K extends string, V, O>(keys: readonly K[], value: Schema<V, O>): Schema<Record<K, V>, [O] extends [Same] ? Same : Record<K, O>> =>
  node('object', isClosed, { keys: [...keys], fields: keys.map(() => value), values: new Set(keys), unknown: 'strict' });

export interface OptionalOptions<T> {
  /**
   * What `parse` puts where the value is absent or `undefined`. It stands for the input that was
   * not there, so it is then read as an input is: coerced, filled and mapped by this schema where
   * the schema does those things, and otherwise handed out as it is, uncopied. Freeze an object
   * you give here. `check` and the input type still describe the input, where the key may be absent.
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
export const nullable = <T, O>(schema: Schema<T, O>): Schema<T | null, [O] extends [Same] ? Same : O | null> => node('nullable', isNullable, { item: schema, own: NULLABLE });

/** `T`, `null` or `undefined`; as an object's field, the key may be absent. */
export const nullish = <T, O>(schema: Schema<T, O>): OptionalSchema<T | null | undefined, [O] extends [Same] ? Same : O | null | undefined, T | null | undefined> =>
  node('nullish', isNullish, { item: schema, optional: true, own: NULLISH });

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
  node('union', isUnion, { fields: [...members], own: UNION });

/** What every member accepts. */
export const intersection = <const T extends Schemas>(members: T): Schema<AllOf<T>, AllOut<T>> =>
  node('intersection', isEvery, { fields: [...members], own: EVERY });

/**
 * A schema asked for when it is read, which is what lets one name itself or another that names it
 * back: `const Tree: Schema<Tree> = object({ kids: array(lazy(() => Tree)) })`.
 */
export const lazy = <T, O = Same>(get: () => Schema<T, O>): Schema<T, O> => node('lazy', isLater, { get, own: LATER });

/** A type that is whatever a named predicate says it is (spec.md R10). The static type is the caller's to state. */
export const custom = <T>(name: string, test: Test): Schema<T> =>
  node('custom', isCustom, { rule: Object.freeze({ name, pattern: null, test }), own: CUSTOM });

/** The same schema with a title, a description or examples on it. Nothing that validates reads them. */
export const annotate = <S extends AnySchema>(schema: S, meta: Meta): S =>
  Object.freeze({ ...schema, meta: Object.freeze({ ...schema.meta, ...meta }) });

export interface RefineOptions<K extends string = string> {
  /** Where under the value the issue is reported: the keys that lead there. The value itself when there are none. */
  readonly path?: readonly (string | number)[];
  /** What the rule expects, for the issue: it reads "expected <message>, got …". */
  readonly message?: string;
  /**
   * The keys of the object that the rule reads. With them the rule runs whenever those fields are
   * sound, whatever is wrong with the others, and is handed a value typed with those keys alone.
   * Without them it runs only on a value that is sound all through.
   */
  readonly uses?: readonly K[];
}

/**
 * The schema, and a rule of your own on top of it (spec.md R10). The rule is handed what the
 * schema accepted, so it can rely on the type; it returns true for a value it allows.
 *
 * A rule across fields, such as "the two passwords match", names the fields it reads in `uses`
 * and the field to report at in `path`. It is then run and reported even when another field of the
 * object is wrong, so one `issues` call says everything there is to fix.
 */
export const refine = <T, O, const K extends keyof T & string = never>(
  schema: Schema<T, O>,
  test: (value: NoInfer<[K] extends [never] ? T : Pick<T, K>>) => boolean,
  options: RefineOptions<K> = {},
): Schema<T, O> =>
  node('refine', isRefined, {
    item: schema,
    rule: Object.freeze({ name: options.message ?? 'a value the rule accepts', pattern: null, test: test as Test }),
    keys: (options.path ?? []).map(String),
    values: options.uses === undefined ? null : new Set(options.uses),
    own: REFINED,
  });

/**
 * The schema, and a function that makes of what it accepts what `parse` hands out (spec.md R10).
 * `check`, `issues` and the input type describe what goes in; only `parse` runs the function, and
 * only on a value the whole schema accepted.
 */
export const transform = <T, M, R>(schema: Schema<T, M>, map: (value: Out<T, M>) => R): Schema<T, R> => node('transform', isMapped, { item: schema, value: map, own: MAPPED });

export interface PropertiesOptions {
  /** The fewest and the most keys the object may have. */
  readonly min?: number;
  readonly max?: number;
}

/**
 * The schema, held to a number of keys: JSON Schema's `minProperties` and `maxProperties`, for an
 * object or a record. The keys are counted as a record's are read, so an enumerable key of the
 * prototype counts (parity.md decision 3). A wrapper and not an option of `object`, so an object
 * that does not count its keys pays nothing for those that do.
 */
export const properties = <T extends object, O>(schema: Schema<T, O>, options: PropertiesOptions): Schema<T, O> =>
  node('count', isCounted, { item: schema, min: options.min ?? 0, max: options.max, own: COUNTED });

/**
 * The schema, with your words for its issues: one message for every issue it reports, or one for
 * each keyword you name (`{ type: '…', min: '…' }`). The words replace the whole message, `fix:`
 * line included, and stand whatever a per-call `message` hook says: the schema's own words are the
 * more specific. Only the wrapped schema's own issues are reworded, those reported where it stands
 * and those about one of its keys (`required`, `unknown`, `undefined`, `key`, `tag`); a schema
 * inside it keeps its own.
 */
export const message = <T, O>(schema: Schema<T, O>, words: string | Readonly<Record<string, string>>): Schema<T, O> =>
  node('message', isMapped, { item: schema, value: typeof words === 'string' ? words : new Map(Object.entries(words)), own: WORDED });

/**
 * Two schemas in a row: what `parse` makes of the first is parsed by the second, and what the
 * second makes of it is the output. `transform` maps a value and trusts the result; a pipe holds
 * the result to a schema: `pipe(transform(string(), Number), number({ min: 5 }))`.
 *
 * `check`, `issues`, the emitted code and the input type describe what goes in, which is the first
 * schema alone. The second sees a value only `parse` makes, so only `parse` can refuse on its
 * account: a value `check` accepts may still fail to parse, with the second schema's issues.
 */
export const pipe = <T, M, U, R>(first: Schema<T, M>, second: Schema<U, R>): Schema<T, Out<U, R>> => node('pipe', isMapped, { item: first, key: second, own: PIPED });

/**
 * The schema, and a function `parse` runs on what arrived before anything is validated: a coercion
 * of your own. `transform` runs after validation, on a value of the schema's type; this runs
 * before it, on a value of any type, and what it returns is validated.
 *
 * As with `coerce`, `check`, `issues`, the emitted code and the input type describe the value the
 * schema accepts, which is the value after the function has run; `check` never runs it. The
 * function runs once for each time `parse` reads the value through this schema, which inside a
 * union is once a member tried: keep it free of side effects.
 */
export const preprocess = <T, O>(map: (value: unknown) => unknown, schema: Schema<T, O>): Schema<T, O> => node('preprocess', isMapped, { item: schema, value: map, own: BEFORE });

const trimmed = (text: string): string => text.trim();
const lowered = (text: string): string => text.toLowerCase();
const raised = (text: string): string => text.toUpperCase();

/** A schema whose output is a string: the only kind the four string transforms below take. */
type Text<T extends string, M extends string | Same> = Schema<T, M>;

/**
 * The string with the white space at its two ends removed (`String.prototype.trim`). Like every
 * transform it runs after validation: the schema describes the string as it arrives. To hold the
 * trimmed string to a schema, `pipe(trim(string()), string({ min: 1 }))`.
 */
export const trim = <T extends string, M extends string | Same = Same>(schema: Text<T, M>): Schema<T, string> => transform(schema, trimmed as (value: Out<T, M>) => string);

/** The string in lower case (`String.prototype.toLowerCase`, which follows no locale). */
export const lowercase = <T extends string, M extends string | Same = Same>(schema: Text<T, M>): Schema<T, string> => transform(schema, lowered as (value: Out<T, M>) => string);

/** The string in upper case (`String.prototype.toUpperCase`). */
export const uppercase = <T extends string, M extends string | Same = Same>(schema: Text<T, M>): Schema<T, string> => transform(schema, raised as (value: Out<T, M>) => string);

export type NormalForm = 'NFC' | 'NFD' | 'NFKC' | 'NFKD';

const FORMS: ReadonlySet<unknown> = /* @__PURE__ */ new Set(['NFC', 'NFD', 'NFKC', 'NFKD']);

/** The string in a Unicode normalization form (UAX #15, `String.prototype.normalize`): NFC unless another is named. */
export const normalize = <T extends string, M extends string | Same = Same>(schema: Text<T, M>, form: NormalForm = 'NFC'): Schema<T, string> => {
  if (!FORMS.has(form)) throw new TypeError(`cannot normalize to ${typeof form === 'string' ? JSON.stringify(form) : `a value of the type ${typeof form}`}: there is no such form. fix: name NFC, NFD, NFKC or NFKD`);
  return transform(schema, (text) => (text as string).normalize(form));
};
