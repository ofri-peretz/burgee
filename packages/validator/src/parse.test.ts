import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  array,
  check,
  discriminated,
  intersection,
  type Issue,
  lazy,
  literal,
  nullable,
  nullish,
  number,
  object,
  optional,
  parse,
  type Parsed,
  record,
  type Schema,
  string,
  tuple,
  union,
  unknown,
} from './index.js';

/** Frozen all the way down, so a write into the caller's value throws. */
const frozen = <T>(value: T): T => {
  if (typeof value === 'object' && value !== null) for (const member of Object.values(value)) frozen(member);
  return Object.freeze(value);
};

const value = <T>(result: Parsed<T>): T => {
  if (!result.ok) throw new Error(`expected a value, got ${JSON.stringify(result.issues)}`);
  return result.value;
};

const failure = (result: Parsed<unknown>): Issue[] => {
  if (result.ok) throw new Error(`expected issues, got ${String(JSON.stringify(result.value))}`);
  return result.issues;
};

const WithDefault = object({ a: optional(string(), { default: 'd' }), b: optional(number()) });
const Stripped = object({ a: string() }, { unknown: 'strip' });

interface Tree {
  v: number;
  kids?: Tree[] | undefined;
}
const TreeSchema: Schema<Tree> = object({ v: number({ coerce: true }), kids: optional(array(lazy(() => TreeSchema)), { default: [] }) }, { unknown: 'strip' });

describe('parse', () => {
  it('returns the input itself when nothing changed, whatever is in it', () => {
    const inputs: [Schema<unknown>, unknown][] = [
      [WithDefault, { a: 'x', b: 1, extra: [1] }],
      [Stripped, { a: 'x' }],
      [array(unknown()), [Number.NaN, 0, -0, undefined, null]],
      [record(unknown()), { nan: Number.NaN }],
      [tuple([unknown(), number({ coerce: true })]), [Number.NaN, 1]],
      [object({ a: unknown() }), { a: Number.NaN }],
      [object({ a: string() }, { unknown: number({ coerce: true }) }), { a: 'x', b: 1 }],
      [intersection([object({ a: string() }), object({ b: number() })]), { a: 'x', b: 1 }],
      [intersection([Stripped, WithDefault]), { a: 'x' }],
      [union([number({ coerce: true }), string()]), 'x'],
      [nullable(Stripped), null],
      [nullish(Stripped), undefined],
      [discriminated('k', { a: object({ k: literal('a'), a: string() }, { unknown: 'strip' }) }), { k: 'a', a: 'x' }],
      [number({ coerce: true }), 42],
      [TreeSchema, { v: 1, kids: [{ v: 2, kids: [] }] }],
    ];
    for (const [schema, input] of inputs) {
      const result = parse(schema, frozen(input));
      expect(result.ok, JSON.stringify(input)).toBe(true);
      expect(value(result), JSON.stringify(input)).toBe(input);
    }
  });

  it('is typed as the schema, and narrows on ok', () => {
    const result = parse(WithDefault, {});
    expectTypeOf(result).toEqualTypeOf<Parsed<{ a?: string | undefined; b?: number | undefined }>>();
    if (!result.ok) throw new Error('the fixture is valid');
    expectTypeOf(result.value).toEqualTypeOf<{ a?: string | undefined; b?: number | undefined }>();
    expectTypeOf<Extract<Parsed<string>, { ok: false }>['issues']>().toEqualTypeOf<Issue[]>();
  });

  it('gives every reason there is no value, or the first when asked', () => {
    const schema = object({ a: string(), b: number() });
    expect(parse(schema, { a: 1, b: 'x' })).toEqual({
      ok: false,
      issues: [
        { path: '/a', keyword: 'type', message: 'expected a string, got number 1. fix: send a string' },
        { path: '/b', keyword: 'type', message: 'expected a number, got string "x". fix: send a finite number' },
      ],
    });
    expect(failure(parse(schema, { a: 1, b: 'x' }, { first: true }))).toHaveLength(1);
    expect(parse(schema, { a: 'x', b: 1 })).toEqual({ ok: true, value: { a: 'x', b: 1 } });
  });

  describe('a default', () => {
    it('fills a key that is absent or undefined, in a copy, and leaves the input alone', () => {
      const input = frozen({ b: 1, extra: { kept: true } });
      const out = value(parse(WithDefault, input));
      expect(out).toEqual({ a: 'd', b: 1, extra: { kept: true } });
      expect(out).not.toBe(input);
      expect(input).toEqual({ b: 1, extra: { kept: true } });
      expect((out as typeof input).extra).toBe(input.extra);
      expect(value(parse(WithDefault, frozen({ a: undefined })))).toEqual({ a: 'd' });
      expect(Object.keys(value(parse(WithDefault, frozen({ z: 1, y: 2 }))))).toEqual(['z', 'y', 'a']);
    });

    it('stands wherever undefined arrives: at the root, in an array, a tuple and a record', () => {
      const filled = optional(string(), { default: 'd' });
      expect(parse(filled, undefined)).toEqual({ ok: true, value: 'd' });
      expect(parse(filled, 'x')).toEqual({ ok: true, value: 'x' });
      const list = frozen(['a', undefined, 'c']);
      expect(value(parse(array(filled), list))).toEqual(['a', 'd', 'c']);
      expect(list).toEqual(['a', undefined, 'c']);
      expect(value(parse(tuple([filled, filled]), frozen([undefined, 'b'])))).toEqual(['d', 'b']);
      expect(value(parse(record(filled), frozen({ a: undefined, b: 'x' })))).toEqual({ a: 'd', b: 'x' });
    });

    it('is not put where null arrived, and is not there to be found when the schema has none', () => {
      expect(failure(parse(WithDefault, { a: null }))).toHaveLength(1);
      expect(failure(parse(object({ a: string() }), {}))).toEqual([{ path: '/a', keyword: 'required', message: 'expected a value, got undefined undefined. fix: add "a"' }]);
      expect(parse(optional(string()), undefined).ok).toBe(false);
    });

    it('is handed out as it is, and copies only the path to what changed', () => {
      const tags: string[] = [];
      const schema = object({ deep: object({ tags: optional(array(string()), { default: tags }) }), other: object({ a: string() }) });
      const input = frozen({ deep: {}, other: { a: 'x' } });
      const out = value(parse(schema, input)) as { deep: { tags: string[] }; other: object };
      expect(out.deep.tags).toBe(tags);
      expect(out.other).toBe(input.other);
      expect(out.deep).not.toBe(input.deep);
    });

    it('can be a falsy value', () => {
      expect(value(parse(object({ n: optional(number(), { default: 0 }), s: optional(string(), { default: '' }), z: optional(nullable(string()), { default: null }) }), {}))).toEqual({ n: 0, s: '', z: null });
    });
  });

  describe('strip', () => {
    it('leaves the keys the shape does not name out of a copy, and the input alone', () => {
      const input = frozen({ a: 'x', b: 1, c: { d: 2 } });
      const out = value(parse(Stripped, input));
      expect(out).toEqual({ a: 'x' });
      expect(input).toEqual({ a: 'x', b: 1, c: { d: 2 } });
      expect(check(Stripped, input)).toBe(true);
    });

    it('strips at every depth, and only where an object asks', () => {
      const schema = object({ list: array(Stripped), kept: object({ a: string() }) });
      const input = frozen({ list: [{ a: 'x' }, { a: 'y', gone: 1 }], kept: { a: 'z', stays: 1 }, top: 1 });
      const out = value(parse(schema, input)) as unknown as typeof input;
      expect(out).toEqual({ list: [{ a: 'x' }, { a: 'y' }], kept: { a: 'z', stays: 1 }, top: 1 });
      expect(out.list[0]).toBe(input.list[0]);
      expect(out.kept).toBe(input.kept);
    });

    it('still says what is wrong with what it kept', () => {
      expect(failure(parse(Stripped, { a: 1, b: 1 }))).toEqual([{ path: '/a', keyword: 'type', message: 'expected a string, got number 1. fix: send a string' }]);
      expect(parse(Stripped, 'x').ok).toBe(false);
      expect(parse(Stripped, ['x']).ok).toBe(false);
      expect(parse(Stripped, null).ok).toBe(false);
    });

    it('fills a default and strips in the one copy', () => {
      const schema = object({ a: optional(string(), { default: 'd' }), n: number({ coerce: true }) }, { unknown: 'strip' });
      expect(value(parse(schema, frozen({ n: '5', gone: true })))).toEqual({ n: 5, a: 'd' });
      expect(Object.keys(value(parse(schema, frozen({ n: '5', gone: true }))))).toEqual(['n', 'a']);
    });

    it('keeps what the input inherits: the copy has the same prototype', () => {
      const proto = { a: 'inherited' };
      const input: Record<string, unknown> = Object.create(proto) as Record<string, unknown>;
      input.gone = 1;
      const out = value(parse(Stripped, input));
      expect(Object.getPrototypeOf(out)).toBe(proto);
      expect(Object.keys(out)).toEqual([]);
      expect(out.a).toBe('inherited');
      const bare: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
      bare.a = 'x';
      bare.gone = 1;
      expect(Object.getPrototypeOf(value(parse(Stripped, bare)))).toBeNull();
    });

    it('treats a key named __proto__ as a key', () => {
      const input = JSON.parse('{ "__proto__": { "polluted": true }, "a": "x" }') as Record<string, unknown>;
      const kept = value(parse(object({ a: string(), b: optional(number(), { default: 1 }) }), input)) as Record<string, unknown>;
      expect(Object.keys(kept)).toEqual(['__proto__', 'a', 'b']);
      expect(Object.getPrototypeOf(kept)).toBe(Object.prototype);
      expect(kept.polluted).toBeUndefined();
      const stripped = value(parse(Stripped, input));
      expect(Object.keys(stripped)).toEqual(['a']);
      expect(Object.getPrototypeOf(stripped)).toBe(Object.prototype);
    });
  });

  describe('coercion to a number', () => {
    // parity.md decision 12: the written rule. A JSON number, the whole string, and nothing else.
    it.each<[string, number]>([
      ['42', 42],
      ['-1.5e3', -1500],
      ['0', 0],
      ['-0', -0],
      ['0.5', 0.5],
      ['1E+2', 100],
      ['1e-2', 0.01],
      ['10', 10],
      ['3.14159', 3.141_59],
      ['1e10', 1e10],
      ['2E-12', 2e-12],
      ['-0.000', -0],
    ])('reads %j as %d', (text, read) => {
      expect(parse(number({ coerce: true }), text)).toEqual({ ok: true, value: read });
      expect(check(number({ coerce: true }), text)).toBe(false);
      expect(parse(number(), text).ok).toBe(false);
    });

    it.each(['', ' ', ' 1', '1 ', '+1', '01', '-01', '0x10', 'Infinity', '-Infinity', 'NaN', '1e400', '-1e400', '.5', '5.', '1e', '1e+', '--1', '1.2.3', 'abc', '1a', 'a1', '1\n', '१'])(
      'does not read %j, which then fails as the string it is',
      (text) => {
        expect(failure(parse(number({ coerce: true }), text))).toEqual([{ path: '', keyword: 'type', message: `expected a number, got string ${JSON.stringify(text)}. fix: send a finite number` }]);
      },
    );

    it('reads only a string: not null, a boolean, an array or a String object', () => {
      for (const input of [null, true, false, ['1'], new String('1'), undefined, 1n]) expect(parse(number({ coerce: true }), input).ok).toBe(false);
    });

    it('holds what it read to the rest of the schema', () => {
      expect(failure(parse(number({ coerce: true, min: 50 }), '42'))).toEqual([{ path: '', keyword: 'min', message: 'expected a number of at least 50, got number 42. fix: send 50 or more' }]);
      expect(parse(number({ coerce: true, int: true, multipleOf: 2 }), '42')).toEqual({ ok: true, value: 42 });
      expect(parse(number({ coerce: true, int: true }), '4.5').ok).toBe(false);
    });

    it('reads inside an object, an array, a tuple, a record and the keys an object does not name', () => {
      const schema = object({ n: number({ coerce: true }), list: array(number({ coerce: true })), pair: tuple([number({ coerce: true }), string()]), map: record(number({ coerce: true })) }, { unknown: number({ coerce: true }) });
      const input = frozen({ n: '1', list: ['2', 3], pair: ['4', '5'], map: { a: '6', b: 7 }, other: '8', more: 9 });
      expect(value(parse(schema, input))).toEqual({ n: 1, list: [2, 3], pair: [4, '5'], map: { a: 6, b: 7 }, other: 8, more: 9 });
      expect(input.list).toEqual(['2', 3]);
      expect(failure(parse(schema, { ...input, other: 'x' })).map((issue) => issue.path)).toEqual(['/other']);
    });

    it('reads no further into a tuple than the tuple goes, and a wrong length still fails', () => {
      const pair = tuple([number({ coerce: true }), number({ coerce: true })]);
      expect(failure(parse(pair, ['1'])).map((issue) => issue.keyword)).toEqual(['length']);
      expect(failure(parse(pair, ['1', '2', '3'])).map((issue) => issue.keyword)).toEqual(['length']);
      expect(parse(pair, 'x').ok).toBe(false);
      expect(parse(array(number({ coerce: true })), '1').ok).toBe(false);
      expect(parse(record(number({ coerce: true })), ['1']).ok).toBe(false);
    });
  });

  describe('a schema that holds others', () => {
    it('takes the first member of a union that accepts what it itself produced', () => {
      expect(parse(union([number({ coerce: true }), string()]), '42')).toEqual({ ok: true, value: 42 });
      expect(parse(union([string(), number({ coerce: true })]), '42')).toEqual({ ok: true, value: '42' });
      expect(parse(union([number({ coerce: true, min: 50 }), number({ coerce: true, int: true })]), '42')).toEqual({ ok: true, value: 42 });
      expect(parse(union([number({ coerce: true, min: 50 }), string({ min: 3 })]), '42').ok).toBe(false);
      expect(value(parse(union([Stripped, object({ b: number() })]), frozen({ b: 1, c: 2 })))).toEqual({ b: 1, c: 2 });
      expect(value(parse(union([Stripped, object({ b: number() })]), frozen({ a: 'x', b: 1 })))).toEqual({ a: 'x' });
    });

    it('fills the case a discriminated union picks, and nothing when it picks none', () => {
      const schema = discriminated('k', { a: object({ k: literal('a'), n: number({ coerce: true }) }, { unknown: 'strip' }), b: object({ k: literal('b') }) });
      expect(value(parse(schema, frozen({ k: 'a', n: '1', gone: 1 })))).toEqual({ k: 'a', n: 1 });
      expect(parse(schema, frozen({ k: 'c', n: '1' })).ok).toBe(false);
      expect(parse(schema, frozen({ k: 'toString' })).ok).toBe(false);
      expect(parse(schema, 'a').ok).toBe(false);
      expect(parse(schema, frozen({ k: 1 })).ok).toBe(false);
    });

    it('goes through nullable and nullish, and leaves null as it is', () => {
      expect(parse(nullable(number({ coerce: true })), '1')).toEqual({ ok: true, value: 1 });
      expect(parse(nullable(number({ coerce: true })), null)).toEqual({ ok: true, value: null });
      expect(parse(nullish(number({ coerce: true })), '1')).toEqual({ ok: true, value: 1 });
      expect(parse(nullish(number({ coerce: true })), undefined)).toEqual({ ok: true, value: undefined });
      expect(parse(nullable(optional(string(), { default: 'd' })), undefined)).toEqual({ ok: true, value: 'd' });
      expect(parse(optional(nullable(string()), { default: 'd' }), null)).toEqual({ ok: true, value: null });
    });

    it('goes through a schema that names itself', () => {
      const input = frozen({ v: '1', kids: [{ v: 2, gone: true }, { v: '3', kids: [{ v: '4' }] }] });
      expect(value(parse(TreeSchema, input))).toEqual({ v: 1, kids: [{ v: 2, kids: [] }, { v: 3, kids: [{ v: 4, kids: [] }] }] });
    });

    it('merges what the members of an intersection each produce from the input', () => {
      const a = object({ a: string() }, { unknown: 'strip' });
      const b = object({ b: optional(number(), { default: 1 }) }, { unknown: 'strip' });
      const input = frozen({ a: 'x', gone: true });
      // Each member strips what the other names; the merge keeps what either kept.
      expect(value(parse(intersection([a, b]), input))).toEqual({ a: 'x', b: 1 });
      expect(input).toEqual({ a: 'x', gone: true });
      // A member that keeps unnamed keys keeps them for the whole.
      expect(value(parse(intersection([object({ a: string() }), b]), input))).toEqual({ a: 'x', gone: true, b: 1 });
      expect(value(parse(intersection([b, object({ a: string() })]), input))).toEqual({ b: 1, a: 'x', gone: true });
    });

    it('lets the member that changed a key win over one that left it alone, whichever comes first', () => {
      const n = object({ n: number({ coerce: true }) });
      const m = object({ m: optional(string(), { default: 'd' }) });
      expect(value(parse(intersection([n, m]), frozen({ n: '1' })))).toEqual({ n: 1, m: 'd' });
      expect(value(parse(intersection([m, n]), frozen({ n: '1' })))).toEqual({ n: 1, m: 'd' });
      const x = object({ v: optional(string(), { default: 'first' }) });
      const y = object({ v: optional(string(), { default: 'second' }) });
      expect(value(parse(intersection([x, y]), frozen({})))).toEqual({ v: 'second' });
    });

    it('takes the last member to change a value that is not an object', () => {
      expect(parse(intersection([number({ coerce: true }), number({ coerce: true, min: 1 })]), '5')).toEqual({ ok: true, value: 5 });
      expect(parse(intersection([number({ coerce: true }), unknown()]), '5')).toEqual({ ok: true, value: 5 });
      expect(parse(intersection([array(number({ coerce: true })), array(unknown())]), frozen(['5']))).toEqual({ ok: true, value: [5] });
      expect(parse(intersection([optional(string(), { default: 'd' }), optional(string(), { default: 'e' })]), undefined)).toEqual({ ok: true, value: 'e' });
      expect(parse(intersection([optional(object({}), { default: { a: 1 } }), optional(object({}), { default: { b: 2 } })]), undefined)).toEqual({ ok: true, value: { b: 2 } });
    });

    it('gives an intersection its prototype back', () => {
      const proto = { inherited: true };
      const input: Record<string, unknown> = Object.create(proto) as Record<string, unknown>;
      input.n = '1';
      const out = value(parse(intersection([object({ n: number({ coerce: true }) }), object({})]), input));
      expect(Object.getPrototypeOf(out)).toBe(proto);
      expect(Object.keys(out)).toEqual(['n']);
    });
  });
});
