import { describe, expect, expectTypeOf, it } from 'vitest';

import { emit } from './emit.js';
import {
  type AnySchema,
  array,
  check,
  intersection,
  issues,
  lazy,
  mapOf,
  type Node,
  nullable,
  number,
  object,
  optional,
  type Own,
  parse,
  parseAsync,
  type Parsed,
  pipe,
  preprocess,
  record,
  refine,
  refineAsync,
  type Schema,
  setOf,
  string,
  transform,
  transformAsync,
  tuple,
  union,
  unknown,
} from './index.js';
import { compile } from './jit.js';
import { toJsonSchema } from './json-schema.js';
import { AWAITED_MAP, AWAITED_RULE } from './own.js';

/**
 * Wave 3: a rule and a map that are awaited, and the parse that awaits them. The values are the
 * competitors' probes' (benchmarks/results/validator/parity-2026-11-13).
 */

const value = <T>(result: Parsed<T>): T => {
  if (!result.ok) throw new Error(`expected a value, got ${JSON.stringify(result.issues)}`);
  return result.value;
};

const failed = (result: Parsed<unknown>): { path: string; keyword: string }[] => {
  if (result.ok) throw new Error('expected issues, got a value');
  return result.issues.map(({ path, keyword }) => ({ path, keyword }));
};

const isOk = (text: string): Promise<boolean> => Promise.resolve(text === 'ok');
const lengthOf = (text: string): Promise<number> => Promise.resolve(text.length);
const upper = (text: string): string => text.toUpperCase();
const above5 = (count: number): Promise<boolean> => Promise.resolve(count > 5);
const hook = (): string => 'from the hook';
const toUndefined = (): unknown => undefined;
const yes = (): Promise<boolean> => Promise.resolve(true);
const itselfLater = (input: unknown): Promise<unknown> => Promise.resolve(input);
const one = (): Promise<number> => Promise.resolve(1);
const itself = (input: unknown): unknown => input;

/** A log of what was called with what, and functions that write to it. */
const logging = (): { seen: string[]; rule: (name: string, answer?: boolean) => (input: unknown) => Promise<boolean>; map: (name: string) => (input: unknown) => Promise<unknown>; sync: (name: string) => (input: unknown) => unknown } => {
  const seen: string[] = [];
  return {
    seen,
    rule:
      (name, answer = true) =>
      async (input) => {
        seen.push(`${name} asked ${JSON.stringify(input)}`);
        await Promise.resolve();
        seen.push(`${name} answered`);
        return answer;
      },
    map: (name) => async (input) => {
      seen.push(`${name} mapped ${JSON.stringify(input)}`);
      await Promise.resolve();
      return input;
    },
    sync: (name) => (input) => {
      seen.push(`${name} mapped ${JSON.stringify(input)}`);
      return input;
    },
  };
};

/** A schema of a kind of its own that counts how often `parse` fills it: it accepts every value and changes none. */
const counting = (): { schema: AnySchema; count: () => number } => {
  let fills = 0;
  const own: Own = {
    issues: () => {
      // Nothing is wrong with any value.
    },
    fill: (_, input) => {
      fills += 1;
      return input;
    },
  };
  const schema = Object.freeze({ ...unknown(), kind: 'counting', own }) as unknown as AnySchema;
  return { schema, count: () => fills };
};

describe('refineAsync', () => {
  const Ok = refineAsync(string(), isOk);

  it('val.refine_async: a rule of yours may answer with a promise', async () => {
    expect(await parseAsync(Ok, 'ok')).toEqual({ ok: true, value: 'ok' });
    expect(await parseAsync(Ok, 'no')).toEqual({ ok: false, issues: [{ path: '', keyword: 'refine', message: 'expected a value the rule accepts, got string "no". fix: change the value so that the rule holds' }] });
    expect(Ok.kind).toBe('refineAsync');
    expect(Ok.own).toBe(AWAITED_RULE);
    expectTypeOf(Ok).toEqualTypeOf<Schema<string>>();
  });

  it('is refused by parse, which awaits nothing', () => {
    expect(() => parse(Ok, 'ok')).toThrow(TypeError);
    expect(() => parse(Ok, 'ok')).toThrow('cannot parse a schema that has a rule or a map to await with `parse`. fix: call `parseAsync`');
    expect(() => parse(object({ a: array(Ok) }), { a: ['ok'] })).toThrow('fix: call `parseAsync`');
  });

  it('describes what goes in: check, issues and the emitted code read the schema it is on, and never call the rule', async () => {
    const log = logging();
    const schema = refineAsync(string({ min: 2 }), log.rule('r', false));
    expect([check(schema, 'ab'), check(schema, 'a'), check(schema, 1)]).toEqual([true, false, false]);
    expect(issues(schema, 'ab')).toEqual([]);
    expect(issues(schema, 'a').map((issue) => issue.keyword)).toEqual(['min']);
    expect(emit(schema)).toBe(emit(string({ min: 2 })));
    expect(log.seen).toEqual([]);
    expect(failed(await parseAsync(schema, 'a'))).toEqual([{ path: '', keyword: 'min' }]);
    expect(log.seen).toEqual([]);
    expect(failed(await parseAsync(schema, 'ab'))).toEqual([{ path: '', keyword: 'refine' }]);
    expect(log.seen).toEqual(['r asked "ab"', 'r answered']);
  });

  it('reports at the path it names, under where it stands, in the words it was given', async () => {
    const Pair = refineAsync(object({ 'a/b': string(), b: string() }), isSame, { path: ['a/b'], message: 'the same twice' });
    expect(await parseAsync(Pair, { 'a/b': 'x', b: 'y' })).toEqual({ ok: false, issues: [{ path: '/a~1b', keyword: 'refine', message: 'expected the same twice, got an object. fix: change the value so that the rule holds' }] });
    const Rows = object({ rows: array(object({ pair: Pair, name: Ok })) });
    const rows = { rows: [{ pair: { 'a/b': 'x', b: 'x' }, name: 'ok' }, { pair: { 'a/b': 'x', b: 'y' }, name: 'no' }] };
    expect(failed(await parseAsync(Rows, rows))).toEqual([
      { path: '/rows/1/pair/a~1b', keyword: 'refine' },
      { path: '/rows/1/name', keyword: 'refine' },
    ]);
    expect(failed(await parseAsync(Rows, rows, { first: true }))).toEqual([{ path: '/rows/1/pair/a~1b', keyword: 'refine' }]);
    const worded = await parseAsync(Rows, rows, { message: hook });
    expect(worded).toEqual({ ok: false, issues: [{ path: '/rows/1/pair/a~1b', keyword: 'refine', message: 'from the hook' }, { path: '/rows/1/name', keyword: 'refine', message: 'from the hook' }] });
  });

  it('holds only when the rule answers true', async () => {
    const truthy = refineAsync(string(), one as unknown as () => Promise<boolean>);
    expect(failed(await parseAsync(truthy, 'a'))).toEqual([{ path: '', keyword: 'refine' }]);
  });

  it('asks every rule once, the ones beside each other at once, and a rule above another only when that one held', async () => {
    const log = logging();
    const schema = refineAsync(object({ a: refineAsync(string(), log.rule('a')), b: refineAsync(string(), log.rule('b')) }), log.rule('both'));
    expect(value(await parseAsync(schema, { a: 'x', b: 'y' }))).toEqual({ a: 'x', b: 'y' });
    expect(log.seen).toEqual(['a asked "x"', 'b asked "y"', 'a answered', 'b answered', 'both asked {"a":"x","b":"y"}', 'both answered']);

    const second = logging();
    const inner = refineAsync(object({ a: refineAsync(string(), second.rule('a', false)), b: refineAsync(string(), second.rule('b')) }), second.rule('both'));
    expect(failed(await parseAsync(inner, { a: 'x', b: 'y' }))).toEqual([{ path: '/a', keyword: 'refine' }]);
    expect(second.seen).toEqual(['a asked "x"', 'b asked "y"', 'a answered', 'b answered']);
  });

  it('is a finding in JSON Schema, as a rule is', () => {
    expect(toJsonSchema(refineAsync(string(), isOk, { path: ['a'], message: 'm' }))).toEqual({
      schema: { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'string' },
      findings: [{ path: '', keyword: 'refine', message: 'the rule "m", reported at /a, is a function, which JSON Schema cannot carry: the document has the schema without it' }],
    });
  });
});

function isSame(pair: { 'a/b': string; b: string }): Promise<boolean> {
  return Promise.resolve(pair['a/b'] === pair.b);
}

describe('transformAsync', () => {
  const Size = transformAsync(string(), lengthOf);

  it('beh.async_parse: a parse that answers with a promise, having awaited the maps', async () => {
    expect(await parseAsync(Size, 'abc')).toEqual({ ok: true, value: 3 });
    expect(Size.kind).toBe('transformAsync');
    expect(Size.own).toBe(AWAITED_MAP);
    expectTypeOf(Size).toEqualTypeOf<Schema<string, number>>();
    expectTypeOf(parseAsync(Size, 'abc')).toEqualTypeOf<Promise<Parsed<number>>>();
  });

  it('is refused by parse, and describes what goes in to every reader that answers at once', () => {
    expect(() => parse(Size, 'abc')).toThrow('cannot parse a schema that has a rule or a map to await with `parse`. fix: call `parseAsync`');
    expect([check(Size, 'abc'), check(Size, 1), issues(Size, 'abc'), emit(Size) === emit(string())]).toEqual([true, false, [], true]);
    expect(toJsonSchema(Size).findings.map((finding) => finding.keyword)).toEqual(['transform']);
  });

  it('runs a map above another after it, on what that one resolved to', async () => {
    const schema = transform(object({ n: Size, tags: array(transformAsync(string(), lengthOf)), same: string() }), (row) => row.n + row.tags[1]! + row.same.length);
    expect(value(await parseAsync(schema, { n: 'abc', tags: ['a', 'bbbb'], same: 'xx' }))).toBe(9);
    const outer = transformAsync(transform(Size, (size) => size * 2), (twice) => Promise.resolve(`${String(twice)}!`));
    expect(value(await parseAsync(outer, 'abc'))).toBe('6!');
  });

  it('runs every map once, after every rule has held, and none when one did not', async () => {
    const log = logging();
    const schema = transform(object({ a: transformAsync(refineAsync(string(), log.rule('rule')), log.map('inner')), b: transform(string(), log.sync('beside')) }), log.sync('outer'));
    expect(value(await parseAsync(schema, { a: 'x', b: 'y' }))).toEqual({ a: 'x', b: 'y' });
    // The two maps stand beside each other and start together; the one above them waits for both.
    expect(log.seen).toEqual(['rule asked "x"', 'rule answered', 'beside mapped "y"', 'inner mapped "x"', 'outer mapped {"a":"x","b":"y"}']);

    const second = logging();
    const refusing = transform(object({ a: transformAsync(refineAsync(string(), second.rule('rule', false)), second.map('inner')) }), second.sync('outer'));
    expect(failed(await parseAsync(refusing, { a: 'x' }))).toEqual([{ path: '/a', keyword: 'refine' }]);
    expect(second.seen).toEqual(['rule asked "x"', 'rule answered']);
  });

  it('leaves a key that is absent absent, and maps a default as an input', async () => {
    const log = logging();
    const schema = object({ a: optional(transformAsync(string(), log.map('a'))), b: optional(transformAsync(string(), lengthOf), { default: 'four' }) });
    expect(value(await parseAsync(schema, {}))).toEqual({ b: 4 });
    expect(log.seen).toEqual([]);
    expect(value(await parseAsync(schema, { a: 'x', b: 'xy' }))).toEqual({ a: 'x', b: 2 });
  });

  it('is awaited inside every kind that holds others', async () => {
    const schema = object({
      list: array(Size),
      pair: tuple([Size, number()]),
      by: record(Size),
      map: mapOf(Size, Size),
      set: setOf(Size),
      maybe: nullable(Size),
      either: union([number(), Size]),
      both: intersection([object({ a: Size }), object({ b: Size })]),
      later: lazy(() => Size),
    });
    const input = { list: ['a', 'bb'], pair: ['abc', 1], by: { k: 'abcd' }, map: new Map([['a', 'bb']]), set: new Set(['a', 'bb', 'cc']), maybe: null, either: 'abc', both: { a: 'a', b: 'bb' }, later: 'abcde' };
    expect(value(await parseAsync(schema, input))).toEqual({ list: [1, 2], pair: [3, 1], by: { k: 4 }, map: new Map([[1, 2]]), set: new Set([1, 2]), maybe: null, either: 3, both: { a: 1, b: 2 }, later: 5 });
    expect(input.list).toEqual(['a', 'bb']);
  });

  it('says where in a Map or a Set a rule did not hold', async () => {
    const schema = object({ map: mapOf(string(), refineAsync(string(), isOk)), set: setOf(refineAsync(string(), isOk)) });
    expect(failed(await parseAsync(schema, { map: new Map([['a', 'ok'], ['b', 'no']]), set: new Set(['ok', 'no']) }))).toEqual([
      { path: '/map/b', keyword: 'refine' },
      { path: '/set/1', keyword: 'refine' },
    ]);
  });
});

/** A value the corpus schema of the awaited kinds accepts, made new each time. */
const base = (): Record<string, unknown> => ({ id: 'ok', size: 'abc', rows: [{ n: 1 }] });

describe('the readers that answer at once, for the kinds that are awaited', () => {
  const Awaited = object({
    id: refineAsync(string({ min: 2 }), isOk),
    size: optional(transformAsync(string(), lengthOf)),
    rows: array(refineAsync(object({ n: number() }), yes, { path: ['n'] })),
  });
  const PROBES: unknown[] = [undefined, null, 1, '', 'a', 'ok', 'no', [], [{ n: 1 }], [{ n: 'x' }], [1], {}, { n: 1 }];
  const cases = ['id', 'size', 'rows'].flatMap((key) => PROBES.map((probe): [string, unknown] => [key, { ...base(), [key]: probe }]));

  it.each(cases)('agree with each other, and parseAsync accepts nothing they refuse: %s replaced, case %#', async (_, input) => {
    const yes = check(Awaited, input);
    expect(compile(Awaited)(input)).toBe(yes);
    expect(issues(Awaited, input).length === 0).toBe(yes);
    expect(issues(Awaited, input, { first: true }).length === 0).toBe(yes);
    const parsed = await parseAsync(Awaited, input);
    if (!yes) expect(parsed).toEqual({ ok: false, issues: issues(Awaited, input) });
    else if (!parsed.ok) expect(parsed.issues.map((issue) => issue.keyword)).toEqual(['refine']);
  });

  // A required key is there whatever the schema under the rule or the map says of `undefined`.
  it.each<[string, AnySchema]>([
    ['refineAsync', refineAsync(unknown(), yes)],
    ['transformAsync', transformAsync(unknown(), itselfLater)],
  ])('ask for a key that must be there, under a %s', (_, field) => {
    const schema = object({ a: field });
    expect([{ a: 1 }, {}, { a: undefined }].map((input) => [check(schema, input), compile(schema)(input), issues(schema, input).length])).toEqual([
      [true, true, 0],
      [false, false, 1],
      [false, false, 1],
    ]);
  });

  it('accept the value that has everything, and count what they accept', () => {
    expect(check(Awaited, base())).toBe(true);
    expect(cases.filter(([, input]) => check(Awaited, input))).toHaveLength(9);
  });
});

describe('parseAsync', () => {
  const Big = pipe(transform(string(), Number), number({ min: 5 }));
  const Row = object({
    id: string(),
    size: optional(transform(string(), upper)),
    sizes: array(pipe(unknown(), object({ w: number({ coerce: true }) }, { unknown: 'strip' }))),
    pair: tuple([string(), Big]),
    even: optional(refine(number(), (count) => count % 2 === 0)),
    odd: optional(transform(preprocess(toUndefined, unknown()), itself), { default: 1 }),
  });

  const INPUTS: [string, unknown, boolean][] = [
    ['a row with what it has to have', { id: 'r', sizes: [{ w: 1 }], pair: ['a', '6'] }, true],
    ['a row with everything, to coerce, to strip and to map', { id: 'r', size: 'm', sizes: [{ w: '2', extra: true }, { w: 3 }], pair: ['a', '9'], even: 2, odd: 5 }, true],
    ['a row three pipes refuse', { id: 'r', sizes: [{ w: 1 }, { w: 'x' }, {}], pair: ['a', '1'] }, false],
    ['a row check refuses', { id: 1, sizes: [], pair: ['a', '6'] }, false],
    ['a row a rule refuses', { id: 'r', sizes: [], pair: ['a', '6'], even: 3 }, false],
    ['no row at all', null, false],
  ];

  it.each(INPUTS)('gives what parse gives for a schema with nothing to await: %s', async (_, input, accepted) => {
    expect(await parseAsync(Row, input)).toEqual(parse(Row, input));
    expect(await parseAsync(Row, input, { first: true })).toEqual(parse(Row, input, { first: true }));
    expect(await parseAsync(Row, input, { copy: true, message: hook })).toEqual(parse(Row, input, { copy: true, message: hook }));
    expect(parse(Row, input).ok).toBe(accepted);
  });

  // Where `undefined` stands after `check`, a default stands for it on the walk that maps, as it does in `parse`.
  it('reads a default where undefined stands, as parse does', async () => {
    const Odd = optional(transform(preprocess(toUndefined, unknown()), itself), { default: 1 });
    expect(parse(Odd, 5)).toEqual({ ok: true, value: 1 });
    expect(await parseAsync(Odd, 5)).toEqual({ ok: true, value: 1 });
    expect(await parseAsync(array(Odd), [5, 6])).toEqual(parse(array(Odd), [5, 6]));
    expect(await parseAsync(array(Odd), [5, 6])).toEqual({ ok: true, value: [1, 1] });
  });

  it('hands back the input itself where nothing changed, and a copy when one is asked for', async () => {
    const Plain = object({ a: string(), list: array(number()) });
    const input = { a: 'x', list: [1] };
    expect(value(await parseAsync(Plain, input))).toBe(input);
    const withRule = refineAsync(Plain, yes);
    expect(value(await parseAsync(withRule, input))).toBe(input);
    const copied = value(await parseAsync(transformAsync(Plain, (row) => Promise.resolve(row)), input, { copy: true }));
    expect(copied).toEqual(input);
    expect(copied).not.toBe(input);
    expect(copied.list).not.toBe(input.list);
  });

  it('walks a schema with nothing to await or to map once, and one with no rule to await twice more', async () => {
    const plain = counting();
    await parseAsync(object({ a: plain.schema }), { a: 1 });
    expect(plain.count()).toBe(1);

    // The walk that maps calls each filler twice: once to learn its members, once to hand them back.
    const mapped = counting();
    await parseAsync(object({ a: mapped.schema, b: Size() }), { a: 1, b: 'x' });
    expect(mapped.count()).toBe(3);

    const ruled = counting();
    await parseAsync(object({ a: ruled.schema, b: refineAsync(string(), isOk) }), { a: 1, b: 'ok' });
    expect(ruled.count()).toBe(5);
  });

  it('awaits what the second schema of a pipe has to await, and reports it where the pipe stands', async () => {
    const Count = pipe(transform(string(), Number), refineAsync(number(), above5));
    expect(value(await parseAsync(Count, '7'))).toBe(7);
    expect(failed(await parseAsync(Count, '3'))).toEqual([{ path: '', keyword: 'refine' }]);
    const log = logging();
    const Outer = transform(object({ n: Count, m: pipe(string(), transformAsync(string(), lengthOf)) }), log.sync('outer'));
    expect(failed(await parseAsync(Outer, { n: '3', m: 'abc' }))).toEqual([{ path: '/n', keyword: 'refine' }]);
    expect(log.seen).toEqual([]);
    expect(value(await parseAsync(Outer, { n: '8', m: 'abc' }))).toEqual({ n: 8, m: 3 });
    expect(log.seen).toEqual(['outer mapped {"n":8,"m":3}']);
  });

  it('parses nothing with the second schema of a pipe whose first failed inside, nor before the rules have held', async () => {
    const log = logging();
    const Inner = pipe(pipe(string(), string({ min: 2 })), transform(string(), log.sync('second')));
    expect(failed(await parseAsync(Inner, 'a'))).toEqual([{ path: '', keyword: 'min' }]);
    expect(log.seen).toEqual([]);
    const Ruled = pipe(refineAsync(string(), log.rule('rule', false)), transform(string(), log.sync('second')));
    expect(failed(await parseAsync(Ruled, 'a'))).toEqual([{ path: '', keyword: 'refine' }]);
    expect(log.seen).toEqual(['rule asked "a"', 'rule answered']);
  });

  it('refuses a node of a kind there is none of, as parse does', async () => {
    const node = { ...string(), kind: 'constructor' } as unknown as AnySchema;
    await expect(parseAsync(node, 'a')).rejects.toThrow('parse cannot read a node of the kind "constructor": no builder makes it. fix: build the schema with the builders');
    const bare: Node = { ...transformAsync(string(), lengthOf), own: null };
    await expect(parseAsync(bare as AnySchema, 'a')).rejects.toThrow(TypeError);
  });
});

function Size(): Schema<string, number> {
  return transformAsync(string(), lengthOf);
}
