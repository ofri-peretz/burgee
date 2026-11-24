import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  type AnySchema,
  array,
  assert,
  boolean,
  check,
  discriminated,
  discriminatedBy,
  exactOptional,
  extend,
  type Infer,
  type InferInput,
  type InferOutput,
  intersection,
  type Invalid,
  lazy,
  literal,
  nullable,
  nullish,
  number,
  object,
  omit,
  optional,
  parse,
  type Parsed,
  partial,
  pick,
  readonly,
  record,
  recordOf,
  required,
  type Same,
  type Schema,
  string,
  tuple,
  union,
} from './index.js';

/**
 * Wave 2, group 5: a schema has an input type, which is what `check` accepts, and an output type,
 * which is what `parse` produces. They differ where a default fills a key (and, from group 4, where
 * a transform maps a value).
 */

const Filled = object({ a: optional(string(), { default: 'd' }), b: optional(number()), c: boolean() });
type FilledIn = { c: boolean; a?: string | undefined; b?: number | undefined };
type FilledOut = { a: string; c: boolean; b?: number | undefined };

describe('the input and the output type', () => {
  it('are one type for a schema that fills and maps nothing, and the second is not worked out', () => {
    const Plain = object({ a: string(), b: optional(number()), c: array(object({ d: nullable(boolean()) })) });
    type Shape = { a: string; c: { d: boolean | null }[]; b?: number | undefined };
    expectTypeOf<Infer<typeof Plain>>().toEqualTypeOf<Shape>();
    expectTypeOf<InferInput<typeof Plain>>().toEqualTypeOf<Shape>();
    expectTypeOf<InferOutput<typeof Plain>>().toEqualTypeOf<Shape>();
    expectTypeOf(Plain).toEqualTypeOf<Schema<Shape>>();
    expectTypeOf<(typeof Plain)['~out']>().toEqualTypeOf<Same>();
    expectTypeOf(parse(Plain, {})).toEqualTypeOf<Parsed<Shape>>();
  });

  it('differ where a default fills a key: the key may be absent going in and is there coming out', () => {
    expectTypeOf<Infer<typeof Filled>>().toEqualTypeOf<FilledIn>();
    expectTypeOf<InferInput<typeof Filled>>().toEqualTypeOf<FilledIn>();
    expectTypeOf<InferOutput<typeof Filled>>().toEqualTypeOf<FilledOut>();
    expectTypeOf(parse(Filled, {})).toEqualTypeOf<Parsed<FilledOut>>();
    const result = parse(Filled, { c: true });
    expect(result).toEqual({ ok: true, value: { a: 'd', c: true } });
    // An explicit `undefined` for a default is no default, and the key stays optional.
    const none = object({ a: optional(string(), {}) });
    expectTypeOf<InferOutput<typeof none>>().toEqualTypeOf<{ a?: string | undefined }>();
    // @ts-expect-error a default is a value of the schema's own type
    optional(number(), { default: 'one' });
  });

  it('carry the difference out through whatever holds the schema', () => {
    expectTypeOf<InferOutput<ReturnType<typeof array<FilledIn, FilledOut>>>>().toEqualTypeOf<FilledOut[]>();
    const list = array(Filled);
    expectTypeOf<InferInput<typeof list>>().toEqualTypeOf<FilledIn[]>();
    expectTypeOf<InferOutput<typeof list>>().toEqualTypeOf<FilledOut[]>();
    const pair = tuple([Filled, string()]);
    expectTypeOf<InferInput<typeof pair>>().toEqualTypeOf<[FilledIn, string]>();
    expectTypeOf<InferOutput<typeof pair>>().toEqualTypeOf<[FilledOut, string]>();
    const rested = tuple([string()], { rest: Filled });
    expectTypeOf<InferInput<typeof rested>>().toEqualTypeOf<[string, ...FilledIn[]]>();
    expectTypeOf<InferOutput<typeof rested>>().toEqualTypeOf<[string, ...FilledOut[]]>();
    const restedItems = tuple([Filled], { rest: string() });
    expectTypeOf<InferOutput<typeof restedItems>>().toEqualTypeOf<[FilledOut, ...string[]]>();
    const byKey = record(Filled);
    expectTypeOf<InferOutput<typeof byKey>>().toEqualTypeOf<Record<string, FilledOut>>();
    const every = recordOf(['x', 'y'], Filled);
    expectTypeOf<InferInput<typeof every>>().toEqualTypeOf<Record<'x' | 'y', FilledIn>>();
    expectTypeOf<InferOutput<typeof every>>().toEqualTypeOf<Record<'x' | 'y', FilledOut>>();
    const orNull = nullable(Filled);
    expectTypeOf<InferOutput<typeof orNull>>().toEqualTypeOf<FilledOut | null>();
    const orNothing = nullish(Filled);
    expectTypeOf<InferInput<typeof orNothing>>().toEqualTypeOf<FilledIn | null | undefined>();
    expectTypeOf<InferOutput<typeof orNothing>>().toEqualTypeOf<FilledOut | null | undefined>();
    const either = union([Filled, string()]);
    expectTypeOf<InferInput<typeof either>>().toEqualTypeOf<FilledIn | string>();
    expectTypeOf<InferOutput<typeof either>>().toEqualTypeOf<FilledOut | string>();
    const both = intersection([Filled, object({ z: number() })]);
    expectTypeOf<InferInput<typeof both>>().toEqualTypeOf<FilledIn & { z: number }>();
    expectTypeOf<InferOutput<typeof both>>().toEqualTypeOf<FilledOut & { z: number }>();
    const later = lazy(() => Filled);
    expectTypeOf<InferOutput<typeof later>>().toEqualTypeOf<FilledOut>();
    const nested = object({ inner: Filled, maybe: optional(Filled), exact: exactOptional(Filled), orNothing });
    expectTypeOf<InferInput<typeof nested>>().toEqualTypeOf<{ inner: FilledIn; maybe?: FilledIn | undefined; exact?: FilledIn; orNothing?: FilledIn | null | undefined }>();
    expectTypeOf<InferOutput<typeof nested>>().toEqualTypeOf<{ inner: FilledOut; maybe?: FilledOut | undefined; exact?: FilledOut; orNothing?: FilledOut | null | undefined }>();
    const open = object({ a: string() }, { unknown: Filled });
    expectTypeOf<InferInput<typeof open>>().toEqualTypeOf<{ a: string } & Readonly<Record<string, FilledIn>>>();
    expectTypeOf<InferOutput<typeof open>>().toEqualTypeOf<{ a: string } & Readonly<Record<string, FilledOut>>>();
  });

  it('carry it through a discriminated union, by a record of cases or a list', () => {
    const A = object({ k: literal('a'), n: optional(number(), { default: 0 }) });
    const B = object({ k: literal('b') });
    const byRecord = discriminated('k', { a: A, b: B });
    expectTypeOf<InferInput<typeof byRecord>>().toEqualTypeOf<{ k: 'a'; n?: number | undefined } | { k: 'b' }>();
    expectTypeOf<InferOutput<typeof byRecord>>().toEqualTypeOf<{ k: 'a'; n: number } | { k: 'b' }>();
    const byList = discriminatedBy('k', [A, B]);
    expectTypeOf<InferOutput<typeof byList>>().toEqualTypeOf<{ k: 'a'; n: number } | { k: 'b' }>();
    const plain = discriminated('k', { b: B });
    expectTypeOf(plain).toEqualTypeOf<Schema<{ k: 'b' }>>();
  });

  it('carry it through a schema made from an object schema', () => {
    const picked = pick(Filled, ['a', 'c']);
    expectTypeOf<InferInput<typeof picked>>().toEqualTypeOf<{ c: boolean; a?: string | undefined }>();
    expectTypeOf<InferOutput<typeof picked>>().toEqualTypeOf<{ a: string; c: boolean }>();
    const omitted = omit(Filled, ['c']);
    expectTypeOf<InferOutput<typeof omitted>>().toEqualTypeOf<{ a: string; b?: number | undefined }>();
    const loose = partial(Filled);
    expectTypeOf<InferInput<typeof loose>>().toEqualTypeOf<{ a?: string | undefined; b?: number | undefined; c?: boolean | undefined }>();
    expectTypeOf<InferOutput<typeof loose>>().toEqualTypeOf<{ a?: string | undefined; b?: number | undefined; c?: boolean | undefined }>();
    const strict = required(Filled);
    expectTypeOf<InferOutput<typeof strict>>().toEqualTypeOf<{ a: string; b: number; c: boolean }>();
    const more = extend(Filled, { d: optional(number(), { default: 1 }) });
    expectTypeOf<InferInput<typeof more>>().toEqualTypeOf<{ c: boolean; a?: string | undefined; b?: number | undefined; d?: number | undefined }>();
    expectTypeOf<InferOutput<typeof more>>().toEqualTypeOf<{ a: string; c: boolean; b?: number | undefined; d: number }>();
    const moreOfPlain = extend(object({ a: string() }), { d: optional(number(), { default: 1 }) });
    expectTypeOf<InferOutput<typeof moreOfPlain>>().toEqualTypeOf<{ a: string; d: number }>();
    const fixed = readonly(Filled);
    expectTypeOf<InferOutput<typeof fixed>>().toEqualTypeOf<Readonly<FilledOut>>();
    // One that fills nothing stays one type.
    expectTypeOf(pick(object({ a: string(), b: number() }), ['a'])).toEqualTypeOf<Schema<Pick<{ a: string; b: number }, 'a'>>>();
    expectTypeOf(extend(object({ a: string() }), { b: number() })).toEqualTypeOf<Schema<{ a: string; b: number }>>();
  });

  it('can be written by hand, the output only where it differs', () => {
    interface Tree {
      v: number;
      kids?: Tree[] | undefined;
    }
    interface Grown {
      v: number;
      kids: Grown[];
    }
    const TreeSchema: Schema<Tree, Grown> = object({ v: number(), kids: optional(array(lazy(() => TreeSchema)), { default: [] }) });
    expectTypeOf<InferInput<typeof TreeSchema>>().toEqualTypeOf<Tree>();
    expectTypeOf<InferOutput<typeof TreeSchema>>().toEqualTypeOf<Grown>();
    expect(parse(TreeSchema, { v: 1, kids: [{ v: 2 }] })).toEqual({ ok: true, value: { v: 1, kids: [{ v: 2, kids: [] }] } });
    const any: AnySchema[] = [TreeSchema, Filled, string()];
    expect(any).toHaveLength(3);
    // @ts-expect-error a schema whose output differs is not one whose output is its input
    const wrong: Schema<FilledIn> = Filled;
    expect(wrong).toBe(Filled);
  });

  it('check narrows to the input type, whatever the output is', () => {
    const value: unknown = { c: true };
    expect(check(Filled, value)).toBe(true);
    if (check(Filled, value)) expectTypeOf(value).toEqualTypeOf<FilledIn>();
  });
});

/** A call of `assert`, to be made later. */
const asserting =
  (schema: AnySchema, value: unknown): (() => void) =>
  () => {
    assert(schema, value);
  };

describe('assert', () => {
  it('beh.assert: returns for a value the schema describes, and the value is then typed', () => {
    const value: unknown = { c: true, b: 1 };
    assert(Filled, value);
    expectTypeOf(value).toEqualTypeOf<FilledIn>();
    expect(value.b).toBe(1);
    const text: unknown = 'a';
    assert(string(), text);
    expectTypeOf(text).toEqualTypeOf<string>();
  });

  it('throws a TypeError that says the first issue and where, and carries them all', () => {
    const run = asserting(Filled, { a: 1, c: 'x' });
    expect(run).toThrow(TypeError);
    expect(run).toThrow(
      'the value is not what the schema describes. At "/a": expected a string, got number 1. fix: send a string (and 1 more: see `issues` on this error)',
    );
    let thrown: unknown;
    try {
      run();
    } catch (error) {
      thrown = error;
    }
    expect((thrown as Invalid).issues).toEqual([
      { path: '/a', keyword: 'type', message: 'expected a string, got number 1. fix: send a string' },
      { path: '/c', keyword: 'type', message: 'expected true or false, got string "x". fix: send a boolean' },
    ]);
  });

  it('says nothing of more when there is one issue, and counts them when there are many', () => {
    const one = asserting(string(), 1);
    expect(one).toThrow(/^the value is not what the schema describes\. At "": expected a string, got number 1\. fix: send a string$/u);
    const three = asserting(object({ a: string(), b: string(), c: string() }), {});
    expect(three).toThrow('At "/a": expected a value, got undefined undefined. fix: add "a" (and 2 more: see `issues` on this error)');
  });

  // Like check it reads and never writes: a value only `parse` would accept is refused.
  it('fills no default and coerces nothing', () => {
    const run = asserting(number({ coerce: true }), '1');
    expect(run).toThrow('At "": expected a number, got string "1". fix: send a finite number');
    const input = Object.freeze({ c: true });
    assert(Filled, input);
    expect(input).toEqual({ c: true });
  });
});
