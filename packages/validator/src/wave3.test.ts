import { describe, expect, expectTypeOf, it } from 'vitest';

import { verdict, verdicts } from './__fixtures__/readers.js';
import { emit } from './emit.js';
import {
  type AnySchema,
  array,
  brand,
  type Brand,
  check,
  discriminated,
  enumOf,
  exactOptional,
  type Infer,
  type InferOutput,
  issues,
  keysOf,
  literal,
  lowercase,
  mapOf,
  message,
  nan,
  normalize,
  nullable,
  number,
  object,
  optional,
  parse,
  type Parsed,
  pipe,
  preprocess,
  properties,
  record,
  safeInteger,
  type Schema,
  setOf,
  string,
  transform,
  trim,
  tuple,
  undefinedOf,
  union,
  unknown,
  uppercase,
  voidOf,
} from './index.js';
import { toJsonSchema } from './json-schema.js';

/**
 * Wave 3: the features three of the five competitors have. The values each accepts and refuses are
 * the competitors' probes' (benchmarks/results/validator/parity-2026-11-13).
 */

const value = <T>(result: Parsed<T>): T => {
  if (!result.ok) throw new Error(`expected a value, got ${JSON.stringify(result.issues)}`);
  return result.value;
};

const failed = (result: Parsed<unknown>): { path: string; keyword: string }[] => {
  if (result.ok) throw new Error('expected issues, got a value');
  return result.issues.map(({ path, keyword }) => ({ path, keyword }));
};

const upper = (text: string): string => text.toUpperCase();
const trimIfString = (input: unknown): unknown => (typeof input === 'string' ? input.trim() : input);
const lengthOf = (text: string): number => text.length;
const hook = (): string => 'from the hook';
const SAFE = Number.MAX_SAFE_INTEGER;

describe('nan', () => {
  it('prim.nan: accepts NaN and refuses every other number', () => {
    expect(verdicts(nan(), [Number.NaN, 1, 0, Number.POSITIVE_INFINITY, '1', 'NaN', undefined, null, {}])).toEqual([true, false, false, false, false, false, false, false, false]);
  });

  it('says what it wanted, and is one line of emitted text', () => {
    expect(issues(nan(), 1)).toEqual([{ path: '', keyword: 'type', message: 'expected NaN, got number 1. fix: send NaN' }]);
    expect(emit(nan())).toBe('(() => {\n\nreturn (v) => Number.isNaN(v);\n})()');
    expect(nan().kind).toBe('nan');
  });

  it('is a key that must be there', () => {
    expect(verdicts(object({ a: nan() }), [{ a: Number.NaN }, {}, { a: undefined }])).toEqual([true, false, false]);
  });

  it('is no JSON value', () => {
    expect(toJsonSchema(nan()).findings).toEqual([{ path: '', keyword: 'not-json', message: 'NaN is not a JSON value: the document accepts nothing here' }]);
  });
});

describe('voidOf', () => {
  it('prim.void: accepts undefined and refuses null', () => {
    expect(verdicts(voidOf(), [undefined, null, 0, ''])).toEqual([true, false, false, false]);
    expectTypeOf(voidOf()).toEqualTypeOf<Schema<void>>();
  });

  it('is the node of undefinedOf', () => {
    expect(voidOf()).toEqual(undefinedOf());
  });
});

describe('safeInteger', () => {
  it('num.safe_int: accepts 2 ** 53 - 1 and refuses 2 ** 53', () => {
    expect(verdicts(safeInteger(), [SAFE, SAFE + 1, -SAFE, -SAFE - 1, 0, 1.5, '1'])).toEqual([true, false, true, false, true, false, false]);
  });

  it('is a number node whose own bounds are the safe range, so check tests nothing new', () => {
    const schema = safeInteger();
    expect([schema.kind, schema.int, schema.min, schema.max]).toEqual(['number', true, Number.MIN_SAFE_INTEGER, SAFE]);
    expect(schema.check).toBe(number().check);
    expect(schema.own).toBeNull();
    expect(Object.isFrozen(schema)).toBe(true);
    expect(issues(schema, SAFE + 1)[0]?.message).toBe('expected a number of at most 9007199254740991, got number 9007199254740992. fix: send 9007199254740991 or less');
  });

  it('keeps a bound that is tighter, and no bound that is wider', () => {
    const tight = safeInteger({ min: 5, max: 9 });
    expect([tight.min, tight.max]).toEqual([5, 9]);
    const wide = safeInteger({ min: -(2 ** 60), max: 2 ** 60 });
    expect([wide.min, wide.max]).toEqual([Number.MIN_SAFE_INTEGER, SAFE]);
    expect(verdicts(safeInteger({ positive: true, multipleOf: 2 }), [2, 0, -2, 3])).toEqual([true, false, false, false]);
    expect(parse(safeInteger({ coerce: true }), '7')).toEqual({ ok: true, value: 7 });
  });
});

describe('the string transforms', () => {
  it('str.trim, str.lowercase, str.uppercase, str.normalize: the output is the string made over', () => {
    expect(value(parse(trim(string()), ' a '))).toBe('a');
    expect(value(parse(lowercase(string()), 'AbC'))).toBe('abc');
    expect(value(parse(uppercase(string()), 'AbC'))).toBe('ABC');
    expect(value(parse(normalize(string()), 'é'))).toBe('é');
  });

  it('normalize to the form that is named', () => {
    expect(value(parse(normalize(string(), 'NFD'), 'é'))).toBe('é');
    expect(value(parse(normalize(string(), 'NFC'), 'é'))).toBe('é');
    expect(value(parse(normalize(string(), 'NFKC'), 'ﬁ'))).toBe('fi');
    expect(value(parse(normalize(string(), 'NFKD'), 'ﬁé'))).toBe('fié');
  });

  it('refuse a form there is none of, without printing what is not a string', () => {
    expect(() => normalize(string(), 'nfc' as 'NFC')).toThrow('cannot normalize to "nfc": there is no such form. fix: name NFC, NFD, NFKC or NFKD');
    expect(() => normalize(string(), 1 as unknown as 'NFC')).toThrow('cannot normalize to a value of the type number: there is no such form. fix: name NFC, NFD, NFKC or NFKD');
    expect(() => normalize(string(), 'toString' as 'NFC')).toThrow(TypeError);
  });

  it('are transforms: the schema describes the string as it arrives, and they follow one another', () => {
    const schema = lowercase(trim(string({ min: 3 })));
    expect(schema.kind).toBe('transform');
    expect(verdicts(schema, [' A ', 'A', 1])).toEqual([true, false, false]);
    expect(value(parse(schema, ' A '))).toBe('a');
    expect(value(parse(uppercase(enumOf(['a', 'b'])), 'a'))).toBe('A');
    expectTypeOf(schema).toEqualTypeOf<Schema<string, string>>();
    expectTypeOf(uppercase(enumOf(['a', 'b']))).toEqualTypeOf<Schema<'a' | 'b', string>>();
  });

  it('are written as text by the emitter, which has no use for the map', () => {
    expect(emit(trim(string()))).toBe(emit(string()));
    expect(toJsonSchema(normalize(string())).findings.map((finding) => finding.keyword)).toEqual(['transform']);
  });

  it('hold what they made to a schema through a pipe', () => {
    const schema = pipe(trim(string()), string({ min: 1 }));
    expect(value(parse(schema, ' a '))).toBe('a');
    expect(failed(parse(schema, '   '))).toEqual([{ path: '', keyword: 'min' }]);
  });
});

describe('mapOf', () => {
  const Counts = mapOf(string(), number());
  const sym = Symbol('k');
  const obj = {};

  it('col.map: validates a Map, its keys and its values', () => {
    expect(verdicts(Counts, [new Map([['a', 1]]), new Map([[1, 1]]), {}, new Map(), new Map([['a', 'x']]), [], [['a', 1]], null, new Set(['a'])])).toEqual([true, false, false, true, false, false, false, false, false]);
    expect(Counts.kind).toBe('map');
    expectTypeOf(Counts).toEqualTypeOf<Schema<Map<string, number>>>();
  });

  it('says where each entry is wrong: under its key when that is a string or a number, and otherwise its place', () => {
    expect(issues(Counts, {})).toEqual([{ path: '', keyword: 'type', message: 'expected a Map, got an object. fix: send a Map' }]);
    expect(issues(Counts, new Map<unknown, unknown>([['a/b', 'x']]))).toEqual([{ path: '/a~1b', keyword: 'type', message: 'expected a number, got string "x". fix: send a finite number' }]);
    expect(issues(Counts, new Map<unknown, unknown>([[5, 'x']])).map(({ path, keyword, message }) => [path, keyword, message.slice(0, 19)])).toEqual([
      ['/5', 'type', 'expected a string, '],
      ['/5', 'type', 'expected a number, '],
    ]);
    const odd = new Map<unknown, unknown>([['a', 1], [sym, 2], [obj, 3], [4n, 4], [true, 'x']]);
    expect(issues(Counts, odd).map(({ path }) => path)).toEqual(['/1', '/2', '/3', '/4', '/4']);
    expect(issues(Counts, odd, { first: true }).map(({ path }) => path)).toEqual(['/1']);
  });

  it('parses to the same Map when nothing changed, and to a new one when a key or a value did', () => {
    const same = new Map([['a', 1]]);
    expect(value(parse(Counts, same))).toBe(same);
    const copied = value(parse(Counts, same, { copy: true }));
    expect(copied).not.toBe(same);
    expect(copied).toEqual(same);

    const texts = new Map([['a', '1'], ['b', '2']]);
    const read = value(parse(mapOf(string(), number({ coerce: true })), texts));
    expect([...read]).toEqual([['a', 1], ['b', 2]]);
    expect([...texts]).toEqual([['a', '1'], ['b', '2']]);

    const keyed = value(parse(mapOf(transform(string(), upper), number()), new Map([['a', 1], ['b', 2]])));
    expect([...keyed]).toEqual([['A', 1], ['B', 2]]);
    expectTypeOf(keyed).toEqualTypeOf<Map<string, number>>();
    const valued = value(parse(mapOf(string(), transform(string(), lengthOf)), new Map([['a', 'xyz']])));
    expect([...valued]).toEqual([['a', 3]]);
    expectTypeOf(valued).toEqualTypeOf<Map<string, number>>();
  });

  it('leaves what is no Map as it arrived, for check to refuse', () => {
    expect(failed(parse(Counts, { a: 1 }))).toEqual([{ path: '', keyword: 'type' }]);
  });

  it('says where in a Map a pipe failed, as issues would', () => {
    const schema = mapOf(unknown(), pipe(string(), string({ min: 2 })));
    expect(failed(parse(schema, new Map<unknown, string>([['a', 'xx'], ['b', 'y'], [obj, 'zz'], [sym, 'w'], [7, 'v']])))).toEqual([
      { path: '/b', keyword: 'min' },
      { path: '/3', keyword: 'min' },
      { path: '/7', keyword: 'min' },
    ]);
    const keys = mapOf(pipe(string(), string({ max: 1 })), unknown());
    expect(failed(parse(keys, new Map([['a', 1], ['bb', 2]])))).toEqual([{ path: '/bb', keyword: 'max' }]);
  });

  it('is no JSON value', () => {
    expect(toJsonSchema(Counts).findings).toEqual([{ path: '', keyword: 'not-json', message: 'a Map is not a JSON value: the document accepts nothing here' }]);
  });
});

describe('setOf', () => {
  const Numbers = setOf(number());

  it('col.set: validates a Set and each of its members', () => {
    expect(verdicts(Numbers, [new Set([1]), new Set(['a']), [1], new Set(), new Set([1, 'a']), {}, null, new Map([[1, 1]])])).toEqual([true, false, false, true, false, false, false, false]);
    expect(Numbers.kind).toBe('set');
    expectTypeOf(Numbers).toEqualTypeOf<Schema<Set<number>>>();
  });

  it('holds its size to the bounds', () => {
    const sized = setOf(number(), { min: 2, max: 3 });
    expect(verdicts(sized, [new Set([1]), new Set([1, 2]), new Set([1, 2, 3]), new Set([1, 2, 3, 4])])).toEqual([false, true, true, false]);
    expect([sized.min, sized.max, Numbers.min, Numbers.max]).toEqual([2, 3, 0, Number.MAX_VALUE]);
    expect(verdicts(setOf(number(), { min: 1 }), [new Set(), new Set([1])])).toEqual([false, true]);
    expect(verdicts(setOf(number(), { max: 1 }), [new Set([1]), new Set([1, 2])])).toEqual([true, false]);
    expect(issues(sized, new Set([1]))).toEqual([{ path: '', keyword: 'min', message: 'expected at least 2 members, got an object. fix: send 2 or more' }]);
    expect(issues(sized, new Set([1, 2, 3, 'x']))).toEqual([
      { path: '', keyword: 'max', message: 'expected at most 3 members, got an object. fix: send 3 or fewer' },
      { path: '/3', keyword: 'type', message: 'expected a number, got string "x". fix: send a finite number' },
    ]);
  });

  it('says which member is wrong by its place, and what is no Set', () => {
    expect(issues(Numbers, [1])).toEqual([{ path: '', keyword: 'type', message: 'expected a Set, got an array. fix: send a Set' }]);
    expect(issues(Numbers, new Set([1, 'a', 2, 'b'])).map(({ path }) => path)).toEqual(['/1', '/3']);
  });

  it('parses to the same Set when nothing changed, and to a new one when a member did', () => {
    const same = new Set([1, 2]);
    expect(value(parse(Numbers, same))).toBe(same);
    const copied = value(parse(Numbers, same, { copy: true }));
    expect(copied).not.toBe(same);
    expect([...copied]).toEqual([1, 2]);

    const texts = new Set(['1', '2', 1]);
    const read = value(parse(setOf(number({ coerce: true })), texts));
    expect([...read]).toEqual([1, 2]);
    expect([...texts]).toEqual(['1', '2', 1]);
    const sizes = value(parse(setOf(transform(string(), lengthOf)), new Set(['a', 'bb'])));
    expect([...sizes]).toEqual([1, 2]);
    expectTypeOf(sizes).toEqualTypeOf<Set<number>>();
    expect(failed(parse(Numbers, [1]))).toEqual([{ path: '', keyword: 'type' }]);
  });

  it('says where in a Set a pipe failed', () => {
    const schema = setOf(pipe(string(), string({ min: 2 })));
    expect(failed(parse(schema, new Set(['xx', 'y', 'zz', 'w'])))).toEqual([
      { path: '/1', keyword: 'min' },
      { path: '/3', keyword: 'min' },
    ]);
  });

  it('is no JSON value', () => {
    expect(toJsonSchema(Numbers).findings).toEqual([{ path: '', keyword: 'not-json', message: 'a Set is not a JSON value: the document accepts nothing here' }]);
  });
});

describe('properties', () => {
  const Some = properties(record(number()), { min: 1, max: 2 });

  it('obj.property_count: holds a record to a number of keys', () => {
    expect(verdicts(Some, [{ a: 1 }, {}, { a: 1, b: 2, c: 3 }, { a: 1, b: 2 }, { a: 'x' }, 'ab', [1], null])).toEqual([true, false, false, true, false, false, false, false]);
    expect(Some.kind).toBe('count');
    expectTypeOf(Some).toEqualTypeOf<Schema<Record<string, number>>>();
  });

  it('holds an object to one, with one bound or with none', () => {
    const Shape = object({ a: optional(string()) });
    expect(verdicts(properties(Shape, { min: 2 }), [{ a: 'x' }, { a: 'x', b: 1 }, { b: 1, c: 2, d: 3 }])).toEqual([false, true, true]);
    expect(verdicts(properties(Shape, { max: 1 }), [{}, { a: 'x' }, { a: 'x', b: 1 }])).toEqual([true, true, false]);
    expect(verdicts(properties(Shape, {}), [{}, { a: 'x', b: 1 }, 1])).toEqual([true, true, false]);
    expect([properties(Shape, {}).min, properties(Shape, {}).max]).toEqual([0, Number.MAX_VALUE]);
  });

  it('counts a key the way a record reads one: an enumerable key of the prototype is a key', () => {
    const inherited: unknown = Object.create({ b: 2 }, { a: { value: 1, enumerable: true }, hidden: { value: 3, enumerable: false } });
    expect(verdicts(properties(record(number()), { min: 2, max: 2 }), [inherited, { a: 1 }])).toEqual([true, false]);
  });

  it('says how many keys it wanted, after what the schema it wraps has to say', () => {
    expect(issues(Some, {})).toEqual([{ path: '', keyword: 'minProperties', message: 'expected at least 1 keys, got an object. fix: send 1 or more' }]);
    expect(issues(Some, { a: 1, b: 2, c: 'x' })).toEqual([
      { path: '/c', keyword: 'type', message: 'expected a number, got string "x". fix: send a finite number' },
      { path: '', keyword: 'maxProperties', message: 'expected at most 2 keys, got an object. fix: send 2 or fewer' },
    ]);
    expect(issues(Some, { a: 1, b: 2, c: 'x' }, { first: true }).map(({ keyword }) => keyword)).toEqual(['type']);
  });

  it('asks for an object only where the schema it wraps let something else through', () => {
    expect(issues(Some, 'ab')).toEqual([{ path: '', keyword: 'type', message: 'expected an object, got string "ab". fix: send an object' }]);
    const anything = properties(unknown() as Schema<object>, { min: 1 });
    expect(issues(anything, 'ab')).toEqual([{ path: '', keyword: 'type', message: 'expected an object, got string "ab". fix: send an object' }]);
    expect(issues(anything, [1])).toEqual([{ path: '', keyword: 'type', message: 'expected an object, got an array. fix: send an object' }]);
    expect(verdicts(anything, ['ab', [1], { a: 1 }, {}])).toEqual([false, false, true, false]);
  });

  it('is what parse fills, as the schema it wraps is', () => {
    expect(value(parse(properties(record(number({ coerce: true })), { min: 1 }), { a: '1' }))).toEqual({ a: 1 });
  });

  it('is minProperties and maxProperties beside an object\'s or a record\'s keywords, and beside anything else also an object', () => {
    expect(toJsonSchema(Some)).toEqual({
      schema: { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', additionalProperties: { type: 'number' }, minProperties: 1, maxProperties: 2 },
      findings: [],
    });
    expect(toJsonSchema(properties(object({ a: string() }), { max: 3 })).schema).toEqual({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: { a: { type: 'string' } },
      required: ['a'],
      maxProperties: 3,
    });
    const either = properties(union([object({ a: string() }), record(number({ coerce: true }))]), { min: 1 });
    expect(toJsonSchema(either, { draft: 'draft-07' })).toEqual({
      schema: {
        $schema: 'http://json-schema.org/draft-07/schema#',
        allOf: [
          { anyOf: [{ type: 'object', properties: { a: { type: 'string' } }, required: ['a'] }, { type: 'object', additionalProperties: { type: 'number' } }] },
          { type: 'object', minProperties: 1 },
        ],
      },
      findings: [{ path: '/allOf/0/anyOf/1/additionalProperties', keyword: 'coerce', message: 'parse reads this value from a string, and JSON Schema has no coercion: the document describes the value after it is read' }],
    });
  });
});

describe('brand', () => {
  const UserId = brand(string({ min: 1 }), 'UserId');

  it('val.brand: a nominal brand on the inferred type, with no runtime effect', () => {
    const plain = string({ min: 1 });
    expect(brand(plain, 'UserId')).toBe(plain);
    expectTypeOf<Infer<typeof UserId>>().toEqualTypeOf<string & Brand<'UserId'>>();
    expectTypeOf<InferOutput<typeof UserId>>().toEqualTypeOf<string & Brand<'UserId'>>();
    expectTypeOf<string>().not.toMatchTypeOf<Infer<typeof UserId>>();
    expectTypeOf<Infer<typeof UserId>>().toMatchTypeOf<string>();
  });

  it('is what a passing check narrows to, and what parse hands out', () => {
    const input: unknown = 'u_1';
    if (!check(UserId, input)) throw new Error('the fixture is valid');
    expectTypeOf(input).toEqualTypeOf<string & Brand<'UserId'>>();
    expectTypeOf(value(parse(UserId, 'u_1'))).toEqualTypeOf<string & Brand<'UserId'>>();
  });

  it('keeps two brands apart, and holds both when a type has two', () => {
    const OrderId = brand(string(), 'OrderId');
    expectTypeOf<Infer<typeof OrderId>>().not.toMatchTypeOf<Infer<typeof UserId>>();
    const both = brand(UserId, 'Checked');
    expectTypeOf<Infer<typeof both>>().toMatchTypeOf<Infer<typeof UserId>>();
    expectTypeOf<Infer<typeof UserId>>().not.toMatchTypeOf<Infer<typeof both>>();
  });

  it('is on the output of a schema that maps, and on its input', () => {
    const Size = brand(transform(string(), lengthOf), 'Size');
    expectTypeOf<InferOutput<typeof Size>>().toEqualTypeOf<number & Brand<'Size'>>();
    expectTypeOf<Infer<typeof Size>>().toEqualTypeOf<string & Brand<'Size'>>();
  });
});

describe('message', () => {
  it('val.custom_message: a message of your own for a schema, or for one of its constraints', () => {
    const schema = message(string({ min: 3 }), { type: 'E1', min: 'E2' });
    expect(issues(schema, 'a')).toEqual([{ path: '', keyword: 'min', message: 'E2' }]);
    expect(issues(schema, 1)).toEqual([{ path: '', keyword: 'type', message: 'E1' }]);
    expect(issues(message(string(), 'E1'), 1)).toEqual([{ path: '', keyword: 'type', message: 'E1' }]);
  });

  it('leaves a keyword it has no words for as it was, and validates exactly as the schema it wraps', () => {
    const schema = message(string({ min: 3, max: 4 }), { min: 'too short' });
    expect(issues(schema, 'abcde')[0]?.message).toBe('expected at most 4 characters, got string "abcde". fix: send 4 or fewer');
    expect(verdicts(schema, ['abc', 'ab', 'abcde', 1])).toEqual([true, false, false, false]);
    expect(schema.kind).toBe('message');
    expect(emit(schema)).toBe(emit(string({ min: 3, max: 4 })));
    expect(toJsonSchema(schema)).toEqual(toJsonSchema(string({ min: 3, max: 4 })));
    expect(value(parse(message(number({ coerce: true }), 'a number, please'), '7'))).toBe(7);
  });

  it('rewords its own issues and those about its keys, and leaves a schema inside it its own', () => {
    const Inner = object({ deep: string() });
    const Shape = message(object({ a: string(), b: exactOptional(number()), c: Inner }, { unknown: 'strict' }), 'not this');
    const all = issues(Shape, { a: 1, b: undefined, c: {}, extra: true });
    expect(all).toEqual([
      { path: '/a', keyword: 'type', message: 'expected a string, got number 1. fix: send a string' },
      { path: '/b', keyword: 'undefined', message: 'not this' },
      { path: '/c/deep', keyword: 'required', message: 'expected a value, got undefined undefined. fix: add "deep"' },
      { path: '/extra', keyword: 'unknown', message: 'not this' },
    ]);
    expect(issues(Shape, 1)).toEqual([{ path: '', keyword: 'type', message: 'not this' }]);
    expect(issues(Shape, { b: 1, c: { deep: 'x' } })).toEqual([{ path: '/a', keyword: 'required', message: 'not this' }]);
  });

  it('rewords a record\'s key and a discriminated union\'s tag by their keywords', () => {
    const Rec = message(record(number(), { key: enumOf(['a']) }), { key: 'no such key here' });
    expect(issues(Rec, { b: 'x' })).toEqual([
      { path: '/b', keyword: 'key', message: 'no such key here' },
      { path: '/b', keyword: 'type', message: 'expected a number, got string "x". fix: send a finite number' },
    ]);
    const Tagged = message(discriminated('kind', { a: object({ kind: literal('a') }) }), { tag: 'pick a kind' });
    expect(issues(Tagged, { kind: 'z' })).toEqual([{ path: '/kind', keyword: 'tag', message: 'pick a kind' }]);
  });

  it('rewords only what was found under it', () => {
    const schema = object({ a: string(), ab: message(string(), 'second') });
    expect(issues(schema, { a: 1, ab: 2 }).map((issue) => issue.message)).toEqual(['expected a string, got number 1. fix: send a string', 'second']);
    const list = array(message(object({ x: string() }), { required: 'x is needed' }));
    expect(issues(list, [{}, { x: 1 }, {}]).map(({ path, message: text }) => [path, text])).toEqual([
      ['/0/x', 'x is needed'],
      ['/1/x', 'expected a string, got number 1. fix: send a string'],
      ['/2/x', 'x is needed'],
    ]);
  });

  it('stands whatever a message hook of the call says, which words every other issue', () => {
    const schema = object({ a: message(string(), { type: 'the schema\'s own' }), b: string() });
    expect(issues(schema, { a: 1, b: 2 }, { message: hook }).map((issue) => issue.message)).toEqual(['the schema\'s own', 'from the hook']);
  });

  it('takes its words as they are when it is built, by their own keys alone', () => {
    const words: Record<string, string> = { type: 'first' };
    const schema = message(string(), words);
    words.type = 'changed';
    expect(issues(schema, 1)[0]?.message).toBe('first');
    expect(issues(message(string(), {}), 1)[0]?.message).toBe('expected a string, got number 1. fix: send a string');
    expect(Object.isFrozen(schema)).toBe(true);
  });
});

describe('keysOf', () => {
  it('beh.path_array: the path of an issue as an array of keys and indexes', () => {
    const input = { a: ['x', 1] };
    const [issue] = issues(object({ a: array(string()) }), input);
    expect(issue?.path).toBe('/a/1');
    expect(keysOf(issue?.path ?? '', input)).toEqual(['a', 1]);
  });

  it('reads a JSON Pointer as RFC 6901 writes one', () => {
    expect(keysOf('')).toEqual([]);
    expect(keysOf('/a/0')).toEqual(['a', '0']);
    expect(keysOf('/')).toEqual(['']);
    expect(keysOf('/a~1b/~01/~0~1')).toEqual(['a/b', '~1', '~/']);
    expect(keysOf('/~1~1/~0~0')).toEqual(['//', '~~']);
  });

  it('makes a number of a key only where the value there is an array', () => {
    expect(keysOf('/0', ['x'])).toEqual([0]);
    expect(keysOf('/0', { 0: 'x' })).toEqual(['0']);
    expect(keysOf('/a/1/b/0', { a: [{}, { b: ['x'] }] })).toEqual(['a', 1, 'b', 0]);
    expect(keysOf('/a/0', { a: 'xy' })).toEqual(['a', '0']);
    expect(keysOf('/a/0/b', { a: null })).toEqual(['a', '0', 'b']);
    expect(keysOf('/a/0', null)).toEqual(['a', '0']);
    expect(keysOf('/a/0', 5)).toEqual(['a', '0']);
    expect(keysOf('/m/k/0', { m: new Map([['k', ['x']]]) })).toEqual(['m', 'k', '0']);
  });
});

describe('pipe', () => {
  const Big = pipe(transform(string(), Number), number({ min: 5 }));

  it('val.pipe: the output of one schema is validated by another', () => {
    expect(value(parse(Big, '7'))).toBe(7);
    expect(failed(parse(Big, '3'))).toEqual([{ path: '', keyword: 'min' }]);
    expectTypeOf(Big).toEqualTypeOf<Schema<string, number>>();
    expect(Big.kind).toBe('pipe');
  });

  it('describes what goes in: check, issues and the emitted code read the first schema alone', () => {
    expect(verdictsOfInput(Big, ['7', '3', 'x', 7, null])).toEqual([true, true, true, false, false]);
    expect(issues(Big, '3')).toEqual([]);
    expect(issues(Big, 7)).toEqual([{ path: '', keyword: 'type', message: 'expected a string, got number 7. fix: send a string' }]);
    expect(emit(Big)).toBe(emit(string()));
    expect(parse(Big, 7)).toEqual({ ok: false, issues: issues(Big, 7) });
  });

  it('gives the second schema\'s issues, in its words, with the options of the call', () => {
    expect(parse(Big, '3')).toEqual({ ok: false, issues: [{ path: '', keyword: 'min', message: 'expected a number of at least 5, got number 3. fix: send 5 or more' }] });
    expect(parse(Big, 'x')).toEqual({ ok: false, issues: [{ path: '', keyword: 'type', message: 'expected a number, got number NaN. fix: send a finite number' }] });
    expect(parse(Big, '3', { message: hook })).toEqual({ ok: false, issues: [{ path: '', keyword: 'min', message: 'from the hook' }] });
  });

  it('parses with the second schema whole: it fills, coerces, strips and maps', () => {
    const Loose = pipe(unknown(), object({ n: number({ coerce: true }), d: optional(string(), { default: 'd' }) }, { unknown: 'strip' }));
    expect(value(parse(Loose, { n: '1', extra: true }))).toEqual({ n: 1, d: 'd' });
    expect(value(parse(pipe(string(), transform(string(), lengthOf)), 'abc'))).toBe(3);
    expect(value(parse(pipe(number({ coerce: true }), number({ min: 5 })), '7'))).toBe(7);
    const same = { n: 1, d: 'x' };
    expect(value(parse(Loose, same))).toBe(same);
    expect(value(parse(Loose, same, { copy: true }))).not.toBe(same);
    expect(value(parse(Loose, same, { copy: true }))).toEqual(same);
  });

  it('says where the pipe stands in front of where the second schema found fault', () => {
    const Row = object({ id: string(), sizes: array(pipe(unknown(), object({ w: number() }))), pair: tuple([string(), Big]), by: record(Big) });
    const result = parse(Row, { id: 'r', sizes: [{ w: 1 }, { w: 'x' }, {}], pair: ['a', '1'], by: { 'a/b': '2', ok: '9' } });
    expect(failed(result)).toEqual([
      { path: '/sizes/1/w', keyword: 'type' },
      { path: '/sizes/2/w', keyword: 'required' },
      { path: '/pair/1', keyword: 'min' },
      { path: '/by/a~1b', keyword: 'min' },
    ]);
    expect(failed(parse(Row, { id: 'r', sizes: [{ w: 1 }, { w: 'x' }, {}], pair: ['a', '1'], by: {} }, { first: true }))).toEqual([{ path: '/sizes/1/w', keyword: 'type' }]);
    expect(value(parse(Row, { id: 'r', sizes: [{ w: 1 }], pair: ['a', '6'], by: { k: '9' } }))).toEqual({ id: 'r', sizes: [{ w: 1 }], pair: ['a', 6], by: { k: 9 } });
  });

  it('runs no map above a pipe that failed, and no second schema on what one made', () => {
    const seen: unknown[] = [];
    const note = (input: unknown): unknown => {
      seen.push(input);
      return input;
    };
    const Outer = transform(object({ a: Big, b: transform(string(), note) }), note);
    expect(failed(parse(Outer, { a: '3', b: 'x' }))).toEqual([{ path: '/a', keyword: 'min' }]);
    // The map beside the pipe was promised a string and got one; the map above it was promised the whole object, and is not run.
    expect(seen).toEqual(['x']);
    seen.length = 0;
    expect(value(parse(Outer, { a: '6', b: 'x' }))).toEqual({ a: 6, b: 'x' });
    expect(seen).toEqual(['x', { a: 6, b: 'x' }]);

    const Twice = pipe(Big, transform(number(), note));
    seen.length = 0;
    expect(failed(parse(Twice, '3'))).toEqual([{ path: '', keyword: 'min' }]);
    expect(seen).toEqual([]);
    expect(value(parse(Twice, '8'))).toBe(8);
    expect(seen).toEqual([8]);
  });

  it('is tried as a member of a union by what goes in, and takes a default as an input', () => {
    const Either = union([number(), Big]);
    expect(value(parse(Either, '9'))).toBe(9);
    expect(value(parse(Either, 2))).toBe(2);
    expect(failed(parse(Either, '2'))).toEqual([{ path: '', keyword: 'min' }]);
    expect(value(parse(object({ a: optional(Big, { default: '7' }) }), {}))).toEqual({ a: 7 });
  });

  it('is a finding in JSON Schema, which has the first schema alone', () => {
    expect(toJsonSchema(pipe(string(), string({ min: 1 })))).toEqual({
      schema: { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'string' },
      findings: [{ path: '', keyword: 'pipe', message: 'the second schema of the pipe reads what parse makes of the first, which JSON Schema cannot say: the document describes what goes in, the first schema alone' }],
    });
  });
});

describe('preprocess', () => {
  const Name = preprocess(trimIfString, string({ min: 1 }));

  it('val.preprocess: a function of yours runs on the raw input before validation', () => {
    expect(value(parse(Name, ' a '))).toBe('a');
    expect(failed(parse(Name, '   '))).toEqual([{ path: '', keyword: 'min' }]);
    expect(failed(parse(Name, 1))).toEqual([{ path: '', keyword: 'type' }]);
    expect(Name.kind).toBe('preprocess');
    expectTypeOf(Name).toEqualTypeOf<Schema<string>>();
  });

  it('is a coercion of your own: check and the emitted code describe the value after it, and never run it', () => {
    const seen: unknown[] = [];
    const noted = preprocess((input) => {
      seen.push(input);
      return trimIfString(input);
    }, string({ min: 1 }));
    expect(verdicts(noted, [' a ', 'a', '', 1])).toEqual([true, true, false, false]);
    seen.length = 0;
    expect([check(noted, '   '), issues(noted, '   '), emit(noted) === emit(string({ min: 1 }))]).toEqual([true, [], true]);
    expect(seen).toEqual([]);
    expect(failed(parse(noted, '   '))).toEqual([{ path: '', keyword: 'min' }]);
    expect(seen).toEqual(['   ']);
  });

  it('runs once, before the schema fills, checks and maps what it returned', () => {
    const seen: unknown[] = [];
    const noted = preprocess((input) => {
      seen.push(input);
      return typeof input === 'number' ? String(input) : input;
    }, transform(string(), upper));
    expect(value(parse(object({ a: noted, b: optional(noted, { default: 5 as unknown as string }) }), { a: 'x' }))).toEqual({ a: 'X', b: '5' });
    expect(seen).toEqual(['x', 5]);
    expect(value(parse(preprocess(JSON.parse as (input: unknown) => unknown, object({ n: number() })), '{"n":1}'))).toEqual({ n: 1 });
  });

  it('is a finding in JSON Schema, which describes the value after the function', () => {
    expect(toJsonSchema(Name)).toEqual({
      schema: { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'string', minLength: 1 },
      findings: [{ path: '', keyword: 'preprocess', message: 'parse runs a function on the value before it is validated, which JSON Schema cannot carry: the document describes the value after the function has run' }],
    });
  });
});

/** What `check` says of each value, with the emitted code and `issues` held to it. A pipe is not held to `parse`: its second schema may refuse what `check` accepts. */
function verdictsOfInput(schema: AnySchema, values: readonly unknown[]): boolean[] {
  return values.map((input) => {
    const yes = check(schema, input);
    expect(issues(schema, input).length === 0).toBe(yes);
    const parsed = parse(schema, input);
    if (!yes) expect(parsed.ok).toBe(false);
    return yes;
  });
}

/** A value the corpus schema accepts, made new each time: a probe is written into it. */
const wave3 = (): Record<string, unknown> => ({
  none: Number.NaN,
  whole: 1,
  name: 'n',
  counts: new Map([['a', 1]]),
  tags: new Set(['t']),
  few: { a: 1 },
  worded: { a: 'x' },
  before: 'abc',
});

describe('the readers, for the wave 3 kinds', () => {
  const Wave3 = object({
    none: nan(),
    nothing: optional(voidOf()),
    whole: safeInteger({ min: 0 }),
    name: trim(string({ min: 1 })),
    counts: mapOf(string(), number()),
    tags: setOf(string(), { min: 1, max: 2 }),
    few: properties(record(nullable(number())), { min: 1, max: 2 }),
    worded: message(object({ a: string() }), 'no'),
    before: preprocess(trimIfString, string({ max: 3 })),
  });

  const PROBES: unknown[] = [undefined, null, true, 0, 1, -1, 1.5, SAFE + 1, Number.NaN, '', 'a', 'abcd', ' ab ', [], ['a'], {}, { a: 1 }, { a: 'x' }, { a: null, b: 2 }, { a: 1, b: 2, c: 3 }, new Map(), new Map([['a', 1]]), new Map([[1, 1]]), new Map([['a', 'x']]), new Set(), new Set(['t']), new Set(['a', 'b', 'c']), new Set([1])];

  it('agree on a value of every new kind with each member replaced by every probe', () => {
    expect(verdict(Wave3, wave3())).toBe(true);
    let accepted = 0;
    const keys = [...Object.keys(wave3()), 'nothing'];
    for (const key of keys) {
      for (const probe of PROBES) if (verdict(Wave3, { ...wave3(), [key]: probe })) accepted += 1;
    }
    expect([keys.length * PROBES.length, accepted]).toEqual([252, 15]);
  });
});
