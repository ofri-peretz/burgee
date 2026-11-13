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

  // The text itself, so a bound nobody set is not written and the layout stays readable.
  it('writes exactly this for a small schema', () => {
    const small = object({
      tags: array(string(), { min: 1, max: 3 }),
      code: string({ pattern: /^a$/ }),
      any: array(number()),
      pay: discriminated('kind', { a: object({ kind: literal('a') }), b: object({ kind: literal('b') }) }),
    });
    expect(emit(small)).toBe(`(() => {
const f0 = (v) => {
  if (!Array.isArray(v) || v.length < 1 || v.length > 3) return false;
  for (let i = 0; i < v.length; i++) if (!(typeof v[i] === "string")) return false;
  return true;
};
const r1 = /^a$/;
const f2 = (v) => {
  if (!Array.isArray(v)) return false;
  for (let i = 0; i < v.length; i++) if (!(typeof v[i] === "number" && v[i] >= -1.7976931348623157e+308 && v[i] <= 1.7976931348623157e+308)) return false;
  return true;
};
const f3 = (v) => typeof v === "object" && v !== null && !Array.isArray(v)
  && (v["kind"] === "a");
const f4 = (v) => typeof v === "object" && v !== null && !Array.isArray(v)
  && (v["kind"] === "b");
const f5 = (v) => {
  if (!(typeof v === "object" && v !== null && !Array.isArray(v))) return false;
  switch (v["kind"]) {
    case "a": return f3(v);
    case "b": return f4(v);
    default: return false;
  }
};
const f6 = (v) => typeof v === "object" && v !== null && !Array.isArray(v)
  && (f0(v["tags"]))
  && (typeof v["code"] === "string" && r1.test(v["code"]))
  && (f2(v["any"]))
  && (f5(v["pay"]));
return (v) => f6(v);
})()`);
    expect(emit(string({ min: 0, max: Number.MAX_VALUE }))).toBe('(() => {\n\nreturn (v) => typeof v === "string";\n})()');
    expect(emit(string({ min: 1, max: 2 }))).toBe('(() => {\n\nreturn (v) => typeof v === "string" && v.length >= 1 && v.length <= 2;\n})()');
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
