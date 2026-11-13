import { describe, expect, expectTypeOf, it } from 'vitest';

import { verdicts } from './__fixtures__/readers.js';
import { emit, emitWith } from './emit.js';
import {
  type AnySchema,
  array,
  boolean,
  check,
  date,
  discriminated,
  func,
  type InferInput,
  type InferOutput,
  intersection,
  issues,
  lazy,
  literal,
  type Miss,
  nullable,
  nullish,
  number,
  object,
  optional,
  parse,
  type Parsed,
  promise,
  record,
  refine,
  type Schema,
  string,
  transform,
  tuple,
  union,
  unknown,
} from './index.js';

/**
 * Wave 2, group 4: rules and maps of the caller's own, coercion, and messages in the caller's
 * words. The values each feature accepts and refuses are the competitors' probes'
 * (benchmarks/results/validator/parity-2026-11-13).
 */

const value = <T>(result: Parsed<T>): T => {
  if (!result.ok) throw new Error(`expected a value, got ${JSON.stringify(result.issues)}`);
  return result.value;
};

/** A function that notes each value it is called with, and then answers as `answer` does. */
const noting = <T, R>(seen: unknown[], answer: (value: T) => R): ((value: T) => R) => {
  return (given) => {
    seen.push(given);
    return answer(given);
  };
};

const isEven = (n: number): boolean => n % 2 === 0;
const lengthOf = (text: string): number => text.length;
const upper = (text: string): string => text.toUpperCase();
const double = (n: number): number => n * 2;
const sameAB = (pair: { a: string; b: string }): boolean => pair.a === pair.b;
const one = (): unknown => 1;
const always = (): boolean => true;
const never = (): boolean => false;
const date2020 = (): string => '2020-01-01';
const later = async (): Promise<void> => undefined;
const nothing = (): undefined => undefined;
const none = (): null => null;
const empty = (): string => '';
const pending = (): void => {
  // Never settles: what a promise resolves to is nobody's to check now.
};

/** Where a rule that fails reports, given the path it was told. */
const at = (path: (string | number)[]): string | undefined => issues(refine(unknown(), never, { path }), {})[0]?.path;

const french = (miss: Miss): string | undefined => {
  if (miss.keyword === 'type') return `attendu ${miss.expected}, reçu autre chose`;
  return undefined;
};

interface Copied {
  a: string;
  n: { b: number };
  list: { c: number }[];
  pair: [{ d: number }];
  by: Record<string, { e: number }>;
  free: unknown;
}
const copied = (): Copied => ({ a: 'x', n: { b: 1 }, list: [{ c: 2 }], pair: [{ d: 3 }], by: { k: { e: 4 } }, free: { anything: true } });

describe('refine', () => {
  const Even = refine(number(), isEven);

  it('val.refine: accepts what the schema accepts and the rule allows', () => {
    expect(verdicts(Even, [2, 0, -4])).toEqual([true, true, true]);
    expect(verdicts(Even, [3, '2', null, undefined, Number.NaN])).toEqual([false, false, false, false, false]);
  });

  it('asks the rule only about a value the schema accepted, in every reader', () => {
    const seen: unknown[] = [];
    const schema = refine(number({ coerce: true }), noting(seen, isEven));
    for (const given of ['2', null, { n: 2 }]) expect([check(schema, given), issues(schema, given).length > 0]).toEqual([false, true]);
    expect(seen).toEqual([]);
    // `parse` fills first, so the rule is handed the number, never the string it was read from.
    expect(parse(schema, '4')).toEqual({ ok: true, value: 4 });
    expect(seen).toEqual([4]);
    verdicts(schema, ['2', null, { n: 2 }]);
    expect(seen).toEqual([4, 2]);
  });

  it('takes only true for a yes, as a custom type does', () => {
    const truthy = refine(unknown(), one as () => boolean);
    expect(verdicts(truthy, [1, 'a', undefined])).toEqual([false, false, false]);
  });

  it('reports the rule under the keyword refine, in the words it was given or its own', () => {
    expect(issues(Even, 3)).toEqual([{ path: '', keyword: 'refine', message: 'expected a value the rule accepts, got number 3. fix: change the value so that the rule holds' }]);
    expect(issues(refine(number(), isEven, { message: 'an even number' }), 3)).toEqual([
      { path: '', keyword: 'refine', message: 'expected an even number, got number 3. fix: change the value so that the rule holds' },
    ]);
    // What the schema itself refuses is reported as the schema reports it, and the rule says nothing.
    expect(issues(Even, 'x')).toEqual([{ path: '', keyword: 'type', message: 'expected a number, got string "x". fix: send a finite number' }]);
  });

  it('reports at the path it was given, each key a reference token', () => {
    expect([at([]), at(['b']), at(['a', 0, 'c']), at(['a/b', 'c~d']), at([''])]).toEqual(['', '/b', '/a/0/c', '/a~1b/c~0d', '/']);
    expect(issues(object({ list: array(refine(object({ n: number() }), () => false, { path: ['n'] })) }), { list: [{ n: 1 }, { n: 2 }] }).map((issue) => issue.path)).toEqual([
      '/list/0/n',
      '/list/1/n',
    ]);
  });

  it('is data: the schema it wraps, the rule under its name, the path, and the keys the rule reads', () => {
    const inner = object({ a: string(), b: string() });
    const schema = refine(inner, sameAB, { path: ['b', 0], message: 'm', uses: ['a', 'b'] });
    expect([schema.kind, schema.item, schema.rule, schema.keys, [...(schema.values ?? [])]]).toEqual(['refine', inner, { name: 'm', pattern: null, test: sameAB }, ['b', '0'], ['a', 'b']]);
    expect([Object.isFrozen(schema), Object.isFrozen(schema.rule)]).toEqual([true, true]);
    expect(Object.keys(schema)).toEqual(Object.keys(inner));
    expect([Even.keys, Even.values, Even.rule?.name]).toEqual([[], null, 'a value the rule accepts']);
    expect(refine(inner, sameAB, { uses: [] }).values).toEqual(new Set());
  });

  it('is typed as the schema it wraps, and its rule is handed that type', () => {
    expectTypeOf(Even).toEqualTypeOf<Schema<number>>();
    const filled = refine(object({ a: optional(string(), { default: 'd' }) }), (given) => {
      expectTypeOf(given).toEqualTypeOf<{ a?: string | undefined }>();
      return true;
    });
    expectTypeOf<InferOutput<typeof filled>>().toEqualTypeOf<{ a: string }>();
    refine(object({ a: string(), b: string(), c: number() }), (given) => {
      expectTypeOf(given).toEqualTypeOf<Pick<{ a: string; b: string; c: number }, 'a' | 'b'>>();
      return true;
    }, { uses: ['a', 'b'] });
    // @ts-expect-error the rule may read only a key the schema has
    refine(object({ a: string() }), always, { uses: ['z'] });
    expect(filled.kind).toBe('refine');
  });

  it('is written as the test of what it wraps and then a call of the rule, which is handed over as a hook', () => {
    const schema = object({ n: Even, m: refine(string(), always) });
    expect(() => emit(schema)).toThrow(TypeError);
    expect(() => emit(schema)).toThrow(
      'cannot emit a schema that names a function as text alone: a custom type, a refinement, a class, or a format with a test. fix: give the format a pattern, or use `emitWith` and hand its hooks to the text',
    );
    const { source, hooks } = emitWith(schema);
    expect(source).toBe(`(h) => {
const f0 = (v) => typeof v === "object" && v !== null && !Array.isArray(v)
  && (v["n"] !== undefined && (((typeof v["n"] === "number" && v["n"] >= -1.7976931348623157e+308 && v["n"] <= 1.7976931348623157e+308) && h[0](v["n"]) === true)))
  && (v["m"] !== undefined && (((typeof v["m"] === "string") && h[1](v["m"]) === true)));
return (v) => f0(v);
}`);
    expect(hooks).toEqual([isEven, always]);
  });

  it('refuses a hand-built refinement whose rule is not a function', () => {
    const node = { ...Even, rule: { name: 'x', pattern: null, test: 'globalThis.__emitted = 1' } } as unknown as AnySchema;
    expect(() => emitWith(node)).toThrow('cannot emit the rule "x": it has neither a pattern nor a test.');
  });

  it('keeps a required key required: undefined is not handed to a rule that would allow it', () => {
    const schema = object({ a: refine(unknown(), always) });
    expect(verdicts(schema, [{ a: 1 }, { a: null }, {}, { a: undefined }])).toEqual([true, true, false, false]);
  });

  it('can be refined again, and each rule reports for itself', () => {
    const small = refine(Even, (n) => n < 10, { message: 'a number below 10' });
    expect(verdicts(small, [2, 3, 12, 13])).toEqual([true, false, false, false]);
    expect(issues(small, 12).map((issue) => issue.message)).toEqual(['expected a number below 10, got number 12. fix: change the value so that the rule holds']);
    // The outer rule is asked only when the inner one held.
    expect(issues(small, 13).map((issue) => issue.message)).toEqual(['expected a value the rule accepts, got number 13. fix: change the value so that the rule holds']);
  });

  it('parses what it wraps', () => {
    const schema = refine(object({ n: number({ coerce: true }) }, { unknown: 'strip' }), (given) => given.n > 0);
    expect(parse(schema, { n: '5', extra: 1 })).toEqual({ ok: true, value: { n: 5 } });
    expect(parse(schema, { n: '-5' })).toEqual({
      ok: false,
      issues: [{ path: '', keyword: 'refine', message: 'expected a value the rule accepts, got an object. fix: change the value so that the rule holds' }],
    });
  });
});

// The gap zod leaves (intent.md, "where Zod is beatable"; zod #2524): its object-level refinement is
// skipped whenever any field has an issue, so a form learns of the mismatch only after every other
// field is fixed.
describe('a rule across fields', () => {
  const Form = object({ a: string(), b: string(), c: number() });
  const Match = refine(Form, sameAB, { path: ['b'], uses: ['a', 'b'], message: 'the same as "a"' });
  const mismatch = { path: '/b', keyword: 'refine', message: 'expected the same as "a", got an object. fix: change the value so that the rule holds' };

  it('val.refine_path: reports at the field it names', () => {
    expect(verdicts(Match, [{ a: '1', b: '1', c: 0 }, { a: '1', b: '2', c: 0 }])).toEqual([true, false]);
    expect(issues(Match, { a: '1', b: '2', c: 0 })).toEqual([mismatch]);
  });

  it('still runs, and still reports at that field, when another field is wrong', () => {
    expect(issues(Match, { a: '1', b: '2', c: 'x' })).toEqual([{ path: '/c', keyword: 'type', message: 'expected a number, got string "x". fix: send a finite number' }, mismatch]);
    expect(issues(Match, { a: '1', b: '2' })).toEqual([{ path: '/c', keyword: 'required', message: 'expected a value, got undefined undefined. fix: add "c"' }, mismatch]);
    // And says nothing when the fields it reads agree.
    expect(issues(Match, { a: '1', b: '1', c: 'x' }).map((issue) => issue.path)).toEqual(['/c']);
    expect(verdicts(Match, [{ a: '1', b: '2', c: 'x' }, { a: '1', b: '1', c: 'x' }])).toEqual([false, false]);
  });

  it('does not run when a field it reads is wrong, so the rule can rely on what it is handed', () => {
    const seen: unknown[] = [];
    const schema = refine(Form, noting(seen, sameAB), { path: ['b'], uses: ['a', 'b'] });
    expect(issues(schema, { a: 1, b: '2', c: 0 }).map((issue) => issue.path)).toEqual(['/a']);
    expect(issues(schema, { a: '1', c: 0 }).map((issue) => issue.path)).toEqual(['/b']);
    expect(issues(schema, { a: 1, b: 2, c: 'x' }).map((issue) => issue.path)).toEqual(['/a', '/b', '/c']);
    expect(issues(schema, null).map((issue) => issue.path)).toEqual(['']);
    expect(issues(schema, 'ab').map((issue) => issue.path)).toEqual(['']);
    expect(seen).toEqual([]);
  });

  it('does not run when something inside a field it reads is wrong', () => {
    const seen: unknown[] = [];
    const deep = refine(object({ a: object({ list: array(string()) }), ab: number(), b: number() }), noting(seen, always), { uses: ['a'] });
    expect(issues(deep, { a: { list: ['x', 1] }, ab: 1, b: 1 }).map((issue) => issue.path)).toEqual(['/a/list/1']);
    expect(seen).toEqual([]);
    // A key that only starts as one it reads is another key.
    const wrong = { a: { list: [] }, ab: 'x', b: 1 };
    expect(issues(deep, wrong).map((issue) => issue.path)).toEqual(['/ab']);
    expect(seen).toEqual([wrong]);
  });

  it('reads its keys as reference tokens, so one with a slash or a tilde is found', () => {
    const seen: unknown[] = [];
    const odd = refine(object({ 'a/b': string(), 'c~d': string(), e: string() }), noting(seen, always), { uses: ['a/b', 'c~d'] });
    expect(issues(odd, { 'a/b': 1, 'c~d': 'x', e: 'x' }).map((issue) => issue.path)).toEqual(['/a~1b']);
    expect(issues(odd, { 'a/b': 'x', 'c~d': 1, e: 'x' }).map((issue) => issue.path)).toEqual(['/c~0d']);
    expect(seen).toEqual([]);
    expect(issues(odd, { 'a/b': 'x', 'c~d': 'x', e: 1 }).map((issue) => issue.path)).toEqual(['/e']);
    expect(seen).toHaveLength(1);
  });

  it('works the same under a key, an index and another rule', () => {
    const nested = object({ forms: array(Match), z: number() });
    expect(issues(nested, { forms: [{ a: '1', b: '1', c: 0 }, { a: '1', b: '2', c: 'x' }, { a: 1, b: '2', c: 0 }], z: 'x' }).map((issue) => [issue.path, issue.keyword])).toEqual([
      ['/forms/1/c', 'type'],
      ['/forms/1/b', 'refine'],
      ['/forms/2/a', 'type'],
      ['/z', 'type'],
    ]);
    const twice = refine(Match, (form) => form.c > 0, { path: ['c'], uses: ['c'], message: 'above zero' });
    expect(issues(twice, { a: '1', b: '2', c: 0 }).map((issue) => [issue.path, issue.keyword])).toEqual([
      ['/b', 'refine'],
      ['/c', 'refine'],
    ]);
    expect(issues(twice, { a: 1, b: '2', c: 0 }).map((issue) => [issue.path, issue.keyword])).toEqual([
      ['/a', 'type'],
      ['/c', 'refine'],
    ]);
  });

  it('without the keys it reads, runs only on a value that is sound all through', () => {
    const seen: unknown[] = [];
    const whole = refine(Form, noting(seen, sameAB), { path: ['b'] });
    expect(issues(whole, { a: '1', b: '2', c: 'x' }).map((issue) => issue.path)).toEqual(['/c']);
    expect(seen).toEqual([]);
    expect(issues(whole, { a: '1', b: '2', c: 0 }).map((issue) => issue.path)).toEqual(['/b']);
  });

  it('with no keys at all to read, runs on any object the schema could look at', () => {
    const seen: unknown[] = [];
    const free = refine(Form, noting(seen, () => false), { uses: [] });
    expect(issues(free, { a: 1, b: 2, c: 'x' }).map((issue) => issue.keyword)).toEqual(['type', 'type', 'type', 'refine']);
    expect(issues(free, 'x').map((issue) => issue.keyword)).toEqual(['type']);
    expect(seen).toHaveLength(1);
  });

  it('stops at the first issue when asked, whichever it is', () => {
    expect(issues(Match, { a: '1', b: '2', c: 'x' }, { first: true })).toEqual([{ path: '/c', keyword: 'type', message: 'expected a number, got string "x". fix: send a finite number' }]);
    expect(issues(Match, { a: '1', b: '2', c: 0 }, { first: true })).toEqual([mismatch]);
    const seen: unknown[] = [];
    issues(refine(Form, noting(seen, sameAB), { uses: ['a', 'b'] }), { a: '1', b: '2', c: 'x' }, { first: true });
    expect(seen).toEqual([]);
  });
});

describe('transform', () => {
  const Length = transform(string(), lengthOf);

  it('val.transform: parse hands out what the map makes of a value the schema accepted', () => {
    expect(parse(Length, 'abc')).toEqual({ ok: true, value: 3 });
    expect(parse(Length, 1)).toEqual({ ok: false, issues: [{ path: '', keyword: 'type', message: 'expected a string, got number 1. fix: send a string' }] });
    expectTypeOf(Length).toEqualTypeOf<Schema<string, number>>();
    expectTypeOf<InferInput<typeof Length>>().toEqualTypeOf<string>();
    expectTypeOf<InferOutput<typeof Length>>().toEqualTypeOf<number>();
    expectTypeOf(parse(Length, 'a')).toEqualTypeOf<Parsed<number>>();
  });

  it('describes what goes in: check, issues and the emitted code never run the map', () => {
    const seen: unknown[] = [];
    const schema = transform(string(), noting(seen, lengthOf));
    expect(verdicts(schema, ['abc', '', 3, null])).toEqual([true, true, false, false]);
    // `verdicts` asks `parse` once of each value, and the map ran for the two the schema accepted.
    expect(seen).toEqual(['abc', '']);
    expect(emit(object({ t: schema }))).toBe(`(() => {
const f0 = (v) => typeof v === "object" && v !== null && !Array.isArray(v)
  && (v["t"] !== undefined && (typeof v["t"] === "string"));
return (v) => f0(v);
})()`);
  });

  it('is data: the schema it wraps and the map', () => {
    expect([Length.kind, Length.item?.kind, Length.value, Object.isFrozen(Length)]).toEqual(['transform', 'string', lengthOf, true]);
    expect(Object.keys(Length)).toEqual(Object.keys(string()));
  });

  it('runs only when the whole value is sound, so a map never sees half of a refused one', () => {
    const seen: unknown[] = [];
    const schema = object({ a: transform(string(), noting(seen, lengthOf)), b: number() });
    expect(parse(schema, { a: 'abc', b: 'x' }).ok).toBe(false);
    expect(seen).toEqual([]);
    expect(parse(schema, { a: 'abc', b: 1 })).toEqual({ ok: true, value: { a: 3, b: 1 } });
    expect(seen).toEqual(['abc']);
  });

  it('never writes to the input, and copies only what holds a changed value', () => {
    const untouched = Object.freeze({ k: 1 });
    const input = Object.freeze({ a: 'abc', list: Object.freeze(['x', 'yy']), untouched });
    const schema = object({ a: Length, list: array(Length), untouched: object({ k: number() }) });
    const out = value(parse(schema, input));
    expect(out).toEqual({ a: 3, list: [1, 2], untouched: { k: 1 } });
    expect(out.untouched).toBe(untouched);
    expect(input).toEqual({ a: 'abc', list: ['x', 'yy'], untouched: { k: 1 } });
    expectTypeOf(out).toEqualTypeOf<{ a: number; list: number[]; untouched: { k: number } }>();
  });

  it('runs wherever the schema stands', () => {
    expect(value(parse(tuple([Length, string()], { rest: Length }), ['a', 'bb', 'ccc', 'dddd']))).toEqual([1, 'bb', 3, 4]);
    expect(value(parse(record(Length), { x: 'a', y: 'bb' }))).toEqual({ x: 1, y: 2 });
    expect(value(parse(object({ a: string() }, { unknown: Length }), { a: 'x', b: 'yy' }))).toEqual({ a: 'x', b: 2 });
    expect(value(parse(lazy(() => Length), 'abcd'))).toBe(4);
    expect(value(parse(discriminated('k', { a: object({ k: literal('a'), v: Length }), b: object({ k: literal('b'), v: string() }) }), { k: 'a', v: 'xyz' }))).toEqual({ k: 'a', v: 3 });
    expect(value(parse(discriminated('k', { a: object({ k: literal('a'), v: Length }), b: object({ k: literal('b'), v: string() }) }), { k: 'b', v: 'xyz' }))).toEqual({ k: 'b', v: 'xyz' });
    expect(value(parse(refine(Length, (text) => text.length > 1), 'ab'))).toBe(2);
    expect(parse(refine(Length, (text) => text.length > 1), 'a').ok).toBe(false);
  });

  it('is typed where it stands', () => {
    const shape = object({ a: Length, b: optional(Length), list: array(Length), either: union([Length, number()]), orNull: nullable(Length) });
    expectTypeOf<InferInput<typeof shape>>().toEqualTypeOf<{ a: string; list: string[]; either: string | number; orNull: string | null; b?: string | undefined }>();
    expectTypeOf<InferOutput<typeof shape>>().toEqualTypeOf<{ a: number; list: number[]; either: number; orNull: number | null; b?: number | undefined }>();
    const again = transform(shape, (given) => {
      expectTypeOf(given.a).toEqualTypeOf<number>();
      return given.list;
    });
    expectTypeOf<InferOutput<typeof again>>().toEqualTypeOf<number[]>();
    expect(again.kind).toBe('transform');
  });

  it('is owed nothing by a key that is absent, or by null or undefined where the schema around it allows them', () => {
    const seen: unknown[] = [];
    const mapped = transform(string(), noting(seen, lengthOf));
    const schema = object({ a: optional(mapped), b: nullable(mapped), c: nullish(mapped), d: nullish(mapped), e: optional(mapped) });
    const input = { a: undefined, b: null, c: null, d: undefined };
    const result = parse(schema, input);
    expect(result).toEqual({ ok: true, value: input });
    expect(value(result)).toBe(input);
    expect(seen).toEqual([]);
    expect(value(parse(schema, { a: 'a', b: 'bb', c: 'ccc', d: 'dddd', e: 'eeeee' }))).toEqual({ a: 1, b: 2, c: 3, d: 4, e: 5 });
    expect(value(parse(nullish(mapped), undefined))).toBeUndefined();
    expect(value(parse(nullish(mapped), null))).toBeNull();
    expect(value(parse(nullable(mapped), null))).toBeNull();
    expect(seen).toEqual(['a', 'bb', 'ccc', 'dddd', 'eeeee']);
  });

  it('is handed undefined where the schema it wraps accepted undefined', () => {
    const seen: unknown[] = [];
    const named = transform(unknown(), noting(seen, (given) => typeof given));
    expect(value(parse(nullable(named), undefined))).toBe('undefined');
    expect(value(parse(array(named), [undefined, 1]))).toEqual(['undefined', 'number']);
    expect(value(parse(object({ a: string() }, { unknown: named }), { a: 'x', b: undefined }))).toEqual({ a: 'x', b: 'undefined' });
    expect(value(parse(named, undefined))).toBe('undefined');
    expect(seen).toEqual([undefined, undefined, 1, undefined, undefined]);
  });

  it('runs on a default, which stands for the input that was not there', () => {
    const schema = object({ a: optional(Length, { default: 'abcd' }) });
    expect(parse(schema, {})).toEqual({ ok: true, value: { a: 4 } });
    expect(parse(schema, { a: 'ab' })).toEqual({ ok: true, value: { a: 2 } });
    expectTypeOf<InferOutput<typeof schema>>().toEqualTypeOf<{ a: number }>();
    expectTypeOf<InferInput<typeof schema>>().toEqualTypeOf<{ a?: string | undefined }>();
  });

  it('runs after coercion and stripping, on what they made', () => {
    const schema = transform(object({ n: number({ coerce: true }) }, { unknown: 'strip' }), (given) => Object.keys(given).length + given.n);
    expect(parse(schema, { n: '40', x: 1, y: 2 })).toEqual({ ok: true, value: 41 });
  });

  it('of a transform runs the inner map first', () => {
    const order: string[] = [];
    const schema = transform(
      transform(string(), (text) => {
        order.push('inner');
        return text.length;
      }),
      (count) => {
        order.push('outer');
        return count * 2;
      },
    );
    expect(parse(schema, 'abc')).toEqual({ ok: true, value: 6 });
    expect(order).toEqual(['inner', 'outer']);
    expectTypeOf(schema).toEqualTypeOf<Schema<string, number>>();
  });

  it('in a union runs for the member that accepted the value, and no other', () => {
    const either = union([transform(number(), double), transform(string(), upper), boolean()]);
    expect([value(parse(either, 5)), value(parse(either, 'x')), value(parse(either, true))]).toEqual([10, 'X', true]);
    expect(parse(either, null).ok).toBe(false);
    expectTypeOf<InferOutput<typeof either>>().toEqualTypeOf<string | number | boolean>();
    // The first member that accepts its own filled value decides, as it does with no transform.
    const coerced = union([transform(number({ coerce: true }), double), transform(string(), upper)]);
    expect([value(parse(coerced, '5')), value(parse(coerced, 'x'))]).toEqual([10, 'X']);
  });

  it('in an intersection runs in each member, and what they make of an object is merged', () => {
    const both = intersection([object({ a: Length }), object({ b: transform(number(), double) })]);
    expect(parse(both, { a: 'abc', b: 2, c: true })).toEqual({ ok: true, value: { a: 3, b: 4, c: true } });
    expectTypeOf<InferOutput<typeof both>>().toEqualTypeOf<{ a: number } & { b: number }>();
    // A member whose map makes something that is no object decides alone: there is nothing to merge it into.
    const whole = intersection([transform(object({ a: string() }), (given) => given.a), object({ a: string() })]);
    expect(parse(whole, { a: 'x' })).toEqual({ ok: true, value: 'x' });
    const scalars = intersection([Length, transform(string(), upper)]);
    expect(parse(scalars, 'ab')).toEqual({ ok: true, value: 'AB' });
  });

  // A schema with no transform is walked once: the second walk is only for a map to run in.
  it('costs a second walk only to a schema that has one', () => {
    let asked = 0;
    const counted = (inner: AnySchema): AnySchema =>
      lazy(() => {
        asked += 1;
        return inner;
      });
    parse(object({ a: counted(string()) }), { a: 'x' });
    const once = asked;
    asked = 0;
    parse(object({ a: counted(Length) }), { a: 'x' });
    expect([once, asked]).toEqual([2, 3]);
  });
});

describe('coercion to a boolean', () => {
  const Flag = boolean({ coerce: true });

  it('val.coerce_boolean: parse reads true and false, and nothing else', () => {
    expect([parse(Flag, 'true'), parse(Flag, 'false')]).toEqual([
      { ok: true, value: true },
      { ok: true, value: false },
    ]);
    expect([parse(Flag, true), parse(Flag, false)]).toEqual([
      { ok: true, value: true },
      { ok: true, value: false },
    ]);
  });

  it.each(['maybe', 'TRUE', 'True', 'FALSE', '1', '0', 'yes', 'no', 'on', 'off', '', ' true', 'true ', 'truefalse', 1, 0, null, undefined, [], ['true']])('does not read %j', (given) => {
    const result = parse(Flag, given);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.issues).toEqual(issues(boolean(), given));
  });

  it('is asked for: check never coerces, and a boolean without it reads no string', () => {
    expect([check(Flag, 'true'), check(Flag, true), parse(boolean(), 'true').ok, parse(boolean({ coerce: false }), 'false').ok]).toEqual([false, true, false, false]);
    expect(verdicts(Flag, ['true', 'false', true, false, 1])).toEqual([false, false, true, true, false]);
    expect([Flag.coerce, boolean().coerce, Flag.check === boolean().check]).toEqual([true, false, true]);
    expectTypeOf(Flag).toEqualTypeOf<Schema<boolean>>();
  });

  it('reads in place: a copy of what held the string, and the input as it was', () => {
    const input = Object.freeze({ on: 'true', list: Object.freeze(['false', true]) });
    expect(parse(object({ on: Flag, list: array(Flag) }), input)).toEqual({ ok: true, value: { on: true, list: [false, true] } });
    expect(input).toEqual({ on: 'true', list: ['false', true] });
  });
});

describe('coercion to a date', () => {
  const When = date({ coerce: true });

  it('val.coerce_date: parse reads an RFC 3339 date-time, with any offset and any fraction', () => {
    expect(parse(When, '2020-01-01T00:00:00Z')).toEqual({ ok: true, value: new Date(Date.UTC(2020, 0, 1)) });
    expect(value(parse(When, '2020-01-01T00:00:00.123Z')).getTime()).toBe(Date.UTC(2020, 0, 1, 0, 0, 0, 123));
    expect(value(parse(When, '2020-01-01T00:00:00.123456789Z')).getTime()).toBe(Date.UTC(2020, 0, 1, 0, 0, 0, 123));
    expect(value(parse(When, '2020-01-01T00:00:00+02:00')).getTime()).toBe(Date.UTC(2019, 11, 31, 22));
    expect(value(parse(When, '2020-06-30T23:59:59-23:59')).getTime()).toBe(Date.UTC(2020, 6, 1, 23, 58, 59));
    expect(value(parse(When, '2020-02-29T12:30:45Z')).toISOString()).toBe('2020-02-29T12:30:45.000Z');
    expect(value(parse(When, '0001-01-01T00:00:00Z')).toISOString()).toBe('0001-01-01T00:00:00.000Z');
    expect(value(parse(When, '9999-12-31T23:59:59Z')).toISOString()).toBe('9999-12-31T23:59:59.000Z');
  });

  it('reads an RFC 3339 full-date as midnight UTC, as all four libraries that coerce dates do', () => {
    expect(value(parse(When, '2020-01-01')).toISOString()).toBe('2020-01-01T00:00:00.000Z');
    expect(value(parse(When, '2020-02-29')).toISOString()).toBe('2020-02-29T00:00:00.000Z');
    expect(value(parse(When, '2020-12-31')).toISOString()).toBe('2020-12-31T00:00:00.000Z');
  });

  it('hands a Date through as it is', () => {
    const now = new Date(0);
    expect(value(parse(When, now))).toBe(now);
    expect(parse(When, new Date(Number.NaN)).ok).toBe(false);
  });

  // [what is given, why it is not read]
  it.each<[unknown, string]>([
    ['nope', 'not a date'],
    ['01/02/2020', 'a locale form: the day and the month depend on who reads it'],
    ['2020-02-30T00:00:00Z', 'a day February does not have, which the engine would roll into March'],
    ['2020-02-30', 'the same, as a date'],
    ['2021-02-29', 'the 29th in a year that is not a leap year'],
    ['2020-04-31T00:00:00+02:00', 'the 31st of a month with 30 days'],
    ['2020-13-01', 'no such month'],
    ['2020-00-10', 'no such month'],
    ['2020-01-00', 'no such day'],
    ['2020-01-32', 'no such day'],
    ['2020-01-01T24:00:00Z', 'no such hour'],
    ['2020-01-01T00:60:00Z', 'no such minute'],
    ['2020-01-01T23:59:60Z', 'a leap second: a valid date-time that no Date can hold'],
    ['2020-01-01T00:00:00', 'no offset: local time, which depends on the machine'],
    ['2020-01-01T00:00Z', 'no seconds'],
    ['2020-01-01T00:00:00+0200', 'an offset without its colon'],
    ['2020-01-01T00:00:00+24:00', 'no such offset'],
    ['2020-01-01T00:00:00+02:60', 'no such offset'],
    ['2020-01-01T00:00:00.Z', 'a fraction with no digits'],
    ['2020-01-01 00:00:00Z', 'a space for the T'],
    ['2020-01-01t00:00:00z', 'lower case, which ECMAScript does not promise to read'],
    ['2020-01-01T00:00:00z', 'a lower-case z'],
    ['20200101T000000Z', 'the basic form'],
    ['2020-1-1', 'no leading zeros'],
    [' 2020-01-01', 'a space before it'],
    ['2020-01-01 ', 'a space after it'],
    ['2020-01-01T', 'a T and no time'],
    ['12020-01-01', 'a year of five digits'],
    ['2020-01-012020-01-01', 'two dates run together'],
    [{ toString: date2020, slice: date2020 }, 'an object that only reads as one'],
    ['', 'nothing'],
    [0, 'a number: seconds or milliseconds, and since when, is a guess'],
    [1_577_836_800_000, 'a number'],
    [null, 'null'],
    [undefined, 'undefined'],
    [['2020-01-01'], 'an array'],
  ])('does not read %j: %s', (given) => {
    const result = parse(When, given);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.issues).toEqual(issues(date(), given));
  });

  it('is asked for: check never coerces, and a date without it reads no string', () => {
    expect([check(When, '2020-01-01'), check(When, new Date(0)), parse(date(), '2020-01-01').ok, parse(date({ coerce: false }), '2020-01-01').ok]).toEqual([false, true, false, false]);
    expect(verdicts(When, ['2020-01-01', new Date(0), 0])).toEqual([false, true, false]);
    expect([When.coerce, date().coerce, When.check === date().check]).toEqual([true, false, true]);
    expectTypeOf(When).toEqualTypeOf<Schema<Date>>();
  });

  it('reads in place: a copy of what held the string, and the input as it was', () => {
    const input = Object.freeze({ at: '2020-01-01', then: Object.freeze(['2020-01-02T00:00:00Z']) });
    const out = value(parse(object({ at: When, then: array(When) }), input));
    expect([out.at.toISOString(), out.then.map((one) => one.toISOString())]).toEqual(['2020-01-01T00:00:00.000Z', ['2020-01-02T00:00:00.000Z']]);
    expect(input).toEqual({ at: '2020-01-01', then: ['2020-01-02T00:00:00Z'] });
  });
});

describe('a message map', () => {
  const Shape = object({ name: string({ min: 2 }), age: number(), tags: array(string()) });
  const wrong = { name: 'a', age: 'x', tags: [1] };

  it('val.error_map: changes the messages of every schema it is handed with', () => {
    expect(issues(Shape, wrong, { message: french })).toEqual([
      { path: '/name', keyword: 'min', message: 'expected at least 2 characters, got string "a". fix: send 2 or more' },
      { path: '/age', keyword: 'type', message: 'attendu a number, reçu autre chose' },
      { path: '/tags/0', keyword: 'type', message: 'attendu a string, reçu autre chose' },
    ]);
    expect(issues(boolean(), 1, { message: french })).toEqual([{ path: '', keyword: 'type', message: 'attendu true or false, reçu autre chose' }]);
  });

  it('keeps the message, with its fix line, wherever the map returns nothing', () => {
    expect(issues(Shape, wrong, { message: nothing })).toEqual(issues(Shape, wrong));
    expect(issues(Shape, wrong, { message: none })).toEqual(issues(Shape, wrong));
    for (const issue of issues(Shape, wrong, { message: french })) expect(issue.message.includes('fix: ') || issue.message.startsWith('attendu')).toBe(true);
    // An empty text is a text: the map said what it wanted there.
    expect(issues(string(), 1, { message: empty })).toEqual([{ path: '', keyword: 'type', message: '' }]);
  });

  it('is handed what the message is made from: where, which keyword, what was expected, what arrived and the fix', () => {
    const seen: Miss[] = [];
    issues(Shape, wrong, { message: noting(seen, () => undefined) });
    expect(seen).toEqual([
      { path: '/name', keyword: 'min', expected: 'at least 2 characters', got: 'a', fix: 'send 2 or more' },
      { path: '/age', keyword: 'type', expected: 'a number', got: 'x', fix: 'send a finite number' },
      { path: '/tags/0', keyword: 'type', expected: 'a string', got: 1, fix: 'send a string' },
    ]);
  });

  it('is asked once about a union, and not about the members it tried', () => {
    const seen: Miss[] = [];
    const found = issues(union([string(), number()]), true, { message: noting(seen, (miss: Miss) => `[${miss.keyword}]`) });
    expect(found).toEqual([{ path: '', keyword: 'union', message: '[union]' }]);
    expect(seen.map((miss) => miss.keyword)).toEqual(['union']);
  });

  it('goes with parse, and with the first issue alone', () => {
    expect(parse(Shape, wrong, { message: french, first: true })).toEqual({
      ok: false,
      issues: [{ path: '/name', keyword: 'min', message: 'expected at least 2 characters, got string "a". fix: send 2 or more' }],
    });
    expect(parse(string(), 1, { message: french })).toEqual({ ok: false, issues: [{ path: '', keyword: 'type', message: 'attendu a string, reçu autre chose' }] });
  });
});

describe('a promise and a function', () => {
  const unsettled = new Promise<never>(pending);
  const thenable = { then: (): void => undefined };

  it('val.promise: is a Promise, whatever it resolves to', () => {
    expect(verdicts(promise(), [Promise.resolve('a'), Promise.resolve(1), unsettled])).toEqual([true, true, true]);
    expect(verdicts(promise(), [thenable, 'a', null, Promise])).toEqual([false, false, false, false]);
    expectTypeOf(promise()).toEqualTypeOf<Schema<Promise<unknown>>>();
    expect([promise().kind, promise().value]).toEqual(['instance', Promise]);
    expect(issues(promise(), 1)).toEqual([{ path: '', keyword: 'instance', message: 'expected an instance of Promise, got number 1. fix: send one made by Promise' }]);
  });

  it('val.function: is a function, whatever it takes and returns', () => {
    class Named {}
    expect(verdicts(func(), [always, Named, Math.max, later])).toEqual([true, true, true, true]);
    expect(verdicts(func(), ['function', {}, null, undefined])).toEqual([false, false, false, false]);
    expectTypeOf(func()).toEqualTypeOf<Schema<(...args: never[]) => unknown>>();
    expect([func().kind, func().value]).toEqual(['type', 'function']);
    expect(issues(func(), 1)).toEqual([{ path: '', keyword: 'type', message: 'expected a function, got number 1. fix: send a function' }]);
    expect(emit(func())).toBe('(() => {\n\nreturn (v) => typeof v === "function";\n})()');
  });
});

describe('parse, asked for a copy', () => {
  const Shape = object({ a: string(), n: object({ b: number() }), list: array(object({ c: number() })), pair: tuple([object({ d: number() })]), by: record(object({ e: number() })), free: unknown() });
  const input = copied;

  it('beh.clone: hands out a new object and array for every one the schema describes', () => {
    const given = input();
    const out = value(parse(Shape, given, { copy: true }));
    expect(out).toEqual(given);
    expect(out).not.toBe(given);
    expect(out.n).not.toBe(given.n);
    expect(out.list).not.toBe(given.list);
    expect(out.list[0]).not.toBe(given.list[0]);
    expect(out.pair).not.toBe(given.pair);
    expect(out.pair[0]).not.toBe(given.pair[0]);
    expect(out.by).not.toBe(given.by);
    expect(out.by.k).not.toBe(given.by.k);
    // What `unknown` lets through is described by nothing, and is handed over as it is.
    expect(out.free).toBe(given.free);
    expect(given).toEqual(input());
  });

  it('is asked for: without it, or with it off, what did not change is the input itself', () => {
    const given = input();
    expect(value(parse(Shape, given))).toBe(given);
    expect(value(parse(Shape, given, {}))).toBe(given);
    expect(value(parse(Shape, given, { copy: false }))).toBe(given);
    expect(value(parse(Shape, given, { copy: 'yes' as unknown as boolean }))).toBe(given);
  });

  it('copies an array of scalars and a record of them too, and still fills, strips and maps', () => {
    const list = ['a'];
    expect(value(parse(array(string()), list, { copy: true }))).not.toBe(list);
    expect(value(parse(array(string()), list, { copy: true }))).toEqual(['a']);
    const by = { k: 1 };
    expect(value(parse(record(number()), by, { copy: true }))).not.toBe(by);
    const shape = object({ a: optional(string(), { default: 'd' }), n: transform(number({ coerce: true }), double) }, { unknown: 'strip' });
    expect(parse(shape, { n: '2', x: 1 }, { copy: true })).toEqual({ ok: true, value: { a: 'd', n: 4 } });
  });

  it('gives the issues of a value there is no copy of', () => {
    expect(parse(Shape, { ...input(), a: 1 }, { copy: true })).toEqual({ ok: false, issues: [{ path: '/a', keyword: 'type', message: 'expected a string, got number 1. fix: send a string' }] });
  });
});
