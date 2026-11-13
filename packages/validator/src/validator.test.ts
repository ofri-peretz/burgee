import { readFileSync } from 'node:fs';

import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  array,
  boolean,
  check,
  discriminated,
  enumOf,
  type Infer,
  issues,
  literal,
  number,
  object,
  optional,
  type Schema,
  string,
} from './index.js';

const Item = object({ sku: string({ min: 1, max: 32 }), qty: number({ int: true, min: 1 }), price: number({ min: 0 }) });
const Order = object({
  id: string({ min: 1 }),
  email: string({ pattern: /^[^@\s]+@[^@\s]+\.[a-z]+$/ }),
  age: optional(number({ int: true, min: 0, max: 150 })),
  role: enumOf(['admin', 'user', 'guest']),
  active: boolean(),
  tags: array(string(), { max: 10 }),
  address: object({ street: string(), city: string(), zip: string({ pattern: /^\d{5}$/ }) }),
  items: array(Item, { min: 1 }),
  payment: discriminated('kind', {
    card: object({ kind: literal('card'), last4: string({ length: 4 }) }),
    bank: object({ kind: literal('bank'), iban: string({ min: 15, max: 34 }) }),
  }),
});

const valid = (): Record<string, unknown> => ({
  id: 'u_1',
  email: 'ada@example.com',
  age: 36,
  role: 'admin',
  active: true,
  tags: ['a', 'b'],
  address: { street: '1 Quay Rd', city: 'Haifa', zip: '31000' },
  items: [
    { sku: 'A-1', qty: 2, price: 9.5 },
    { sku: 'B-2', qty: 1, price: 120 },
  ],
  payment: { kind: 'card', last4: '4242' },
});

describe('the inferred type', () => {
  it('is the plain object the schema describes, with optional keys optional', () => {
    expectTypeOf<Infer<typeof Order>>().toEqualTypeOf<{
      id: string;
      email: string;
      role: 'admin' | 'user' | 'guest';
      active: boolean;
      tags: string[];
      address: { street: string; city: string; zip: string };
      items: { sku: string; qty: number; price: number }[];
      payment: { kind: 'card'; last4: string } | { kind: 'bank'; iban: string };
      age?: number | undefined;
    }>();
  });

  it('is what a passing check narrows to', () => {
    const value: unknown = valid();
    if (!check(Order, value)) throw new Error('the fixture is valid');
    expectTypeOf(value.items).toEqualTypeOf<{ sku: string; qty: number; price: number }[]>();
  });
});

describe('a schema is data', () => {
  it('is frozen, and every kind has the same members in the same order', () => {
    const members = Object.keys(string());
    for (const schema of [number(), boolean(), literal(1), enumOf(['a']), array(string()), Item, optional(Item), Order.fields?.at(-1)]) {
      expect(Object.keys(schema as object)).toEqual(members);
      expect(Object.isFrozen(schema)).toBe(true);
    }
  });

  // parity.md: a bundle carries only the kinds its schemas use. The node brings its kind's check,
  // so the interpreter must never name the kinds: one `switch` over them puts every kind in every bundle.
  it('carries its own check, which captures nothing and is shared by every node of the kind', () => {
    expect(string().check).toBe(string({ min: 1 }).check);
    expect(string().check).not.toBe(number().check);
    expect(optional(Item).check).toBe(Item.check);
    expect(string().check(string({ min: 2 }), 'ab')).toBe(true);
    expect(string().check(string({ min: 2 }), 'a')).toBe(false);
    expect(readFileSync(`${import.meta.dirname}/check.ts`, 'utf8')).not.toMatch(/\bswitch\b|\.kind\b/u);
  });

  it('refuses a pattern that keeps state between tests', () => {
    expect(() => string({ pattern: /a/g })).toThrow('fix: remove its g and y flags');
    expect(() => string({ pattern: /a/y })).toThrow(TypeError);
    expect(check(string({ pattern: /a/i }), 'A')).toBe(true);
  });

  it('does not let a later change to the cases reach the schema', () => {
    const cases: Record<string, typeof Item> = { a: Item };
    const schema = discriminated('kind', cases);
    cases.b = Item;
    expect([...(schema.cases ?? new Map<unknown, unknown>()).keys()]).toEqual(['a']);
  });
});

// One row per way a value can be wrong: where, which keyword, and the message an agent reads.
const WRONG: [string, (v: ReturnType<typeof valid>) => void, string, string, string][] = [
  ['a missing key', (v) => delete v.id, '/id', 'required', 'expected a value, got undefined undefined. fix: add "id"'],
  ['the wrong type', (v) => (v.id = 7), '/id', 'type', 'expected a string, got number 7. fix: send a string'],
  ['too short', (v) => (v.id = ''), '/id', 'min', 'expected at least 1 characters, got string "". fix: send 1 or more'],
  ['a pattern miss', (v) => (v.email = 'ada'), '/email', 'pattern', String.raw`expected a string matching /^[^@\s]+@[^@\s]+\.[a-z]+$/, got string "ada". fix: send a value the pattern accepts`],
  ['not a number', (v) => (v.age = '36'), '/age', 'type', 'expected a number, got string "36". fix: send a finite number'],
  ['NaN', (v) => (v.age = Number.NaN), '/age', 'type', 'expected a number, got number NaN. fix: send a finite number'],
  ['below the minimum', (v) => (v.age = -1), '/age', 'min', 'expected a number of at least 0, got number -1. fix: send 0 or more'],
  ['above the maximum', (v) => (v.age = 151), '/age', 'max', 'expected a number of at most 150, got number 151. fix: send 150 or less'],
  ['a fraction', (v) => (v.age = 1.5), '/age', 'integer', 'expected a whole number, got number 1.5. fix: drop the fraction'],
  ['outside the enum', (v) => (v.role = 'root'), '/role', 'enum', 'expected one of "admin", "user", "guest", got string "root". fix: send one of them'],
  ['not a boolean', (v) => (v.active = null), '/active', 'type', 'expected true or false, got null. fix: send a boolean'],
  ['not an array', (v) => (v.tags = {}), '/tags', 'type', 'expected an array, got an object. fix: send an array'],
  ['too many items', (v) => (v.tags = Array.from({ length: 11 }, () => 'x')), '/tags', 'max', 'expected at most 10 items, got an array. fix: send 10 or fewer'],
  ['too few items', (v) => (v.items = []), '/items', 'min', 'expected at least 1 items, got an array. fix: send 1 or more'],
  ['a wrong element', (v) => (v.tags = ['a', 1]), '/tags/1', 'type', 'expected a string, got number 1. fix: send a string'],
  ['an array for an object', (v) => (v.address = []), '/address', 'type', 'expected an object, got an array. fix: send an object'],
  ['null for an object', (v) => (v.address = null), '/address', 'type', 'expected an object, got null. fix: send an object'],
  ['deep inside', (v) => ((v.items as { qty: number }[])[1]!.qty = 0), '/items/1/qty', 'min', 'expected a number of at least 1, got number 0. fix: send 1 or more'],
  ['an unknown case', (v) => (v.payment = { kind: 'cash' }), '/payment/kind', 'tag', 'expected one of "card", "bank", got string "cash". fix: send one of them'],
  ['an inherited case name', (v) => (v.payment = { kind: 'toString' }), '/payment/kind', 'tag', 'expected one of "card", "bank", got string "toString". fix: send one of them'],
  ['no case at all', (v) => (v.payment = 'card'), '/payment/kind', 'tag', 'expected one of "card", "bank", got undefined undefined. fix: send one of them'],
  ['an array for a case', (v) => (v.payment = ['card']), '/payment/kind', 'tag', 'expected one of "card", "bank", got undefined undefined. fix: send one of them'],
  ['the right case, wrong inside', (v) => (v.payment = { kind: 'card', last4: '424' }), '/payment/last4', 'min', 'expected at least 4 characters, got string "424". fix: send 4 or more'],
  ['a string too long', (v) => (v.payment = { kind: 'card', last4: '42424' }), '/payment/last4', 'max', 'expected at most 4 characters, got string "42424". fix: send 4 or fewer'],
];

const neverPrinted = (): string => 'its source is never printed';

describe('check and issues', () => {
  it('accept the valid order, with and without its optional key, and with keys the schema does not name', () => {
    const order = valid();
    expect(check(Order, order)).toBe(true);
    expect(issues(Order, order)).toEqual([]);
    delete order.age;
    order.extra = 1;
    expect(check(Order, order)).toBe(true);
    expect(issues(Order, order)).toEqual([]);
  });

  it.each(WRONG)('refuse %s, and say where and why', (...[, wrong, path, keyword, message]) => {
    const order = valid();
    wrong(order);
    expect(check(Order, order)).toBe(false);
    expect(issues(Order, order)).toEqual([{ path, keyword, message }]);
  });

  it('refuse a value that is not an object at all', () => {
    for (const value of [null, undefined, 1, 'x', []]) {
      expect(check(Order, value)).toBe(false);
      expect(issues(Order, value)).toHaveLength(1);
    }
  });

  it('refuse the infinities as numbers', () => {
    for (const value of [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(check(number(), value)).toBe(false);
      expect(issues(number(), value)).toHaveLength(1);
    }
  });

  it('accept a value exactly at each bound, and the defaults when no bound is given', () => {
    const order = valid();
    order.age = 150;
    order.tags = Array.from({ length: 10 }, () => 'x');
    (order.items as { sku: string }[])[0]!.sku = 'x'.repeat(32);
    expect(check(Order, order)).toBe(true);
    expect(issues(Order, order)).toEqual([]);
    for (const [schema, value] of [
      [number(), -5],
      [number({ min: 0 }), 0],
      [string(), ''],
      [array(string()), []],
    ] as [Schema<unknown>, unknown][]) {
      expect(check(schema, value)).toBe(true);
      expect(issues(schema, value)).toEqual([]);
    }
  });

  it('still test the pattern of a string exactly at its longest', () => {
    const schema = string({ max: 3, pattern: /^a+$/ });
    expect(check(schema, 'abc')).toBe(false);
    expect(issues(schema, 'abc')).toEqual([
      { path: '', keyword: 'pattern', message: 'expected a string matching /^a+$/, got string "abc". fix: send a value the pattern accepts' },
    ]);
  });

  it('pick a case only by a string tag', () => {
    const numbered = discriminated('k', { 1: object({}) });
    expect(check(numbered, { k: '1' })).toBe(true);
    expect(check(numbered, { k: 1 })).toBe(false);
    expect(issues(numbered, { k: 1 })).toEqual([{ path: '/k', keyword: 'tag', message: 'expected one of "1", got number 1. fix: send one of them' }]);
  });

  it('compare a literal by identity', () => {
    expect(check(literal(null), null)).toBe(true);
    expect(check(literal(1), '1')).toBe(false);
    expect(check(literal(1), 1)).toBe(true);
    expect(issues(literal(1), '1')).toEqual([{ path: '', keyword: 'literal', message: 'expected 1, got string "1". fix: send 1' }]);
  });

  // The probes of 2026-11-13 found `issues` throwing on a bigint: it printed what arrived with JSON.stringify.
  it.each<[string, unknown, string]>([
    ['a bigint', 1n, 'bigint 1'],
    ['a symbol', Symbol('x'), 'symbol Symbol(x)'],
    ['a function', neverPrinted, 'a function'],
    ['a class', class Named {}, 'a function'],
    ['undefined', undefined, 'undefined undefined'],
    ['a boolean', true, 'boolean true'],
    ['a date', new Date(0), 'an object'],
    ['a string of exactly the most a message quotes', 'x'.repeat(80), `string "${'x'.repeat(80)}"`],
    ['a longer string', `${'x'.repeat(80)}yz`, `string "${'x'.repeat(80)}" and 2 more characters`],
    ['a string with a quote in it', 'a"b', String.raw`string "a\"b"`],
    ['a long bigint', 10n ** 99n, `bigint 1${'0'.repeat(79)} and 20 more characters`],
  ])('say what arrived when it is %s, without throwing', (_, value, text) => {
    expect(check(number(), value)).toBe(false);
    expect(issues(number(), value)).toEqual([{ path: '', keyword: 'type', message: `expected a number, got ${text}. fix: send a finite number` }]);
  });

  it('never walk an object to say what arrived, so one that holds itself is safe', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const list: unknown[] = [];
    list.push(list);
    expect(issues(string(), cyclic)).toEqual([{ path: '', keyword: 'type', message: 'expected a string, got an object. fix: send a string' }]);
    expect(issues(string(), list)).toEqual([{ path: '', keyword: 'type', message: 'expected a string, got an array. fix: send a string' }]);
    expect(issues(object({ self: object({ self: string() }) }), cyclic)).toEqual([
      { path: '/self/self', keyword: 'type', message: 'expected a string, got an object. fix: send a string' },
    ]);
  });

  it('escape a key in the path as JSON Pointer does', () => {
    expect(issues(object({ 'a/b~c': string() }), { 'a/b~c': 1 })[0]?.path).toBe('/a~1b~0c');
  });

  it('report every issue, or only the first when asked', () => {
    const order = valid();
    order.id = '';
    order.role = 'root';
    order.tags = [1, 2];
    delete order.active;
    expect(issues(Order, order).map((issue) => issue.path)).toEqual(['/id', '/role', '/active', '/tags/0', '/tags/1']);
    expect(issues(Order, order, { first: true }).map((issue) => issue.path)).toEqual(['/id']);
    expect(issues(Order, { ...valid(), active: undefined, id: undefined }, { first: true })).toHaveLength(1);
  });
});

// spec.md R2 for the two readers that exist: on any value, `check` says yes exactly when `issues` is empty.
const PROBES: unknown[] = [undefined, null, true, 0, 1, -1, 1.5, 151, Number.NaN, '', 'a', '4242', '31000', 'ada@example.com', 'card', 'admin', [], {}, ['a'], Array.from({ length: 11 }, () => 'x')];

type Path = (string | number)[];

const pathsOf = (value: unknown, path: Path = [], found: Path[] = []): Path[] => {
  found.push(path);
  if (typeof value === 'object' && value !== null) {
    for (const [key, child] of Object.entries(value)) pathsOf(child, [...path, Array.isArray(value) ? Number(key) : key], found);
  }
  return found;
};

/** The valid order with the member at `path` replaced by `probe`. */
const replaced = (path: Path, probe: unknown): unknown => {
  if (path.length === 0) return probe;
  const order = valid();
  let parent = order as Record<string | number, unknown>;
  for (const key of path.slice(0, -1)) parent = parent[key] as Record<string | number, unknown>;
  parent[path.at(-1) as string] = probe;
  return order;
};

describe('check and issues agree', () => {
  it('on every order with one member replaced by every probe value, at every depth', () => {
    const paths = pathsOf(valid());
    let refused = 0;
    for (const path of paths) {
      for (const probe of PROBES) {
        const order = replaced(path, probe);
        const yes = check(Order, order);
        expect(issues(Order, order).length === 0, `/${path.join('/')} = ${JSON.stringify(probe)}`).toBe(yes);
        expect(issues(Order, order, { first: true }).length === 0, `/${path.join('/')} = ${JSON.stringify(probe)}, first`).toBe(yes);
        if (!yes) refused += 1;
      }
    }
    expect(paths.length * PROBES.length).toBe(500);
    expect(refused).toBeGreaterThan(400);
  });
});
