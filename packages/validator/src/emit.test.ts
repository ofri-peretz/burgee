import { describe, expect, it } from 'vitest';

import { check } from './check.js';
import { emit } from './emit.js';
import { issues } from './issues.js';
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
const r1 = new RegExp("^a$", "");
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
    expect(emit(string({ min: 1 }))).toBe('(() => {\n\nreturn (v) => typeof v === "string" && v.length >= 1;\n})()');
  });

  // parity.md decision 4: a length is in code points. One unit or none needs no count, and a
  // string is counted only when its `length` does not already decide the bound.
  it('writes a length bound in code points, with the counter written once', () => {
    expect(emit(object({ a: string({ min: 1, max: 2 }), b: string({ min: 4, max: 5 }) }))).toBe(`(() => {
const p0 = (s) => {
  let n = s.length;
  for (let i = 0; i < s.length; i++) if (s.codePointAt(i) > 65535) n -= 1;
  return n;
};
const f1 = (v) => typeof v === "object" && v !== null && !Array.isArray(v)
  && (typeof v["a"] === "string" && v["a"].length >= 1 && (v["a"].length <= 2 || p0(v["a"]) <= 2))
  && (typeof v["b"] === "string" && (v["b"].length >= 8 || p0(v["b"]) >= 4) && (v["b"].length <= 5 || p0(v["b"]) <= 5));
return (v) => f1(v);
})()`);
  });

  const LEAD = '\uD83D';
  const TRAIL = '\uDE00';
  const FACE = LEAD + TRAIL;

  // [the schema, the string, how many code points it has]
  it.each<[string, number]>([
    ['', 0],
    ['a', 1],
    [FACE, 1],
    [`${FACE}a`, 2],
    [`a${FACE}`, 2],
    [FACE + FACE, 2],
    [`${FACE}ab`, 3],
    [FACE + FACE + FACE, 3],
    [`a${FACE}b${FACE}`, 4],
    [LEAD, 1],
    [TRAIL, 1],
    [LEAD + LEAD, 2],
    [TRAIL + TRAIL, 2],
    [TRAIL + LEAD, 2],
    [LEAD + LEAD + TRAIL, 2],
    [LEAD + TRAIL + TRAIL, 2],
    ['\uD800\uDC00', 1],
    ['\uDBFF\uDFFF', 1],
    ['\uD7FF\uDC00', 2],
    ['\uDC00\uDC00', 2],
    ['\uD800\uDBFF', 2],
    ['\uD800\uE000', 2],
    ['\uD800\uDFFF', 1],
    ['\uDBFF\uDC00', 1],
    ['\uD800a', 2],
    ['a\uDC00', 2],
    ['\uFFFF', 1],
    ['\uFFFF\uFFFF', 2],
    [`\uFFFF${FACE}`, 2],
    [`${FACE}\uFFFF\uFFFF`, 3],
  ])('counts %j as %i code points in all three readers, at every bound around it', (text, count) => {
    expect([...text]).toHaveLength(count);
    for (const bound of [count - 1, count, count + 1, text.length - 1, text.length, text.length + 1, text.length * 2 - 1, Math.ceil(text.length / 2), Math.floor(text.length / 2)].filter((size) => size >= 0)) {
      for (const [schema, yes] of [
        [string({ min: bound }), count >= bound],
        [string({ max: bound }), count <= bound],
        [string({ length: bound }), count === bound],
      ] as const) {
        const name = `${JSON.stringify(text)} against ${String(schema.min)}..${String(schema.max)}`;
        expect(check(schema, text), name).toBe(yes);
        expect(load(emit(schema))(text), name).toBe(yes);
        expect(issues(schema, text).length === 0, name).toBe(yes);
      }
    }
  });

  it('says how many characters a string with an emoji is short or over by its code points', () => {
    expect(issues(string({ min: 2 }), FACE)).toEqual([{ path: '', keyword: 'min', message: `expected at least 2 characters, got string "${FACE}". fix: send 2 or more` }]);
    expect(issues(string({ max: 1 }), FACE + FACE)).toEqual([{ path: '', keyword: 'max', message: `expected at most 1 characters, got string "${FACE}${FACE}". fix: send 1 or fewer` }]);
    expect(issues(string({ max: 1, pattern: /^a$/ }), FACE)).toEqual([
      { path: '', keyword: 'pattern', message: `expected a string matching /^a$/, got string "${FACE}". fix: send a value the pattern accepts` },
    ]);
  });

  // A schema is data and its strings may come from a document somebody else wrote. None of them
  // may become code.
  describe('what a schema carries cannot become code', () => {
    const breakout = '"]; globalThis.__emitted = 1; //';
    const closing = '</script><script>alert(1)//';
    const separators = 'a\u2028b\u2029c';

    it.each<[string, Schema<unknown>, unknown, unknown]>([
      ['an object key', object({ [breakout]: string() }), { [breakout]: 'x' }, { [breakout]: 1 }],
      ['an enum member', enumOf([breakout, closing]), closing, 'other'],
      ['a literal', literal(closing), closing, 'other'],
      ['a discriminator and its tags', discriminated(breakout, { [closing]: object({}) }), { [breakout]: closing }, { [breakout]: 'x' }],
      ['a key with line separators', object({ [separators]: number() }), { [separators]: 1 }, { [separators]: '1' }],
      ['a pattern', string({ pattern: /^<\/script>\u2028$/u }), '</script>\u2028', '</script>'],
    ])('%s is written as an escaped literal, and still means what it said', (_, schema, accepted, refused) => {
      const source = emit(schema);
      // The code itself has `<=` and `=>`; what must not survive is a tag that closes a script, or a raw line separator.
      expect(source).not.toMatch(/<\/script|\u2028|\u2029/u);
      const emitted = load(source);
      expect(emitted(accepted)).toBe(true);
      expect(emitted(refused)).toBe(false);
      expect(check(schema, accepted)).toBe(true);
      expect('__emitted' in globalThis).toBe(false);
    });

    it('writes a slash only where it is code, never inside a value', () => {
      expect(emit(literal('a/b'))).toBe('(() => {\n\nreturn (v) => v === "a\\u002fb";\n})()');
    });

    it.each<[string, Record<string, unknown>]>([
      ['a string bound', { ...string(), min: '0 || globalThis.__emitted' }],
      ['a number bound', { ...number(), max: '1; globalThis.__emitted = 1' }],
      ['an array bound', { ...array(string()), min: '1) {} globalThis.__emitted = 1; if (' }],
      ['an upper string bound', { ...string(), max: 'Infinity || globalThis.__emitted' }],
      ['an upper array bound', { ...array(string()), max: '9 || globalThis.__emitted' }],
      ['a lower number bound', { ...number(), min: '0 || globalThis.__emitted' }],
    ])('refuses a hand-built node with %s that is not a number', (_, node) => {
      expect(() => emit(node as unknown as Schema<unknown>)).toThrow(TypeError);
      expect(() => emit(node as unknown as Schema<unknown>)).toThrow('it is not a number. fix: build the schema with the builders, or give the node numeric bounds');
    });

    it('refuses a hand-built node whose pattern is not a RegExp', () => {
      const node = { ...string(), pattern: { source: 'x', flags: '', test: () => true } } as unknown as Schema<unknown>;
      expect(() => emit(node)).toThrow('cannot emit a pattern that is not a RegExp. fix: build the schema with `string({ pattern })`');
    });

    it('keeps a pattern\'s flags', () => {
      const emitted = load(emit(string({ pattern: /^a$/i })));
      expect(emitted('A')).toBe(true);
      expect(emit(string({ pattern: /^a$/i }))).toContain('new RegExp("^a$", "i")');
    });
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
