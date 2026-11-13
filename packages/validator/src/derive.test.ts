import { describe, expect, expectTypeOf, it } from 'vitest';

import { verdicts } from './__fixtures__/readers.js';
import { emit } from './emit.js';
import {
  array,
  boolean,
  enumOf,
  exactOptional,
  extend,
  type Infer,
  issues,
  keyof,
  literal,
  nullish,
  number,
  object,
  omit,
  optional,
  parse,
  partial,
  pick,
  readonly,
  record,
  recordOf,
  required,
  type Schema,
  string,
  tuple,
  union,
} from './index.js';

/**
 * Wave 2, group 3: schemas made from schemas. The values each row accepts and refuses are the
 * competitors' probes' (benchmarks/results/validator/parity-2026-11-13), and `verdicts` puts each
 * to every reader.
 */

const AB = object({ a: string(), b: number() });
const Strict = object({ a: string(), b: optional(number()) }, { unknown: 'strict' });
const Strip = object({ a: string(), b: number({ coerce: true }) }, { unknown: 'strip' });
const Rest = object({ a: string(), b: number() }, { unknown: boolean() });

const YES = (count: number): boolean[] => Array.from({ length: count }, () => true);
const NO = (count: number): boolean[] => Array.from({ length: count }, () => false);

/** Each maker, handed what is not an object schema, and what it says. */
const REFUSALS: [string, (schema: Schema<never>) => unknown, string][] = [
  ['pick', (schema) => pick(schema, []), 'cannot pick from a schema of kind string: it has no keys. fix: give it a schema built with `object`'],
  ['omit', (schema) => omit(schema, []), 'cannot omit from a schema of kind string: it has no keys. fix: give it a schema built with `object`'],
  ['partial', (schema) => partial(schema), 'cannot make partial a schema of kind string: it has no keys. fix: give it a schema built with `object`'],
  ['required', (schema) => required(schema), 'cannot make required a schema of kind string: it has no keys. fix: give it a schema built with `object`'],
  ['extend', (schema) => extend(schema, {}), 'cannot extend a schema of kind string: it has no keys. fix: give it a schema built with `object`'],
  ['keyof', (schema) => keyof(schema), 'cannot take the keys of a schema of kind string: it has no keys. fix: give it a schema built with `object`'],
];

describe('a schema made from an object schema', () => {
  it.each<[string, Schema<unknown>, unknown[], unknown[]]>([
    ['obj.pick', pick(AB, ['a']), [{ a: 'x' }, { a: 'x', b: 'not checked' }], [{ b: 1 }, {}, null]],
    ['obj.omit', omit(AB, ['a']), [{ b: 1 }, { a: 1, b: 1 }], [{ a: 'x' }, {}]],
    ['obj.partial', partial(AB), [{}, { a: 'x' }, { b: 1 }, { a: undefined, b: undefined }], [{ a: 1 }, { b: 'x' }, null]],
    ['obj.required', required(object({ a: optional(string()) })), [{ a: 'x' }], [{}, { a: undefined }, { a: 1 }]],
    ['obj.extend', extend(AB, { c: boolean() }), [{ a: 'x', b: 1, c: true }], [{ a: 'x', b: 1 }, { a: 'x', c: true }]],
    ['obj.extend, over a key it has', extend(AB, { a: number() }), [{ a: 1, b: 1 }], [{ a: 'x', b: 1 }]],
    ['obj.keyof', keyof(AB), ['a', 'b'], ['c', 0, undefined]],
    ['obj.readonly', readonly(AB), [{ a: 'x', b: 1 }], [{ a: 'x' }]],
  ])('%s: every reader accepts what the probes accept and refuses what they refuse', (_, schema, accepted, refused) => {
    expect(verdicts(schema, accepted)).toEqual(YES(accepted.length));
    expect(verdicts(schema, refused)).toEqual(NO(refused.length));
  });

  it('is a new frozen node, and leaves the one it was made from alone', () => {
    const before = JSON.stringify(AB);
    for (const made of [pick(AB, ['a']), omit(AB, ['a']), partial(AB), required(AB), extend(AB, { c: boolean() })]) {
      expect(made).not.toBe(AB);
      expect(Object.isFrozen(made)).toBe(true);
      expect(Object.keys(made)).toEqual(Object.keys(AB));
      expect(made.kind).toBe('object');
      expect(made.check).toBe(AB.check);
    }
    for (const field of [...(partial(AB).fields ?? []), ...(required(partial(AB)).fields ?? [])]) expect(Object.isFrozen(field)).toBe(true);
    expect(JSON.stringify(AB)).toBe(before);
    expect(AB.fields?.map((field) => field.optional)).toEqual([false, false]);
  });

  it('has the keys the name says, in the order they stood', () => {
    const Wide = object({ a: string(), b: number(), c: boolean(), d: optional(string()) });
    expect(pick(Wide, ['c', 'a']).keys).toEqual(['a', 'c']);
    expect(pick(Wide, ['c', 'a']).fields).toEqual([Wide.fields?.[0], Wide.fields?.[2]]);
    expect(omit(Wide, ['c', 'a']).keys).toEqual(['b', 'd']);
    expect(omit(Wide, ['c', 'a']).fields).toEqual([Wide.fields?.[1], Wide.fields?.[3]]);
    expect(pick(Wide, []).keys).toEqual([]);
    expect(omit(Wide, []).keys).toEqual(['a', 'b', 'c', 'd']);
    expect(partial(Wide).keys).toEqual(['a', 'b', 'c', 'd']);
    expect(partial(Wide).fields?.map((field) => [field.kind, field.optional])).toEqual([['string', true], ['number', true], ['boolean', true], ['string', true]]);
    expect(required(Wide).fields?.map((field) => [field.kind, field.optional])).toEqual([['string', false], ['number', false], ['boolean', false], ['string', false]]);
    const more = extend(Wide, { b: literal(1), e: number(), a: boolean() });
    expect(more.keys).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(more.fields?.map((field) => field.kind)).toEqual(['boolean', 'literal', 'boolean', 'string', 'number']);
    expect([...(keyof(Wide).values ?? [])]).toEqual(['a', 'b', 'c', 'd']);
    expect(keyof(Wide).kind).toBe('enum');
    // A name the schema does not have is no key of the result: the type refuses it, and the node has no place for it.
    expect(pick(Wide as Schema<Record<string, unknown>>, ['z', 'a']).keys).toEqual(['a']);
  });

  // What an object does with the keys its shape does not name goes on to the schema made from it.
  describe('keeps what the object does with keys its shape does not name', () => {
    it('for one that keeps them: there is still no set of its keys', () => {
      expect([pick(AB, ['a']).values, partial(AB).values, extend(AB, { c: string() }).values]).toEqual([null, null, null]);
    });

    it('for a strict one: a key it no longer names is refused, and one it gained is accepted', () => {
      expect(verdicts(pick(Strict, ['a']), [{ a: 'x' }, { a: 'x', b: 1 }, { a: 'x', z: 1 }])).toEqual([true, false, false]);
      expect(verdicts(omit(Strict, ['b']), [{ a: 'x' }, { a: 'x', b: 1 }])).toEqual([true, false]);
      expect(verdicts(extend(Strict, { c: boolean() }), [{ a: 'x', c: true }, { a: 'x', b: 1, c: false }, { a: 'x', c: true, d: 1 }, { a: 'x' }])).toEqual([true, true, false, false]);
      expect(verdicts(partial(Strict), [{}, { b: 1 }, { z: 1 }])).toEqual([true, true, false]);
      expect(verdicts(required(Strict), [{ a: 'x', b: 1 }, { a: 'x' }, { a: 'x', b: 1, z: 1 }])).toEqual([true, false, false]);
      expect([...(pick(Strict, ['a']).values ?? [])]).toEqual(['a']);
      expect([...(extend(Strict, { c: boolean() }).values ?? [])]).toEqual(['a', 'b', 'c']);
      expect(issues(pick(Strict, ['a']), { a: 'x', b: 1 })).toEqual([{ path: '/b', keyword: 'unknown', message: 'expected no such key, got number 1. fix: remove "b"' }]);
    });

    it('for one with a schema for the rest: a key it no longer names is held to that schema', () => {
      expect(verdicts(omit(Rest, ['a']), [{ b: 1 }, { b: 1, a: true }, { b: 1, a: 'x' }])).toEqual([true, true, false]);
      expect(verdicts(extend(Rest, { c: string() }), [{ a: 'x', b: 1, c: 'y' }, { a: 'x', b: 1, c: true }, { a: 'x', b: 1, c: 'y', d: false }])).toEqual([true, false, true]);
    });

    it('for one that strips: parse leaves out a key it no longer names', () => {
      expect(parse(pick(Strip, ['a']), { a: 'x', b: '1', c: 2 })).toEqual({ ok: true, value: { a: 'x' } });
      expect(parse(extend(Strip, { c: number() }), { a: 'x', b: '1', c: 2, d: 3 })).toEqual({ ok: true, value: { a: 'x', b: 1, c: 2 } });
      expect(parse(partial(Strip), { b: '2', z: 0 })).toEqual({ ok: true, value: { b: 2 } });
    });
  });

  it('works on what another of them made', () => {
    const made = required(partial(pick(extend(omit(Strict, ['b']), { c: optional(number()), d: boolean() }), ['a', 'c'])));
    expect(made.keys).toEqual(['a', 'c']);
    expect(verdicts(made, [{ a: 'x', c: 1 }, { a: 'x' }, { c: 1 }, { a: 'x', c: 1, d: true }, { a: 'x', c: 1, b: 1 }])).toEqual([true, false, false, false, false]);
    expect(verdicts(keyof(partial(extend(AB, { c: string() }))), ['a', 'b', 'c', 'd'])).toEqual([true, true, true, false]);
    const fromRecord = partial(pick(recordOf(['x', 'y', 'z'], number()), ['x', 'y']));
    expect(verdicts(fromRecord, [{}, { x: 1 }, { x: 1, y: 2 }, { z: 3 }, { x: 'a' }])).toEqual([true, true, true, false, false]);
    expect(verdicts(extend(pick(AB, []), {}), [{}, { anything: 1 }, null])).toEqual([true, true, false]);
  });

  it('makes of a field what the name says, whatever it was', () => {
    const Mixed = object({ plain: string(), loose: optional(string()), exact: exactOptional(string()), filled: optional(string(), { default: 'd' }), either: nullish(string()) });
    expect(partial(Mixed).fields?.map((field) => field.optional)).toEqual([true, true, true, true, true]);
    expect(required(Mixed).fields?.map((field) => field.optional)).toEqual([false, false, false, false, false]);
    const all = { plain: 'a', loose: 'b', exact: 'c', filled: 'e', either: null };
    expect(verdicts(required(Mixed), [all, { ...all, exact: undefined }, { ...all, loose: undefined }, { ...all, either: undefined }, { ...all, plain: undefined }])).toEqual([true, false, false, false, false]);
    expect(verdicts(partial(Mixed), [{}, { exact: undefined }, { plain: undefined, either: undefined }, { plain: 1 }])).toEqual([true, true, true, false]);
    // A default is the field's, and stays: what was required and had none is still filled by nothing.
    expect(parse(partial(Mixed), {})).toEqual({ ok: true, value: { filled: 'd' } });
    expect(parse(required(Mixed), { plain: 'a', loose: 'b', exact: 'c', either: null })).toEqual({ ok: true, value: { plain: 'a', loose: 'b', exact: 'c', either: null, filled: 'd' } });
  });

  it.each(REFUSALS)('%s refuses a schema that is not an object schema, and says what to give it', (_, make, message) => {
    expect(() => make(string() as Schema<never>)).toThrow(TypeError);
    expect(() => make(string() as Schema<never>)).toThrow(message);
    expect(() => make(record(string()) as Schema<never>)).toThrow('a schema of kind record');
    expect(() => make(union([AB, AB]) as Schema<never>)).toThrow('a schema of kind union');
  });

  it('is typed as the object type the name says', () => {
    const Wide = object({ a: string(), b: optional(number()), c: boolean() });
    expectTypeOf<Infer<ReturnType<typeof pick<Infer<typeof Wide>, 'a' | 'b'>>>>().toEqualTypeOf<{ a: string; b?: number | undefined }>();
    expectTypeOf(pick(Wide, ['a', 'b'])).toEqualTypeOf<Schema<Pick<{ a: string; c: boolean; b?: number | undefined }, 'a' | 'b'>>>();
    expectTypeOf<Infer<typeof picked>>().toEqualTypeOf<{ a: string; b?: number | undefined }>();
    expectTypeOf<Infer<typeof omitted>>().toEqualTypeOf<{ c: boolean; b?: number | undefined }>();
    expectTypeOf<Infer<typeof loose>>().toEqualTypeOf<{ a?: string | undefined; b?: number | undefined; c?: boolean | undefined }>();
    expectTypeOf<Infer<typeof strict>>().toEqualTypeOf<{ a: string; b: number; c: boolean }>();
    expectTypeOf<Infer<typeof more>>().toEqualTypeOf<{ b?: number | undefined; c: boolean; a: number; d: string[]; e?: string | undefined }>();
    expectTypeOf<Infer<typeof keys>>().toEqualTypeOf<'a' | 'b' | 'c'>();
    expectTypeOf<Infer<typeof fixed>>().toEqualTypeOf<{ readonly a: string; readonly c: boolean; readonly b?: number | undefined }>();
    expectTypeOf<Infer<typeof list>>().toEqualTypeOf<readonly number[]>();
    // @ts-expect-error a key the schema does not have cannot be picked
    pick(Wide, ['z']);
    // @ts-expect-error nor omitted
    omit(Wide, ['z']);
    const picked = pick(Wide, ['a', 'b']);
    const omitted = omit(Wide, ['a']);
    const loose = partial(Wide);
    const strict = required(Wide);
    const more = extend(Wide, { a: number(), d: array(string()), e: optional(string()) });
    const keys = keyof(Wide);
    const fixed = readonly(Wide);
    const list = readonly(array(number()));
    expect(fixed).toBe(Wide);
  });

  // parity.md decision 10: the value handed back may be the caller's own, so nothing is frozen.
  it('readonly marks the type and freezes nothing', () => {
    const input = { a: 'x', b: 1 };
    const result = parse(readonly(AB), input);
    expect(result.ok && result.value).toBe(input);
    expect(Object.isFrozen(input)).toBe(false);
    const filled = parse(readonly(object({ a: optional(string(), { default: 'd' }) })), {});
    expect(filled.ok && Object.isFrozen(filled.value)).toBe(false);
  });
});

describe('an exact optional key', () => {
  const Exact = object({ a: exactOptional(string()), b: optional(string()) });

  it('obj.exact_optional: may be absent, and when it is there is not undefined', () => {
    expect(verdicts(Exact, [{}, { a: 'x' }, { b: undefined }])).toEqual(YES(3));
    expect(verdicts(Exact, [{ a: undefined }, { a: 1 }, { a: null }, { a: undefined, b: 'x' }])).toEqual(NO(4));
    expectTypeOf<Infer<typeof Exact>>().toEqualTypeOf<{ a?: string; b?: string | undefined }>();
  });

  // parity.md decision 3: a key the prototype holds is there.
  it('counts a key the prototype holds as there', () => {
    expect(verdicts(Exact, [Object.create({ a: 'x' }), Object.create({ a: undefined }), Object.create({ b: undefined })])).toEqual([true, false, true]);
  });

  it('says that the key must go or be given a value', () => {
    expect(issues(Exact, { a: undefined })).toEqual([{ path: '/a', keyword: 'undefined', message: 'expected a value, or no key at all, got undefined undefined. fix: remove "a", or give it a value' }]);
    expect(issues(object({ a: exactOptional(string()), z: string() }), { a: undefined }, { first: true })).toHaveLength(1);
    expect(issues(object({ z: string(), a: exactOptional(string()) }), { a: undefined }, { first: true })).toEqual([{ path: '/z', keyword: 'required', message: 'expected a value, got undefined undefined. fix: add "z"' }]);
    expect(issues(object({ z: string(), a: exactOptional(string()) }), { a: undefined })).toHaveLength(2);
  });

  it('is written as a test of the key, and only for that field', () => {
    expect(emit(object({ 'a"': exactOptional(string()), b: optional(string()), c: string() }))).toBe(String.raw`(() => {
const f0 = (v) => typeof v === "object" && v !== null && !Array.isArray(v)
  && (v["a\""] === undefined ? !("a\"" in v) : (typeof v["a\""] === "string"))
  && (v["b"] === undefined || (typeof v["b"] === "string"))
  && (typeof v["c"] === "string");
return (v) => f0(v);
})()`);
  });

  it('is the wrapped schema where there is no key, as optional is', () => {
    expect(verdicts(exactOptional(string()), ['a', undefined])).toEqual([true, false]);
    expect(exactOptional(string()).optional).toBe('exact');
    expect(Object.isFrozen(exactOptional(string()))).toBe(true);
    expectTypeOf<Infer<ReturnType<typeof exactOptional<string>>>>().toEqualTypeOf<string>();
  });

  // A node is data and may be built by hand: whatever is neither true nor false is read as exact, by every reader.
  it('is how every reader takes an optional member that is neither true nor false', () => {
    const odd = object({ a: { ...string(), optional: 'sometimes' } as unknown as Schema<string> });
    expect(verdicts(odd, [{}, { a: 'x' }, { a: undefined }])).toEqual([true, true, false]);
  });
});

describe('a record whose keys are an enum', () => {
  it('col.record_enum_keys: takes those keys and no other, and needs none of them', () => {
    const some = record(number(), { key: enumOf(['a', 'b']) });
    expect(verdicts(some, [{ a: 1, b: 2 }, { a: 1 }, {}])).toEqual(YES(3));
    expect(verdicts(some, [{ a: 1, b: 2, c: 3 }, { a: 'x' }])).toEqual(NO(2));
    expectTypeOf<Infer<typeof some>>().toEqualTypeOf<{ a?: number; b?: number }>();
    expectTypeOf(record(number(), { key: string({ min: 1 }) })).toEqualTypeOf<Schema<Record<string, number>>>();
    expectTypeOf(record(number())).toEqualTypeOf<Schema<Record<string, number>>>();
  });

  it('col.record_enum_exhaustive: recordOf needs every key, and takes no other', () => {
    const all = recordOf(['a', 'b'], number());
    expect(verdicts(all, [{ a: 1, b: 2 }])).toEqual(YES(1));
    expect(verdicts(all, [{ a: 1 }, { a: 1, b: 2, c: 3 }, { a: 1, b: 'x' }, {}, null])).toEqual(NO(5));
    expectTypeOf<Infer<typeof all>>().toEqualTypeOf<Record<'a' | 'b', number>>();
    expect(issues(all, { a: 1, c: 3 }).map((issue) => [issue.path, issue.keyword])).toEqual([
      ['/b', 'required'],
      ['/c', 'unknown'],
    ]);
  });

  it('recordOf is a closed object, built from a copy of the keys it was given', () => {
    const keys = ['a', 'b'];
    const value = number();
    const all = recordOf(keys, value);
    keys.push('c');
    expect([all.kind, all.keys, all.fields, [...(all.values ?? [])], all.unknown]).toEqual(['object', ['a', 'b'], [value, value], ['a', 'b'], 'strict']);
    expect(all.check).toBe(Strict.check);
    expect(Object.isFrozen(all)).toBe(true);
    expect(verdicts(recordOf([], number()), [{}, { a: 1 }])).toEqual([true, false]);
  });
});

describe('a tuple with a schema for the rest', () => {
  const Rested = tuple([string()], { rest: number() });

  it('col.tuple_rest: takes its items and then any number of the rest', () => {
    expect(verdicts(Rested, [['a'], ['a', 1, 2], ['a', 1]])).toEqual(YES(3));
    expect(verdicts(Rested, [['a', 'b'], [], [1], ['a', 1, 'b'], ['a', 1, undefined], 'a', null, { 0: 'a', length: 1 }])).toEqual(NO(8));
    expectTypeOf<Infer<typeof Rested>>().toEqualTypeOf<[string, ...number[]]>();
    expectTypeOf(tuple([string(), boolean()], { rest: nullish(number()) })).toEqualTypeOf<Schema<[string, boolean, ...(number | null | undefined)[]]>>();
    expectTypeOf(tuple([], { rest: string() })).toEqualTypeOf<Schema<string[]>>();
  });

  it('carries the rest in the member an array carries its element in', () => {
    expect([Rested.kind, Rested.fields?.length, Rested.item?.kind, tuple([string()]).item]).toEqual(['tuple', 1, 'number', null]);
  });

  it('with no items of its own is an array of the rest', () => {
    expect(verdicts(tuple([], { rest: number() }), [[], [1], [1, 2], ['a'], [1, 'a']])).toEqual([true, true, true, false, false]);
  });

  it('says how many items it needs at least, and which of the rest is wrong', () => {
    const two = tuple([string(), string()], { rest: number() });
    expect(issues(two, ['a'])).toEqual([{ path: '', keyword: 'length', message: 'expected at least 2 items, got an array. fix: send 2 or more' }]);
    expect(issues(two, ['a', 'b', 1, 'x', 2, null])).toEqual([
      { path: '/3', keyword: 'type', message: 'expected a number, got string "x". fix: send a finite number' },
      { path: '/5', keyword: 'type', message: 'expected a number, got null. fix: send a finite number' },
    ]);
    expect(issues(two, [1]).map((issue) => [issue.path, issue.keyword])).toEqual([
      ['', 'length'],
      ['/0', 'type'],
    ]);
    expect(issues(two, ['a', 'b', 'c'], { first: true })).toHaveLength(1);
    // A tuple without one still says exactly how many, and looks at no item past its last.
    expect(issues(tuple([string()]), ['a', 1, 2])).toEqual([{ path: '', keyword: 'length', message: 'expected exactly 1 items, got an array. fix: send 1' }]);
    expect(issues(tuple([string(), string()]), [1])).toEqual([
      { path: '', keyword: 'length', message: 'expected exactly 2 items, got an array. fix: send 2' },
      { path: '/0', keyword: 'type', message: 'expected a string, got number 1. fix: send a string' },
    ]);
  });

  it('is written as its items and a loop over the rest', () => {
    expect(emit(object({ t: tuple([string(), boolean()], { rest: number({ int: true }) }) }))).toBe(`(() => {
const f0 = (v) => {
  if (!(Array.isArray(v) && v.length >= 2
  && (typeof v[0] === "string")
  && (typeof v[1] === "boolean"))) return false;
  for (let i = 2; i < v.length; i++) if (!(typeof v[i] === "number" && v[i] >= -1.7976931348623157e+308 && v[i] <= 1.7976931348623157e+308 && Number.isInteger(v[i]))) return false;
  return true;
};
const f1 = (v) => typeof v === "object" && v !== null && !Array.isArray(v)
  && (f0(v["t"]));
return (v) => f1(v);
})()`);
  });

  it('parses the rest as it parses the items', () => {
    const schema = tuple([string()], { rest: number({ coerce: true }) });
    const input = Object.freeze(['a', '1', 2, '3']);
    expect(parse(schema, input)).toEqual({ ok: true, value: ['a', 1, 2, 3] });
    expect(input).toEqual(['a', '1', 2, '3']);
    const same = ['a', 1, 2];
    const result = parse(schema, same);
    expect(result.ok && result.value).toBe(same);
    expect(parse(schema, 'a').ok).toBe(false);
    // Without a schema for the rest nothing past the last item is read.
    expect(parse(tuple([string()]), ['a', '1']).ok).toBe(false);
    expect(parse(tuple([string(), number({ coerce: true })]), ['a', '1'])).toEqual({ ok: true, value: ['a', 1] });
  });
});
