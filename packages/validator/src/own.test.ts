import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { check } from './check.js';
import { emit, emitWith } from './emit.js';
import { issues } from './issues.js';
import { BIGINT, CUSTOM, DATE, EVERY, INSTANCE, LATER, MAPPED, NEVER, NULLABLE, NULLISH, RECORD, REFINED, TUPLE, TYPE, UNION, UNKNOWN } from './own.js';
import { parse } from './parse.js';
import {
  type AnySchema,
  any,
  array,
  bigint,
  boolean,
  custom,
  date,
  discriminated,
  enumOf,
  func,
  instanceOf,
  intersection,
  lazy,
  literal,
  never,
  nullable,
  nullish,
  number,
  object,
  type Own,
  promise,
  record,
  refine,
  string,
  symbol,
  transform,
  tuple,
  union,
  unknown,
} from './schema.js';

const always = (): boolean => true;
const upper = (text: string): string => text.toUpperCase();

const called: string[] = [];
const spy = (name: string) => (): string => {
  called.push(name);
  return '1';
};
/** A value that says so when anything turns it into a string or a number. */
const odd = { toString: spy('toString'), valueOf: spy('valueOf') };

const BACKSLASH = String.fromCodePoint(92);
/** A string as the emitter writes it: a JSON string, with what could close a script or open a comment as an escape. */
const escaped = (text: string): string => JSON.stringify(text).replaceAll(/[<>/]/gu, (unit) => `${BACKSLASH}u00${(unit.codePointAt(0) as number).toString(16)}`);

const FIX = /\. fix: build the schema with the builders$/u;

/** The four readers that look a node's kind up, each as a call that throws when it refuses. */
const READERS: [string, (schema: AnySchema) => unknown, string][] = [
  ['issues', (schema) => issues(schema, 1), 'issues cannot read a node of the kind '],
  ['parse', (schema) => parse(schema, 1), 'parse cannot read a node of the kind '],
  ['emit', (schema) => emit(schema), 'cannot emit a node of the kind '],
  ['emitWith', (schema) => emitWith(schema), 'cannot emit a node of the kind '],
];

describe('a kind brings its own reading for issues and parse', () => {
  const CORE: [string, AnySchema][] = [
    ['string', string()],
    ['number', number()],
    ['boolean', boolean()],
    ['literal', literal(1)],
    ['enum', enumOf(['a'])],
    ['array', array(string())],
    ['object', object({})],
    ['discriminated', discriminated('k', {})],
  ];
  const CARRIED: [string, AnySchema, Own][] = [
    ['unknown', unknown(), UNKNOWN],
    ['any', any(), UNKNOWN],
    ['never', never(), NEVER],
    ['record', record(string()), RECORD],
    ['tuple', tuple([]), TUPLE],
    ['nullable', nullable(string()), NULLABLE],
    ['nullish', nullish(string()), NULLISH],
    ['union', union([]), UNION],
    ['intersection', intersection([]), EVERY],
    ['lazy', lazy(() => string()), LATER],
    ['custom', custom('x', always), CUSTOM],
    ['bigint', bigint(), BIGINT],
    ['date', date(), DATE],
    ['symbol', symbol(), TYPE],
    ['func', func(), TYPE],
    ['instanceOf', instanceOf(Date), INSTANCE],
    ['promise', promise(), INSTANCE],
    ['refine', refine(string(), always), REFINED],
    ['transform', transform(string(), upper), MAPPED],
  ];

  it.each(CORE)('%s is one of the eight kinds issues and parse read themselves, and carries none', (_, schema) => {
    expect(schema.own).toBeNull();
  });

  it.each(CARRIED)('%s carries a frozen pair of functions, one for each', (_, schema, pair) => {
    expect(schema.own).toBe(pair);
    expect(Object.isFrozen(pair)).toBe(true);
    expect(Object.keys(pair)).toEqual(['issues', 'fill']);
    expect([typeof pair.issues, typeof pair.fill]).toEqual(['function', 'function']);
  });

  // A reader on a node must not bring `issues` or `parse` with it: a program that only calls `check` would then carry both.
  it('imports neither issues nor parse, and marks each pair as free of side effects', () => {
    const source = readFileSync(`${import.meta.dirname}/own.ts`, 'utf8');
    expect(source).not.toMatch(/from '\.\/(?:issues|parse|emit|index)\.js'/u);
    const frozen = source.split('Object.freeze(').length - 1;
    expect(frozen).toBe(new Set(CARRIED.map(([, , pair]) => pair)).size);
    expect(source.split(': Own = /* @__PURE__ */ Object.freeze(').length - 1).toBe(frozen);
  });

  it('is what issues and parse run for the kind, whatever the node says its kind is', () => {
    const renamed = { ...union([string(), number()]), kind: 'string' } as unknown as AnySchema;
    expect(issues(renamed, 1)).toEqual([]);
    expect(issues(renamed, true).map((issue) => issue.keyword)).toEqual(['union']);
    expect(parse(renamed, true).ok).toBe(false);
    expect(parse({ ...transform(string(), upper), kind: 'number' } as unknown as AnySchema, 'a')).toEqual({ ok: true, value: 'A' });
  });

  it('is handed the walk to go further with, so a union inside a union still stops at the first issue of each member', () => {
    const schema = union([union([string({ min: 2 }), number()]), object({ a: union([literal(1), literal(2)]) })]);
    expect(issues(schema, { a: 3 })).toEqual([
      { path: '', keyword: 'union', message: 'expected a value one of 2 members accepts, got an object. fix: satisfy one of them; member 0 fails union at ""; member 1 fails union at "/a"' },
    ]);
    expect(check(schema, { a: 2 })).toBe(true);
  });
});

describe('a node that no builder makes', () => {
  it.each(READERS)('%s refuses a kind there is none of', (_, read, start) => {
    const node = { ...string(), kind: 'nope' } as unknown as AnySchema;
    expect(() => read(node)).toThrow(TypeError);
    expect(() => read(node)).toThrow(`${start}"nope"`);
    expect(() => read(node)).toThrow(FIX);
  });

  it.each(READERS)('%s refuses a kind every object inherits a member for', (_, read, start) => {
    for (const kind of ['constructor', 'toString', 'hasOwnProperty', '__proto__', 'valueOf']) {
      const node = { ...string(), kind } as unknown as AnySchema;
      expect(() => read(node)).toThrow(TypeError);
      expect(() => read(node)).toThrow(`${start}"${kind}"`);
      expect(() => read(node)).toThrow(FIX);
    }
  });

  it.each(READERS)('%s refuses a kind that is not a string, by its type and without running anything of it', (_, read, start) => {
    called.length = 0;
    for (const [kind, type] of [[odd, 'object'], [1, 'number'], [null, 'object'], [undefined, 'undefined'], [always, 'function']] as const) {
      const node = { ...string(), kind } as unknown as AnySchema;
      expect(() => read(node)).toThrow(TypeError);
      expect(() => read(node)).toThrow(start);
      expect(() => read(node)).toThrow(`a value of the type ${type}: `);
      expect(() => read(node)).toThrow(FIX);
    }
    expect(called).toEqual([]);
  });

  it.each(READERS.slice(0, 2))('%s refuses a kind that carries its own reading, on a node that does not', (_, read, start) => {
    const { own: _own, ...bare } = union([string()]);
    for (const node of [{ ...bare, own: null }, bare, { ...bare, own: undefined }]) {
      expect(() => read(node as unknown as AnySchema)).toThrow(TypeError);
      expect(() => read(node as unknown as AnySchema)).toThrow(`${start}"union": no builder makes it. fix: build the schema with the builders`);
    }
  });

  it('is refused where it stands inside a schema that is sound', () => {
    const bad = { ...string(), kind: 'constructor' } as unknown as AnySchema;
    const schema = object({ ok: string(), list: array(nullable(bad)) });
    expect(() => issues(schema, { ok: 'a', list: ['x'] })).toThrow('issues cannot read a node of the kind "constructor": no builder makes it. fix: build the schema with the builders');
    expect(() => parse(schema, { ok: 'a', list: ['x'] })).toThrow('parse cannot read a node of the kind "constructor": no builder makes it. fix: build the schema with the builders');
    expect(() => emit(schema)).toThrow('cannot emit a node of the kind "constructor": there is no such kind. fix: build the schema with the builders');
    // Nothing is read where nothing is reached: `null` is the nullable's own to answer.
    expect(issues(schema, { ok: 'a', list: [null] })).toEqual([]);
  });

  it('has its kind escaped by the emitter in saying so', () => {
    const node = { ...string(), kind: '</script>' } as unknown as AnySchema;
    expect(() => emit(node)).toThrow(`cannot emit a node of the kind ${escaped('</script>')}: there is no such kind.`);
  });
});

describe('a bound the emitter refuses', () => {
  it.each<[string, Record<string, unknown>, string]>([
    ['a string bound that is an object', { ...string(), min: odd }, 'cannot emit the bound a value of the type object: it is not a number. fix: build the schema with the builders, or give the node numeric bounds'],
    ['a number bound that is a function', { ...number(), max: always }, 'cannot emit the bound a value of the type function: it is not a number.'],
    ['a step that is a bigint', { ...number(), step: 2n }, 'cannot emit the bound a value of the type bigint: it is not a number.'],
    ['an array bound that is null', { ...array(string()), max: null }, 'cannot emit the bound a value of the type object: it is not a number.'],
    ['a string bound that is a string', { ...string(), max: '</script>' }, `cannot emit the bound ${escaped('</script>')}: it is not a number.`],
    ['a bigint bound that is an object', { ...bigint(), value: [odd, 1n] }, 'cannot emit the bound a value of the type object: it is not a bigint. fix: build the schema with `bigint({ min, max })`'],
    ['an upper bigint bound that is an object', { ...bigint(), value: [0n, odd] }, 'cannot emit the bound a value of the type object: it is not a bigint.'],
    ['a bigint bound that is a number', { ...bigint(), value: [0n, 1] }, 'cannot emit the bound a value of the type number: it is not a bigint.'],
  ])('is named by its type for %s, and nothing of it is run', (_, node, message) => {
    called.length = 0;
    expect(() => emit(node as unknown as AnySchema)).toThrow(TypeError);
    expect(() => emit(node as unknown as AnySchema)).toThrow(message);
    expect(called).toEqual([]);
  });
});
