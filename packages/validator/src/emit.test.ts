import { describe, expect, it } from 'vitest';

import { verdict } from './__fixtures__/readers.js';
import { check } from './check.js';
import { extend, keyof, omit, partial, pick, readonly, required } from './derive.js';
import { emit, emitWith } from './emit.js';
import { issues } from './issues.js';
import {
  type AnySchema,
  annotate,
  any,
  array,
  bigint,
  boolean,
  custom,
  discriminated,
  date,
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

/** Run emitted code. Only here: the package itself never evaluates text (spec.md R3). */
const BACKSLASH = String.fromCodePoint(92);
const isOne = (value: unknown): boolean => value === 1;
const isE = (text: string): boolean => text === 'e';

/** A string as the emitter must write it: a JSON string, with what could close a script or open a comment as an escape. */
const escaped = (text: string): string => JSON.stringify(text).replaceAll(/[<>/]/gu, (unit) => `${BACKSLASH}u00${(unit.codePointAt(0) as number).toString(16)}`);

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

    it.each<[string, AnySchema, unknown, unknown]>([
      ['an object key', object({ [breakout]: string() }), { [breakout]: 'x' }, { [breakout]: 1 }],
      ['an enum member', enumOf([breakout, closing]), closing, 'other'],
      ['a literal', literal(closing), closing, 'other'],
      ['a discriminator and its tags', discriminated(breakout, { [closing]: object({}) }), { [breakout]: closing }, { [breakout]: 'x' }],
      ['a key with line separators', object({ [separators]: number() }), { [separators]: 1 }, { [separators]: '1' }],
      ['a pattern', string({ pattern: /^<\/script>\u2028$/u }), '</script>\u2028', '</script>'],
      ['a strict object\'s key', object({ [breakout]: string() }, { unknown: 'strict' }), { [breakout]: 'x' }, { [breakout]: 'x', other: 1 }],
      ['a key beside a schema for the rest', object({ [closing]: string() }, { unknown: number() }), { [closing]: 'x', b: 1 }, { [closing]: 'x', b: 'y' }],
      ['a record\'s key', record(number(), { key: enumOf([closing, breakout]) }), { [closing]: 1, [breakout]: 2 }, { x: 1 }],
      ['a format\'s name and pattern', string({ format: { name: breakout, pattern: /^<\/script>\u2028$/u } }), '</script>\u2028', 'x'],
      ['a default', object({ a: optional(string(), { default: `${breakout}${closing}${separators}` }) }), {}, { a: 1 }],
      ['a title, a description and examples', annotate(string(), { title: closing, description: breakout, examples: [separators, breakout] }), 'a', 1],
      ['a literal in a tuple in a union', union([tuple([literal(closing)]), nullable(literal(breakout))]), [closing], [breakout]],
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

    // A default and metadata are not what `check` reads, so the text has no place for them at all.
    it('writes nothing of a default, a title, a description, an example or a rule\'s name', () => {
      const marked = object({
        a: annotate(optional(string({ format: { name: 'MARK-format', pattern: /^a$/ } }), { default: 'MARK-default' }), { title: 'MARK-title', description: 'MARK-description', examples: ['MARK-example'] }),
        b: custom('MARK-custom', isOne),
        c: string({ format: { name: 'MARK-tested', test: isE } }),
      });
      expect(emitWith(marked).source).not.toContain('MARK');
      expect(emitWith(marked).hooks).toEqual([isOne, isE]);
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
      ['an exclusive lower bound', { ...number(), above: '0 || globalThis.__emitted' }],
      ['an exclusive upper bound', { ...number(), below: '0 || globalThis.__emitted' }],
      ['a step', { ...number({ multipleOf: 2 }), step: '2) || globalThis.__emitted || (1' }],
      ['a step where none was asked for', { ...number(), step: '0' }],
    ])('refuses a hand-built node with %s that is not a number', (_, node) => {
      expect(() => emit(node as unknown as AnySchema)).toThrow(TypeError);
      expect(() => emit(node as unknown as AnySchema)).toThrow('it is not a number. fix: build the schema with the builders, or give the node numeric bounds');
    });

    it('refuses a hand-built node whose pattern is not a RegExp', () => {
      const node = { ...string(), pattern: { source: 'x', flags: '', test: () => true } } as unknown as AnySchema;
      expect(() => emit(node)).toThrow('cannot emit a pattern that is not a RegExp. fix: build the schema with `string({ pattern })`');
    });

    it('refuses a hand-built format whose pattern is not a RegExp', () => {
      const node = { ...string(), rule: { name: 'x', pattern: { source: 'x', flags: '', test: () => true }, test: null } } as unknown as AnySchema;
      expect(() => emit(node)).toThrow('cannot emit a pattern that is not a RegExp. fix: build the schema with `string({ pattern })`');
    });

    it.each<[string, Record<string, unknown>]>([
      ['custom type', { ...custom('x', isOne), rule: { name: closing, pattern: null, test: 'globalThis.__emitted = 1' } }],
      ['format', { ...string(), rule: { name: closing, pattern: null, test: null } }],
    ])('refuses a hand-built %s whose test is not a function, and escapes its name in saying so', (_, node) => {
      expect(() => emitWith(node as unknown as AnySchema)).toThrow(TypeError);
      expect(() => emitWith(node as unknown as AnySchema)).toThrow(
        `${String.raw`cannot emit the rule "\u003c\u002fscript\u003e\u003cscript\u003ealert(1)\u002f\u002f"`}: it has neither a pattern nor a test. fix: build it with \`string({ format })\` or \`custom\``,
      );
    });

    // Wave 2: a bigint's bounds, the name `typeof` gives, and the class of an instance check.
    it.each<[string, AnySchema, unknown, unknown]>([
      ['a bigint literal', literal(-5n), -5n, -5],
      ['a bigint bound', bigint({ min: -(2n ** 64n), max: 2n ** 64n }), 2n ** 64n, 2n ** 64n + 1n],
      ['the literal undefined', undefinedOf(), undefined, null],
      ['the members of a native enum', nativeEnum({ A: closing, B: breakout }), closing, 'A'],
      ['a tag that is a number', discriminatedBy(breakout, [object({ [breakout]: literal(1) })]), { [breakout]: 1 }, { [breakout]: '1' }],
    ])('%s is written as a literal, and still means what it said', (_, schema, accepted, refused) => {
      const source = emit(schema);
      expect(source).not.toMatch(/<\/script|\u2028|\u2029/u);
      const emitted = load(source);
      expect(emitted(accepted)).toBe(true);
      expect(emitted(refused)).toBe(false);
      expect(check(schema, accepted)).toBe(true);
      expect(check(schema, refused)).toBe(false);
      expect('__emitted' in globalThis).toBe(false);
    });

    it('writes the name a hand-built type node carries as an escaped string, which no value has as its type', () => {
      const name = `symbol" || globalThis.__emitted || "${closing}`;
      const node = { ...symbol(), value: name } as unknown as AnySchema;
      const source = emit(node);
      expect(source).toBe(`(() => {\n\nreturn (v) => typeof v === ${escaped(name)};\n})()`);
      expect(source).not.toContain('</script');
      expect(load(source)(Symbol('x'))).toBe(false);
      expect(check(node, Symbol('x'))).toBe(false);
      expect('__emitted' in globalThis).toBe(false);
    });

    it.each<[string, unknown]>([
      ['a string', '0n || globalThis.__emitted'],
      ['a number', 5],
      ['null', null],
    ])('refuses a hand-built bigint node whose bound is %s', (_, bound) => {
      for (const value of [[bound, 1n], [0n, bound]]) {
        const node = { ...bigint(), value } as unknown as AnySchema;
        expect(() => emit(node)).toThrow(TypeError);
        expect(() => emit(node)).toThrow('it is not a bigint. fix: build the schema with `bigint({ min, max })`');
      }
    });

    it('escapes the bound it refuses in saying so', () => {
      const node = { ...bigint(), value: [closing, 1n] } as unknown as AnySchema;
      expect(() => emit(node)).toThrow(`cannot emit the bound ${escaped(closing)}: it is not a bigint.`);
    });

    it('refuses a hand-built instance node whose class is not a function', () => {
      const node = { ...instanceOf(Date), value: 'Date; globalThis.__emitted = 1' } as unknown as AnySchema;
      expect(() => emitWith(node)).toThrow(TypeError);
      expect(() => emitWith(node)).toThrow('cannot emit an instance check whose class is not a function. fix: build it with `instanceOf`');
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

  it.each<[string, AnySchema, unknown[]]>([
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

interface Tree {
  v: number;
  kids: Tree[];
}
const TreeSchema: Schema<Tree> = object({ v: number(), kids: array(lazy(() => TreeSchema)) });

interface Left {
  b: Right[];
}
interface Right {
  a?: Left | undefined;
}
const LeftSchema: Schema<Left> = object({ b: array(lazy(() => RightSchema)) });
const RightSchema: Schema<Right> = object({ a: optional(LeftSchema) });

const loadWith = (schema: AnySchema): ((value: unknown) => boolean) => {
  const { source, hooks } = emitWith(schema);
  // eslint-disable-next-line secure-coding/no-unsafe-deserialization, node-security/detect-eval-with-expression -- The emitted text is the subject under test
  return (new Function(`return ${source};`)() as (hooks: readonly unknown[]) => (value: unknown) => boolean)(hooks);
};

/** A value with a member of every wave 1 kind, which the `Wave` schema below accepts. */
const wave = (): Record<string, unknown> => ({
  n: 2.5,
  whole: 9,
  d: '7',
  e: 'e',
  r: { ab: -1, cd: -2.5 },
  t: ['a', null, undefined],
  u: 'ab',
  i: { a: 'x', b: 1, c: 'rest' },
  s: { a: 'x', b: 0 },
  tree: { v: 1, kids: [{ v: 2, kids: [] }] },
  left: { b: [{ a: { b: [{}] } }] },
  c: 1,
});

/** That value with the member at `path` replaced by `probe`. */
const replacedIn = (path: Path, probe: unknown): unknown => {
  if (path.length === 0) return probe;
  const value = wave();
  let parent = value as Record<string | number, unknown>;
  for (const key of path.slice(0, -1)) parent = parent[key] as Record<string | number, unknown>;
  parent[path.at(-1) as string] = probe;
  return value;
};

describe('emit, for the wave 1 kinds', () => {
  it('writes exactly this for one schema of every new kind', () => {
    const every = object({
      n: number({ gt: 0, lt: 10, multipleOf: 0.5, int: true }),
      m: number({ multipleOf: 3, positive: true }),
      d: string({ format: { name: 'digit', pattern: /^\d$/ } }),
      r: record(number(), { key: string({ pattern: /^x/ }) }),
      q: record(unknown()),
      t: tuple([string(), nullable(number())]),
      e: tuple([]),
      u: union([string(), number(), never()]),
      i: intersection([any(), nullish(string())]),
      none: union([]),
      all: intersection([]),
      s: object({ a: optional(string()) }, { unknown: 'strict' }),
      c: object({ 'a"': string(), 'b': string() }, { unknown: enumOf([1]) }),
      z: object({}, { unknown: 'strict' }),
      p: object({ a: string() }, { unknown: 'strip' }),
    });
    expect(emit(every)).toBe(String.raw`(() => {
const m0 = (v, s) => {
  const r = Math.abs(v % s);
  return r === 0 || (!Number.isInteger(s) && Math.min(r, s - r) <= Math.abs(v) * Number.EPSILON);
};
const r1 = new RegExp("^\\d$", "");
const r2 = new RegExp("^x", "");
const f3 = (v) => {
  if (!(typeof v === "object" && v !== null && !Array.isArray(v))) return false;
  for (const k in v) if (!(typeof k === "string" && r2.test(k)) || !(typeof v[k] === "number" && v[k] >= -1.7976931348623157e+308 && v[k] <= 1.7976931348623157e+308)) return false;
  return true;
};
const f4 = (v) => {
  if (!(typeof v === "object" && v !== null && !Array.isArray(v))) return false;
  for (const k in v) if (!(true)) return false;
  return true;
};
const f5 = (v) => Array.isArray(v) && v.length === 2
  && (typeof v[0] === "string")
  && ((v[1] === null || (typeof v[1] === "number" && v[1] >= -1.7976931348623157e+308 && v[1] <= 1.7976931348623157e+308)));
const f6 = (v) => Array.isArray(v) && v.length === 0;
const f7 = (v) => {
  for (const k in v) if (!(k === "a")) return false;
  return true;
};
const f8 = (v) => typeof v === "object" && v !== null && !Array.isArray(v)
  && (v["a"] === undefined || (typeof v["a"] === "string"))
  && f7(v);
const f9 = (v) => {
  for (const k in v) if (!(k === "a\"" || k === "b") && !((v[k] === 1))) return false;
  return true;
};
const f10 = (v) => typeof v === "object" && v !== null && !Array.isArray(v)
  && (typeof v["a\""] === "string")
  && (typeof v["b"] === "string")
  && f9(v);
const f11 = (v) => {
  for (const k in v) if (!(false)) return false;
  return true;
};
const f12 = (v) => typeof v === "object" && v !== null && !Array.isArray(v)
  && f11(v);
const f13 = (v) => typeof v === "object" && v !== null && !Array.isArray(v)
  && (typeof v["a"] === "string");
const f14 = (v) => typeof v === "object" && v !== null && !Array.isArray(v)
  && (typeof v["n"] === "number" && v["n"] >= -1.7976931348623157e+308 && v["n"] <= 1.7976931348623157e+308 && v["n"] > 0 && v["n"] < 10 && Number.isInteger(v["n"]) && m0(v["n"], 0.5))
  && (typeof v["m"] === "number" && v["m"] >= -1.7976931348623157e+308 && v["m"] <= 1.7976931348623157e+308 && v["m"] > 0 && m0(v["m"], 3))
  && (typeof v["d"] === "string" && r1.test(v["d"]))
  && (f3(v["r"]))
  && (f4(v["q"]))
  && (f5(v["t"]))
  && (f6(v["e"]))
  && (v["u"] !== undefined && (((typeof v["u"] === "string") || (typeof v["u"] === "number" && v["u"] >= -1.7976931348623157e+308 && v["u"] <= 1.7976931348623157e+308) || (false))))
  && (v["i"] !== undefined && (((true) && ((v["i"] === null || v["i"] === undefined || (typeof v["i"] === "string"))))))
  && (v["none"] !== undefined && (false))
  && (v["all"] !== undefined && (true))
  && (f8(v["s"]))
  && (f10(v["c"]))
  && (f12(v["z"]))
  && (f13(v["p"]));
return (v) => f14(v);
})()`);
  });

  // A schema that names itself: its function is named before its body is written, so the text is
  // finite, and each function is written once.
  it('writes a schema that names itself as functions that call each other', () => {
    expect(emit(TreeSchema)).toBe(`(() => {
const f0 = (v) => {
  if (!Array.isArray(v)) return false;
  for (let i = 0; i < v.length; i++) if (!(g0(v[i]))) return false;
  return true;
};
const f1 = (v) => typeof v === "object" && v !== null && !Array.isArray(v)
  && (typeof v["v"] === "number" && v["v"] >= -1.7976931348623157e+308 && v["v"] <= 1.7976931348623157e+308)
  && (f0(v["kids"]));
const g0 = (v) => f1(v);
return (v) => f1(v);
})()`);
    expect(emit(lazy(() => string()))).toBe('(() => {\nconst g0 = (v) => typeof v === "string";\nreturn (v) => g0(v);\n})()');
  });

  it('writes two schemas that name each other, and two lazy schemas under two names', () => {
    expect(emit(LeftSchema)).toBe(`(() => {
const f0 = (v) => {
  if (!Array.isArray(v)) return false;
  for (let i = 0; i < v.length; i++) if (!(g0(v[i]))) return false;
  return true;
};
const f1 = (v) => typeof v === "object" && v !== null && !Array.isArray(v)
  && (f0(v["b"]));
const f2 = (v) => typeof v === "object" && v !== null && !Array.isArray(v)
  && (v["a"] === undefined || (f1(v["a"])));
const g0 = (v) => f2(v);
const f4 = (v) => typeof v === "object" && v !== null && !Array.isArray(v)
  && (f0(v["b"]));
return (v) => f4(v);
})()`);
    const one = lazy(() => string());
    expect(emit(tuple([one, lazy(() => boolean()), one]))).toBe(`(() => {
const g0 = (v) => typeof v === "string";
const g1 = (v) => typeof v === "boolean";
const f2 = (v) => Array.isArray(v) && v.length === 3
  && (g0(v[0]))
  && (g1(v[1]))
  && (g0(v[2]));
return (v) => f2(v);
})()`);
  });

  it('has no text for a schema that names a function, and says what to do', () => {
    for (const schema of [custom('one', isOne), object({ a: string({ format: { name: 'e', test: isE } }) })]) {
      expect(() => emit(schema)).toThrow(TypeError);
      expect(() => emit(schema)).toThrow(
        'cannot emit a schema that names a function as text alone: a custom type, a refinement, a class, or a format with a test. fix: give the format a pattern, or use `emitWith` and hand its hooks to the text',
      );
    }
    expect(emit(string({ format: { name: 'e', pattern: /^e$/ } }))).toBe('(() => {\nconst r0 = new RegExp("^e$", "");\nreturn (v) => typeof v === "string" && r0.test(v);\n})()');
  });

  it('writes a function the schema names as a call into the hooks it is handed, in the order it met them', () => {
    const schema = object({ a: custom('one', isOne), f: string({ format: { name: 'e', test: isE } }), again: custom('one', isOne) });
    const { source, hooks } = emitWith(schema);
    expect(source).toBe(`(h) => {
const f0 = (v) => typeof v === "object" && v !== null && !Array.isArray(v)
  && (v["a"] !== undefined && (h[0](v["a"]) === true))
  && (typeof v["f"] === "string" && h[1](v["f"]) === true)
  && (v["again"] !== undefined && (h[2](v["again"]) === true));
return (v) => f0(v);
}`);
    expect(hooks).toEqual([isOne, isE, isOne]);
    expect(emitWith(string()).source).toBe('(h) => {\n\nreturn (v) => typeof v === "string";\n}');
    expect(emitWith(string()).hooks).toEqual([]);
  });

  // spec.md R2 for the wave 1 kinds: one value with a member of every new kind, each member replaced
  // by every probe, and the three readers asked about each.
  const Wave = object(
    {
      n: number({ gt: 0, lt: 10, multipleOf: 0.5 }),
      whole: number({ positive: true, int: true, multipleOf: 3 }),
      d: string({ format: { name: 'digit', pattern: /^\d$/ } }),
      e: string({ format: { name: 'e', test: isE } }),
      r: record(number({ negative: true }), { key: string({ min: 2 }) }),
      t: tuple([string(), nullable(number()), nullish(boolean())]),
      u: union([string({ min: 2 }), number({ int: true }), literal(null)]),
      i: intersection([object({ a: string() }), object({ b: optional(number()) }, { unknown: string() })]),
      s: object({ a: optional(string()), b: any() }, { unknown: 'strict' }),
      tree: TreeSchema,
      left: LeftSchema,
      c: custom('one', isOne),
      gone: optional(never()),
    },
    { unknown: 'strip' },
  );
  const WAVE_PROBES: unknown[] = [undefined, null, true, 0, 1, -1, 0.5, 2.5, 3, 9, 10, 0.3, '', 'a', 'ab', 'e', '7', '77', [], {}, ['a'], ['a', 1, true], { a: 'x' }, { b: 1 }, { ab: -1 }, { a: 'x', extra: 1 }, { v: 1, kids: [] }, { b: [] }, Number.NaN, 1n];

  it('answers what check and issues answer, on a value of every new kind with one member replaced by every probe', () => {
    const emitted = loadWith(Wave);
    expect(check(Wave, wave())).toBe(true);
    expect(emitted(wave())).toBe(true);
    expect(issues(Wave, wave())).toEqual([]);
    let refused = 0;
    let accepted = 0;
    const paths = pathsOf(wave());
    for (const path of paths) {
      for (const probe of WAVE_PROBES) {
        const value = replacedIn(path, probe);
        const name = `/${path.join('/')} = ${typeof probe === 'bigint' ? 'a bigint' : String(JSON.stringify(probe))}`;
        const yes = check(Wave, value);
        expect(emitted(value), name).toBe(yes);
        expect(issues(Wave, value).length === 0, name).toBe(yes);
        expect(issues(Wave, value, { first: true }).length === 0, `${name}, first`).toBe(yes);
        if (yes) accepted += 1;
        else refused += 1;
      }
    }
    expect([paths.length * WAVE_PROBES.length, refused, accepted]).toEqual([990, 849, 141]);
  });
});

/** What `enum Level { Low, High }` compiles to. */
const Level = { Low: 0, High: 1, 0: 'Low', 1: 'High' } as const;
const isEven = (n: number): boolean => n % 2 === 0;
const sameAB = (pair: { a: string; b: string }): boolean => pair.a === pair.b;
const lengthOf = (text: string): number => text.length;
const nothing = (): void => undefined;
const Strict = object({ a: string(), b: optional(number()), c: boolean() }, { unknown: 'strict' });

// spec.md R2 for the wave 2 kinds: one value with a member of every new kind, each member replaced
// by every probe, and every reader asked about each by `verdict`.
const Wave2 = object({
  big: bigint({ min: 0n, max: 10n }),
  at: date(),
  level: nativeEnum(Level),
  sym: symbol(),
  none: optional(undefinedOf()),
  map: instanceOf(Map),
  fn: func(),
  later: promise(),
  tagged: discriminatedBy('t', [object({ t: literal(1), n: number() }), object({ t: literal(true) }), object({ t: literal('1'), s: string() })]),
  exact: object({ a: exactOptional(string()), b: optional(string()) }),
  all: recordOf(['x', 'y'], number()),
  some: record(number(), { key: enumOf(['a', 'b']) }),
  rested: tuple([string()], { rest: number() }),
  picked: pick(Strict, ['a', 'b']),
  loose: partial(Strict),
  needed: required(omit(Strict, ['c'])),
  more: extend(Strict, { d: nullable(string()) }),
  key: keyof(Strict),
  fixed: readonly(array(number())),
  even: refine(number(), isEven),
  match: refine(object({ a: string(), b: string(), c: number() }), sameAB, { path: ['b'], uses: ['a', 'b'] }),
  size: transform(string(), lengthOf),
  flag: boolean({ coerce: true }),
  when: date({ coerce: true }),
});

/** A value the `Wave2` schema accepts, made new each time: a probe is written into it. */
const wave2 = (): Record<string, unknown> => ({
  big: 5n,
  at: new Date(0),
  level: 1,
  sym: Symbol('s'),
  map: new Map(),
  fn: nothing,
  later: Promise.resolve(1),
  tagged: { t: 1, n: 2 },
  exact: { a: 'x' },
  all: { x: 1, y: 2 },
  some: { a: 1 },
  rested: ['a', 1, 2],
  picked: { a: 'x', b: 1 },
  loose: { c: true },
  needed: { a: 'x', b: 1 },
  more: { a: 'x', c: true, d: null },
  key: 'a',
  fixed: [1, 2],
  even: 2,
  match: { a: 'p', b: 'p', c: 0 },
  size: 'abc',
  flag: true,
  when: new Date(1),
});

const WAVE2_PROBES: unknown[] = [undefined, null, true, false, 0, 1, 2, 3, -1, 1n, 11n, -1n, '', 'a', 'b', 'x', 'true', '2020-01-01', 'Low', new Date(0), new Date(Number.NaN), Symbol('p'), new Map(), new Set(), nothing, Promise.resolve(0), [], ['a'], ['a', 1], ['a', 'b'], [1], {}, { a: 'x' }, { a: undefined }, { a: 'x', b: undefined }, { a: 'x', b: 1 }, { a: 'x', b: 1, c: true }, { a: 'x', c: true, d: 'y' }, { x: 1, y: 2 }, { x: 1 }, { a: 1, b: 2 }, { a: 1, c: 3 }, { t: 1, n: 1 }, { t: true }, { t: '1', s: 's' }, { t: 'true' }, { a: 'p', b: 'q', c: 0 }, { a: 'p', b: 'q', c: 'x' }, { a: 'p', b: 'p', c: 'x' }];

/** That value with the member at `path` replaced by `probe`. */
const probedAt = (path: Path, probe: unknown): unknown => {
  if (path.length === 0) return probe;
  const value = wave2();
  let parent = value as Record<string | number, unknown>;
  for (const key of path.slice(0, -1)) parent = parent[key] as Record<string | number, unknown>;
  parent[path.at(-1) as string] = probe;
  return value;
};

describe('the readers, for the wave 2 kinds', () => {
  it('agree on a value of every new kind with one member replaced by every probe', () => {
    expect(verdict(Wave2, wave2())).toBe(true);
    let refused = 0;
    let accepted = 0;
    const paths = pathsOf(wave2());
    for (const path of paths) {
      for (const probe of WAVE2_PROBES) {
        if (verdict(Wave2, probedAt(path, probe))) accepted += 1;
        else refused += 1;
      }
    }
    expect([paths.length * WAVE2_PROBES.length, refused, accepted]).toEqual([2254, 2077, 177]);
  });
});
