import { readFileSync } from 'node:fs';

import { describe, expect, expectTypeOf, it } from 'vitest';

import { verdict, verdicts } from './__fixtures__/readers.js';
import { emit } from './emit.js';
import { base64url, cuid, cuid2, duration, emoji, json, jwt, nanoid, regex, ulid, uuidVersion, type UuidVersion } from './formats.js';
import {
  type AnySchema,
  array,
  bigint,
  boolean,
  catchOf,
  check,
  codec,
  contains,
  encode,
  endsWith,
  enumOf,
  includes,
  type Infer,
  type InferOutput,
  intersection,
  issues,
  literal,
  type Node,
  not,
  nullable,
  number,
  object,
  oneOf,
  optional,
  parse,
  type Parsed,
  readonly,
  type Schema,
  startsWith,
  string,
  template,
  transform,
  tuple,
  union,
  unique,
  unknown,
} from './index.js';
import { compile } from './jit.js';
import { fromJsonSchema, standardJson, toJsonSchema } from './json-schema.js';
import { standard } from './standard.js';

/**
 * Wave 4: the features two of the five competitors have (parity.md). The values each accepts and
 * refuses are the competitors' probes' where a probe names them (benchmarks/results/validator/
 * parity-2026-11-13), and every verdict is held to the emitted code, `issues` and `parse` by
 * `verdicts`.
 */

const value = <T>(result: Parsed<T>): T => {
  if (!result.ok) throw new Error(`expected a value, got ${JSON.stringify(result.issues)}`);
  return result.value;
};

const failed = (result: Parsed<unknown>): { path: string; keyword: string }[] => {
  if (result.ok) throw new Error('expected issues, got a value');
  return result.issues.map(({ path, keyword }) => ({ path, keyword }));
};

const where = (schema: AnySchema, got: unknown): { path: string; keyword: string }[] => issues(schema, got).map(({ path, keyword }) => ({ path, keyword }));

/** A template with a hole that holds `part`, as a call that throws when it is refused. */
const holeOf = (part: AnySchema): (() => unknown) => () => template(['a', part]);

/** A document read with no finding: the schema is all there is to see. */
const read = (document: unknown, options?: Parameters<typeof fromJsonSchema>[1]): AnySchema => {
  const { schema, findings } = fromJsonSchema(document, options);
  expect(findings).toEqual([]);
  return schema;
};

/** A document's reading, as a call that throws when it is refused. */
const readingOf = (document: unknown, options?: Parameters<typeof fromJsonSchema>[1]): (() => unknown) => () => fromJsonSchema(document, options);

/** A node as a hand would build it: one the builders would not make. */
const hand = (schema: AnySchema, change: Partial<Record<keyof Node, unknown>>): AnySchema => ({ ...schema, ...change }) as AnySchema;

describe('template', () => {
  const User = template(['user-', number({ int: true })]);

  it('accepts the strings the template describes, and nothing else', () => {
    expect(verdicts(User, ['user-7', 'user-0', 'user--12', 'user-', 'user-07', 'user-1.5', 'User-1', 7, null])).toEqual([true, true, true, false, false, false, false, false, false]);
  });

  it('is typed as the template literal type it describes', () => {
    expectTypeOf<Infer<typeof User>>().toEqualTypeOf<`user-${number}`>();
    const Size = template([number(), enumOf(['px', 'em'])]);
    expectTypeOf<Infer<typeof Size>>().toEqualTypeOf<`${number}px` | `${number}em`>();
    expectTypeOf<Infer<ReturnType<typeof template<['a', Schema<boolean>, 'b']>>>>().toEqualTypeOf<'atrueb' | 'afalseb'>();
  });

  it('reads a number as JSON writes one, which is what String writes for every finite double', () => {
    const N = template([number()]);
    expect(verdicts(N, ['1', '-1.5', '1e+21', '1E-7', '0.5', '01', '.5', '+1', '0x10', '1.', 'Infinity', ''])).toEqual([true, true, true, true, true, false, false, false, false, false, false, false]);
    expect(String(1e21)).toBe('1e+21');
  });

  it('holds a string, a bigint, a boolean, a literal, an enum, a union, a nullable and another template', () => {
    expect(verdicts(template(['<', string(), '>']), ['<>', '<a b>', '<<>>', '<', 'a'])).toEqual([true, true, true, false, false]);
    expect(verdicts(template([bigint(), 'n']), ['10n', '-3n', '1.5n'])).toEqual([true, true, false]);
    expect(verdicts(template(['is-', boolean()]), ['is-true', 'is-false', 'is-1'])).toEqual([true, true, false]);
    expect(verdicts(template([literal(5n), literal(null), literal(undefined), literal(true), literal(1.5)]), ['5nullundefinedtrue1.5', '5nulltrue1.5'])).toEqual([true, false]);
    expect(verdicts(template([union([literal('a'), number({ int: true })]), '!']), ['a!', '42!', 'b!'])).toEqual([true, true, false]);
    expect(verdicts(template([nullable(boolean())]), ['null', 'true', 'undefined'])).toEqual([true, true, false]);
    expect(verdicts(template(['[', template(['x', number({ int: true })]), ']']), ['[x1]', '[x]'])).toEqual([true, false]);
  });

  it('matches nothing in a hole that has no value, and the empty string with no parts', () => {
    expect(verdicts(template(['a', enumOf([])]), ['a', ''])).toEqual([false, false]);
    expect(verdicts(template([]), ['', 'a'])).toEqual([true, false]);
  });

  it('reads a surrogate pair as two units, in the text and in a string hole', () => {
    expect(verdicts(template(['😀', string()]), ['😀', '😀x', 'x😀'])).toEqual([true, true, false]);
  });

  it('reads two holes of open length side by side in time proportional to the string', () => {
    const Two = template([string(), string(), '!']);
    const long = 'a'.repeat(20_000);
    const started = performance.now();
    expect(check(Two, long)).toBe(false);
    expect(check(Two, `${long}!`)).toBe(true);
    expect(performance.now() - started).toBeLessThan(2000);
  });

  it('reports one issue that names the template', () => {
    expect(issues(User, 'user-x')).toEqual([{ path: '', keyword: 'template', message: 'expected a string of the template `user-${number}`, got string "user-x". fix: send a string of the template `user-${number}`' }]);
    expect(issues(template(['a`b']), 'x')[0]?.message).toContain('`a\\`b`');
  });

  it('refuses a hole that has no text a template can match', () => {
    expect(holeOf(string({ min: 1 }))).toThrow('part 1 of the template is a string with bounds, a pattern or a format, which has no text a template can match. fix: use a string, number, bigint, boolean, literal or enum schema, or a union or nullable of them, with no bounds');
    expect(holeOf(number({ min: 1 }))).toThrow('part 1 of the template is a number with bounds');
    expect(holeOf(number({ gt: 1 }))).toThrow('a number with bounds');
    expect(holeOf(number({ multipleOf: 2 }))).toThrow('a number with bounds');
    expect(holeOf(bigint({ min: 1n }))).toThrow('a bigint with bounds');
    expect(holeOf(array(string()))).toThrow('part 1 of the template is a schema of the kind "array"');
    expect(holeOf(hand(literal(1), { value: Symbol('s') }))).toThrow('part 1 of the template is a literal that has no text. fix: use a string, number, bigint, boolean, null or undefined');
    expect(holeOf(hand(literal(1), { kind: 7 }))).toThrow('a schema of the kind number');
  });

  it('is written as one pattern to JSON Schema, which reads the same strings', () => {
    const { schema, findings } = toJsonSchema(template(['id-', number({ int: true }), '.', enumOf(['a', 'b']), string()]));
    expect(findings).toEqual([]);
    expect(schema).toEqual({ $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'string', pattern: '^id-(?:-|)(?:0|[\\u0031-\\u0039](?:[\\u0030-\\u0039])*)\\.(?:a|b)(?:[\\s\\S])*$' });
    const pattern = new RegExp(schema['pattern'] as string, 'u');
    for (const text of ['id-1.a', 'id--2.bxyz', 'id-01.a', 'id-1.c', 'id-.a']) expect(pattern.test(text)).toBe(check(template(['id-', number({ int: true }), '.', enumOf(['a', 'b']), string()]), text));
    expect(toJsonSchema(template(['a.b', enumOf([])])).schema['pattern']).toBe('^a\\.b[]$');
  });

  // A bundler keeps a call it cannot see through: without the marks, a program that only checks a string carried the number grammar (702 B became 881 B).
  it('marks every piece made when its module loads as free of side effects', () => {
    const source = readFileSync(`${import.meta.dirname}/template.ts`, 'utf8');
    const pieces = source.slice(source.indexOf('const DIGIT = '), source.indexOf('/** The text `String` writes'));
    const calls = pieces.match(/\b(?:range|row|star|either|maybe|text)\(/gu) ?? [];
    const marked = pieces.match(/\/\* @__PURE__ \*\/ (?:range|row|star|either|maybe|text)\(/gu) ?? [];
    expect(calls.length).toBeGreaterThan(20);
    expect(marked).toHaveLength(calls.length);
  });

  it('is refused by the emitter and the JSON Schema writer when a hand-built node holds no steps', () => {
    expect(() => emit(hand(User, { value: { steps: [[0, 'a', 1]] } }))).toThrow('cannot emit a template whose steps are not numbers. fix: build the schema with `template`');
    expect(() => emit(hand(User, { value: null }))).toThrow('cannot emit a template whose steps are not numbers');
    expect(() => emit(hand(User, { value: { steps: [[0, 1]] } }))).toThrow('not numbers');
    expect(() => emit(hand(User, { value: { steps: ['x'] } }))).toThrow('not numbers');
    expect(() => toJsonSchema(hand(User, { value: { source: 1 } }))).toThrow('cannot export the key or name 1: it is not a string');
    expect(() => toJsonSchema(hand(User, { value: null }))).toThrow('cannot export the key or name undefined');
  });
});

describe('startsWith, endsWith, includes', () => {
  it('hold a string to a prefix, a suffix and a substring, beside what the string schema says', () => {
    expect(verdicts(startsWith(string({ max: 4 }), 'ab'), ['ab', 'abcd', 'abcde', 'xab', 1])).toEqual([true, true, false, false, false]);
    expect(verdicts(endsWith(string(), '.ts'), ['a.ts', '.ts', 'a.tsx', null])).toEqual([true, true, false, false]);
    expect(verdicts(includes(string(), '@'), ['a@b', '@', 'ab', 3])).toEqual([true, true, false, false]);
  });

  it('report the string schema first, and the test only where it holds', () => {
    expect(where(startsWith(string({ max: 2 }), 'a'), 'bcd')).toEqual([{ path: '', keyword: 'max' }]);
    expect(issues(startsWith(string(), 'a'), 'b')).toEqual([{ path: '', keyword: 'startsWith', message: 'expected a string that starts with "a", got string "b". fix: send a string that starts with "a"' }]);
    expect(where(endsWith(string(), 'z'), 'a')).toEqual([{ path: '', keyword: 'endsWith' }]);
    expect(where(includes(string(), 'z'), 'a')).toEqual([{ path: '', keyword: 'includes' }]);
    expect(where(includes(string(), 'z'), 1)).toEqual([{ path: '', keyword: 'type' }]);
  });

  it('keep the static type of the schema they wrap', () => {
    expectTypeOf<Infer<ReturnType<typeof startsWith<'a' | 'b', never>>>>().toEqualTypeOf<'a' | 'b'>();
  });

  it('refuse text that is not a string, at build and at emit', () => {
    expect(() => startsWith(string(), 1 as unknown as string)).toThrow('cannot test that a string starts with a value of the type number. fix: give the text as a string');
    expect(() => emit(hand(endsWith(string(), 'a'), { value: 1 }))).toThrow('cannot emit a string test for a value of the type number: it is not a string. fix: build the schema with `startsWith`, `endsWith` or `includes`');
  });

  it('are written as an escaped pattern beside the schema they wrap', () => {
    expect(toJsonSchema(startsWith(string({ min: 1 }), 'a.b')).schema).toEqual({ $schema: 'https://json-schema.org/draft/2020-12/schema', allOf: [{ type: 'string', minLength: 1 }, { type: 'string', pattern: '^a\\.b' }] });
    expect(toJsonSchema(endsWith(string(), '$(x)')).schema['allOf']).toEqual([{ type: 'string' }, { type: 'string', pattern: '\\$\\(x\\)$' }]);
    expect(toJsonSchema(includes(string(), '[/]')).schema['allOf']).toEqual([{ type: 'string' }, { type: 'string', pattern: '\\[\\/\\]' }]);
  });
});

describe('contains', () => {
  const Some = contains(array(number()), number({ min: 10 }));

  it('needs at least one item the schema accepts, and every item still the array schema', () => {
    expect(verdicts(Some, [[1, 10], [10], [1, 2], [], ['a', 10], 'x'])).toEqual([true, true, false, false, false, false]);
  });

  it('counts between min and max', () => {
    const Two = contains(array(unknown()), string(), { min: 2, max: 3 });
    expect(verdicts(Two, [['a', 'b'], ['a', 'b', 'c', 1], ['a'], ['a', 'b', 'c', 'd']])).toEqual([true, true, false, false]);
    expect(verdicts(contains(array(unknown()), string(), { min: 0 }), [[], [1]])).toEqual([true, true]);
  });

  it('reports too few under contains and too many under maxContains, after the array schema', () => {
    const Two = contains(array(unknown(), { max: 5 }), string(), { min: 2, max: 3 });
    expect(issues(Two, ['a'])).toEqual([{ path: '', keyword: 'contains', message: 'expected at least 2 items of the kind it must contain, not 1, got an array. fix: send 2 or more of them' }]);
    expect(issues(Two, ['a', 'b', 'c', 'd'])).toEqual([{ path: '', keyword: 'maxContains', message: 'expected at most 3 items of the kind it may contain, not 4, got an array. fix: send 3 or fewer of them' }]);
    expect(where(Two, [1, 2, 3, 4, 5, 6])).toEqual([{ path: '', keyword: 'max' }]);
    expect(where(Two, 'x')).toEqual([{ path: '', keyword: 'type' }]);
    expect(where(contains(unknown() as Schema<unknown[]>, string()), 'x')).toEqual([]);
  });

  it('is written as contains, and as minContains and maxContains where 2020-12 has them', () => {
    expect(toJsonSchema(Some).schema['allOf']).toEqual([{ type: 'array', items: { type: 'number' } }, { type: 'array', contains: { type: 'number', minimum: 10 } }]);
    const Two = contains(array(unknown()), string(), { min: 2, max: 3 });
    expect(toJsonSchema(Two).schema['allOf']).toEqual([{ type: 'array', items: {} }, { type: 'array', contains: { type: 'string' }, minContains: 2, maxContains: 3 }]);
    const old = toJsonSchema(Two, { draft: 'draft-07' });
    expect(old.schema['allOf']).toEqual([{ type: 'array', items: {} }, { type: 'array', contains: { type: 'string' } }]);
    expect(old.findings).toEqual([{ path: '', keyword: 'contains', message: 'draft-07 has no minContains or maxContains: the document asks for at least one matching item, and the schema for 2 to 3' }]);
    expect(toJsonSchema(Some, { draft: 'draft-07' }).findings).toEqual([]);
  });

  it('refuses a bound that is not a number in a hand-built node', () => {
    expect(() => emit(hand(Some, { min: '1' }))).toThrow('cannot emit the bound "1": it is not a number');
    expect(() => toJsonSchema(hand(Some, { max: '1' }))).toThrow('cannot export the bound "1": it is not a number');
  });
});

describe('unique', () => {
  const Unique = unique(array(unknown()));

  it('refuses two items that are the same value, as uniqueItems compares JSON', () => {
    expect(verdicts(Unique, [[], [1, 2], [1, 1], ['1', 1], [1, 1n], [NaN, NaN], [0, -0], [true, true], [null, null], [undefined, undefined]])).toEqual([true, true, false, true, true, false, false, false, false, false]);
    expect(verdicts(Unique, [[{ a: 1, b: 2 }, { b: 2, a: 1 }], [{ a: 1 }, { a: 2 }], [{ a: 1 }, { a: 1, b: 1 }], [{ a: 1, b: 1 }, { a: 1, c: 1 }], [[1, 2], [1, 2]], [[1, 2], [2, 1]], [[1], [1, 2]], [[], {}]])).toEqual([false, true, true, true, false, true, true, true]);
  });

  it('reads a date by its time, and any other object as only itself', () => {
    class Point {
      constructor(readonly x: number) {}
    }
    const one = new Point(1);
    expect(verdicts(Unique, [[new Date(0), new Date(0)], [new Date(0), new Date(1)], [new Date(0), 0], [0, new Date(0)], [new Point(1), new Point(1)], [one, one], [new Map(), new Map()], [Object.create(null), {}]])).toEqual([false, true, true, true, true, false, true, false]);
    expect(verdicts(Unique, [[{ d: new Date(0) }, { d: {} }], [{ a: [] }, { a: {} }], [{ a: {} }, { a: [] }]])).toEqual([true, true, true]);
  });

  it('ends on a value that holds itself', () => {
    const left: Record<string, unknown> = { a: 1 };
    left['self'] = left;
    const right: Record<string, unknown> = { a: 1 };
    right['self'] = right;
    const list: unknown[] = [1];
    list.push(list);
    // A value that holds itself is the same as nothing but itself when it is met again: `left` and `right` differ there, and `list` is `list`.
    expect(verdicts(Unique, [[left, right], [left, left], [list, [1, list]], [list, [2, list]]])).toEqual([true, false, false, true]);
  });

  it('reports the first repeated item at its own place, after the array schema', () => {
    expect(issues(unique(array(number())), [1, 2, 1])).toEqual([{ path: '/2', keyword: 'unique', message: 'expected an item unlike every item before it, got number 1. fix: remove it, or change it' }]);
    expect(where(unique(array(number())), [1, 'a', 1])).toEqual([{ path: '/1', keyword: 'type' }]);
    expect(where(unique(unknown() as Schema<unknown[]>), 'x')).toEqual([]);
  });

  it('is written as uniqueItems', () => {
    expect(toJsonSchema(unique(array(string()))).schema['allOf']).toEqual([{ type: 'array', items: { type: 'string' } }, { type: 'array', uniqueItems: true }]);
  });
});

describe('not', () => {
  it('accepts every value the schema refuses, undefined at a key included', () => {
    expect(verdicts(not(string()), [1, null, undefined, 'a'])).toEqual([true, true, true, false]);
    expect(verdicts(object({ a: not(string()) }), [{ a: 1 }, {}, { a: 'x' }])).toEqual([true, false, false]);
    expect(verdicts(intersection([string(), not(literal(''))]), ['a', '', 1])).toEqual([true, false, false]);
  });

  it('reports one issue at the value', () => {
    expect(issues(not(number()), 1)).toEqual([{ path: '', keyword: 'not', message: 'expected a value the schema it negates refuses, got number 1. fix: send a value the schema it negates refuses' }]);
  });

  it('is typed unknown, and written as not', () => {
    expectTypeOf<Infer<ReturnType<typeof not>>>().toEqualTypeOf<unknown>();
    expect(toJsonSchema(not(string())).schema).toEqual({ $schema: 'https://json-schema.org/draft/2020-12/schema', not: { type: 'string' } });
  });
});

describe('oneOf', () => {
  const Either = oneOf([number({ int: true }), number({ min: 10 })]);

  it('accepts what exactly one member accepts', () => {
    expect(verdicts(Either, [1, 10.5, 10, 'a'])).toEqual([true, true, false, false]);
    expect(verdicts(oneOf([]), [1, undefined])).toEqual([false, false]);
    expect(verdicts(object({ a: oneOf([unknown(), number()]) }), [{ a: 'x' }, { a: 1 }, {}])).toEqual([true, false, false]);
  });

  it('says which members fail, or which accept, in one issue', () => {
    expect(issues(Either, 'a')).toEqual([{ path: '', keyword: 'oneOf', message: 'expected a value exactly one of 2 members accepts, got string "a". fix: satisfy one of them; member 0 fails type at ""; member 1 fails type at ""' }]);
    expect(issues(Either, 10)).toEqual([{ path: '', keyword: 'oneOf', message: 'expected a value exactly one of 2 members accepts, got number 10. fix: change it so that only one of the members 0, 1 accepts it' }]);
  });

  it('parses with the member that accepts, and is typed as a union', () => {
    const Parsed = oneOf([transform(string(), (text) => text.length), number()]);
    expect(value(parse(Parsed, 'abc'))).toBe(3);
    expect(value(parse(Parsed, 7))).toBe(7);
    expectTypeOf<Infer<typeof Parsed>>().toEqualTypeOf<string | number>();
    expectTypeOf<InferOutput<typeof Parsed>>().toEqualTypeOf<number>();
  });

  it('is written as oneOf, and as a schema of nothing with no member', () => {
    expect(toJsonSchema(Either).schema['oneOf']).toEqual([{ type: 'integer' }, { type: 'number', minimum: 10 }]);
    expect(toJsonSchema(oneOf([])).schema).toEqual({ $schema: 'https://json-schema.org/draft/2020-12/schema', not: {} });
  });
});

describe('catchOf', () => {
  it('hands out the fallback in place of a value the schema refuses', () => {
    const Port = catchOf(number({ int: true }), 8080);
    expect(value(parse(Port, 3000))).toBe(3000);
    expect(value(parse(Port, 'x'))).toBe(8080);
    expect(value(parse(object({ port: Port }), { port: null }))).toEqual({ port: 8080 });
    expect(verdicts(Port, [1, 'x'])).toEqual([true, false]);
    expectTypeOf<InferOutput<typeof Port>>().toEqualTypeOf<number>();
  });

  it('hands a function the issues of the value it replaces', () => {
    const seen: unknown[] = [];
    const Counted = catchOf(string({ min: 2 }), (found) => {
      seen.push(found.map((issue) => issue.keyword));
      return 'fallback';
    });
    expect(value(parse(Counted, 'a'))).toBe('fallback');
    expect(value(parse(Counted, 'ab'))).toBe('ab');
    expect(seen).toEqual([['min']]);
  });

  it('holds the fallback to the schema, as it holds a default', () => {
    expect(failed(parse(catchOf(number(), 'no' as unknown as number), 'x'))).toEqual([{ path: '', keyword: 'type' }]);
    expect(failed(parse(catchOf(number(), () => 'no' as unknown as number), 'x'))).toEqual([{ path: '', keyword: 'type' }]);
  });

  it('reads the fallback as an input, as a default is read: the transform maps it', () => {
    const Length = catchOf(transform(string(), (text) => text.length), '');
    expect(value(parse(Length, 'abc'))).toBe(3);
    expect(value(parse(Length, 9))).toBe(0);
  });

  it('is a finding in JSON Schema, which has no fallback', () => {
    expect(toJsonSchema(catchOf(number(), 0))).toEqual({
      schema: { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'number' },
      findings: [{ path: '', keyword: 'catch', message: 'parse hands out a fallback in place of a value this schema refuses, which JSON Schema cannot say: the document describes what the schema accepts' }],
    });
  });
});

describe('codec', () => {
  const Instant = codec(string(), number(), { decode: (text) => Date.parse(text), encode: (time) => new Date(time).toISOString() });

  it('decodes with parse and encodes with encode', () => {
    expect(value(parse(Instant, '1970-01-01T00:00:01.000Z'))).toBe(1000);
    expect(value(encode(Instant, 1000))).toBe('1970-01-01T00:00:01.000Z');
    expectTypeOf<Infer<typeof Instant>>().toEqualTypeOf<string>();
    expectTypeOf<InferOutput<typeof Instant>>().toEqualTypeOf<number>();
  });

  // As for a pipe, `parse` may still refuse what `check` accepts: here a string that is no date.
  it('describes what goes in to check, issues and the emitted code', () => {
    for (const [schema, values] of [[Instant, ['x', 1]], [object({ at: Instant }), [{ at: 'x' }, {}]]] as [AnySchema, unknown[]][]) {
      expect(values.map((one) => compile(schema)(one))).toEqual(values.map((one) => check(schema, one)));
      expect(values.map((one) => issues(schema, one).length === 0)).toEqual(values.map((one) => check(schema, one)));
    }
    expect([check(Instant, 'x'), check(Instant, 1)]).toEqual([true, false]);
  });

  it('fails a decoded value the output schema refuses, and an output encode is not given', () => {
    expect(failed(parse(Instant, 'not a date'))).toEqual([{ path: '', keyword: 'type' }]);
    expect(failed(encode(Instant, 'x'))).toEqual([{ path: '', keyword: 'type' }]);
    const Lossy = codec(string(), number(), { decode: Number, encode: (count) => count });
    expect(failed(encode(Lossy, 1))).toEqual([{ path: '', keyword: 'type' }]);
  });

  it('refuses to encode with a schema that is not a codec', () => {
    expect(() => encode(string() as never, 'x')).toThrow('cannot encode with a schema of the kind "string": only a codec has a second direction. fix: build it with `codec(input, output, { decode, encode })`');
    expect(() => encode(hand(Instant, { kind: 1 }) as never, 'x')).toThrow('of the kind number');
  });

  it('is a finding in JSON Schema, which describes the input', () => {
    expect(toJsonSchema(Instant)).toEqual({
      schema: { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'string' },
      findings: [{ path: '', keyword: 'codec', message: 'parse decodes this value into another schema, which JSON Schema cannot say: the document describes what goes in, before it is decoded' }],
    });
    expect(toJsonSchema(hand(Instant, { item: string() })).schema['type']).toBe('string');
  });
});

describe('the wave 4 formats', () => {
  const cases: [string, Schema<string>, string[], unknown[]][] = [
    ['base64url', string({ format: base64url }), ['aGVsbG8', '', 'aGVsbG8-_w', 'aGU'], ['aGVs+G8=', 'aGVsbG8=', 'a', 'aGVsb']],
    ['cuid', string({ format: cuid }), ['cjld2cjxh0000qzrmn831i7rn'], ['cjld2cjxh0000qzrmn831i7r', 'xjld2cjxh0000qzrmn831i7rn', 'cjld2cjxh0000qzrmn831i7rN']],
    ['cuid2', string({ format: cuid2 }), ['tz4a98xxat96iws9zmbrgj3a', 'ab'], ['1abc', 'a', 'Tz4a98', `a${'b'.repeat(32)}`]],
    ['duration', string({ format: duration }), ['P1DT2H', 'PT36H', 'P1Y2M3DT4H5M6S', 'P3W', 'PT1M', 'P1M'], ['1 day', 'P', 'PT', 'P1Y1D', 'PT1H1S', 'P1D2H', 'P1W1D', 'P1.5D', '']],
    ['emoji', string({ format: emoji }), ['😀', '👍🏽', '🇫🇷', '👨‍👩‍👧', '😀😀'], ['abc', '123', '', '#', 'a😀']],
    ['json', string({ format: json }), ['{"a":1}', '1', ' [ ] ', 'null', '"x"'], ['{', '', 'undefined', "{'a':1}"]],
    [
      'jwt',
      string({ format: jwt }),
      ['eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2ln', 'eyJhbGciOiJub25lIn0.e30.', 'eyJhbGciOiJub25lIn0..'],
      ['a.b.c', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0', '.e30.', 'eyJ0eXAiOiJKV1QifQ.e30.c2ln', 'WzFd.e30.', 'bnVsbA.e30.', 'eyJhbGciOjF9.e30.', 'eyJhbGciOiJub25lIn0=.e30.', '_w.e30.', 'eyJhbGciOiJub25lIn0.e30.a', 'a.e30.', 'eyJhbGciOiJIUzI1NiJ9.e30.c2ln.x'],
    ],
    ['nanoid', string({ format: nanoid }), ['V1StGXR8_Z5jdHi6B-myT'], ['V1StGXR8_Z5jdHi6B-my', 'V1StGXR8_Z5jdHi6B-myT!', 'V1StGXR8 Z5jdHi6B-myT']],
    ['ulid', string({ format: ulid }), ['01ARZ3NDEKTSV4RRFFQ69G5FAV', '01arz3ndektsv4rrffq69g5fav', '7ZZZZZZZZZZZZZZZZZZZZZZZZZ'], ['8ZZZZZZZZZZZZZZZZZZZZZZZZZ', '01ARZ3NDEKTSV4RRFFQ69G5FAU', '01ARZ3NDEKTSV4RRFFQ69G5FA', '01ARZ3NDEKTSV4RRFFQ69G5FAI']],
    ['regex', string({ format: regex }), ['^a+$', '', '\\d', '(?<y>\\d{4})'], ['(', '\\-', '[', 'a{2,1}']],
    ['uuid-v4', string({ format: uuidVersion(4) }), ['9b2c5f44-0a8b-4f1a-9e3c-7d6f2b1a0c9e', '9B2C5F44-0A8B-4F1A-9E3C-7D6F2B1A0C9E'], ['9b2c5f44-0a8b-1f1a-9e3c-7d6f2b1a0c9e', '9b2c5f44-0a8b-4f1a-7e3c-7d6f2b1a0c9e', '00000000-0000-0000-0000-000000000000']],
    ['uuid-v7', string({ format: uuidVersion(7) }), ['01890a5d-ac96-774b-bcce-b302099a8057'], ['01890a5d-ac96-474b-bcce-b302099a8057']],
  ];

  it.each(cases)('%s accepts what it names and refuses the rest', (name, schema, accepted, refused) => {
    expect(schema.rule?.name).toBe(name);
    expect(accepted.map((text) => check(schema, text))).toEqual(accepted.map(() => true));
    expect(refused.map((text) => check(schema, text))).toEqual(refused.map(() => false));
    const emitted = compile(schema);
    expect([...accepted, ...refused].map((text) => emitted(text))).toEqual([...accepted, ...refused].map((text) => check(schema, text)));
  });

  it('are data: patterns where a pattern can say it, and tests where it cannot', () => {
    for (const format of [base64url, cuid, cuid2, duration, nanoid, ulid, uuidVersion(1)]) {
      expect(Object.isFrozen(format)).toBe(true);
      expect('pattern' in format && format.pattern.flags).toBe('u');
    }
    expect(emoji.pattern.flags).toBe('v');
    expect(emit(string({ format: ulid }))).toContain('new RegExp(');
    for (const format of [json, jwt, regex]) expect(() => emit(string({ format }))).toThrow('cannot emit a schema that names a function as text alone');
  });

  it('refuses a UUID version RFC 9562 does not define', () => {
    expect(() => uuidVersion(9 as UuidVersion)).toThrow('there is no UUID version 9. fix: name a version from 1 to 8 (RFC 9562 §4.2)');
    expect(() => uuidVersion(0 as UuidVersion)).toThrow('there is no UUID version 0');
    expect(() => uuidVersion(1.5 as UuidVersion)).toThrow('there is no UUID version 1.5');
    expect(() => uuidVersion('4' as unknown as UuidVersion)).toThrow('there is no UUID version that is a value of the type string');
    expect(uuidVersion(8).name).toBe('uuid-v8');
  });

  it('a JWT header that is not UTF-8 is not a header', () => {
    // 0xff is never a byte of UTF-8.
    expect(check(string({ format: jwt }), '_w.e30.')).toBe(false);
  });
});

describe('readonly', () => {
  it('is written as readOnly, and read back from it', () => {
    const Id = readonly(string());
    expect(toJsonSchema(Id).schema).toEqual({ $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'string', readOnly: true });
    expect(fromJsonSchema({ type: 'string', readOnly: true }).schema.meta).toEqual({ readOnly: true });
  });
});

describe('fromJsonSchema', () => {

  it('reads the boolean schemas and the empty one', () => {
    expect(verdicts(read(true), [1, 'a', null])).toEqual([true, true, true]);
    expect(verdicts(read(false), [1, null])).toEqual([false, false]);
    expect(read({}).kind).toBe('unknown');
  });

  it('binds a keyword only to its own type, so a schema with no type allows the others', () => {
    expect(verdicts(read({ minLength: 2 }), ['ab', 'a', 7, null, true, [], {}])).toEqual([true, false, true, true, true, true, true]);
    expect(verdicts(read({ minimum: 2 }), [2, 1, 'a'])).toEqual([true, false, true]);
    expect(verdicts(read({ minItems: 1 }), [[1], [], 'a'])).toEqual([true, false, true]);
    expect(verdicts(read({ required: ['a'] }), [{ a: 1 }, {}, 'a'])).toEqual([true, false, true]);
    expect(verdicts(read({ type: ['integer', 'string'], minimum: 2, minLength: 2 }), [2, 1, 'ab', 'a', 2.5, null])).toEqual([true, false, true, false, false, false]);
  });

  it('reads every type, and integer as a whole number', () => {
    expect(verdicts(read({ type: 'null' }), [null, 0])).toEqual([true, false]);
    expect(verdicts(read({ type: 'boolean' }), [true, 0])).toEqual([true, false]);
    expect(verdicts(read({ type: 'integer' }), [1, 1.5, '1'])).toEqual([true, false, false]);
    expect(verdicts(read({ type: ['number', 'integer'] }), [1.5])).toEqual([true]);
    expect(verdicts(read({ type: 'array' }), [[], {}])).toEqual([true, false]);
    expect(verdicts(read({ type: 'object' }), [{}, []])).toEqual([true, false]);
  });

  it('reads the string, number, array and object keywords', () => {
    expect(verdicts(read({ type: 'string', maxLength: 10, pattern: '^2', format: 'date' }), ['2020-01-01', '2020-13-01', '1999-01-01', '2020-01-011'])).toEqual([true, false, false, false]);
    expect(verdicts(read({ type: 'number', exclusiveMinimum: 1, exclusiveMaximum: 3, multipleOf: 2, maximum: 9 }), [2, 1, 3, 2.5])).toEqual([true, false, false, false]);
    expect(verdicts(read({ type: 'array', items: { type: 'number' }, minItems: 1, maxItems: 2, uniqueItems: true }), [[1], [], [1, 2, 3], [1, 1], ['a']])).toEqual([true, false, false, false, false]);
    expect(verdicts(read({ prefixItems: [{ type: 'number' }, { type: 'string' }], items: false, minItems: 1 }), [[1], [1, 'a'], [], [1, 'a', 2], ['a']])).toEqual([true, true, false, false, false]);
    expect(verdicts(read({ contains: { type: 'number' }, minContains: 2, maxContains: 2 }), [[1, 2], [1], [1, 2, 3]])).toEqual([true, false, false]);
    expect(verdicts(read({ properties: { a: { type: 'number' } }, required: ['a', 'b'], additionalProperties: { type: 'string' } }), [{ a: 1, b: 'x', c: 'y' }, { a: 1, b: 2 }, { a: 1 }, { a: 1, b: 'x', c: 1 }])).toEqual([true, false, false, false]);
    expect(verdicts(read({ properties: { a: true }, additionalProperties: false }), [{ a: 1 }, { b: 1 }])).toEqual([true, false]);
    // A key `required` names and `properties` does not is one of the others, held to `additionalProperties`.
    expect(verdicts(read({ required: ['b'], additionalProperties: false }), [{ b: 1 }, {}])).toEqual([false, false]);
    expect(verdicts(read({ additionalProperties: true, propertyNames: { maxLength: 1 }, minProperties: 1, maxProperties: 2 }), [{ a: 1 }, {}, { ab: 1 }, { a: 1, b: 1, c: 1 }])).toEqual([true, false, false, false]);
  });

  it('reads enum, const and the four combinations', () => {
    expect(verdicts(read({ enum: [1, 'a', null, [1], { a: [true] }] }), [1, 'a', null, [1], { a: [true] }, [1, 1], { a: [true], b: 1 }, 2])).toEqual([true, true, true, true, true, false, false, false]);
    expect(verdicts(read({ enum: [] }), [1])).toEqual([false]);
    expect(verdicts(read({ const: 1.0 }), [1, 1.5])).toEqual([true, false]);
    expect(verdicts(read({ allOf: [{ type: 'number' }, { minimum: 2 }], anyOf: [{ maximum: 3 }, { multipleOf: 5 }] }), [2, 10, 4, 1])).toEqual([true, true, false, false]);
    expect(verdicts(read({ allOf: [{}] }), [1])).toEqual([true]);
    expect(verdicts(read({ oneOf: [{ type: 'number' }, { type: 'integer' }] }), [1.5, 1, 'a'])).toEqual([true, false, false]);
    expect(verdicts(read({ not: { type: 'string' } }), [1, 'a'])).toEqual([true, false]);
    expect(verdicts(read({ if: { type: 'number' }, then: { minimum: 2 }, else: { type: 'string' } }), [2, 1, 'a', null])).toEqual([true, false, true, false]);
    expect(verdicts(read({ if: { type: 'string' } }), [1, 'a'])).toEqual([true, true]);
  });

  it('reads dependentRequired and dependentSchemas, and draft-07 dependencies', () => {
    expect(verdicts(read({ dependentRequired: { a: ['b'] }, dependentSchemas: { c: { required: ['d'] } } }), [{}, { a: 1, b: 1 }, { a: 1 }, { c: 1 }, { c: 1, d: 1 }, 'x'])).toEqual([true, true, false, false, true, true]);
    const old = read({ $schema: 'http://json-schema.org/draft-07/schema#', dependencies: { a: ['b'], c: { required: ['d'] } }, dependentRequired: { e: ['f'] } });
    expect(verdicts(old, [{ a: 1, b: 1 }, { a: 1 }, { c: 1 }, { e: 1 }])).toEqual([true, false, false, true]);
  });

  it('follows a $ref to a pointer in the document, itself included', () => {
    const Tree = read({ type: 'object', properties: { kids: { type: 'array', items: { $ref: '#' } } } });
    expect(verdicts(Tree, [{ kids: [{ kids: [] }] }, { kids: [1] }])).toEqual([true, false]);
    const Defs = read({ $defs: { 'a/b': { type: 'number' }, 'c~d': { type: 'string' }, list: [{ type: 'boolean' }], 'e f': { type: 'null' } }, anyOf: [{ $ref: '#/$defs/a~1b' }, { $ref: '#/$defs/c~0d' }, { $ref: '#/$defs/list/0' }, { $ref: '#/$defs/e%20f' }] });
    expect(verdicts(Defs, [1, 'x', true, null, []])).toEqual([true, true, true, true, false]);
    expect(verdicts(read({ $defs: { n: { type: 'number' } }, $ref: '#/$defs/n', minimum: 2 }), [2, 1])).toEqual([true, false]);
    const same = read({ $defs: { n: { type: 'number' } }, allOf: [{ $ref: '#/$defs/n' }, { $ref: '#/$defs/n' }] });
    expect(verdicts(same, [1, 'a'])).toEqual([true, false]);
  });

  it('ignores what stands beside a $ref in draft-07 and OpenAPI 3.0, as they say', () => {
    const old = read({ $schema: 'http://json-schema.org/draft-07/schema#', definitions: { s: { type: 'string' } }, $ref: '#/definitions/s', minLength: 3 });
    expect(verdicts(old, ['a', 1])).toEqual([true, false]);
    expect(verdicts(read({ items: [{ type: 'number' }], additionalItems: { type: 'string' } }, { draft: 'draft-07' }), [[1, 'a'], [1, 2], ['a']])).toEqual([true, false, false]);
    expect(verdicts(read({ items: { type: 'number' } }, { draft: 'draft-07' }), [[1], ['a']])).toEqual([true, false]);
    // Draft-07 has `contains` and no `minContains`: there it is a keyword it does not know.
    expect(verdicts(read({ contains: { type: 'number' }, minContains: 2 }, { draft: 'draft-07' }), [[1], ['a']])).toEqual([true, false]);
  });

  it('reads an OpenAPI 3.0 Schema Object: nullable, and exclusive bounds as booleans', () => {
    const Price = read({ type: 'number', minimum: 0, exclusiveMinimum: true, maximum: 10, exclusiveMaximum: false, nullable: true }, { draft: 'openapi-3.0' });
    expect(verdicts(Price, [0, 0.5, 10, null, 'a'])).toEqual([false, true, true, true, false]);
    expect(verdicts(read({ type: 'string', nullable: true, enum: ['a'] }, { draft: 'openapi-3.0' }), ['a', null])).toEqual([true, false]);
    expect(verdicts(read({ type: 'number', nullable: true }), [null])).toEqual([false]);
    expect(verdicts(read({ type: 'number', maximum: 1, exclusiveMaximum: true }, { draft: 'openapi-3.0' }), [1, 0])).toEqual([false, true]);
    expect(verdicts(read({ if: { type: 'string' }, then: false }, { draft: 'openapi-3.0' }), ['a'])).toEqual([true]);
    expect(verdicts(read({ type: 'string', format: 'byte' }, { draft: 'openapi-3.0' }), ['aGk=', 'a'])).toEqual([true, false]);
  });

  it('keeps title, description, examples and readOnly, and is data the emitter writes', () => {
    const schema = read({ title: 'T', description: 'D', examples: [1], readOnly: true, default: 1, type: 'number' });
    expect(schema.meta).toEqual({ title: 'T', description: 'D', examples: [1], readOnly: true });
    expect(compile(schema)(1)).toBe(true);
    expect(emit(read({ $defs: { n: { type: 'number' } }, items: { $ref: '#/$defs/n' } }))).toContain('const g');
  });

  it('takes formats of the caller, beside and over its own', () => {
    const upper = { name: 'upper', pattern: /^[A-Z]+$/u };
    expect(verdicts(read({ format: 'upper' }, { formats: { upper } }), ['AB', 'ab'])).toEqual([true, false]);
  });

  it('reads the dialect from $schema, and finds one it does not know', () => {
    expect(fromJsonSchema({ $schema: 'https://json-schema.org/draft/2020-12/schema', prefixItems: [true] }).findings).toEqual([]);
    expect(fromJsonSchema({ $schema: 'http://json-schema.org/draft-04/schema#' }).findings).toEqual([{ path: '', keyword: '$schema', message: 'the dialect "http://json-schema.org/draft-04/schema#" is not one this library reads: the document is read as 2020-12' }]);
    expect(fromJsonSchema({ $schema: 1 }).findings[0]?.message).toContain('the dialect 1 is not');
  });

  it('finds every keyword it does not read, and accepts more than the document there', () => {
    const { schema, findings } = fromJsonSchema({ patternProperties: { '^x': { type: 'number' } }, additionalProperties: false, unevaluatedItems: false, format: 'iri', multipleOf: 0.1, properties: { r: { $ref: 'other.json#/a' } } });
    expect(findings.map(({ path, keyword }) => ({ path, keyword }))).toEqual([
      { path: '', keyword: 'unevaluatedItems' },
      { path: '', keyword: 'multipleOf' },
      { path: '', keyword: 'format' },
      { path: '', keyword: 'patternProperties' },
      { path: '/properties/r', keyword: '$ref' },
    ]);
    expect(check(schema, { x: 'not a number', y: 1, r: 'anything' })).toBe(true);
  });

  it('refuses what is not JSON Schema, each with a fix line', () => {
    const FIX = ". fix: correct the document, or validate it against its dialect's meta-schema first";
    expect(readingOf(1)).toThrow(`cannot read the JSON Schema at "": a schema is an object or a boolean, and this is 1${FIX}`);
    expect(readingOf([])).toThrow('and this is an array');
    expect(readingOf({ items: 'x' })).toThrow('cannot read the JSON Schema at "/items": a schema is an object or a boolean, and this is "x"');
    expect(readingOf({ minimum: '1' })).toThrow('"minimum" is "1", not a number');
    expect(readingOf({ minLength: -1 })).toThrow('"minLength" is -1, not a whole number of zero or more');
    expect(readingOf({ minLength: 1.5 })).toThrow('not a whole number');
    expect(readingOf({ multipleOf: 0 })).toThrow('"multipleOf" is 0, not a number above zero');
    expect(readingOf({ allOf: [] })).toThrow('"allOf" is a value of the type object, not a list of one schema or more');
    expect(readingOf({ anyOf: {} })).toThrow('"anyOf" is a value of the type object');
    expect(readingOf({ type: 'date' })).toThrow('"type" names "date", which is no JSON type');
    expect(readingOf({ type: [1] })).toThrow('"type" is a value of the type object, not a list of strings');
    expect(readingOf({ required: 'a' })).toThrow('"required" is "a", not a list of strings');
    expect(readingOf({ properties: [] })).toThrow('"properties" is a value of the type object, not an object');
    expect(readingOf({ dependentRequired: 1 })).toThrow('"dependentRequired" is 1, not an object');
    expect(readingOf({ dependentRequired: { a: 'b' } })).toThrow('"a" is "b", not a list of strings');
    expect(readingOf({ pattern: 1 })).toThrow('"pattern" is 1, not a string');
    expect(readingOf({ pattern: '(' })).toThrow('"pattern" "(" is not a regular expression');
    expect(readingOf({ format: 1 })).toThrow('"format" is 1, not a string');
    expect(readingOf({ enum: 'a' })).toThrow('"enum" is "a", not a list');
    expect(readingOf({ const: Number.NaN })).toThrow('cannot read the JSON Schema at "/const": NaN is not a JSON value');
    expect(readingOf({ const: [String] })).toThrow('at "/const/0": a value of the type function is not a JSON value');
    expect(readingOf({ $ref: 1 })).toThrow('"$ref" is 1, not a string');
    expect(readingOf({ $ref: '#/nowhere' })).toThrow('"$ref" "#/nowhere" names nothing in the document');
    expect(readingOf({ $defs: { a: [] }, $ref: '#/$defs/a/x' })).toThrow('names nothing');
    expect(readingOf({ $defs: { a: [] }, $ref: '#/$defs/a/01' })).toThrow('names nothing');
    expect(readingOf({ $ref: '#/$defs/n', $defs: { n: { minimum: 'x' } } })).toThrow('cannot read the JSON Schema at "/$defs/n": "minimum" is "x", not a number');
    expect(readingOf({}, { draft: 'draft-04' as never })).toThrow("cannot read the dialect \"draft-04\". fix: ask for '2020-12', 'draft-07' or 'openapi-3.0'");
    const self: Record<string, unknown> = {};
    self['not'] = self;
    expect(readingOf(self)).toThrow('cannot read the JSON Schema at "/not": the document holds itself without a $ref, so it has no end');
  });

  it('is what toJsonSchema writes, read back', () => {
    const Order = object({ id: template(['o-', number({ int: true })]), tags: unique(array(string())), total: number({ min: 0 }), note: optional(nullable(string())), lines: tuple([string(), number()]) });
    const back = read(toJsonSchema(Order).schema);
    const values = [{ id: 'o-1', tags: ['a'], total: 1, lines: ['x', 1] }, { id: 'o-1', tags: ['a', 'a'], total: 1, lines: ['x', 1] }, { id: 'x', tags: [], total: 1, lines: ['x', 1] }, { id: 'o-1', tags: [], total: -1, lines: ['x', 1] }, { id: 'o-1', tags: [], total: 1, note: null, lines: ['x'] }];
    expect(values.map((one) => verdict(back, one))).toEqual(values.map((one) => check(Order, one)));
  });
});

describe('standardJson', () => {
  const Order = object({ id: string(), total: number() });

  it('writes the input and the output as the target asks', () => {
    const wrapped = standardJson(Order)['~standard'];
    expect(wrapped.vendor).toBe('validator');
    expect(wrapped.version).toBe(1);
    expect(wrapped.jsonSchema.input({ target: 'draft-2020-12' })).toEqual(toJsonSchema(Order).schema);
    expect(wrapped.jsonSchema.output({ target: 'draft-07' })).toEqual(toJsonSchema(Order, { draft: 'draft-07' }).schema);
  });

  it('refuses a target it does not write, as the specification asks', () => {
    expect(() => standardJson(Order)['~standard'].jsonSchema.input({ target: 'openapi-3.0' })).toThrow('cannot write JSON Schema for the target "openapi-3.0". fix: ask for "draft-2020-12" or "draft-07"');
  });

  it('refuses an output a document of the input cannot describe, and hands the findings over', () => {
    const Length = standardJson(transform(string(), (text) => text.length));
    const found: unknown[] = [];
    expect(Length['~standard'].jsonSchema.input({ target: 'draft-07', libraryOptions: { findings: (all: unknown[]) => found.push(...all) } })).toEqual({ $schema: 'http://json-schema.org/draft-07/schema#', type: 'string' });
    expect(found).toHaveLength(1);
    expect(() => Length['~standard'].jsonSchema.output({ target: 'draft-07' })).toThrow('cannot write the output of this schema as JSON Schema: at "", the transform is a function');
    expect(standardJson(refineFree)['~standard'].jsonSchema.output({ target: 'draft-07', libraryOptions: { findings: 1 } })).toEqual({ $schema: 'http://json-schema.org/draft-07/schema#', type: 'number' });
  });

  it('keeps the validate of a Standard Schema it wraps, and is still a schema', () => {
    const both = standardJson(standard(Order));
    expect(both['~standard'].jsonSchema.input({ target: 'draft-07' })['type']).toBe('object');
    expect((both['~standard'] as unknown as { validate: (value: unknown) => unknown }).validate({ id: 'a', total: 1 })).toEqual({ value: { id: 'a', total: 1 } });
    expect(check(both, { id: 'a', total: 1 })).toBe(true);
  });
});

const refineFree = number();

/** Every wave 4 kind in one object, and a value it accepts. */
const Wave4 = object({
  tmpl: template(['id-', number({ int: true })]),
  pre: startsWith(string(), 'a'),
  suf: endsWith(string(), 'z'),
  mid: includes(string(), '@'),
  some: contains(array(number()), number({ min: 10 }), { max: 2 }),
  distinct: unique(array(unknown())),
  nope: not(string()),
  one: oneOf([number({ int: true }), number({ min: 10 })]),
  fallback: catchOf(number(), 0),
  coded: codec(string({ pattern: /^\d+$/u }), number(), { decode: Number, encode: String }),
  base: string({ format: base64url }),
  span: string({ format: duration }),
  id: string({ format: ulid }),
  v4: string({ format: uuidVersion(4) }),
});

const wave4 = (): Record<string, unknown> => ({
  tmpl: 'id-1',
  pre: 'ab',
  suf: 'az',
  mid: 'a@b',
  some: [1, 10],
  distinct: [1, { a: 1 }],
  nope: 1,
  one: 1,
  fallback: 1,
  coded: '12',
  base: 'aGk',
  span: 'P1D',
  id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  v4: '9b2c5f44-0a8b-4f1a-9e3c-7d6f2b1a0c9e',
});

const WAVE4_PROBES: unknown[] = [undefined, null, true, 0, 1, 10, 10.5, -1, 1n, '', 'a', 'z', '@', 'id-7', 'id-x', 'az@', '7', 'P2W', 'aGk=', '01ARZ3NDEKTSV4RRFFQ69G5FAU', '9b2c5f44-0a8b-1f1a-9e3c-7d6f2b1a0c9e', [], [10], [10, 10], [10, 11, 12], [1, 1], [{ a: 1 }, { a: 1 }], [NaN, NaN], {}, { a: 1 }, new Date(0)];

/** The places in the value: each key, and each item of an array under one. */
const places = (value: Record<string, unknown>): (string | number)[][] =>
  Object.entries(value).flatMap(([key, member]) => [[key], ...(Array.isArray(member) ? member.map((_, index) => [key, index]) : [])]);

const probedAt = (path: readonly (string | number)[], probe: unknown): unknown => {
  const value = wave4();
  const [key, index] = path as [string, number | undefined];
  if (index === undefined) value[key] = probe;
  else (value[key] as unknown[])[index] = probe;
  return value;
};

describe('the readers, for the wave 4 kinds', () => {
  it('agree on a value of every new kind with one member replaced by every probe', () => {
    expect(verdict(Wave4, wave4())).toBe(true);
    let accepted = 0;
    const paths = places(wave4());
    for (const path of paths) for (const probe of WAVE4_PROBES) if (verdict(Wave4, probedAt(path, probe))) accepted += 1;
    expect([paths.length * WAVE4_PROBES.length, accepted]).toEqual([558, 114]);
  });
});
