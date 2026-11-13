import { describe, expect, expectTypeOf, it } from 'vitest';

import { verdict, verdicts } from './__fixtures__/readers.js';
import { emit, emitWith } from './emit.js';
import {
  array,
  bigint,
  boolean,
  check,
  date,
  discriminated,
  discriminatedBy,
  enumOf,
  type Infer,
  instanceOf,
  intersection,
  issues,
  literal,
  nativeEnum,
  nullable,
  number,
  object,
  optional,
  parse,
  type Schema,
  string,
  symbol,
  tuple,
  undefinedOf,
  union,
} from './index.js';

/**
 * Wave 2 of parity.md: what four of the five competitors have. As in wave 1, every accept and
 * every refusal is put to all the readers (spec.md R2) by `verdict`.
 */

describe('what wave 1 left open', () => {
  // parity.md decision 9.
  describe('a discriminated union by a tag that is a string, a number or a boolean', () => {
    const Mixed = discriminatedBy('t', [
      object({ t: literal(1), n: number() }),
      object({ s: string(), t: literal('1') }),
      object({ t: literal(true), b: boolean() }),
      object({ t: literal(false) }),
      object({ t: literal(0), n: number({ coerce: true }) }, { unknown: 'strip' }),
    ]);

    it('picks the case by the value and the type of the tag, in every reader', () => {
      expect(verdicts(Mixed, [{ t: 1, n: 2 }, { t: '1', s: 'x' }, { t: true, b: false }, { t: false }, { t: 0, n: 1 }])).toEqual([true, true, true, true, true]);
      expect(verdicts(Mixed, [{ t: 1, s: 'x' }, { t: '1', n: 2 }, { t: true }, { t: 'true', b: true }, { t: 'false' }, { t: 2 }, { t: null }, {}, { t: 0, n: 'x' }, null, [], 1])).toEqual(
        Array.from({ length: 12 }, () => false),
      );
    });

    it('is typed as the union of its cases', () => {
      expectTypeOf<Infer<typeof Mixed>>().toEqualTypeOf<{ t: 1; n: number } | { s: string; t: '1' } | { t: true; b: boolean } | { t: false } | { t: 0; n: number }>();
    });

    it('names every tag in the issue, a string in quotes', () => {
      expect(issues(Mixed, { t: 2 })).toEqual([{ path: '/t', keyword: 'tag', message: 'expected one of 1, "1", true, false, 0, got number 2. fix: send one of them' }]);
      expect(issues(Mixed, { t: 1, n: 'x' })).toEqual([{ path: '/n', keyword: 'type', message: 'expected a number, got string "x". fix: send a finite number' }]);
    });

    it('is written as a switch on the literal tags', () => {
      expect(emit(discriminatedBy('t', [object({ t: literal(1) }), object({ t: literal(true) })]))).toBe(`(() => {
const f0 = (v) => typeof v === "object" && v !== null && !Array.isArray(v)
  && (v["t"] === 1);
const f1 = (v) => typeof v === "object" && v !== null && !Array.isArray(v)
  && (v["t"] === true);
const f2 = (v) => {
  if (!(typeof v === "object" && v !== null && !Array.isArray(v))) return false;
  switch (v["t"]) {
    case 1: return f0(v);
    case true: return f1(v);
    default: return false;
  }
};
return (v) => f2(v);
})()`);
    });

    it('parses the case its tag picks', () => {
      expect(parse(Mixed, { t: 0, n: '5', extra: 1 })).toEqual({ ok: true, value: { t: 0, n: 5 } });
      expect(parse(Mixed, { t: '0', n: '5' }).ok).toBe(false);
    });

    it('keeps the cases in the order given, and is not reached by a later change to the list', () => {
      const cases: Schema<unknown>[] = [object({ t: literal('b') }), object({ t: literal('a') })];
      const schema = discriminatedBy('t', cases);
      cases.push(object({ t: literal('c') }));
      expect([...(schema.cases as ReadonlyMap<unknown, unknown>).keys()]).toEqual(['b', 'a']);
      expect(Object.isFrozen(schema)).toBe(true);
    });

    it.each<[string, Schema<unknown>[], string]>([
      ['is not an object', [object({ t: literal('a') }), string()], 'case 1 of the union on "t" names no tag. fix: make it an object with "t" a literal string, number or boolean'],
      ['is a tuple, which has items and no keys', [tuple([literal('a'), literal('b')])], 'case 0 of the union on "t" names no tag.'],
      ['has no such key', [object({ u: literal('a') })], 'case 0 of the union on "t" names no tag. fix: make it an object with "t" a literal string, number or boolean'],
      ['has no keys at all', [object({})], 'case 0 of the union on "t" names no tag.'],
      ['has no literal there', [object({ t: string() })], 'case 0 of the union on "t" names no tag.'],
      ['has an enum there, whose members are not its value', [object({ t: { ...enumOf(['a']), value: 'a' } as Schema<unknown> })], 'case 0 of the union on "t" names no tag.'],
      ['has null there', [object({ t: literal(null) })], 'case 0 of the union on "t" names no tag.'],
      ['has NaN there', [object({ t: literal(Number.NaN) })], 'case 0 of the union on "t" names no tag.'],
      ['has an infinity there', [object({ t: literal(Number.POSITIVE_INFINITY) })], 'case 0 of the union on "t" names no tag.'],
      ['repeats a tag', [object({ t: literal(1) }), object({ t: literal('1') }), object({ t: literal(1) })], 'case 2 of the union on "t" repeats the tag of an earlier case. fix: give each case its own tag'],
    ])('refuses a list with a case that %s', (_, cases, message) => {
      expect(() => discriminatedBy('t', cases)).toThrow(TypeError);
      expect(() => discriminatedBy('t', cases)).toThrow(message);
    });

    it('still takes a record of cases, whose tags are its keys and so strings', () => {
      const schema = discriminated('k', { 1: object({}), true: object({}) });
      expect(verdicts(schema, [{ k: '1' }, { k: 'true' }, { k: 1 }, { k: true }, { k: 'toString' }, { k: '__proto__' }])).toEqual([true, true, false, false, false, false]);
    });
  });

  // `optional` is about a key. What it wraps is the same schema anywhere else.
  describe('an optional schema where there is no key', () => {
    it('is the schema it wraps, to every reader and to the type', () => {
      const maybe = optional(string());
      expect(verdicts(maybe, ['a', undefined, null])).toEqual([true, false, false]);
      expectTypeOf<Infer<typeof maybe>>().toEqualTypeOf<string>();
      expect(issues(maybe, undefined)).toEqual([{ path: '', keyword: 'type', message: 'expected a string, got undefined undefined. fix: send a string' }]);
      const list = array(optional(number()));
      expect(verdicts(list, [[1], [1, undefined], [undefined]])).toEqual([true, false, false]);
      expectTypeOf<Infer<typeof list>>().toEqualTypeOf<number[]>();
    });

    it('is a key that may be absent or undefined, in an object', () => {
      const shape = object({ a: optional(string()) });
      expect(verdicts(shape, [{}, { a: undefined }, { a: 'x' }, { a: null }])).toEqual([true, true, true, false]);
      expectTypeOf<Infer<typeof shape>>().toEqualTypeOf<{ a?: string | undefined }>();
    });

    it('still takes its default wherever undefined arrives', () => {
      expect(parse(optional(string(), { default: 'd' }), undefined)).toEqual({ ok: true, value: 'd' });
      expect(check(optional(string(), { default: 'd' }), undefined)).toBe(false);
    });
  });

  it('prints a number that is not finite as what it is', () => {
    expect(issues(number(), Number.NaN)[0]?.message).toBe('expected a number, got number NaN. fix: send a finite number');
    expect(issues(string(), Number.NEGATIVE_INFINITY)[0]?.message).toBe('expected a string, got number -Infinity. fix: send a string');
    expect(issues(string(), -0)[0]?.message).toBe('expected a string, got number 0. fix: send a string');
    expect(issues(string(), 1e21)[0]?.message).toBe('expected a string, got number 1e+21. fix: send a string');
  });

  // Found while writing wave 2: JSON calls every number that is not finite null, and the emitter wrote a literal through JSON.
  describe('a literal or an enum member that is not a finite number', () => {
    it.each<[string, Schema<unknown>, string]>([
      ['a positive infinity', literal(Number.POSITIVE_INFINITY), 'v === Infinity'],
      ['a negative infinity', literal(Number.NEGATIVE_INFINITY), 'v === -Infinity'],
      ['NaN, which no value is identical to', literal(Number.NaN), 'v === NaN'],
      ['an enum of them', enumOf([Number.NaN, Number.POSITIVE_INFINITY, 1]), '(v !== v || v === Infinity || v === 1)'],
    ])('is written as itself for %s, and means to the emitted code what it means to check', (_, schema, text) => {
      expect(emit(schema)).toBe(`(() => {\n\nreturn (v) => ${text};\n})()`);
      for (const value of [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NaN, null, 1, 'Infinity', undefined]) verdict(schema, value);
    });

    it('is named as itself in an issue', () => {
      expect(issues(literal(Number.POSITIVE_INFINITY), 1)).toEqual([{ path: '', keyword: 'literal', message: 'expected Infinity, got number 1. fix: send Infinity' }]);
      expect(issues(enumOf([Number.NaN, 'a']), 1)).toEqual([{ path: '', keyword: 'enum', message: 'expected one of NaN, "a", got number 1. fix: send one of them' }]);
    });

    it('is accepted where it is the value', () => {
      expect(verdict(literal(Number.POSITIVE_INFINITY), Number.POSITIVE_INFINITY)).toBe(true);
      expect(verdict(literal(Number.NaN), Number.NaN)).toBe(false);
      expect(verdicts(enumOf([Number.NaN, Number.POSITIVE_INFINITY]), [Number.NaN, Number.POSITIVE_INFINITY, null])).toEqual([true, true, false]);
    });
  });
});

/** What `enum Level { Low, High }` compiles to: each name to its number, and each number back to its name. */
const Level = { Low: 0, High: 1, 0: 'Low', 1: 'High' } as const;
/** What `enum Colour { Red = 'red', Green = 'green' }` compiles to. */
const Colour = { Red: 'red', Green: 'green' } as const;
/** A mix: `enum Mixed { A = 'B', B = 1, C = '1' }`, where one value is another member's name and another reads as a number. */
const Mixed = { A: 'B', B: 1, 1: 'B', C: '1' } as const;

class Animal {
  readonly legs = 4;
}
class Dog extends Animal {}

const KINDS: [string, Schema<unknown>, unknown[], unknown[]][] = [
  ['prim.bigint', bigint(), [1n, 0n, -1n, 2n ** 2000n, -(2n ** 2000n)], [1, '1', null, undefined, Number.POSITIVE_INFINITY]],
  ['a bigint between bounds a double cannot hold', bigint({ min: 2n ** 64n, max: 2n ** 64n + 2n }), [2n ** 64n, 2n ** 64n + 1n, 2n ** 64n + 2n], [2n ** 64n - 1n, 2n ** 64n + 3n, 0n, 2 ** 64]],
  ['a bigint with a lower bound only', bigint({ min: 0n }), [0n, 1n, 2n ** 2000n], [-1n]],
  ['a bigint with an upper bound only', bigint({ max: 0n }), [0n, -1n, -(2n ** 2000n)], [1n]],
  ['a bigint literal', literal(1n), [1n], [1, 2n, '1']],
  ['prim.date', date(), [new Date(0), new Date('2020-01-01T00:00:00Z')], ['2020-01-01T00:00:00Z', new Date(Number.NaN), 0, null, undefined, {}, { getTime: Date.now }]],
  ['prim.native_enum, of numbers', nativeEnum(Level), [0, 1], ['Low', 'High', 5, '0', undefined]],
  ['prim.native_enum, of strings', nativeEnum(Colour), ['red', 'green'], ['Red', 'Green', 0]],
  ['a native enum of both', nativeEnum(Mixed), ['B', 1, '1'], ['A', 'C', 0]],
  ['prim.symbol', symbol(), [Symbol('x'), Symbol.iterator, Symbol.for('y')], ['x', 'symbol', undefined, null]],
  ['prim.undefined', undefinedOf(), [undefined], [null, 0, '', 'undefined']],
  ['undefined beside another member', union([string(), undefinedOf()]), ['a', undefined], [null, 1]],
  ['val.instanceof', instanceOf(Map), [new Map()], [{}, new Set(), null, Map]],
  ['an instance of a class or of one that extends it', instanceOf(Animal), [new Animal(), new Dog()], [{ legs: 4 }, Animal]],
  ['the new kinds in an object', object({ id: bigint({ min: 1n }), at: date(), level: nativeEnum(Level), key: optional(symbol()) }), [{ id: 1n, at: new Date(0), level: 1 }, { id: 2n, at: new Date(1), level: 0, key: Symbol('k') }], [{ id: 0n, at: new Date(0), level: 1 }, { id: 1n, at: 0, level: 1 }, { id: 1n, at: new Date(0), level: 'Low' }, { id: 1n, at: new Date(0), level: 1, key: 'k' }]],
  ['the new kinds in the others', array(nullable(intersection([tuple([bigint(), date()]), tuple([literal(1n), instanceOf(Date)])]))), [[], [null, [1n, new Date(0)]]], [[[2n, new Date(0)]], [[1n, new Date(Number.NaN)]], [[1n]]]],
];

describe('the primitive kinds of wave 2', () => {
  it.each(KINDS)('%s: every reader accepts what the probes accept and refuses what they refuse', (_, schema, accepted, refused) => {
    expect(verdicts(schema, accepted)).toEqual(accepted.map(() => true));
    expect(verdicts(schema, refused)).toEqual(refused.map(() => false));
  });

  it('are data like every other node: frozen, with every member, each kind named', () => {
    const members = Object.keys(string());
    for (const [, schema] of KINDS) {
      expect(Object.keys(schema)).toEqual(members);
      expect(Object.isFrozen(schema)).toBe(true);
    }
    expect(([bigint(), date(), symbol(), instanceOf(Map), undefinedOf(), nativeEnum(Level)] as Schema<unknown>[]).map((schema) => schema.kind)).toEqual(['bigint', 'date', 'type', 'instance', 'literal', 'enum']);
    expect(bigint().value).toEqual([Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY]);
    expect(Object.isFrozen(bigint().value)).toBe(true);
    expect(bigint({ min: 1n, max: 2n }).value).toEqual([1n, 2n]);
    expect([symbol().value, instanceOf(Map).value, undefinedOf().value]).toEqual(['symbol', Map, undefined]);
    expect([...(nativeEnum(Level).values ?? [])]).toEqual([0, 1]);
    expect([...(nativeEnum(Mixed).values ?? [])]).toEqual(['B', 1, '1']);
    expect(undefinedOf().check).toBe(literal(1).check);
    expect(nativeEnum(Level).check).toBe(enumOf(['a']).check);
  });

  it('are typed', () => {
    expectTypeOf(bigint({ min: 0n })).toEqualTypeOf<Schema<bigint>>();
    expectTypeOf(date()).toEqualTypeOf<Schema<Date>>();
    expectTypeOf(symbol()).toEqualTypeOf<Schema<symbol>>();
    expectTypeOf(undefinedOf()).toEqualTypeOf<Schema<undefined>>();
    expectTypeOf(literal(1n)).toEqualTypeOf<Schema<1n>>();
    expectTypeOf(literal(undefined)).toEqualTypeOf<Schema<undefined>>();
    expectTypeOf(instanceOf(Animal)).toEqualTypeOf<Schema<Animal>>();
    expectTypeOf(instanceOf(Map)).toEqualTypeOf<Schema<Map<unknown, unknown>>>();
    expectTypeOf<Infer<ReturnType<typeof nativeEnum<typeof Level>>>>().toEqualTypeOf<0 | 1>();
    expectTypeOf(nativeEnum(Colour)).toEqualTypeOf<Schema<'red' | 'green'>>();
    expectTypeOf(nativeEnum(Mixed)).toEqualTypeOf<Schema<'B' | 1 | '1'>>();
    enum Real {
      Off,
      On,
    }
    const real: Schema<Real> = nativeEnum(Real);
    // @ts-expect-error the names a numeric enum maps back to are not its values
    const names: Schema<string> = nativeEnum(Real);
    expect(names.kind).toBe('enum');
    expect(verdicts(real, [Real.Off, Real.On, 0, 1, 'Off', 2])).toEqual([true, true, true, true, false, false]);
    // @ts-expect-error a bigint's bound is a bigint
    bigint({ min: 1 });
  });

  it.each<[string, Schema<unknown>, unknown, { path: string; keyword: string; message: string }]>([
    ['not a bigint', bigint(), 1, { path: '', keyword: 'type', message: 'expected a bigint, got number 1. fix: send a bigint' }],
    ['a bigint too small', bigint({ min: 5n, max: 9n }), 4n, { path: '', keyword: 'min', message: 'expected a bigint of at least 5n, got bigint 4. fix: send 5n or more' }],
    ['a bigint too large', bigint({ min: 5n, max: 9n }), 10n, { path: '', keyword: 'max', message: 'expected a bigint of at most 9n, got bigint 10. fix: send 9n or less' }],
    ['not a bigint literal', literal(1n), 1, { path: '', keyword: 'literal', message: 'expected 1n, got number 1. fix: send 1n' }],
    ['not a date', date(), '2020-01-01', { path: '', keyword: 'type', message: 'expected a Date, got string "2020-01-01". fix: send a Date' }],
    ['a date that is no time', date(), new Date(Number.NaN), { path: '', keyword: 'date', message: 'expected a Date that is a time, not `new Date(NaN)`, got an object. fix: send a Date made from a real time' }],
    ['not a symbol', symbol(), 'x', { path: '', keyword: 'type', message: 'expected a symbol, got string "x". fix: send a symbol' }],
    ['not undefined', undefinedOf(), null, { path: '', keyword: 'literal', message: 'expected undefined, got null. fix: send undefined' }],
    ['a name of a native enum', nativeEnum(Level), 'Low', { path: '', keyword: 'enum', message: 'expected one of 0, 1, got string "Low". fix: send one of them' }],
    ['not an instance', instanceOf(Animal), {}, { path: '', keyword: 'instance', message: 'expected an instance of Animal, got an object. fix: send one made by Animal' }],
  ])('say what is wrong with %s', (_, schema, value, issue) => {
    expect(issues(schema, value)).toEqual([issue]);
  });

  it('are written as their own tests', () => {
    const every = object({ b: bigint(), lo: bigint({ min: -1n }), hi: bigint({ max: 10n ** 30n }), d: date(), s: symbol(), u: optional(undefinedOf()), must: undefinedOf(), e: nativeEnum(Level), l: literal(7n) });
    expect(emit(every)).toBe(`(() => {
const f0 = (v) => typeof v === "object" && v !== null && !Array.isArray(v)
  && (typeof v["b"] === "bigint")
  && (typeof v["lo"] === "bigint" && v["lo"] >= -1n)
  && (typeof v["hi"] === "bigint" && v["hi"] <= 1000000000000000000000000000000n)
  && ((v["d"] instanceof Date && !Number.isNaN(v["d"].getTime())))
  && (typeof v["s"] === "symbol")
  && (v["u"] === undefined || (v["u"] === undefined))
  && (v["must"] !== undefined && (v["must"] === undefined))
  && ((v["e"] === 0 || v["e"] === 1))
  && (v["l"] === 7n);
return (v) => f0(v);
})()`);
  });

  // A required key must be present, and a present key is not `undefined`: no object has one.
  it('refuse an object whose required key must be undefined, in every reader', () => {
    const schema = object({ must: undefinedOf() });
    expect(verdicts(schema, [{}, { must: undefined }, { must: 1 }])).toEqual([false, false, false]);
    expect(verdicts(object({ may: optional(undefinedOf()) }), [{}, { may: undefined }, { may: null }])).toEqual([true, true, false]);
  });

  it('take the class of an instance check as a hook, since text cannot hold it', () => {
    const schema = object({ m: instanceOf(Map), d: instanceOf(Date) });
    expect(() => emit(schema)).toThrow('cannot emit a schema that names a function as text alone');
    const { source, hooks } = emitWith(schema);
    expect(source).toBe(`(h) => {
const f0 = (v) => typeof v === "object" && v !== null && !Array.isArray(v)
  && (v["m"] instanceof h[0])
  && (v["d"] instanceof h[1]);
return (v) => f0(v);
}`);
    expect(hooks).toEqual([Map, Date]);
  });

  it('leave a value of a new kind as it is when parsing', () => {
    const at = new Date(0);
    const key = Symbol('k');
    const input = Object.freeze({ id: 1n, at, level: 1, key });
    const schema = object({ id: bigint({ min: 1n }), at: date(), level: nativeEnum(Level), key: optional(symbol()), m: optional(instanceOf(Map)) });
    const result = parse(schema, input);
    expect(result.ok && result.value).toBe(input);
  });
});
