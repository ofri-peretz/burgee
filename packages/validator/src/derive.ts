import { enumOf, type Flat, type Node, type ObjectFull, type ObjectOf, type Out, type Same, type Schema, type Shape } from './schema.js';

/**
 * Schemas made from an object schema: data in, data out. Each returns a new frozen node and leaves
 * the one it was given alone, so they work on each other's results, and each is a function of its
 * own, so a bundle carries only the ones it calls.
 *
 * What the schema does with keys its shape does not name is kept: a strict object stays strict
 * about its new keys, and one with a schema for the rest keeps holding the rest to it.
 */

type Entry = readonly [key: string, field: Node];

/** Every key may be absent or `undefined`. */
type Loose<T> = { [K in keyof T]?: T[K] | undefined };
/** Every key is there, and not `undefined`. */
type Present<T> = { [K in keyof T]-?: Exclude<T[K], undefined> };

/** The keys of an object schema with their fields. Only `object` and `recordOf` make a schema that has them. */
const entriesOf = (schema: Node, verb: string): Entry[] => {
  if (schema.kind !== 'object') {
    throw new TypeError(`cannot ${verb} a schema of kind ${String(schema.kind)}: it has no keys. fix: give it a schema built with \`object\``);
  }
  const fields = schema.fields as readonly Node[];
  return (schema.keys as readonly string[]).map((key, index) => [key, fields[index] as Node]);
};

/** The same object schema with these keys and fields. An object that closes or strips knows its keys as a set, and gets the new one. */
const reshaped = <S>(schema: Node, entries: readonly Entry[]): S => {
  const keys = entries.map(([key]) => key);
  const fields = entries.map(([, field]) => field);
  return Object.freeze({ ...schema, keys, fields, values: schema.values === null ? null : new Set(keys) }) as S;
};

/** Only the named keys. A name the schema does not have is no key of the result. */
const pick = <T, O, const K extends keyof T & string>(schema: Schema<T, O>, keys: readonly K[]): Schema<Pick<T, K>, [O] extends [Same] ? Same : Pick<O, K & keyof O>> => {
  const wanted = new Set<string>(keys);
  return reshaped(
    schema,
    entriesOf(schema, 'pick from').filter(([key]) => wanted.has(key)),
  );
};

/** Every key but the named ones. */
const omit = <T, O, const K extends keyof T & string>(schema: Schema<T, O>, keys: readonly K[]): Schema<Omit<T, K>, [O] extends [Same] ? Same : Omit<O, K>> => {
  const unwanted = new Set<string>(keys);
  return reshaped(
    schema,
    entriesOf(schema, 'omit from').filter(([key]) => !unwanted.has(key)),
  );
};

/** Every key optional: absent or `undefined`. A field keeps its default. */
const partial = <T, O>(schema: Schema<T, O>): Schema<Loose<T>, [O] extends [Same] ? Same : Loose<O>> =>
  reshaped(
    schema,
    entriesOf(schema, 'make partial').map(([key, field]) => [key, Object.freeze({ ...field, optional: true })]),
  );

/** Every key required: there, and not `undefined`. */
const required = <T, O>(schema: Schema<T, O>): Schema<Present<T>, [O] extends [Same] ? Same : Present<O>> =>
  reshaped(
    schema,
    entriesOf(schema, 'make required').map(([key, field]) => [key, Object.freeze({ ...field, optional: false })]),
  );

/** The schema with more keys. One it already has is replaced where it stood, as a spread would. */
const extend = <T, O, const S extends Shape>(
  schema: Schema<T, O>,
  shape: S,
): Schema<Flat<Omit<T, keyof S> & ObjectOf<S>>, [O | S[keyof S]['~out']] extends [Same] ? Same : Flat<Omit<Out<T, O>, keyof S> & ObjectFull<S>>> =>
  reshaped(schema, [...new Map<string, Node>([...entriesOf(schema, 'extend'), ...Object.entries(shape)])]);

/** One of the schema's keys, as a string. */
const keyof = <T>(schema: Schema<T, unknown>): Schema<keyof T & string> => enumOf(entriesOf(schema, 'take the keys of').map(([key]) => key)) as Schema<keyof T & string>;

/**
 * The same schema, typed read-only. Nothing is frozen: `parse` hands back the caller's own value
 * when nothing changed (parity.md decision 10), and freezing that would write to it. Of the five
 * libraries only zod freezes; valibot, arktype and typebox mark the type alone, as this does.
 */
const readonly = <T, O>(schema: Schema<T, O>): Schema<Readonly<T>, [O] extends [Same] ? Same : Readonly<O>> => schema as Schema<Readonly<T>, never>;

/** What a brand adds to a type: a member no value has, named by the brand. Two brands on one type are both there. */
interface Brand<B extends string | symbol> {
  readonly '~brand': { readonly [K in B]: true };
}

/**
 * The same schema, with a brand on its type: a `string` branded `'UserId'` is not assignable from a
 * plain `string`, so only a value that passed this schema can be used as one. Type only, as
 * `readonly` is: the node is the one it was given. The brand is on the input type too, which is
 * what a passing `check` narrows to.
 */
const brand = <T, O, const B extends string | symbol>(schema: Schema<T, O>, _name: B): Schema<T & Brand<B>, [O] extends [Same] ? Same : O & Brand<B>> => schema as Schema<T & Brand<B>, never>;

export { type Brand, brand, extend, keyof, omit, partial, pick, readonly, required };
