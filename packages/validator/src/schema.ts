/**
 * A schema is data (spec.md R1): every builder returns one frozen node, a kind and its constraints.
 * `check`, `issues` and, later, the code emitter and the JSON Schema writer all read that node.
 *
 * Every node has the same members in the same order, whatever its kind, so the engine reading
 * them sees one object shape.
 */

import { isArray, isBoolean, isCase, isLiteral, isMember, isNumber, isObject, isString } from './check.js';

export type Check = (schema: Node, value: unknown) => boolean;

export type Kind = 'string' | 'number' | 'boolean' | 'literal' | 'enum' | 'array' | 'object' | 'discriminated';

export interface Node {
  readonly kind: Kind;
  /** The kind's own check, put here by the builder so that a bundle carries only the kinds it builds. It captures nothing. */
  readonly check: Check;
  /** Length for a string or an array, value for a number. */
  readonly min: number;
  readonly max: number;
  readonly int: boolean;
  readonly pattern: RegExp | null;
  /** The literal's value. */
  readonly value: unknown;
  /** The enum's members. */
  readonly values: ReadonlySet<unknown> | null;
  /** The array's element. */
  readonly item: Node | null;
  /** The object's keys and, in the same order, their schemas. */
  readonly keys: readonly string[] | null;
  readonly fields: readonly Node[] | null;
  /** On an object's field: the key may be absent. */
  readonly optional: boolean;
  /** The discriminated union's key and its cases by that key's value. */
  readonly tag: string | null;
  readonly cases: Readonly<Record<string, Node>> | null;
}

/** A node that validates a `T`. The type lives only in the type system. */
export interface Schema<T> extends Node {
  readonly '~type': T;
}

/** A field whose key may be absent. */
export interface OptionalSchema<T> extends Schema<T> {
  readonly '~optional': true;
}

export type Infer<S extends Schema<unknown>> = S['~type'];

type Shape = Readonly<Record<string, Schema<unknown>>>;
type OptionalKeys<S extends Shape> = { [K in keyof S]: S[K] extends OptionalSchema<unknown> ? K : never }[keyof S];
type Flat<T> = { [K in keyof T]: T[K] };
export type ObjectOf<S extends Shape> = Flat<
  { [K in Exclude<keyof S, OptionalKeys<S>>]: S[K]['~type'] } & { [K in OptionalKeys<S>]?: S[K]['~type'] }
>;

type Part = { readonly [K in keyof Node]?: Node[K] | undefined };

const node = <S extends Schema<unknown>>(kind: Kind, check: Check, part: Part): S =>
  // eslint-disable-next-line reliability/no-unsafe-type-narrowing -- `~type` exists only in the type system: the node carries no member for it
  Object.freeze({
    kind,
    check,
    min: part.min ?? -Number.MAX_VALUE,
    max: part.max ?? Number.MAX_VALUE,
    int: part.int ?? false,
    pattern: part.pattern ?? null,
    value: part.value,
    values: part.values ?? null,
    item: part.item ?? null,
    keys: part.keys ?? null,
    fields: part.fields ?? null,
    optional: false,
    tag: part.tag ?? null,
    cases: part.cases ?? null,
  }) as unknown as S;

export interface StringOptions {
  readonly min?: number;
  readonly max?: number;
  readonly length?: number;
  readonly pattern?: RegExp;
}

export const string = (options: StringOptions = {}): Schema<string> => {
  const { pattern } = options;
  // A global or sticky pattern remembers where it stopped, so the same input would pass, then fail.
  if (pattern !== undefined && (pattern.global || pattern.sticky)) {
    throw new TypeError(`pattern ${String(pattern)} keeps state between tests. fix: remove its g and y flags`);
  }
  return node('string', isString, { min: options.length ?? options.min ?? 0, max: options.length ?? options.max, pattern });
};

export interface NumberOptions {
  readonly min?: number;
  readonly max?: number;
  readonly int?: boolean;
}

/** A finite number: `NaN` and the infinities fail, as they do in JSON. */
export const number = (options: NumberOptions = {}): Schema<number> => node('number', isNumber, options);

export const boolean = (): Schema<boolean> => node('boolean', isBoolean, {});

export const literal = <const T extends string | number | boolean | null>(value: T): Schema<T> =>
  node('literal', isLiteral, { value });

export const enumOf = <const T extends readonly (string | number)[]>(values: T): Schema<T[number]> =>
  node('enum', isMember, { values: new Set(values) });

export interface ArrayOptions {
  readonly min?: number;
  readonly max?: number;
}

export const array = <T>(item: Schema<T>, options: ArrayOptions = {}): Schema<T[]> =>
  node('array', isArray, { item, min: options.min ?? 0, max: options.max });

/** Marks an object's field as one that may be absent. */
export const optional = <T>(schema: Schema<T>): OptionalSchema<T | undefined> =>
  Object.freeze({ ...schema, optional: true }) as OptionalSchema<T | undefined>;

/** Keys the shape does not name are allowed and left alone. */
export const object = <const S extends Shape>(shape: S): Schema<ObjectOf<S>> =>
  node('object', isObject, { keys: Object.keys(shape), fields: Object.values(shape) });

type Cases = Readonly<Record<string, Schema<unknown>>>;

/** One object schema per value of `tag`. The case is picked by that value, never by trying each. */
export const discriminated = <const C extends Cases>(tag: string, cases: C): Schema<C[keyof C]['~type']> =>
  node('discriminated', isCase, { tag, cases: Object.freeze({ ...cases }) });
