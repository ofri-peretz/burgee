import { describe, expect, it } from 'vitest';

import { extend, keyof, partial, pick, readonly } from './derive.js';
import { email, url } from './formats.js';
import { type Finding, type JsonSchema, toJsonSchema } from './json-schema.js';
import {
  annotate,
  any,
  type AnySchema,
  array,
  bigint,
  boolean,
  custom,
  date,
  discriminated,
  discriminatedBy,
  enumOf,
  exactOptional,
  func,
  instanceOf,
  intersection,
  lazy,
  literal,
  nativeEnum,
  never,
  nullable,
  nullish,
  number,
  object,
  optional,
  promise,
  record,
  recordOf,
  refine,
  type Schema,
  string,
  symbol,
  transform,
  tuple,
  undefinedOf,
  union,
  unknown,
} from './schema.js';

/**
 * Wave 2, group 7: a node as a JSON Schema document, with a finding for everything the document
 * cannot say (spec.md R10, intent.md Z10).
 */

const D2020 = 'https://json-schema.org/draft/2020-12/schema';
const D07 = 'http://json-schema.org/draft-07/schema#';

const EMAIL = /^[^@\s]+@[^@\s]+\.[a-z]+$/u;
const ZIP = /^\d{5}$/u;

const Item = object({ sku: string({ min: 1, max: 32 }), qty: number({ int: true, min: 1 }), price: number({ min: 0 }) });
const Order = object({
  id: string({ min: 1 }),
  email: string({ pattern: EMAIL }),
  age: optional(number({ int: true, min: 0, max: 150 })),
  role: enumOf(['admin', 'user', 'guest']),
  active: boolean(),
  tags: array(string(), { max: 10 }),
  address: object({ street: string(), city: string(), zip: string({ pattern: ZIP }) }),
  items: array(Item, { min: 1 }),
  spare: array(Item),
  payment: discriminated('kind', {
    card: object({ kind: literal('card'), last4: string({ length: 4 }) }),
    bank: object({ kind: literal('bank'), iban: string({ min: 15, max: 34 }) }),
  }),
});

const ITEM = {
  type: 'object',
  properties: { sku: { type: 'string', minLength: 1, maxLength: 32 }, qty: { type: 'integer', minimum: 1 }, price: { type: 'number', minimum: 0 } },
  required: ['sku', 'qty', 'price'],
};

/** The document without its `$schema`, and the findings as `[path, keyword]`. */
const written = (schema: AnySchema, draft?: '2020-12' | 'draft-07'): [JsonSchema, [string, string][]] => {
  const { schema: document, findings } = toJsonSchema(schema, draft === undefined ? {} : { draft });
  const { $schema: _, ...rest } = document;
  return [rest, findings.map((finding) => [finding.path, finding.keyword])];
};

/** The document without its `$schema`, and the findings whole. */
const one = (schema: AnySchema): [JsonSchema, Finding[]] => {
  const { schema: document, findings } = toJsonSchema(schema);
  const { $schema: _, ...rest } = document;
  return [rest, findings];
};

/** A case of a union on `k`, beside the schema that pins its tag to `a`. */
const pinned = (inner: JsonSchema): JsonSchema => ({ allOf: [{ type: 'object', properties: { k: { const: 'a' } }, required: ['k'] }, inner] });

const isOne = (value: unknown): boolean => value === 1;
const isE = (text: string): boolean => text === 'e';
const always = (): boolean => true;
const lengthOf = (text: string): number => text.length;
const called: string[] = [];
const spy = (name: string) => (): boolean => {
  called.push(name);
  return true;
};

interface Tree {
  v: number;
  kids: Tree[];
}
const TreeSchema: Schema<Tree> = object({ v: number(), kids: array(lazy(() => TreeSchema)) });
const TREE = { type: 'object', properties: { v: { type: 'number' }, kids: { type: 'array', items: { $ref: '#/$defs/s0' } } }, required: ['v', 'kids'] };

interface Left {
  b: Right[];
}
interface Right {
  a?: Left | undefined;
}
const LeftSchema: Schema<Left> = object({ b: array(lazy(() => RightSchema)) });
const RightSchema: Schema<Right> = object({ a: optional(LeftSchema) });

const Level = { Low: 0, High: 1, 0: 'Low', 1: 'High' } as const;

describe('toJsonSchema', () => {
  it('io.json_schema_export: writes the order schema as a 2020-12 document, with nothing lost', () => {
    const { schema, findings } = toJsonSchema(Order);
    expect(findings).toEqual([]);
    expect(schema).toEqual({
      $schema: D2020,
      type: 'object',
      properties: {
        id: { type: 'string', minLength: 1 },
        email: { type: 'string', pattern: EMAIL.source },
        age: { type: 'integer', minimum: 0, maximum: 150 },
        role: { enum: ['admin', 'user', 'guest'] },
        active: { type: 'boolean' },
        tags: { type: 'array', items: { type: 'string' }, maxItems: 10 },
        address: { type: 'object', properties: { street: { type: 'string' }, city: { type: 'string' }, zip: { type: 'string', pattern: ZIP.source } }, required: ['street', 'city', 'zip'] },
        items: { type: 'array', items: ITEM, minItems: 1 },
        spare: { type: 'array', items: ITEM },
        payment: {
          oneOf: [
            { type: 'object', properties: { kind: { const: 'card' }, last4: { type: 'string', minLength: 4, maxLength: 4 } }, required: ['kind', 'last4'] },
            { type: 'object', properties: { kind: { const: 'bank' }, iban: { type: 'string', minLength: 15, maxLength: 34 } }, required: ['kind', 'iban'] },
          ],
        },
      },
      required: ['id', 'email', 'role', 'active', 'tags', 'address', 'items', 'spare', 'payment'],
    });
    // Plain data, which JSON can carry as it is.
    expect(JSON.parse(JSON.stringify(schema))).toEqual(schema);
  });

  it('io.draft_07: writes the same document under the other dialect when asked', () => {
    expect(toJsonSchema(Order, { draft: 'draft-07' }).schema).toEqual({ ...toJsonSchema(Order).schema, $schema: D07 });
    expect(toJsonSchema(string(), { draft: '2020-12' }).schema).toEqual({ $schema: D2020, type: 'string' });
    expect(toJsonSchema(string(), {}).schema).toEqual({ $schema: D2020, type: 'string' });
    // No keyword is written with nothing under it.
    expect(toJsonSchema(string()).schema).toStrictEqual({ type: 'string', $schema: D2020 });
    expect(toJsonSchema(object({ n: number(), list: array(boolean()), t: tuple([literal(1)]) })).schema).toStrictEqual({
      type: 'object',
      properties: { n: { type: 'number' }, list: { type: 'array', items: { type: 'boolean' } }, t: { type: 'array', prefixItems: [{ const: 1 }], items: false, minItems: 1 } },
      required: ['n', 'list', 't'],
      $schema: D2020,
    });
  });

  // One row for every kind and every keyword a kind writes: [what, the schema, the document, the findings].
  it.each<[string, AnySchema, JsonSchema, [string, string][]]>([
    ['a string with no bounds', string(), { type: 'string' }, []],
    ['a string with every bound', string({ min: 2, max: 5 }), { type: 'string', minLength: 2, maxLength: 5 }, []],
    ['a string of no characters at most', string({ max: 0 }), { type: 'string', maxLength: 0 }, []],
    ['a pattern', string({ pattern: /^a$/u }), { type: 'string', pattern: '^a$' }, []],
    ['a pattern with no flag, and with the d flag', object({ a: string({ pattern: /^a$/ }), b: string({ pattern: /^b$/d }) }), { type: 'object', properties: { a: { type: 'string', pattern: '^a$' }, b: { type: 'string', pattern: '^b$' } }, required: ['a', 'b'] }, []],
    ['a format that is a pattern', string({ format: email }), { type: 'string', pattern: email.pattern.source }, []],
    ['a pattern and a format that is one', string({ pattern: /^a/u, format: { name: 'z', pattern: /z$/u } }), { type: 'string', allOf: [{ pattern: '^a' }, { pattern: 'z$' }] }, []],
    ['a number with no bounds', number(), { type: 'number' }, []],
    ['a number with every bound', number({ min: -1, max: 9, gt: -2, lt: 10, multipleOf: 3 }), { type: 'number', minimum: -1, maximum: 9, exclusiveMinimum: -2, exclusiveMaximum: 10, multipleOf: 3 }, []],
    ['a number between zeros', number({ min: 0, max: 0 }), { type: 'number', minimum: 0, maximum: 0 }, []],
    ['a positive and a negative number', tuple([number({ positive: true }), number({ negative: true })]), { type: 'array', prefixItems: [{ type: 'number', exclusiveMinimum: 0 }, { type: 'number', exclusiveMaximum: 0 }], items: false, minItems: 2 }, []],
    ['an integer', number({ int: true }), { type: 'integer' }, []],
    ['a boolean', boolean(), { type: 'boolean' }, []],
    ['null', literal(null), { const: null }, []],
    ['a literal string, number and boolean', tuple([literal('a'), literal(0), literal(false), literal('')]), { type: 'array', prefixItems: [{ const: 'a' }, { const: 0 }, { const: false }, { const: '' }], items: false, minItems: 4 }, []],
    ['an enum', enumOf(['a', 1]), { enum: ['a', 1] }, []],
    ['an empty enum', enumOf([]), { enum: [] }, []],
    ['a native enum', nativeEnum(Level), { enum: [0, 1] }, []],
    ['an array with no bounds', array(number()), { type: 'array', items: { type: 'number' } }, []],
    ['an array with both bounds', array(number(), { min: 1, max: 3 }), { type: 'array', items: { type: 'number' }, minItems: 1, maxItems: 3 }, []],
    ['an array that must be empty', array(number(), { max: 0 }), { type: 'array', items: { type: 'number' }, maxItems: 0 }, []],
    ['a tuple', tuple([string(), number()]), { type: 'array', prefixItems: [{ type: 'string' }, { type: 'number' }], items: false, minItems: 2 }, []],
    ['a tuple with a rest', tuple([string()], { rest: number() }), { type: 'array', prefixItems: [{ type: 'string' }], items: { type: 'number' }, minItems: 1 }, []],
    ['a tuple of nothing', tuple([]), { type: 'array', maxItems: 0 }, []],
    ['a tuple of nothing but a rest', tuple([], { rest: number() }), { type: 'array', items: { type: 'number' } }, []],
    ['an object with no keys', object({}), { type: 'object', properties: {} }, []],
    ['an object with only optional keys', object({ a: optional(string()), b: exactOptional(number()), c: nullish(boolean()) }), { type: 'object', properties: { a: { type: 'string' }, b: { type: 'number' }, c: { anyOf: [{ type: 'boolean' }, { type: 'null' }] } } }, []],
    ['a strict object', object({ a: string() }, { unknown: 'strict' }), { type: 'object', properties: { a: { type: 'string' } }, required: ['a'], additionalProperties: false }, []],
    ['an object with a schema for the rest', object({ a: string() }, { unknown: number() }), { type: 'object', properties: { a: { type: 'string' } }, required: ['a'], additionalProperties: { type: 'number' } }, []],
    ['an object that keeps the rest', object({ a: string() }, { unknown: 'keep' }), { type: 'object', properties: { a: { type: 'string' } }, required: ['a'] }, []],
    ['a key named __proto__', object({ ['__proto__']: string() }), { type: 'object', properties: Object.fromEntries([['__proto__', { type: 'string' }]]), required: ['__proto__'] }, []],
    ['a record', record(number()), { type: 'object', additionalProperties: { type: 'number' } }, []],
    ['a record with a schema for its keys', record(number(), { key: enumOf(['a', 'b']) }), { type: 'object', propertyNames: { enum: ['a', 'b'] }, additionalProperties: { type: 'number' } }, []],
    ['a record of every one of its keys', recordOf(['a', 'b'], number()), { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } }, required: ['a', 'b'], additionalProperties: false }, []],
    ['unknown', unknown(), {}, []],
    ['any', any(), {}, []],
    ['never', never(), { not: {} }, []],
    ['nullable', nullable(string()), { anyOf: [{ type: 'string' }, { type: 'null' }] }, []],
    ['nullish', nullish(string()), { anyOf: [{ type: 'string' }, { type: 'null' }] }, []],
    ['a union', union([string(), number()]), { anyOf: [{ type: 'string' }, { type: 'number' }] }, []],
    ['a union of nothing', union([]), { not: {} }, []],
    ['an intersection', intersection([object({ a: string() }), object({ b: number() })]), { allOf: [{ type: 'object', properties: { a: { type: 'string' } }, required: ['a'] }, { type: 'object', properties: { b: { type: 'number' } }, required: ['b'] }] }, []],
    ['an intersection of nothing', intersection([]), {}, []],
    ['a discriminated union of nothing', discriminated('k', {}), { not: {} }, []],
    ['a discriminated union by a number and a boolean', discriminatedBy('t', [object({ t: literal(1), n: number() }), object({ t: literal(true) })]), {
      oneOf: [
        { type: 'object', properties: { t: { const: 1 }, n: { type: 'number' } }, required: ['t', 'n'] },
        { type: 'object', properties: { t: { const: true } }, required: ['t'] },
      ],
    }, []],
    ['a schema made from an object schema', readonly(partial(pick(extend(object({ a: string(), b: number() }, { unknown: 'strict' }), { c: boolean() }), ['a', 'c']))), { type: 'object', properties: { a: { type: 'string' }, c: { type: 'boolean' } }, additionalProperties: false }, []],
    ['the keys of an object schema', keyof(object({ a: string(), b: number() })), { enum: ['a', 'b'] }, []],
  ])('writes %s', (_, schema, document, findings) => {
    expect(written(schema)).toEqual([document, findings]);
  });

  // A case that does not say in its own shape what its tag is, is written beside the schema that says it.
  it('pins the tag of a discriminated case that does not pin it itself', () => {
    const cases: [string, AnySchema, JsonSchema][] = [
      ['a case with no such key', object({ v: string() }), { type: 'object', properties: { v: { type: 'string' } }, required: ['v'] }],
      ['a case whose key is no literal', object({ k: string() }), { type: 'object', properties: { k: { type: 'string' } }, required: ['k'] }],
      ['a case whose literal is another value', object({ k: literal('b') }), { type: 'object', properties: { k: { const: 'b' } }, required: ['k'] }],
      ['a case whose key is optional', object({ k: optional(literal('a')) }), { type: 'object', properties: { k: { const: 'a' } } }],
      ['a case that is no object', unknown(), {}],
      ['a case that is a tuple of the literal', tuple([literal('a'), literal('a')]), { type: 'array', prefixItems: [{ const: 'a' }, { const: 'a' }], items: false, minItems: 2 }],
      ['a case that is another union on another key', discriminated('j', { x: object({ j: literal('x') }) }), { oneOf: [{ type: 'object', properties: { j: { const: 'x' } }, required: ['j'] }] }],
    ];
    for (const [what, one, document] of cases) expect(written(discriminated('k', { a: one }))[0], what).toEqual({ oneOf: [pinned(document)] });
    expect(written(discriminated('k', { a: object({ z: string(), k: literal('a') }) }))[0]).toEqual({ oneOf: [{ type: 'object', properties: { z: { type: 'string' }, k: { const: 'a' } }, required: ['z', 'k'] }] });
  });

  it('writes a tuple as draft-07 writes one', () => {
    expect(written(tuple([string(), number()]), 'draft-07')[0]).toEqual({ type: 'array', items: [{ type: 'string' }, { type: 'number' }], additionalItems: false, minItems: 2 });
    expect(written(tuple([string()], { rest: number() }), 'draft-07')[0]).toEqual({ type: 'array', items: [{ type: 'string' }], additionalItems: { type: 'number' }, minItems: 1 });
    expect(written(tuple([]), 'draft-07')[0]).toEqual({ type: 'array', maxItems: 0 });
    expect(written(tuple([], { rest: number() }), 'draft-07')[0]).toEqual({ type: 'array', items: { type: 'number' } });
  });

  describe('a schema that names itself', () => {
    it('is a reference to a schema written once, under a name', () => {
      expect(toJsonSchema(TreeSchema)).toEqual({ schema: { $schema: D2020, ...TREE, $defs: { s0: TREE } }, findings: [] });
      const seven = { ...TREE, properties: { ...TREE.properties, kids: { type: 'array', items: { $ref: '#/definitions/s0' } } } };
      expect(toJsonSchema(TreeSchema, { draft: 'draft-07' }).schema).toEqual({ $schema: D07, ...seven, definitions: { s0: seven } });
    });

    it('names each schema that is pointed at once, however often, and two schemas with two names', () => {
      const one = lazy(() => string());
      const target = number();
      const pair = tuple([lazy(() => target), one, lazy(() => target), one]);
      expect(toJsonSchema(pair).schema).toEqual({
        $schema: D2020,
        type: 'array',
        prefixItems: [{ $ref: '#/$defs/s0' }, { $ref: '#/$defs/s1' }, { $ref: '#/$defs/s0' }, { $ref: '#/$defs/s2' }],
        items: false,
        minItems: 4,
        $defs: { s0: { type: 'number' }, s1: { type: 'string' }, s2: { type: 'string' } },
      });
      const left = { type: 'object', properties: { b: { type: 'array', items: { $ref: '#/$defs/s0' } } }, required: ['b'] };
      expect(toJsonSchema(LeftSchema).schema).toEqual({ $schema: D2020, ...left, $defs: { s0: { type: 'object', properties: { a: left } } } });
    });

    it('at the root is a reference beside its definitions, which draft-07 needs under allOf', () => {
      const root = lazy(() => TreeSchema);
      expect(toJsonSchema(root).schema).toEqual({ $ref: '#/$defs/s0', $schema: D2020, $defs: { s0: TREE } });
      const seven = toJsonSchema(root, { draft: 'draft-07' }).schema;
      expect(Object.keys(seven).toSorted()).toEqual(['$schema', 'allOf', 'definitions']);
      expect(seven.allOf).toEqual([{ $ref: '#/definitions/s0' }]);
    });

    it('reports a finding inside it where the shared schema is written', () => {
      const Loop: Schema<unknown> = object({ next: optional(lazy(() => Loop)), at: date() });
      expect(written(Loop)[1]).toEqual([
        ['/$defs/s0/properties/at', 'not-json'],
        ['/properties/at', 'not-json'],
      ]);
      expect(written(Loop, 'draft-07')[1]).toEqual([
        ['/definitions/s0/properties/at', 'not-json'],
        ['/properties/at', 'not-json'],
      ]);
    });
  });

  describe('what a schema says about itself', () => {
    it('is written as title, description, examples and default', () => {
      const schema = annotate(optional(string(), { default: 'd' }), { title: 't', description: 'about', examples: ['a', 'b'] });
      expect(written(schema)).toEqual([{ type: 'string', title: 't', description: 'about', examples: ['a', 'b'], default: 'd' }, []]);
      expect(written(annotate(string(), { title: 't' }))).toEqual([{ type: 'string', title: 't' }, []]);
      expect(written(annotate(string(), { description: '' }))).toEqual([{ type: 'string', description: '' }, []]);
      expect(written(object({ a: optional(number(), { default: 0 }), b: optional(boolean(), { default: false }), c: optional(nullable(string()), { default: null }) }))[0]).toEqual({
        type: 'object',
        properties: { a: { type: 'number', default: 0 }, b: { type: 'boolean', default: false }, c: { anyOf: [{ type: 'string' }, { type: 'null' }], default: null } },
      });
    });

    it('is copied as data: an object or an array of a default or an example, all the way down', () => {
      const fallback = { list: [1, { deep: null }], on: true, none: Object.create(null) as object };
      const { schema } = toJsonSchema(optional(unknown(), { default: fallback }));
      expect(schema.default).toEqual({ list: [1, { deep: null }], on: true, none: {} });
      expect(schema.default).not.toBe(fallback);
      expect((schema.default as typeof fallback).list).not.toBe(fallback.list);
      expect(written(annotate(unknown(), { examples: [[], {}, [[0]]] }))[0]).toEqual({ examples: [[], {}, [[0]]] });
    });

    it.each<[string, unknown]>([
      ['a Date', new Date(0)],
      ['a Map', new Map()],
      ['a function', always],
      ['a bigint', 1n],
      ['a symbol', Symbol('s')],
      ['NaN', Number.NaN],
      ['an infinity', Number.NEGATIVE_INFINITY],
      ['an object that holds undefined', { a: undefined }],
      ['an array that holds one deep down', [[{ a: [1n] }]]],
      ['an array with a hole', [1, , 3]],
      ['an array of holes only', Array.from({ length: 2 })],
      ['an instance of a class', new (class Named {})()],
    ])('leaves out a default that is %s, with a finding', (_, value) => {
      expect(written(optional(unknown(), { default: value }))).toEqual([{}, [['', 'default']]]);
      expect(written(annotate(unknown(), { examples: [value] }))).toEqual([{}, [['', 'meta']]]);
    });

    it('says which annotation it left out, and where', () => {
      const schema = object({ a: annotate(optional(string(), { default: 1n as unknown as string }), { title: 't', examples: [always] }) });
      expect(toJsonSchema(schema)).toEqual({
        schema: { $schema: D2020, type: 'object', properties: { a: { type: 'string', title: 't' } } },
        findings: [
          { path: '/properties/a', keyword: 'meta', message: 'the examples is not JSON data, and is left out' },
          { path: '/properties/a', keyword: 'default', message: 'the default is not JSON data, and is left out' },
        ],
      });
      const node = { ...string(), meta: { title: 1n, description: always } } as unknown as AnySchema;
      expect(toJsonSchema(node).findings).toEqual([
        { path: '', keyword: 'meta', message: 'the title is not JSON data, and is left out' },
        { path: '', keyword: 'meta', message: 'the description is not JSON data, and is left out' },
      ]);
    });

    it('refuses a default that holds itself, and one that is held twice is written twice', () => {
      const cyclic: Record<string, unknown> = { a: 1 };
      cyclic.self = cyclic;
      expect(written(optional(unknown(), { default: cyclic }))).toEqual([{}, [['', 'default']]]);
      const list: unknown[] = [];
      list.push([list]);
      expect(written(optional(unknown(), { default: list }))).toEqual([{}, [['', 'default']]]);
      const shared = { x: 1 };
      expect(written(optional(unknown(), { default: [shared, shared, { again: shared }] }))).toEqual([{ default: [{ x: 1 }, { x: 1 }, { again: { x: 1 } }] }, []]);
    });

    it('runs nothing of a default: no getter, no toJSON, and a member that is not enumerable is no member', () => {
      const ran: string[] = [];
      const getter = Object.defineProperty({ plain: 1 }, 'computed', {
        enumerable: true,
        get: () => {
          ran.push('getter');
          return 1;
        },
      });
      expect(written(optional(unknown(), { default: getter }))).toEqual([{}, [['', 'default']]]);
      const toJson = {
        a: 1,
        toJSON: () => {
          ran.push('toJSON');
          return 'other';
        },
      };
      expect(written(optional(unknown(), { default: toJson }))).toEqual([{}, [['', 'default']]]);
      const hidden = Object.defineProperty({ shown: 1 }, 'hidden', { enumerable: false, value: always });
      expect(written(optional(unknown(), { default: hidden }))).toEqual([{ default: { shown: 1 } }, []]);
      const listed = Object.defineProperty([1, 2], 'extra', { enumerable: false, value: 3 });
      expect(written(optional(unknown(), { default: listed }))).toEqual([{ default: [1, 2] }, []]);
      const named = Object.assign([1], { extra: 2 });
      expect(written(optional(unknown(), { default: named }))).toEqual([{}, [['', 'default']]]);
      expect(ran).toEqual([]);
    });

    it('beside a reference is a sibling in 2020-12 and under allOf in draft-07, where a reference silences its siblings', () => {
      const titled = annotate(lazy(() => string()), { title: 't' });
      expect(written(titled)[0]).toEqual({ $ref: '#/$defs/s0', title: 't', $defs: { s0: { type: 'string' } } });
      expect(written(object({ a: titled }), 'draft-07')[0]).toEqual({
        type: 'object',
        properties: { a: { allOf: [{ $ref: '#/definitions/s0' }], title: 't' } },
        required: ['a'],
        definitions: { s0: { type: 'string' } },
      });
      // A reference with nothing beside it stays a reference.
      expect(written(object({ a: lazy(() => string()) }), 'draft-07')[0]).toEqual({ type: 'object', properties: { a: { $ref: '#/definitions/s0' } }, required: ['a'], definitions: { s0: { type: 'string' } } });
    });
  });

  // spec.md R10, intent.md Z10: never dropped silently.
  describe('what JSON Schema cannot say is a finding, with where and why', () => {
    it.each<[string, AnySchema, JsonSchema, Finding]>([
      ['a bigint', bigint({ min: 1n }), { not: {} }, { path: '', keyword: 'not-json', message: 'a bigint is not a JSON value: the document accepts nothing here' }],
      ['a date', date(), { not: {} }, { path: '', keyword: 'not-json', message: 'a Date is not a JSON value: the document accepts nothing here' }],
      ['a symbol', symbol(), { not: {} }, { path: '', keyword: 'not-json', message: 'a symbol is not a JSON value: the document accepts nothing here' }],
      ['a function', func(), { not: {} }, { path: '', keyword: 'not-json', message: 'a function is not a JSON value: the document accepts nothing here' }],
      ['an instance', instanceOf(Map), { not: {} }, { path: '', keyword: 'not-json', message: 'an instance of a class is not a JSON value: the document accepts nothing here' }],
      ['a promise', promise(), { not: {} }, { path: '', keyword: 'not-json', message: 'an instance of a class is not a JSON value: the document accepts nothing here' }],
      ['undefined', undefinedOf(), { not: {} }, { path: '', keyword: 'not-json', message: 'the literal undefined is not a JSON value: the document accepts nothing here' }],
      ['a bigint literal', literal(5n), { not: {} }, { path: '', keyword: 'not-json', message: 'the literal 5n is not a JSON value: the document accepts nothing here' }],
      ['a literal that is not finite', literal(Number.NaN), { not: {} }, { path: '', keyword: 'not-json', message: 'the literal NaN is not a JSON value: the document accepts nothing here' }],
      ['a custom type', custom('one', isOne), {}, { path: '', keyword: 'custom', message: 'the custom type "one" is a function, which JSON Schema cannot carry: the document accepts any value here' }],
      ['a refinement', refine(number(), always), { type: 'number' }, { path: '', keyword: 'refine', message: 'the rule "a value the rule accepts" is a function, which JSON Schema cannot carry: the document has the schema without it' }],
      ['a refinement with a path', refine(object({ 'a/b': string() }), always, { path: ['a/b', 0], message: 'm' }), { type: 'object', properties: { 'a/b': { type: 'string' } }, required: ['a/b'] }, { path: '', keyword: 'refine', message: 'the rule "m", reported at /a~1b/0, is a function, which JSON Schema cannot carry: the document has the schema without it' }],
      ['a transform', transform(string(), lengthOf), { type: 'string' }, { path: '', keyword: 'transform', message: 'the transform is a function, which JSON Schema cannot carry: the document describes what goes in, not what parse hands out' }],
      ['a format that is a function', string({ format: url }), { type: 'string', format: 'url' }, { path: '', keyword: 'format', message: 'the format "url" is a function, which JSON Schema cannot carry: the document names it, and a validator that does not know the name will not check it' }],
      ['a pattern with a flag', string({ pattern: /^a$/imsu }), { type: 'string', pattern: '^a$' }, { path: '', keyword: 'pattern', message: 'the pattern "^a$" has the flags "ims", which JSON Schema cannot carry: the document has the pattern without them' }],
      ['a format whose pattern has a flag', string({ format: { name: 'f', pattern: /^a$/i } }), { type: 'string', pattern: '^a$' }, { path: '', keyword: 'pattern', message: 'the pattern "^a$" has the flags "i", which JSON Schema cannot carry: the document has the pattern without them' }],
      ['a number that coerces', number({ coerce: true }), { type: 'number' }, { path: '', keyword: 'coerce', message: 'parse reads this value from a string, and JSON Schema has no coercion: the document describes the value after it is read' }],
      ['a boolean that coerces', boolean({ coerce: true }), { type: 'boolean' }, { path: '', keyword: 'coerce', message: 'parse reads this value from a string, and JSON Schema has no coercion: the document describes the value after it is read' }],
      ['a multiple of a fraction', number({ multipleOf: 0.1 }), { type: 'number', multipleOf: 0.1 }, { path: '', keyword: 'multipleOf', message: 'a multiple of 0.1 is read here within one rounding error, so that 0.3 is a multiple of 0.1; a validator that tests the bare remainder refuses it' }],
      ['an object that strips', object({ a: string() }, { unknown: 'strip' }), { type: 'object', properties: { a: { type: 'string' } }, required: ['a'] }, { path: '', keyword: 'strip', message: 'parse leaves out the keys this object does not name, and JSON Schema has no such thing: the document allows them, as check does' }],
    ])('%s', (_, schema, document, finding) => {
      expect(one(schema)).toEqual([document, [finding]]);
    });

    it('a date that coerces is two findings: no JSON value, and no coercion', () => {
      expect(written(date({ coerce: true }))).toEqual([{ not: {} }, [['', 'not-json']]]);
    });

    it('an enum member or a tag that is no JSON value is left out, and counted', () => {
      const members = { ...enumOf(['a']), values: new Set(['a', undefined, 1n, Number.NaN, null, true, always]) } as unknown as AnySchema;
      expect(one(members)).toEqual([{ enum: ['a', null, true] }, [{ path: '', keyword: 'enum', message: "4 of the enum's members are not JSON values, and are left out" }]]);
      const tags = { ...discriminated('k', {}), cases: new Map<unknown, AnySchema>([[1n, object({})], ['a', object({ k: literal('a') })], [Number.NaN, object({})], [null, object({})]]) } as unknown as AnySchema;
      expect(one(tags)).toEqual([
        { oneOf: [{ type: 'object', properties: { k: { const: 'a' } }, required: ['k'] }] },
        [
          { path: '', keyword: 'tag', message: 'the case under the tag 1n is left out: that tag is not a JSON value' },
          { path: '', keyword: 'tag', message: 'the case under the tag NaN is left out: that tag is not a JSON value' },
          { path: '', keyword: 'tag', message: 'the case under the tag null is left out: that tag is not a JSON value' },
        ],
      ]);
    });

    it('is reported where in the document the node stands, each key a reference token', () => {
      const schema = object(
        {
          'a/b': array(date()),
          'c~d': tuple([string(), bigint()], { rest: symbol() }),
          r: record(custom('x', isOne), { key: string({ format: url }) }),
          u: union([string(), refine(number(), always)]),
          i: intersection([unknown(), transform(string(), lengthOf)]),
          n: nullable(date()),
          q: nullish(date()),
          d: discriminated('k', { a: object({ k: literal('a'), at: date() }), b: object({ at: date() }) }),
        },
        { unknown: date() },
      );
      expect(written(schema)[1]).toEqual([
        ['/properties/a~1b/items', 'not-json'],
        ['/properties/c~0d/prefixItems/1', 'not-json'],
        ['/properties/c~0d/items', 'not-json'],
        ['/properties/r/propertyNames', 'format'],
        ['/properties/r/additionalProperties', 'custom'],
        ['/properties/u/anyOf/1', 'refine'],
        ['/properties/i/allOf/1', 'transform'],
        ['/properties/n/anyOf/0', 'not-json'],
        ['/properties/q/anyOf/0', 'not-json'],
        ['/properties/d/oneOf/0/properties/at', 'not-json'],
        ['/properties/d/oneOf/1/allOf/1/properties/at', 'not-json'],
        ['/additionalProperties', 'not-json'],
      ]);
      expect(written(tuple([date()], { rest: date() }), 'draft-07')[1]).toEqual([
        ['/items/0', 'not-json'],
        ['/additionalItems', 'not-json'],
      ]);
      expect(written(tuple([], { rest: date() }))[1]).toEqual([['/items', 'not-json']]);
    });

    it('is every one of them: a schema of all that is lost has a finding for each, and a document all the same', () => {
      const lossy = object({ a: refine(transform(custom<string>('c', always), lengthOf), always), b: optional(date(), { default: new Date(0) }) }, { unknown: 'strip' });
      expect(written(lossy)).toEqual([
        { type: 'object', properties: { a: {}, b: { not: {} } }, required: ['a'] },
        [
          ['', 'strip'],
          ['/properties/a', 'refine'],
          ['/properties/a', 'transform'],
          ['/properties/a', 'custom'],
          ['/properties/b', 'not-json'],
          ['/properties/b', 'default'],
        ],
      ]);
    });
  });

  it('runs no function a schema carries but the one a lazy schema names itself by', () => {
    called.length = 0;
    const schema = object({
      c: custom('c', spy('custom')),
      r: refine(string(), spy('refine')),
      t: transform(string(), spy('transform')),
      f: string({ format: { name: 'f', test: spy('format') } }),
      l: lazy(() => {
        called.push('lazy');
        return string();
      }),
    });
    expect(toJsonSchema(schema).findings.map((finding) => finding.keyword)).toEqual(['custom', 'refine', 'transform', 'format']);
    expect(called).toEqual(['lazy']);
    expect(isE('e')).toBe(true);
  });

  // A node is data, and may be built by hand or read from somewhere: it is refused whole, never half written.
  describe('a node that no builder makes', () => {
    const odd = { toString: spy('toString') };

    it.each<[string, Record<string, unknown>, string]>([
      ['a kind there is none of', { ...string(), kind: 'nope' }, 'cannot export a node of the kind "nope": there is no such kind. fix: build the schema with the builders'],
      ['a kind every object inherits a member for', { ...string(), kind: 'constructor' }, 'cannot export a node of the kind "constructor": there is no such kind. fix: build the schema with the builders'],
      ['a kind that is an object', { ...string(), kind: odd }, 'cannot export a node of the kind a value of the type object: there is no such kind. fix: build the schema with the builders'],
      ['a string bound that is no number', { ...string(), min: '1' }, 'cannot export the bound "1": it is not a number. fix: build the schema with the builders, or give the node numeric bounds'],
      ['an upper string bound that is none', { ...string(), max: 1n }, 'cannot export the bound 1n: it is not a number.'],
      ['a number bound that is none', { ...number(), min: odd }, 'cannot export the bound a value of the type object: it is not a number.'],
      ['an upper number bound that is none', { ...number(), max: always }, 'cannot export the bound a value of the type function: it is not a number.'],
      ['an exclusive bound that is none', { ...number(), above: '0' }, 'cannot export the bound "0": it is not a number.'],
      ['an upper exclusive bound that is none', { ...number(), below: null }, 'cannot export the bound null: it is not a number.'],
      ['a step that is none', { ...number(), step: '2' }, 'cannot export the bound "2": it is not a number.'],
      ['an array bound that is none', { ...array(string()), min: '1' }, 'cannot export the bound "1": it is not a number.'],
      ['an upper array bound that is none', { ...array(string()), max: undefined }, 'cannot export the bound undefined: it is not a number.'],
      ['a pattern that is no RegExp', { ...string(), pattern: { source: 'x', flags: '' } }, 'cannot export a pattern that is not a RegExp. fix: build the schema with `string({ pattern })`'],
      ['a format whose pattern is none', { ...string(), rule: { name: 'x', pattern: 'x', test: null } }, 'cannot export a pattern that is not a RegExp.'],
      ['a format whose name is no string', { ...string(), rule: { name: odd, pattern: null, test: always } }, 'cannot export the key or name a value of the type object: it is not a string. fix: build the schema with the builders'],
      ['a key that is no string', { ...object({ a: string() }), keys: [odd] }, 'cannot export the key or name a value of the type object: it is not a string.'],
      ['a tag that is no string', { ...discriminated('k', {}), tag: 1 }, 'cannot export the key or name 1: it is not a string.'],
      ['a refinement whose path is no string', { ...refine(string(), always), keys: [Symbol('s')] }, 'cannot export the key or name Symbol(s): it is not a string.'],
      ['a type that is no name', { ...symbol(), value: odd }, 'cannot export the key or name a value of the type object: it is not a string.'],
    ])('is refused for %s, with what to do', (_, node, message) => {
      called.length = 0;
      expect(() => toJsonSchema(node as unknown as AnySchema)).toThrow(TypeError);
      expect(() => toJsonSchema(node as unknown as AnySchema)).toThrow(message);
      expect(called).toEqual([]);
    });

    it('is refused where it stands inside a schema that is sound, and nothing comes back', () => {
      const node = object({ ok: string(), bad: { ...number(), min: '0' } as unknown as AnySchema });
      expect(() => toJsonSchema(node)).toThrow('cannot export the bound "0": it is not a number.');
    });

    it.each<[string, Record<string, unknown>, string]>([
      ['an object with no fields', { ...object({ a: string() }), fields: null }, 'cannot export this schema to JSON Schema: a node in it is not what a builder makes ('],
      ['an array with no element', { ...array(string()), item: null }, 'cannot export this schema to JSON Schema: a node in it is not what a builder makes ('],
      ['a lazy schema that names nothing', { ...lazy(() => string()), get: null }, ' is not a function). fix: build the schema with the builders'],
      ['an enum with no members', { ...enumOf(['a']), values: null }, ' is not iterable). fix: build the schema with the builders'],
    ])('is refused for %s, with what went wrong and what to do', (_, node, message) => {
      const run = (): unknown => toJsonSchema(node as unknown as AnySchema);
      expect(run).toThrow(TypeError);
      expect(run).toThrow(message);
      expect(run).toThrow(/ fix: build the schema with the builders$/u);
      let thrown: unknown;
      try {
        run();
      } catch (error) {
        thrown = error;
      }
      expect((thrown as Error).cause).toBeInstanceOf(TypeError);
    });

    it('is refused when what goes wrong is no error at all, and says what was thrown', () => {
      const thrower = lazy(() => {
        throw 'a string';
      });
      expect(() => toJsonSchema(thrower)).toThrow('cannot export this schema to JSON Schema: a node in it is not what a builder makes ("a string"). fix: build the schema with the builders');
      const own = lazy(() => {
        throw new TypeError('the schema is not ready. fix: build it first');
      });
      expect(() => toJsonSchema(own)).toThrow(/^the schema is not ready\. fix: build it first$/u);
      const range = lazy(() => {
        throw new RangeError('too deep. fix: none');
      });
      expect(() => toJsonSchema(range)).toThrow('a node in it is not what a builder makes (too deep. fix: none). fix: build the schema with the builders');
      const plain = lazy(() => {
        throw new TypeError('no fix line here');
      });
      expect(() => toJsonSchema(plain)).toThrow('a node in it is not what a builder makes (no fix line here). fix: build the schema with the builders');
    });

    it('is refused for a draft there is none of', () => {
      expect(() => toJsonSchema(string(), { draft: 'draft-04' as '2020-12' })).toThrow(TypeError);
      expect(() => toJsonSchema(string(), { draft: 'draft-04' as '2020-12' })).toThrow(`cannot export to the draft "draft-04". fix: ask for '2020-12' or 'draft-07'`);
      expect(() => toJsonSchema(string(), { draft: 'constructor' as '2020-12' })).toThrow('cannot export to the draft "constructor".');
      called.length = 0;
      expect(() => toJsonSchema(string(), { draft: { toString: spy('toString') } as unknown as '2020-12' })).toThrow('cannot export to the draft a value of the type object.');
      expect(called).toEqual([]);
    });
  });
});
