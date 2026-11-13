import { describe, expect, expectTypeOf, it } from 'vitest';

import { verdict, verdicts } from './__fixtures__/readers.js';
import { emit } from './emit.js';
import {
  array,
  boolean,
  check,
  discriminated,
  discriminatedBy,
  enumOf,
  type Infer,
  issues,
  literal,
  number,
  object,
  optional,
  parse,
  type Schema,
  string,
  tuple,
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
