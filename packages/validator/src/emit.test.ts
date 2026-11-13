import { describe, expect, it } from 'vitest';

import { check } from './check.js';
import { emit } from './emit.js';
import { array, boolean, discriminated, enumOf, literal, number, object, optional, type Schema, string } from './schema.js';

/** Run emitted code. Only here: the package itself never evaluates text (spec.md R3). */
const load = (source: string): ((value: unknown) => boolean) =>
  // eslint-disable-next-line secure-coding/no-unsafe-deserialization, node-security/detect-eval-with-expression -- The emitted text is the subject under test
  new Function(`return ${source};`)() as (value: unknown) => boolean;

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
  spare: array(Item),
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
  spare: [],
  payment: { kind: 'card', last4: '4242' },
});

const PROBES: unknown[] = [undefined, null, true, 0, 1, -1, 1.5, 150, 151, Number.NaN, Number.POSITIVE_INFINITY, '', 'a', '4242', '424', '31000', 'ada@example.com', 'card', 'bank', 'admin', 'toString', [], {}, ['a'], Array.from({ length: 10 }, () => 'x'), Array.from({ length: 11 }, () => 'x'), 'x'.repeat(32), 'x'.repeat(33)];

type Path = (string | number)[];

const pathsOf = (value: unknown, path: Path = [], found: Path[] = []): Path[] => {
  found.push(path);
  if (typeof value === 'object' && value !== null) {
    for (const [key, child] of Object.entries(value)) pathsOf(child, [...path, Array.isArray(value) ? Number(key) : key], found);
  }
  return found;
};

const replaced = (path: Path, probe: unknown): unknown => {
  if (path.length === 0) return probe;
  const order = valid();
  let parent = order as Record<string | number, unknown>;
  for (const key of path.slice(0, -1)) parent = parent[key] as Record<string | number, unknown>;
  parent[path.at(-1) as string] = probe;
  return order;
};

describe('emit', () => {
  it('writes one expression with no imports, and each shared schema once', () => {
    const source = emit(Order);
    expect(source.startsWith('(() => {\n')).toBe(true);
    expect(source.endsWith('\n})()')).toBe(true);
    expect(source).not.toMatch(/\b(?:import|require)\b/u);
    // `Item` is used by two arrays and written once.
    expect(source.split('\n').filter((line) => line.includes('"sku"'))).toHaveLength(1);
  });

  it('is the same text on every run', () => {
    expect(emit(Order)).toBe(emit(Order));
  });

  // spec.md R2: the emitted code and the interpreter give the same verdict.
  it('answers what check answers, on every order with one member replaced by every probe', () => {
    const emitted = load(emit(Order));
    expect(emitted(valid())).toBe(true);
    let refused = 0;
    const paths = pathsOf(valid());
    for (const path of paths) {
      for (const probe of PROBES) {
        const order = replaced(path, probe);
        const yes = check(Order, order);
        expect(emitted(order), `/${path.join('/')} = ${JSON.stringify(probe)}`).toBe(yes);
        if (!yes) refused += 1;
      }
    }
    expect(paths.length * PROBES.length).toBe(728);
    expect(refused).toBeGreaterThan(600);
  });

  it.each<[string, Schema<unknown>, unknown[]]>([
    ['a string with no bounds', string(), ['', 'a', 1, null]],
    ['a number with no bounds', number(), [-5, 0, 1.5, Number.NaN, Number.NEGATIVE_INFINITY, '1']],
    ['a boolean', boolean(), [true, false, 0, 'true']],
    ['null', literal(null), [null, undefined, 0]],
    ['a number literal', literal(1), [1, '1', true]],
    ['an enum of numbers', enumOf([1, 2]), [1, 2, 3, '1']],
    ['an empty enum', enumOf([]), [undefined, null, '']],
    ['an array with no bounds', array(number()), [[], [1], [1, 'x'], {}, 'x']],
    ['an optional at the root', optional(string()), ['a', 1]],
    ['a key that needs quoting', object({ 'a"b\\c': string() }), [{ 'a"b\\c': 'x' }, { 'a"b\\c': 1 }, {}]],
    ['a tag that needs quoting', discriminated('k"', { 'a"': object({}) }), [{ 'k"': 'a"' }, { 'k"': 'b' }, { k: 'a"' }, [], null]],
    ['a union with no cases', discriminated('k', {}), [{ k: 'a' }, {}]],
  ])('answers what check answers for %s', (_, schema, values) => {
    const emitted = load(emit(schema));
    for (const value of values) expect(emitted(value), JSON.stringify(value)).toBe(check(schema, value));
  });
});
