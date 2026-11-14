import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  type AnySchema,
  annotate,
  any,
  array,
  boolean,
  check,
  custom,
  discriminated,
  enumOf,
  type Format,
  type Infer,
  intersection,
  type Issue,
  issues,
  lazy,
  literal,
  never,
  nullable,
  nullish,
  number,
  object,
  optional,
  record,
  type Schema,
  string,
  tuple,
  union,
  unknown,
} from './index.js';
import { compile } from './jit.js';

/**
 * Wave 1 of parity.md: the 24 features all five competitors have. The values each row accepts and
 * refuses are the ones the competitors' probes use (benchmarks/results/validator/parity-2026-11-13),
 * and every row is put to all three readers (spec.md R2): `check`, `issues` and the emitted code.
 */

const digit: Format = { name: 'digit', pattern: /^\d$/ };
const evenLength = (text: string): boolean => text.length % 2 === 0;
const even: Format = { name: 'even', test: evenLength };
const startsWithX = (value: unknown): boolean => typeof value === 'string' && value.startsWith('x');
const truthy = (value: unknown): boolean => value as boolean;
const anything = (): boolean => true;

interface Tree {
  v: number;
  kids: Tree[];
}
const TreeSchema: Schema<Tree> = object({ v: number(), kids: array(lazy(() => TreeSchema)) });

interface A {
  b: B[];
}
interface B {
  a?: A | undefined;
}
const ASchema: Schema<A> = object({ b: array(lazy(() => BSchema)) });
const BSchema: Schema<B> = object({ a: optional(ASchema) });

const FEATURES: [string, AnySchema, unknown[], unknown[]][] = [
  ['prim.any', any(), [1, null, undefined, {}], []],
  ['prim.unknown', unknown(), [1, null, undefined], []],
  ['prim.never', never(), [], [1, undefined, null]],
  ['fmt.custom, by pattern', string({ format: digit }), ['1'], ['a', '12', 1]],
  ['fmt.custom, by test', string({ format: even }), ['ab', ''], ['a', 2]],
  ['a format beside a pattern and a bound', string({ min: 2, pattern: /^a/, format: even }), ['ab', 'abcd'], ['abc', 'bb', '']],
  ['num.exclusive', number({ gt: 0, lt: 1 }), [0.5, Number.MIN_VALUE], [0, 1, -1, 2, Number.NaN]],
  ['num.multiple_of', number({ multipleOf: 2 }), [4, 0, -4], [3, '4', Number.POSITIVE_INFINITY]],
  ['a multiple of a fraction', number({ multipleOf: 0.1 }), [0.3, 0.1 + 0.2, 0.7, 1.1, -0.3, 0, 123_456_789.3], [0.35, 0.05, 1e-10]],
  ['a multiple of a whole number is exact', number({ multipleOf: 1 }), [1, 2 ** 53], [1.000_000_000_000_000_2, 0.5]],
  // 2 ** -8 is one step and 2 ** -60 more, and 2 ** -60 is exactly its rounding error: the edge of the rule, and inside it.
  ['a multiple of a fraction, exactly one rounding error off', number({ multipleOf: 2 ** -8 - 2 ** -60 }), [2 ** -8], [2 ** -8 + 2 ** -59]],
  ['num.positive', number({ positive: true }), [1, Number.MIN_VALUE], [0, -1]],
  ['num.negative', number({ negative: true }), [-1, -Number.MIN_VALUE], [0, 1]],
  ['positive beside a looser bound', number({ positive: true, gt: -5 }), [1], [0, -3]],
  ['positive beside a tighter bound', number({ positive: true, gt: 5 }), [6], [5, 3]],
  ['negative beside a looser bound', number({ negative: true, lt: 5 }), [-1], [0, 3]],
  ['negative beside a tighter bound', number({ negative: true, lt: -5 }), [-6], [-5, -3]],
  ['positive: false asks for nothing', number({ positive: false, negative: false }), [0, 1, -1], []],
  ['an exclusive bound beside an inclusive one and an integer', number({ min: 0, gt: 0, max: 10, int: true }), [1, 10], [0, 11, 1.5]],
  ['col.record', record(number()), [{}, { a: 1 }], [{ a: 'x' }, { a: 1, b: 'x' }, null, [], 'x']],
  ['col.record_key_schema', record(number(), { key: string({ pattern: /^x/ }) }), [{ xa: 1 }, {}], [{ ya: 1 }, { xa: 1, ya: 1 }, { xa: 'x' }]],
  ['a record keyed by an enum', record(boolean(), { key: enumOf(['a', 'b']) }), [{ a: true }, { a: true, b: false }], [{ c: true }]],
  ['col.tuple', tuple([string(), number()]), [['a', 1]], [[1, 'a'], ['a'], ['a', 1, 2], [], {}, 'a1', { 0: 'a', 1: 1, length: 2 }]],
  ['an empty tuple', tuple([]), [[]], [[1], {}]],
  ['obj.catchall', object({ a: string() }, { unknown: number() }), [{ a: 'x', b: 1 }, { a: 'x' }], [{ a: 'x', b: 'y' }, { a: 1, b: 1 }, { b: 1 }, null]],
  ['obj.default', object({ a: optional(string(), { default: 'd' }) }), [{}, { a: 'x' }], [{ a: 1 }]],
  ['obj.nullable', nullable(string()), ['a', null], [undefined, 1]],
  ['obj.nullish', nullish(string()), ['a', null, undefined], [1]],
  ['a nullish key may be absent', object({ a: nullish(string()) }), [{}, { a: null }, { a: undefined }, { a: 'x' }], [{ a: 1 }]],
  ['a nullable key may not be absent', object({ a: nullable(string()) }), [{ a: null }, { a: 'x' }], [{}, { a: undefined }]],
  // A key that is not optional must be there, whatever its schema would say of undefined.
  ['a required key of unknown', object({ a: unknown() }), [{ a: null }, { a: 0 }], [{}, { a: undefined }]],
  ['a required key of a nullable unknown', object({ a: nullable(unknown()) }), [{ a: null }, { a: 0 }], [{}, { a: undefined }]],
  ['a required key of a nullish made required by hand', object({ a: { ...nullish(string()), optional: false } as AnySchema }), [{ a: null }, { a: 'x' }], [{}, { a: undefined }]],
  ['a required key of a union', object({ a: union([unknown()]) }), [{ a: null }], [{}, { a: undefined }]],
  ['a required key of an intersection', object({ a: intersection([]) }), [{ a: null }], [{}, { a: undefined }]],
  ['a required key of a lazy schema', object({ a: lazy(() => unknown()) }), [{ a: null }], [{}, { a: undefined }]],
  ['a required key of a custom type', object({ a: custom('anything', anything) }), [{ a: null }], [{}, { a: undefined }]],
  ['obj.strict', object({ a: string() }, { unknown: 'strict' }), [{ a: 'x' }], [{ a: 'x', b: 1 }, { a: 'x', b: undefined }, { a: 1 }, {}, []]],
  ['a strict object with no keys', object({}, { unknown: 'strict' }), [{}], [{ a: 1 }]],
  ['obj.strip, which check reads as keep', object({ a: string() }, { unknown: 'strip' }), [{ a: 'x' }, { a: 'x', b: 1 }], [{ b: 1 }]],
  ['comp.union', union([string(), number()]), ['a', 1], [true, null, undefined]],
  ['a union with no members', union([]), [], [1, undefined]],
  ['a union of objects', union([object({ a: string() }), object({ b: number() })]), [{ a: 'x' }, { b: 1 }, { a: 1, b: 1 }], [{ a: 1 }, {}]],
  ['comp.intersection', intersection([object({ a: string() }), object({ b: number() })]), [{ a: 'x', b: 1 }], [{ a: 'x' }, { b: 1 }, { a: 'x', b: 'y' }]],
  ['an intersection with no members', intersection([]), [1, undefined], []],
  ['comp.recursive', TreeSchema, [{ v: 1, kids: [{ v: 2, kids: [] }] }, { v: 1, kids: [] }], [{ v: 1, kids: [{ v: 'x', kids: [] }] }, { v: 1 }]],
  ['comp.mutual_recursive', ASchema, [{ b: [{ a: { b: [] } }] }, { b: [{}] }], [{ b: [{ a: { b: [1] } }] }, { b: [{ a: 1 }] }]],
  ['a lazy scalar', lazy(() => string({ min: 1 })), ['a'], ['', 1]],
  ['val.coerce_number, which check does not do', number({ coerce: true }), [42], ['42', 'abc']],
  ['val.custom_type', custom<`x${string}`>('a string that starts with x', startsWithX), ['xa'], ['a', 1]],
  ['a custom type that answers something other than true', custom('truthy', truthy), [true], [1, 'yes', false]],
  ['val.metadata, which nothing that validates reads', annotate(string({ min: 1 }), { title: 't' }), ['a'], ['', 1]],
];

describe('the wave 1 features', () => {
  it.each(FEATURES)('%s: check, issues and the emitted code accept and refuse the same values', (_, schema, accepted, refused) => {
    const compiled = compile(schema);
    for (const value of accepted) {
      expect(check(schema, value), `accept ${String(JSON.stringify(value))}`).toBe(true);
      expect(compiled(value), `emitted, accept ${String(JSON.stringify(value))}`).toBe(true);
      expect(issues(schema, value)).toEqual([]);
    }
    for (const value of refused) {
      expect(check(schema, value), `refuse ${String(JSON.stringify(value))}`).toBe(false);
      expect(compiled(value), `emitted, refuse ${String(JSON.stringify(value))}`).toBe(false);
      expect(issues(schema, value).length, `issues for ${String(JSON.stringify(value))}`).toBeGreaterThan(0);
      expect(issues(schema, value, { first: true })).toHaveLength(1);
    }
  });

  it('has a row for every wave 1 feature of the matrix', () => {
    const ids = new Set(FEATURES.map(([name]) => name.split(/[, ]/u)[0]).filter((name) => name?.includes('.')));
    expect([...ids].toSorted()).toEqual([
      'col.record',
      'col.record_key_schema',
      'col.tuple',
      'comp.intersection',
      'comp.mutual_recursive',
      'comp.recursive',
      'comp.union',
      'fmt.custom',
      'num.exclusive',
      'num.multiple_of',
      'num.negative',
      'num.positive',
      'obj.catchall',
      'obj.default',
      'obj.nullable',
      'obj.nullish',
      'obj.strict',
      'obj.strip',
      'prim.any',
      'prim.never',
      'prim.unknown',
      'val.coerce_number',
      'val.custom_type',
      'val.metadata',
    ]);
  });
});

// One row per way a value of a new kind can be wrong: every issue, in order.
const WRONG: [string, AnySchema, unknown, Issue[]][] = [
  ['at an exclusive lower bound', number({ gt: 0 }), 0, [{ path: '', keyword: 'gt', message: 'expected a number above 0, got number 0. fix: send more than 0' }]],
  ['at an exclusive upper bound', number({ lt: 1 }), 1, [{ path: '', keyword: 'lt', message: 'expected a number below 1, got number 1. fix: send less than 1' }]],
  ['under an inclusive bound that is looser', number({ min: -1, gt: 0 }), -1, [{ path: '', keyword: 'gt', message: 'expected a number above 0, got number -1. fix: send more than 0' }]],
  ['under an inclusive bound that is tighter', number({ min: 1, gt: 0 }), 0.5, [{ path: '', keyword: 'min', message: 'expected a number of at least 1, got number 0.5. fix: send 1 or more' }]],
  ['over both upper bounds', number({ max: 1, lt: 2 }), 2, [{ path: '', keyword: 'max', message: 'expected a number of at most 1, got number 2. fix: send 1 or less' }]],
  ['not positive', number({ positive: true }), 0, [{ path: '', keyword: 'gt', message: 'expected a number above 0, got number 0. fix: send more than 0' }]],
  ['not negative', number({ negative: true }), 0, [{ path: '', keyword: 'lt', message: 'expected a number below 0, got number 0. fix: send less than 0' }]],
  ['a fraction above an exclusive bound', number({ gt: 0, int: true }), 1.5, [{ path: '', keyword: 'integer', message: 'expected a whole number, got number 1.5. fix: drop the fraction' }]],
  ['not a multiple', number({ multipleOf: 2 }), 3, [{ path: '', keyword: 'multipleOf', message: 'expected a multiple of 2, got number 3. fix: send a multiple of 2' }]],
  ['a fraction where a whole multiple is wanted', number({ int: true, multipleOf: 0.5 }), 1.5, [{ path: '', keyword: 'integer', message: 'expected a whole number, got number 1.5. fix: drop the fraction' }]],
  ['not in a format', string({ format: digit }), 'a', [{ path: '', keyword: 'format', message: 'expected a string in the format digit, got string "a". fix: send one in the format digit' }]],
  ['not in a tested format', string({ format: even }), 'a', [{ path: '', keyword: 'format', message: 'expected a string in the format even, got string "a". fix: send one in the format even' }]],
  ['a pattern miss before a format', string({ pattern: /^b/, format: digit }), 'a', [{ path: '', keyword: 'pattern', message: 'expected a string matching /^b/, got string "a". fix: send a value the pattern accepts' }]],
  ['anything, where nothing is allowed', object({ a: never() }), { a: 1 }, [{ path: '/a', keyword: 'never', message: 'expected no value, got number 1. fix: remove it' }]],
  ['an unknown key of a strict object', object({ a: string() }, { unknown: 'strict' }), { 'a': 'x', 'b': 1, 'c/d': null }, [
    { path: '/b', keyword: 'unknown', message: 'expected no such key, got number 1. fix: remove "b"' },
    { path: '/c~1d', keyword: 'unknown', message: 'expected no such key, got null. fix: remove "c/d"' },
  ]],
  ['a strict object that is wrong inside and out', object({ a: string() }, { unknown: 'strict' }), { b: 1 }, [
    { path: '/a', keyword: 'required', message: 'expected a value, got undefined undefined. fix: add "a"' },
    { path: '/b', keyword: 'unknown', message: 'expected no such key, got number 1. fix: remove "b"' },
  ]],
  ['an unknown key that fails its schema', object({ a: string() }, { unknown: number() }), { a: 'x', b: 'y', c: 2, d: null }, [
    { path: '/b', keyword: 'type', message: 'expected a number, got string "y". fix: send a finite number' },
    { path: '/d', keyword: 'type', message: 'expected a number, got null. fix: send a finite number' },
  ]],
  ['not a record', record(number()), [], [{ path: '', keyword: 'type', message: 'expected an object, got an array. fix: send an object' }]],
  ['a wrong value in a record', record(number()), { 'a': 1, 'b/c': 'x' }, [{ path: '/b~1c', keyword: 'type', message: 'expected a number, got string "x". fix: send a finite number' }]],
  ['a wrong key in a record', record(number(), { key: string({ pattern: /^x/ }) }), { xa: 1, ya: 2 }, [
    { path: '/ya', keyword: 'key', message: 'expected a key the record allows, got string "ya". fix: rename the key, or remove it' },
  ]],
  ['a wrong key with a wrong value', record(number(), { key: string({ pattern: /^x/ }) }), { ya: 'z' }, [
    { path: '/ya', keyword: 'key', message: 'expected a key the record allows, got string "ya". fix: rename the key, or remove it' },
    { path: '/ya', keyword: 'type', message: 'expected a number, got string "z". fix: send a finite number' },
  ]],
  ['not a tuple', tuple([string()]), { 0: 'a' }, [{ path: '', keyword: 'type', message: 'expected an array, got an object. fix: send an array' }]],
  ['a tuple too long', tuple([string(), number()]), ['a', 1, 2], [{ path: '', keyword: 'length', message: 'expected exactly 2 items, got an array. fix: send 2' }]],
  ['a tuple too short, and wrong where it has items', tuple([string(), number(), boolean()]), [1, 2], [
    { path: '', keyword: 'length', message: 'expected exactly 3 items, got an array. fix: send 3' },
    { path: '/0', keyword: 'type', message: 'expected a string, got number 1. fix: send a string' },
  ]],
  ['a tuple with a wrong item', tuple([string(), number()]), ['a', 'b'], [{ path: '/1', keyword: 'type', message: 'expected a number, got string "b". fix: send a finite number' }]],
  ['undefined where null is allowed', nullable(string()), undefined, [{ path: '', keyword: 'type', message: 'expected a string, got undefined undefined. fix: send a string' }]],
  ['wrong inside a nullish', object({ a: nullish(string({ min: 2 })) }), { a: 'x' }, [{ path: '/a', keyword: 'min', message: 'expected at least 2 characters, got string "x". fix: send 2 or more' }]],
  ['no member of a union', union([string(), number({ min: 1 })]), true, [
    { path: '', keyword: 'union', message: 'expected a value one of 2 members accepts, got boolean true. fix: satisfy one of them; member 0 fails type at ""; member 1 fails type at ""' },
  ]],
  ['a union of objects, each failing somewhere else', object({ u: union([object({ a: string() }), object({ b: array(number()) })]) }), { u: { a: 1, b: [1, 'x'] } }, [
    { path: '/u', keyword: 'union', message: 'expected a value one of 2 members accepts, got an object. fix: satisfy one of them; member 0 fails type at "/u/a"; member 1 fails type at "/u/b/1"' },
  ]],
  ['a union with no members', union([]), 1, [{ path: '', keyword: 'union', message: 'expected a value one of 0 members accepts, got number 1. fix: satisfy one of them' }]],
  ['every member of an intersection that fails', intersection([object({ a: string() }), object({ b: number() })]), { a: 1 }, [
    { path: '/a', keyword: 'type', message: 'expected a string, got number 1. fix: send a string' },
    { path: '/b', keyword: 'required', message: 'expected a value, got undefined undefined. fix: add "b"' },
  ]],
  ['deep in a tree', TreeSchema, { v: 1, kids: [{ v: 2, kids: [{ v: 'x', kids: [] }] }] }, [{ path: '/kids/0/kids/0/v', keyword: 'type', message: 'expected a number, got string "x". fix: send a finite number' }]],
  ['not a custom type', custom('a string that starts with x', startsWithX), 'a', [
    { path: '', keyword: 'custom', message: 'expected a string that starts with x, got string "a". fix: send a value that is a string that starts with x' },
  ]],
];

describe('issues, for the wave 1 kinds', () => {
  it.each(WRONG)('says where and why for %s', (_, schema, value, expected) => {
    expect(check(schema, value)).toBe(false);
    expect(issues(schema, value)).toEqual(expected);
    expect(issues(schema, value, { first: true })).toEqual(expected.slice(0, 1));
  });

  it('stops at the first issue inside a strict object, a record and a tuple', () => {
    expect(issues(object({ a: string() }, { unknown: 'strict' }), { a: 1, b: 1 }, { first: true }).map((issue) => issue.path)).toEqual(['/a']);
    expect(issues(object({}, { unknown: 'strict' }), { a: 1, b: 1 }, { first: true }).map((issue) => issue.path)).toEqual(['/a']);
    expect(issues(record(number(), { key: enumOf(['a']) }), { a: 'x', b: 1 }, { first: true }).map((issue) => issue.keyword)).toEqual(['type']);
    expect(issues(record(number(), { key: enumOf(['a']) }), { b: 'x', a: 'y' }, { first: true }).map((issue) => issue.keyword)).toEqual(['key']);
    expect(issues(tuple([string()]), [1, 2], { first: true }).map((issue) => issue.keyword)).toEqual(['length']);
  });

  it('reads the enumerable keys of the prototype as keys, as it reads a named field there (parity.md decision 3)', () => {
    const inherited: unknown = Object.create({ b: 'x' });
    expect(check(record(number()), inherited)).toBe(false);
    expect(check(object({}, { unknown: 'strict' }), inherited)).toBe(false);
    expect(check(object({ b: string() }, { unknown: 'strict' }), inherited)).toBe(true);
    expect(issues(record(number()), inherited).map((issue) => issue.path)).toEqual(['/b']);
    expect(issues(object({}, { unknown: 'strict' }), inherited).map((issue) => issue.path)).toEqual(['/b']);
    expect(compile(record(number()))(inherited)).toBe(false);
    expect(compile(object({}, { unknown: 'strict' }))(inherited)).toBe(false);
  });
});

describe('the builders', () => {
  it('give every kind the same members in the same order, frozen', () => {
    const members = Object.keys(string());
    expect(members).toEqual([
      'kind', 'check', 'min', 'max', 'above', 'below', 'step', 'int', 'coerce', 'pattern', 'rule', 'value', 'values', 'item', 'key',
      'keys', 'fields', 'optional', 'default', 'unknown', 'tag', 'cases', 'get', 'meta', 'own',
    ]);
    for (const [, schema] of FEATURES) {
      expect(Object.keys(schema)).toEqual(members);
      expect(Object.isFrozen(schema)).toBe(true);
    }
    for (const schema of [optional(string(), { default: 'd' }), nullish(string()), annotate(optional(string()), { title: 't' })]) {
      expect(Object.keys(schema)).toEqual(members);
      expect(Object.isFrozen(schema)).toBe(true);
    }
  });

  it('keep what a kind does not use at the one value that says so', () => {
    expect({ ...boolean(), check: null }).toEqual({
      kind: 'boolean', check: null, min: -Number.MAX_VALUE, max: Number.MAX_VALUE, above: Number.NEGATIVE_INFINITY, below: Number.POSITIVE_INFINITY, step: 0,
      int: false, coerce: false, pattern: null, rule: null, value: undefined, values: null, item: null, key: null,
      keys: null, fields: null, optional: false, default: undefined, unknown: 'keep', tag: null, cases: null, get: null, meta: null, own: null,
    });
    expect(literal(null).value).toBeNull();
    expect(number({ coerce: true }).coerce).toBe(true);
    expect(number({ int: true }).int).toBe(true);
  });

  it('name each kind', () => {
    expect(FEATURES.map(([, schema]) => schema.kind).filter((kind, index, all) => all.indexOf(kind) === index)).toEqual([
      'unknown', 'never', 'string', 'number', 'record', 'tuple', 'object', 'nullable', 'nullish', 'union', 'intersection', 'lazy', 'custom',
    ]);
    expect(any().check).toBe(unknown().check);
  });

  it('carry on an object only what its handling of unknown keys needs', () => {
    expect(object({ a: string() }).values).toBeNull();
    expect(object({ a: string() }).unknown).toBe('keep');
    expect(object({ a: string() }, { unknown: 'keep' }).check).toBe(object({}).check);
    const strip = object({ a: string() }, { unknown: 'strip' });
    expect([strip.unknown, [...(strip.values ?? [])], strip.item, strip.check === object({}).check]).toEqual(['strip', ['a'], null, true]);
    const strict = object({ a: string() }, { unknown: 'strict' });
    expect([strict.unknown, [...(strict.values ?? [])], strict.item, strict.check === object({}).check]).toEqual(['strict', ['a'], null, false]);
    const rest = number();
    const open = object({ a: string() }, { unknown: rest });
    expect([open.unknown, [...(open.values ?? [])], open.item === rest, open.check === strict.check]).toEqual(['keep', ['a'], true, true]);
  });

  it('refuse a multipleOf that has no multiples', () => {
    for (const step of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => number({ multipleOf: step })).toThrow(TypeError);
      expect(() => number({ multipleOf: step })).toThrow(`multipleOf ${String(step)} has no multiples to test. fix: give a finite number above zero`);
    }
    expect(number({ multipleOf: Number.MIN_VALUE }).step).toBe(Number.MIN_VALUE);
    expect(number({ multipleOf: Number.MAX_VALUE }).step).toBe(Number.MAX_VALUE);
    expect(number().step).toBe(0);
  });

  it('refuse a format whose pattern keeps state between tests', () => {
    expect(() => string({ format: { name: 'g', pattern: /a/g } })).toThrow('pattern /a/g keeps state between tests. fix: remove its g and y flags');
    expect(() => string({ format: { name: 'y', pattern: /a/y } })).toThrow(TypeError);
  });

  it('hold a format as frozen data: a name and a pattern or a test, never both', () => {
    expect(string({ format: digit }).rule).toEqual({ name: 'digit', pattern: /^\d$/, test: null });
    expect(string({ format: even }).rule).toEqual({ name: 'even', pattern: null, test: evenLength });
    expect(Object.isFrozen(string({ format: digit }).rule)).toBe(true);
    expect(custom('named', startsWithX).rule).toEqual({ name: 'named', pattern: null, test: startsWithX });
    expect(Object.isFrozen(custom('named', startsWithX).rule)).toBe(true);
    expect(string().rule).toBeNull();
  });

  it('do not let a later change to the members reach a tuple, a union or an intersection', () => {
    const members: AnySchema[] = [string()];
    const built = [tuple(members), union(members), intersection(members)];
    members.push(number());
    for (const schema of built) expect(schema.fields).toHaveLength(1);
  });

  it('ask a lazy schema for its target only when it is read', () => {
    let asked = 0;
    const schema = lazy(() => {
      asked += 1;
      return string();
    });
    expect(asked).toBe(0);
    expect(check(schema, 'a')).toBe(true);
    expect(asked).toBe(1);
  });

  it('carry a title, a description and examples, readable back, and add to what is already there', () => {
    const base = string({ min: 1 });
    const titled = annotate(base, { title: 't' });
    const described = annotate(titled, { description: 'd', examples: ['a'] });
    expect(base.meta).toBeNull();
    expect(titled.meta).toEqual({ title: 't' });
    expect(described.meta).toEqual({ title: 't', description: 'd', examples: ['a'] });
    expect(annotate(described, { title: 'u' }).meta?.title).toBe('u');
    expect(Object.isFrozen(described.meta)).toBe(true);
    expect({ ...described, meta: null }).toEqual(base);
  });

  it('keep a default on the node, and say there is none with undefined', () => {
    expect(optional(string(), { default: 'd' }).default).toBe('d');
    expect(optional(string()).default).toBeUndefined();
    expect(optional(string(), { default: 'd' }).optional).toBe(true);
    expect(string().optional).toBe(false);
    expect(nullish(string()).optional).toBe(true);
    expect(nullable(string()).optional).toBe(false);
  });
});

describe('the inferred types of the wave 1 builders', () => {
  it('are any, unknown and never', () => {
    expectTypeOf<Infer<ReturnType<typeof any>>>().toBeAny();
    expectTypeOf<Infer<ReturnType<typeof unknown>>>().toBeUnknown();
    expectTypeOf<Infer<ReturnType<typeof never>>>().toBeNever();
  });

  it('are a tuple and a record', () => {
    const pair = tuple([string(), number(), literal('a')]);
    expectTypeOf<Infer<typeof pair>>().toEqualTypeOf<[string, number, 'a']>();
    const scores = record(number());
    expectTypeOf<Infer<typeof scores>>().toEqualTypeOf<Record<string, number>>();
    const keyed = record(array(boolean()), { key: enumOf(['a', 'b']) });
    expectTypeOf<Infer<typeof keyed>>().toEqualTypeOf<{ a?: boolean[]; b?: boolean[] }>();
    // @ts-expect-error a key is a string, so a number schema cannot describe one
    record(number(), { key: number() });
  });

  it('are nullable and nullish, and a nullish key is optional', () => {
    const name = nullable(string());
    expectTypeOf<Infer<typeof name>>().toEqualTypeOf<string | null>();
    const maybe = nullish(number());
    expectTypeOf<Infer<typeof maybe>>().toEqualTypeOf<number | null | undefined>();
    const shape = object({ a: nullish(string()), b: nullable(string()), c: optional(number(), { default: 1 }) });
    expectTypeOf<Infer<typeof shape>>().toEqualTypeOf<{ b: string | null; a?: string | null | undefined; c?: number | undefined }>();
    // @ts-expect-error a default is a value of the schema's own type
    optional(number(), { default: 'one' });
  });

  it('are a union and an intersection', () => {
    const either = union([string(), number(), literal(true)]);
    expectTypeOf<Infer<typeof either>>().toEqualTypeOf<string | number | true>();
    const both = intersection([object({ a: string() }), object({ b: number() }), object({ c: optional(boolean()) })]);
    expectTypeOf<Infer<typeof both>>().toEqualTypeOf<{ a: string } & { b: number } & { c?: boolean | undefined }>();
    const value: unknown = { a: 'x', b: 1 };
    if (!check(both, value)) throw new Error('the fixture is valid');
    expectTypeOf(value.a).toEqualTypeOf<string>();
    expectTypeOf(value.b).toEqualTypeOf<number>();
    expectTypeOf<Infer<ReturnType<typeof intersection<[]>>>>().toBeUnknown();
    expectTypeOf<Infer<ReturnType<typeof union<[]>>>>().toBeNever();
  });

  it('are the object its modes describe, with the unknown keys typed when they have a schema', () => {
    const strict = object({ a: string() }, { unknown: 'strict' });
    expectTypeOf<Infer<typeof strict>>().toEqualTypeOf<{ a: string }>();
    const strip = object({ a: string() }, { unknown: 'strip' });
    expectTypeOf<Infer<typeof strip>>().toEqualTypeOf<{ a: string }>();
    const open = object({ a: string() }, { unknown: number() });
    expectTypeOf<Infer<typeof open>>().toEqualTypeOf<{ a: string } & Readonly<Record<string, number>>>();
    // @ts-expect-error a mode is one of three words, or a schema
    object({ a: string() }, { unknown: 'loose' });
  });

  it('are what a recursive schema is annotated with, and what a custom type is said to be', () => {
    expectTypeOf<Infer<typeof TreeSchema>>().toEqualTypeOf<Tree>();
    expectTypeOf<Infer<typeof ASchema>>().toEqualTypeOf<A>();
    const brand = custom<`x${string}`>('x', startsWithX);
    expectTypeOf<Infer<typeof brand>>().toEqualTypeOf<`x${string}`>();
    const node = lazy(() => object({ a: string() }));
    expectTypeOf<Infer<typeof node>>().toEqualTypeOf<{ a: string }>();
  });

  it('are unchanged by a format, a bound, a coercion or metadata, and metadata keeps a key optional', () => {
    expectTypeOf(string({ format: digit })).toEqualTypeOf<Schema<string>>();
    expectTypeOf(number({ gt: 0, lt: 1, multipleOf: 0.5, positive: true, coerce: true })).toEqualTypeOf<Schema<number>>();
    const shape = object({ a: annotate(optional(string()), { title: 't' }), b: annotate(number(), { description: 'd' }) });
    expectTypeOf<Infer<typeof shape>>().toEqualTypeOf<{ b: number; a?: string | undefined }>();
  });

  it('are what discriminated cases of the new kinds describe', () => {
    const shape = discriminated('k', { a: object({ k: literal('a'), v: tuple([number()]) }), b: object({ k: literal('b'), v: nullable(string()) }) });
    expectTypeOf<Infer<typeof shape>>().toEqualTypeOf<{ k: 'a'; v: [number] } | { k: 'b'; v: string | null }>();
  });
});
