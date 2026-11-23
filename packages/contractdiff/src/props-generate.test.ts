import { describe, expect, it } from 'vitest';

import { anyValue, bothTypes, type Draft, drawFrom, FORMATS, GENERATED, HARD_DEPTH, inside, isFormat, itemsOf, make, merge, rangeOf, SOFT_DEPTH, token, typesOf } from './props-generate.js';
import { rooted, validatorJudge } from './props-judge.js';
import { randomFrom } from './props-random.js';

/** `count` values from `schema`, with whether each draw held to every keyword. */
const sample = (schema: unknown, options: { count?: number; draft?: Draft; root?: unknown; seed?: number } = {}) => {
  const random = randomFrom(options.seed ?? 1);
  return Array.from({ length: options.count ?? 200 }, () => {
    const draw = drawFrom(random, options.root ?? {}, options.draft ?? '2020-12');
    const made = make(draw, schema, '', 0);
    return { made, exact: draw.exact, reported: draw.reported };
  });
};

const values = (schema: unknown, options: Parameters<typeof sample>[1] = {}): unknown[] => sample(schema, options).flatMap(({ made }) => (made === undefined ? [] : [made.value]));

/** Every value made from an exact draw passes the validator: the generator and the validator agree. */
const agrees = (schema: unknown, options: Parameters<typeof sample>[1] = {}): void => {
  const judge = validatorJudge(rooted(schema, options.root ?? {}), options.draft ?? '2020-12');
  const drawn = sample(schema, options);
  expect(drawn.some(({ made }) => made !== undefined)).toBe(true);
  for (const { made, exact } of drawn) {
    if (made === undefined) continue;
    expect(exact).toBe(true);
    expect(judge.paths(made.value), JSON.stringify(made.value)).toEqual([]);
  }
};

describe('make: the keywords it holds to', () => {
  it.each([
    ['a bounded integer', { type: 'integer', minimum: -3, maximum: 4 }],
    ['an exclusive integer range', { type: 'integer', exclusiveMinimum: 1.5, exclusiveMaximum: 9 }],
    ['a multiple', { type: 'integer', multipleOf: 7, minimum: 1, maximum: 60 }],
    ['a number', { type: 'number', minimum: 0.5, exclusiveMaximum: 0.75 }],
    ['an exclusive number', { type: 'number', exclusiveMinimum: 2, exclusiveMaximum: 2.001 }],
    ['a number only above', { type: 'number', minimum: 1e6 }],
    ['a number only below', { type: 'number', maximum: -1e6 }],
    ['a string length', { type: 'string', minLength: 2, maxLength: 3 }],
    ['a long string', { type: 'string', minLength: 30 }],
    ['booleans and null', { type: ['boolean', 'null'] }],
    ['a value list', { enum: ['a', 1, null, { b: [2] }] }],
    ['a constant', { const: { deep: [1, 'x'] } }],
    ['an array', { type: 'array', items: { type: 'integer' }, minItems: 2, maxItems: 4 }],
    ['a tuple with no rest', { type: 'array', prefixItems: [{ const: 1 }, { type: 'string' }], items: false }],
    ['a tuple with a rest', { type: 'array', prefixItems: [{ const: 1 }], items: { type: 'boolean' }, minItems: 3 }],
    ['an object', { type: 'object', required: ['a'], properties: { a: { type: 'string' }, b: { type: 'integer' } }, additionalProperties: false }],
    ['extra properties of a kind', { type: 'object', additionalProperties: { type: 'boolean' }, minProperties: 3, maxProperties: 4 }],
    ['a required property it does not name', { type: 'object', required: ['x'], additionalProperties: { const: 5 } }],
    ['a property named like a prototype', { type: 'object', required: ['__proto__', 'constructor'], properties: { ['__proto__']: { const: 1 }, constructor: { const: 2 } } }],
    ['nothing declared', {}],
    ['true', true],
    ['an any-of', { anyOf: [{ type: 'string', maxLength: 1 }, { type: 'integer', minimum: 100 }] }],
    ['an any-of beside a type', { type: 'object', required: ['k'], anyOf: [{ properties: { k: { const: 1 } } }, { properties: { k: { const: 2 } } }] }],
    ['an all-of', { allOf: [{ type: 'object', required: ['a'], properties: { a: { type: 'integer', minimum: 0 } } }, { required: ['b'], properties: { a: { maximum: 3 }, b: { const: true } } }] }],
    ['an all-of of types', { allOf: [{ type: ['integer', 'string'] }, { type: 'number' }] }],
    ['an all-of of an all-of', { allOf: [{ allOf: [{ type: 'string' }, { minLength: 2 }] }, { maxLength: 2 }] }],
    ['an all-of with two any-ofs', { allOf: [{ anyOf: [{ type: 'string' }, { type: 'integer' }] }, { anyOf: [{ type: 'integer', minimum: 5 }, { type: 'string', minLength: 3 }] }] }],
    ['keywords bound to their own type', { minimum: 3, maxLength: 2 }],
    ['an exclusive bound looser than the inclusive one', { type: 'integer', minimum: 5, exclusiveMinimum: 3, maximum: 6, exclusiveMaximum: 9 }],
    ['an exclusive bound tighter than the inclusive one', { type: 'number', minimum: 1, exclusiveMinimum: 3, maximum: 9, exclusiveMaximum: 4 }],
    ['a number range of one point', { type: 'number', minimum: 0.5, maximum: 0.5 }],
    ['a range narrower than the rounding', { type: 'number', exclusiveMinimum: 0, exclusiveMaximum: 0.0001 }],
    ['a range ending just above the rounding', { type: 'number', minimum: 0.9999, exclusiveMaximum: 1 }],
    ['an all-of with a reference beside a keyword', { allOf: [{ $ref: '#/$defs/Small', minimum: 2 }], $defs: { Small: { type: 'integer', maximum: 3 } } }],
    ['an all-of of a reference', { allOf: [{ $ref: '#/$defs/Small' }], $defs: { Small: { type: 'integer', maximum: 3 } } }],
    ['an all-of that agrees on a keyword', { allOf: [{ type: 'string', format: 'date' }, { format: 'date' }] }],
  ])('%s', (_name, schema) => {
    // The schema is its own document, so a `$ref` to its `$defs` resolves.
    agrees(schema, { root: schema });
  });

  it('reads a draft-07 tuple: `items` as a list, `additionalItems` as the rest', () => {
    agrees({ type: 'array', items: [{ const: 'a' }, { type: 'integer' }], additionalItems: false, minItems: 1 }, { draft: 'draft-07' });
    agrees({ type: 'array', items: [{ const: 'a' }], minItems: 2, maxItems: 3 }, { draft: 'draft-07' });
    expect(values({ type: 'array', items: [{ const: 'a' }], additionalItems: { const: 'b' }, minItems: 3, maxItems: 3 }, { draft: 'draft-07', count: 3 })).toEqual([['a', 'b', 'b'], ['a', 'b', 'b'], ['a', 'b', 'b']]);
  });

  it.each(FORMATS.map((format) => [format]))('the %s format', (format) => {
    agrees({ type: 'string', format });
  });

  it('follows references, through a document, and stops a schema that requires itself', () => {
    const root = {
      components: {
        schemas: {
          Node: { type: 'object', required: ['value'], properties: { value: { type: 'integer' }, next: { $ref: '#/components/schemas/Node' } } },
          Loop: { type: 'object', required: ['again'], properties: { again: { $ref: '#/components/schemas/Loop' } } },
          Alias: { $ref: '#/components/schemas/Node' },
        },
      },
    };
    agrees({ $ref: '#/components/schemas/Node' }, { root });
    agrees({ $ref: '#/components/schemas/Alias' }, { root });
    expect(values({ $ref: '#/components/schemas/Loop' }, { root, count: 5 })).toEqual([]);
  });

  it('reads a reference beside keywords as both in 2020-12, and as the reference alone before it', () => {
    const root = { $defs: { Small: { type: 'integer', maximum: 3 } } };
    agrees({ $ref: '#/$defs/Small', minimum: 2 }, { root });
    expect(new Set(values({ $ref: '#/$defs/Small', minimum: 2 }, { root, count: 100 }))).toEqual(new Set([2, 3]));
    const old = values({ $ref: '#/$defs/Small', minimum: 2 }, { root, count: 200, draft: 'draft-07' });
    expect(old.some((value) => (value as number) < 2)).toBe(true);
    agrees({ $ref: '#/$defs/Small', description: 'a note' }, { root });
  });

  it('holds to OpenAPI 3.0: `nullable` adds null, and boolean exclusive bounds exclude', () => {
    agrees({ type: 'integer', nullable: true, minimum: 1, exclusiveMinimum: true, maximum: 3, exclusiveMaximum: true }, { draft: 'openapi-3.0' });
    expect(new Set(values({ type: 'integer', nullable: true, minimum: 1, exclusiveMinimum: true, maximum: 3, exclusiveMaximum: true }, { draft: 'openapi-3.0' }))).toEqual(new Set([2, null]));
    expect(values({ type: 'null', nullable: true }, { draft: 'openapi-3.0', count: 3 })).toEqual([null, null, null]);
  });

  it('draws the ends of a range, where off-by-ones live', () => {
    const drawn = new Set(values({ type: 'integer', minimum: 0, maximum: 1000 }, { count: 300 }));
    expect(drawn.has(0)).toBe(true);
    expect(drawn.has(1000)).toBe(true);
    expect([...drawn].some((value) => (value as number) > 0 && (value as number) < 1000)).toBe(true);
  });

  it('makes fractions as well as whole numbers for a number, rounded short', () => {
    const drawn = values({ type: 'number', minimum: 0, maximum: 10 }, { count: 300 }) as number[];
    expect(drawn.some((value) => !Number.isInteger(value))).toBe(true);
    expect(drawn.some((value) => Number.isInteger(value))).toBe(true);
    expect(drawn.every((value) => String(value).length <= 6)).toBe(true);
  });

  it('counts a string in code points, so a character outside the BMP is one', () => {
    const drawn = values({ type: 'string', minLength: 1, maxLength: 1 }, { count: 500 }) as string[];
    expect(drawn.some((value) => value.length === 2)).toBe(true);
    expect(drawn.every((value) => [...value].length === 1)).toBe(true);
  });

  it('makes optional properties sometimes, extra ones now and then, and none past the soft depth', () => {
    const schema = { type: 'object', properties: { a: { type: 'integer' } } };
    const drawn = values(schema, { count: 300 }) as Record<string, unknown>[];
    expect(drawn.some((value) => 'a' in value)).toBe(true);
    expect(drawn.some((value) => !('a' in value))).toBe(true);
    expect(drawn.some((value) => 'extra' in value)).toBe(true);
    const deep = { type: 'object', properties: { a: { type: 'array', items: { type: 'integer' } } } };
    const random = randomFrom(4);
    for (let index = 0; index < 50; index += 1) expect(make(drawFrom(random, {}, '2020-12'), deep, '', 4)?.value).toEqual({});
    for (let index = 0; index < 20; index += 1) expect(make(drawFrom(random, {}, '2020-12'), { type: 'array', minItems: 1, items: { const: 0 } }, '', 4)?.value).toEqual([0]);
    for (let index = 0; index < 50; index += 1) {
      const value = make(drawFrom(random, {}, '2020-12'), true, '', 4)?.value;
      expect(value === null || typeof value !== 'object').toBe(true);
    }
  });

  it('names an extra property so it is not one the schema names', () => {
    const drawn = values({ type: 'object', properties: { extra: { const: 1 }, extra_: { const: 2 } }, required: ['extra', 'extra_'], minProperties: 3, maxProperties: 3 }, { count: 20 });
    for (const value of drawn) expect(Object.keys(value as object).sort()).toEqual(['extra', 'extra_', 'extra__']);
  });
});

describe('make: no value', () => {
  it.each([
    ['false', false],
    ['an empty value list', { enum: [] }],
    ['an empty integer range', { type: 'integer', minimum: 3, maximum: 2 }],
    ['an empty exclusive range', { type: 'integer', exclusiveMinimum: 1, exclusiveMaximum: 2 }],
    ['no multiple in range', { type: 'integer', multipleOf: 10, minimum: 1, maximum: 9 }],
    ['an empty number range', { type: 'number', minimum: 2, maximum: 1 }],
    ['a point excluded', { type: 'number', minimum: 2, exclusiveMaximum: 2 }],
    ['a string too short to be', { type: 'string', minLength: 3, maxLength: 2 }],
    ['an array too short to be', { type: 'array', minItems: 3, maxItems: 2 }],
    ['an array whose items have no value', { type: 'array', minItems: 1, items: false }],
    ['an array whose items have an empty range', { type: 'array', minItems: 1, items: { type: 'integer', minimum: 3, maximum: 2 } }],
    ['a value list that is not a list', { enum: 'x' }],
    ['a second any-of no branch of which fits', { allOf: [{ type: 'string', anyOf: [{ minLength: 1 }] }, { anyOf: [{ type: 'null' }] }] }],
    ['an object with an impossible property', { type: 'object', required: ['a'], properties: { a: false } }],
    ['an object with too few names', { type: 'object', minProperties: 2, additionalProperties: false }],
    ['an object past its most', { type: 'object', required: ['a', 'b'], maxProperties: 1 }],
    ['types that share nothing', { allOf: [{ type: 'string' }, { type: 'integer' }] }],
    ['an all-of with false', { allOf: [{ type: 'string' }, false] }],
    ['an all-of of an impossible all-of', { allOf: [{ allOf: [{ type: 'string' }, { type: 'null' }] }] }],
    ['an any-of whose branch is impossible', { type: 'string', anyOf: [{ type: 'integer' }] }],
    ['a second any-of whose branch is impossible', { allOf: [{ anyOf: [{ type: 'string' }] }, { anyOf: [{ type: 'null' }] }] }],
    ['a type no value has', { type: 'thing' }],
    ['a schema that is not one', 'string'],
  ])('%s', (_name, schema) => {
    expect(values(schema, { count: 20 })).toEqual([]);
  });

  it('reports a reference that names nothing, and a type no value has', () => {
    const [first] = sample({ $ref: '#/nowhere' }, { count: 1 });
    expect(first?.made).toBeUndefined();
    expect(first?.reported.get('$ref')).toEqual(new Set(['/']));
    expect(sample({ allOf: [{ $ref: '#/nowhere' }] }, { count: 1 })[0]?.made).toBeUndefined();
    expect(sample({ type: 'thing' }, { count: 1 })[0]?.reported.get('type:thing')).toEqual(new Set(['/']));
  });

  it('gives up on a value deeper than the hard depth', () => {
    expect(make(drawFrom(randomFrom(1), {}, '2020-12'), { type: 'integer' }, '', 25)).toBeUndefined();
  });
});

describe('make: what it reports instead of holding to', () => {
  it.each([
    ['pattern', { type: 'string', pattern: '^a+$' }, '/'],
    ['not', { not: { type: 'string' } }, '/'],
    ['if', { if: { type: 'string' }, then: { minLength: 2 } }, '/'],
    ['oneOf', { oneOf: [{ type: 'string' }, { type: 'integer' }] }, '/'],
    ['uniqueItems', { type: 'array', uniqueItems: true }, '/'],
    ['contains', { type: 'array', contains: { const: 1 } }, '/'],
    ['patternProperties', { type: 'object', patternProperties: { '^x': { type: 'string' } } }, '/'],
    ['propertyNames', { type: 'object', propertyNames: { maxLength: 2 } }, '/'],
    ['multipleOf', { type: 'number', multipleOf: 0.5, maximum: 3 }, '/'],
    ['format-length', { type: 'string', format: 'email', maxLength: 5 }, '/'],
    ['format:color', { type: 'string', format: 'color' }, '/'],
    ['enum-with-constraints', { type: 'string', enum: ['a', 'bb'], maxLength: 1 }, '/'],
    ['additionalProperties', { allOf: [{ properties: { a: true } }, { additionalProperties: false }] }, '/'],
    ['maxLength', { allOf: [{ type: 'string', maxLength: 3 }, { type: 'string', maxLength: 'x' }] }, '/'],
    ['pattern', { type: 'object', required: ['a'], properties: { a: { type: 'string', pattern: 'x' } } }, '/properties/a'],
    ['pattern', { type: 'array', minItems: 1, items: { type: 'string', pattern: 'x' } }, '/items'],
    ['pattern', { type: 'array', minItems: 1, prefixItems: [{ type: 'string', pattern: 'x' }] }, '/prefixItems/0'],
    ['pattern', { type: 'object', required: ['a'], additionalProperties: { type: 'string', pattern: 'x' } }, '/additionalProperties'],
    ['pattern', { anyOf: [{ type: 'string', pattern: 'x' }] }, '/anyOf/0'],
  ])('%s, at %s', (keyword, schema, at) => {
    const drawn = sample(schema, { count: 30 });
    expect(drawn.every(({ exact }) => !exact)).toBe(true);
    const reported = drawn.find(({ reported: found }) => found.has(keyword))?.reported.get(keyword);
    expect(reported?.has(at)).toBe(true);
  });

  it('names the reference a reported keyword sits behind', () => {
    const root = { $defs: { Code: { type: 'string', pattern: '^[A-Z]+$' } } };
    expect(sample({ $ref: '#/$defs/Code' }, { root, count: 1 })[0]?.reported.get('pattern')).toEqual(new Set(['#/$defs/Code']));
  });
});

describe('typesOf and merge', () => {
  it('reads the types a schema allows, declared or bound by its keywords', () => {
    expect(typesOf({ type: 'string' }, '2020-12')).toEqual(['string']);
    expect(typesOf({ type: 'string', nullable: true }, '2020-12')).toEqual(['string']);
    expect(typesOf({ type: 'string', nullable: false }, 'openapi-3.0')).toEqual(['string']);
    expect(typesOf({ type: 'string', nullable: true }, 'openapi-3.0')).toEqual(['string', 'null']);
    expect(typesOf({ type: ['string', 'null'], nullable: true }, 'openapi-3.0')).toEqual(['string', 'null']);
    expect(typesOf({ minimum: 1, items: {} }, '2020-12')).toEqual(['number', 'array']);
    expect(typesOf({ description: 'x' }, '2020-12')).toHaveLength(7);
  });

  it('merges the parts of an all-of into the schema that holds to each', () => {
    const draw = drawFrom(randomFrom(1), {}, '2020-12');
    expect(merge(draw, [{ type: ['integer', 'string'], minimum: 1, maxLength: 9, required: ['a'] }, { type: 'number', minimum: 4, maxLength: 3, required: ['a', 'b'], title: 'x' }], '')).toEqual({
      type: ['integer'],
      minimum: 4,
      maxLength: 3,
      required: ['a', 'b'],
      title: 'x',
    });
    expect(merge(draw, [{ type: 'number' }, { type: ['integer', 'number'] }], '')).toEqual({ type: ['number', 'integer'] });
    expect(merge(draw, [{ properties: { a: { minimum: 1 } } }, { properties: { a: { maximum: 2 }, b: {} } }], '')).toEqual({ properties: { a: { allOf: [{ minimum: 1 }, { maximum: 2 }] }, b: {} } });
    expect(merge(draw, [true, { const: 1 }], '')).toEqual({ const: 1 });
    expect(draw.exact).toBe(true);
    expect(merge(draw, [{ const: 1 }, { const: 2 }], '/here')).toEqual({ const: 1 });
    expect(draw.reported.get('const')).toEqual(new Set(['/here']));
  });
});

/** The least and greatest of some numbers. */
const extremes = (numbers: readonly number[]): [number, number] => [Math.min(...numbers), Math.max(...numbers)];

/** Strings drawn from `format`. */
const formatted = (format: string, count = 3000): string[] => values({ type: 'string', format }, { count }) as string[];

/** Values made at `depth`. */
const madeAt = (schema: unknown, depth: number, count = 200): unknown[] => {
  const random = randomFrom(3);
  return Array.from({ length: count }, () => make(drawFrom(random, {}, '2020-12'), schema, '', depth)?.value);
};

/** The JSON type of a value. */
const kindOf = (value: unknown): string => {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  return typeof value;
};

describe('the lists and small pieces', () => {
  it('names the keywords it holds to', () => {
    expect(GENERATED).toEqual(['$ref', 'type', 'nullable', 'const', 'enum', 'allOf', 'anyOf', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'minLength', 'maxLength', 'format', 'items', 'prefixItems', 'additionalItems', 'minItems', 'maxItems', 'properties', 'required', 'additionalProperties', 'minProperties', 'maxProperties']);
    expect([SOFT_DEPTH, HARD_DEPTH]).toEqual([4, 24]);
  });

  it('escapes a pointer token, and tells a format it knows', () => {
    expect(token('a~b/c')).toBe('a~0b~1c');
    expect(isFormat('uuid')).toBe(true);
    expect(isFormat(7)).toBe(false);
  });

  it('reads the items of an array, in either dialect', () => {
    expect(itemsOf({ prefixItems: [1], items: 2 })).toEqual({ tuple: [1], tupleKey: 'prefixItems', rest: 2, restKey: 'items' });
    expect(itemsOf({ prefixItems: [1] })).toEqual({ tuple: [1], tupleKey: 'prefixItems', rest: true, restKey: 'items' });
    expect(itemsOf({ items: [1], additionalItems: 2 })).toEqual({ tuple: [1], tupleKey: 'items', rest: 2, restKey: 'additionalItems' });
    expect(itemsOf({ items: [1] })).toEqual({ tuple: [1], tupleKey: 'items', rest: true, restKey: 'additionalItems' });
    expect(itemsOf({ items: 2 })).toEqual({ tuple: [], tupleKey: 'prefixItems', rest: 2, restKey: 'items' });
    expect(itemsOf({})).toEqual({ tuple: [], tupleKey: 'prefixItems', rest: true, restKey: 'items' });
  });

  it('finds the types two schemas both allow: an integer is a number', () => {
    expect(bothTypes('number', 'integer')).toEqual(['integer']);
    expect(bothTypes('integer', 'number')).toEqual(['integer']);
    expect(bothTypes(['integer', 'number'], ['integer', 'number'])).toEqual(['integer', 'number']);
    expect(bothTypes('string', 'integer')).toEqual([]);
    expect(bothTypes('integer', 'string')).toEqual([]);
    expect(bothTypes('number', 'string')).toEqual([]);
  });

  it('reads the types each keyword binds, and nullable only in OpenAPI 3.0', () => {
    for (const key of ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf']) expect(typesOf({ [key]: 1 }, '2020-12')).toEqual(['number']);
    for (const key of ['minLength', 'maxLength', 'format']) expect(typesOf({ [key]: 1 }, '2020-12')).toEqual(['string']);
    for (const key of ['items', 'prefixItems', 'minItems', 'maxItems']) expect(typesOf({ [key]: 1 }, '2020-12')).toEqual(['array']);
    for (const key of ['properties', 'required', 'additionalProperties', 'minProperties', 'maxProperties']) expect(typesOf({ [key]: 1 }, '2020-12')).toEqual(['object']);
    expect(typesOf({ type: 'string', nullable: true }, '2020-12')).toEqual(['string']);
    expect(typesOf({ type: 'string', nullable: false }, 'openapi-3.0')).toEqual(['string']);
  });

  it('reads a range: a window from an open end, both bounds of a kind as the tighter, and OpenAPI 3.0 flags only there', () => {
    expect(rangeOf({}, '2020-12')).toEqual({ low: -100, lowOut: false, high: 100, highOut: false });
    expect(rangeOf({ minimum: 5 }, '2020-12')).toEqual({ low: 5, lowOut: false, high: 105, highOut: false });
    expect(rangeOf({ maximum: 5 }, '2020-12')).toEqual({ low: -95, lowOut: false, high: 5, highOut: false });
    expect(rangeOf({ minimum: 'x' }, '2020-12').low).toBe(-100);
    expect(rangeOf({ minimum: 1, exclusiveMinimum: 1, maximum: 4, exclusiveMaximum: 4 }, '2020-12')).toEqual({ low: 1, lowOut: true, high: 4, highOut: true });
    expect(rangeOf({ minimum: 1, exclusiveMinimum: true }, '2020-12').lowOut).toBe(false);
    expect(rangeOf({ minimum: 1, exclusiveMinimum: false }, 'openapi-3.0').lowOut).toBe(false);
  });

  it('tells a number inside a range from one at or past an end', () => {
    const range = { low: 0, lowOut: false, high: 1, highOut: false };
    expect([0, 1, 0.5, -0.1, 1.1].map((value) => inside(range, value))).toEqual([true, true, true, false, false]);
    const open = { low: 0, lowOut: true, high: 1, highOut: true };
    expect([0, 1, 0.5].map((value) => inside(open, value))).toEqual([false, false, true]);
  });
});

/** A fresh draw over `root`. */
const draw = (root: unknown = {}, draft: Draft = '2020-12') => drawFrom(randomFrom(1), root, draft);

/** A document of `links` references in a row, ending at a string. */
const chain = (links: number): Record<string, unknown> => {
  const defs: Record<string, unknown> = { d0: { type: 'string' } };
  for (let link = 1; link <= links; link += 1) defs[`d${String(link)}`] = { $ref: `#/$defs/d${String(link - 1)}` };
  return { $defs: defs };
};

describe('merge, told apart', () => {
  it('keeps the tighter bound of each kind, and reports any other keyword the parts disagree on', () => {
    for (const key of ['minimum', 'exclusiveMinimum', 'minLength', 'minItems', 'minProperties']) expect(merge(draw(), [{ [key]: 1 }, { [key]: 3 }], '')).toEqual({ [key]: 3 });
    for (const key of ['maximum', 'exclusiveMaximum', 'maxLength', 'maxItems', 'maxProperties']) expect(merge(draw(), [{ [key]: 3 }, { [key]: 1 }], '')).toEqual({ [key]: 1 });
    const odd = draw();
    expect(merge(odd, [{ minimum: 1 }, { minimum: 'x' }, { multipleOf: 3 }, { multipleOf: 2 }], '/p')).toEqual({ minimum: 1, multipleOf: 3 });
    expect([...odd.reported.keys()]).toEqual(['minimum', 'multipleOf']);
    expect(merge(draw(), [{ minimum: 'x' }, { minimum: 2 }], '')).toEqual({ minimum: 'x' });
    expect(merge(draw(), [{ maximum: 'x' }, { maximum: 2 }], '')).toEqual({ maximum: 'x' });
    expect(merge(draw(), [{ anyOf: [{}], required: ['a'] }, { required: ['b'] }], '')).toEqual({ anyOf: [{}], required: ['a', 'b'] });
  });

  it('is false when no value holds to the parts', () => {
    expect(merge(draw(), [{ type: 'string' }, { type: 'integer' }], '')).toBe(false);
    expect(merge(draw(), [{}, false], '')).toBe(false);
    expect(merge(draw(), [{ type: 'string' }, 'not a schema'], '')).toBe(false);
    expect(merge(draw(), [{ type: 'string', anyOf: [{}] }, { anyOf: [{ type: 'integer' }] }], '')).toBe(false);
    expect(merge(draw(), [{ type: 'string', anyOf: [{}] }, { anyOf: [{ type: 'integer' }] }, { title: 't' }], '')).toBe(false);
  });

  it('reports additionalProperties only where parts are merged', () => {
    const one = draw();
    merge(one, [{ additionalProperties: false }], '');
    expect(one.reported.size).toBe(0);
    const two = draw();
    merge(two, [{ additionalProperties: false }, {}], '');
    expect([...two.reported.keys()]).toEqual(['additionalProperties']);
    const referred = draw({ $defs: { o: { type: 'object', additionalProperties: false } } });
    expect(merge(referred, [{ $ref: '#/$defs/o' }], '')).toEqual({ type: 'object', additionalProperties: false });
    expect(referred.reported.size).toBe(0);
  });

  it('picks a branch of a second any-of, and leaves a first one be', () => {
    expect(merge(draw(), [{ anyOf: [{ type: 'string' }] }, { anyOf: [{ maxLength: 2 }] }], '')).toEqual({ anyOf: [{ type: 'string' }], maxLength: 2 });
    expect(merge(draw(), [{ type: 'string' }, { anyOf: [{ maxLength: 2 }] }], '')).toEqual({ type: 'string', anyOf: [{ maxLength: 2 }] });
    // Keywords beside the second list, before or after it, are all kept.
    expect(merge(draw(), [{ anyOf: [{ type: 'integer' }] }, { anyOf: [{ minimum: 10 }], maximum: 20 }], '')).toEqual({ anyOf: [{ type: 'integer' }], minimum: 10, maximum: 20 });
    expect(merge(draw(), [{ anyOf: [{ type: 'integer' }] }, { maximum: 20, anyOf: [{ minimum: 10 }] }], '')).toEqual({ anyOf: [{ type: 'integer' }], maximum: 20, minimum: 10 });
    agrees({ allOf: [{ anyOf: [{ type: 'integer' }] }, { anyOf: [{ minimum: 10 }], maximum: 20 }] });
  });

  it('follows references: alone in any dialect, beside keywords as both in 2020-12, and the reference alone before it', () => {
    const root = { $defs: { s: { type: 'string', maxLength: 4 } } };
    expect(merge(draw(root), [{ $ref: '#/$defs/s' }], '')).toEqual({ type: 'string', maxLength: 4 });
    expect(merge(draw(root), [{ $ref: '#/$defs/s', maxLength: 2 }], '')).toEqual({ type: 'string', maxLength: 2 });
    expect(merge(draw(root, 'draft-07'), [{ $ref: '#/$defs/s', maxLength: 2 }], '')).toEqual({ type: 'string', maxLength: 4 });
    expect(merge(draw(root, 'draft-07'), [{ $ref: '#/$defs/nowhere' }], '')).toBe(false);
  });

  it('ends a schema made of itself, as false', () => {
    const root = { $defs: { a: { allOf: [{ $ref: '#/$defs/a' }] } } };
    expect(merge(draw(root), [{ $ref: '#/$defs/a' }], '')).toBe(false);
    expect(make(draw(root), { $ref: '#/$defs/a' })).toBeUndefined();
    expect(make(draw({ $defs: { a: { $ref: '#/$defs/a' } } }), { $ref: '#/$defs/a' })).toBeUndefined();
    expect(merge(draw({ $defs: { a: { $ref: '#/$defs/a' } } }), [{ $ref: '#/$defs/a' }], '')).toBe(false);
    expect(merge(draw({ $defs: { a: { $ref: '#/$defs/a', title: 't' } } }), [{ $ref: '#/$defs/a' }], '')).toBe(false);
  });

  it('follows 23 references in a row, and ends at the 24th', () => {
    expect(merge(draw(chain(23)), [{ $ref: '#/$defs/d23' }], '')).toEqual({ type: 'string' });
    expect(merge(draw(chain(24)), [{ $ref: '#/$defs/d24' }], '')).toBe(false);
  });
});

describe('make: the edges of what it draws', () => {
  it('draws integers across the whole window when unbounded, and multiples', () => {
    expect(extremes(values({ type: 'integer' }, { count: 3000 }) as number[])).toEqual([-100, 100]);
    expect(extremes(values({ type: 'integer', multipleOf: 3, minimum: -4, maximum: 7 }, { count: 500 }) as number[])).toEqual([-3, 6]);
    expect(values({ type: 'integer', multipleOf: 5, minimum: 5, maximum: 5 }, { count: 3 })).toEqual([5, 5, 5]);
  });

  it('makes from defaults: a true schema gives a value, and a report names the root as /', () => {
    const draw = drawFrom(randomFrom(1), {}, '2020-12');
    expect(make(draw, true)).toHaveProperty('value');
    make(draw, { type: 'string', pattern: 'a' });
    expect([...draw.reported]).toEqual([['pattern', new Set(['/'])]]);
  });

  it('draws fractions across the range, and never past it', () => {
    const drawn = (values({ type: 'number', minimum: 0, maximum: 1000 }, { count: 2000 }) as number[]).filter((value) => !Number.isInteger(value));
    const [low, high] = extremes(drawn);
    const shifted = (values({ type: 'number', minimum: 100.5, maximum: 1000 }, { count: 2000 }) as number[]).filter((value) => value === 550.25);
    expect(shifted.length).toBeLessThan(5);
    expect(low).toBeGreaterThanOrEqual(0);
    expect(low).toBeLessThan(100);
    expect(high).toBeGreaterThan(900);
    expect(high).toBeLessThanOrEqual(1000);
  });

  it('draws strings from no characters up to eight more than the minimum, and treats a length that is not a number as none', () => {
    expect(extremes((values({ type: 'string' }, { count: 2000 }) as string[]).map((text) => [...text].length))).toEqual([0, 8]);
    expect(extremes((values({ type: 'string', minLength: 'x' }, { count: 2000 }) as string[]).map((text) => [...text].length))).toEqual([0, 8]);
    expect(extremes((values({ type: 'string', minLength: 3 }, { count: 2000 }) as string[]).map((text) => [...text].length))).toEqual([3, 11]);
  });

  it('draws arrays from no items up to four more than the minimum', () => {
    expect(extremes((values({ type: 'array', items: { const: 0 } }, { count: 2000 }) as unknown[][]).map((items) => items.length))).toEqual([0, 4]);
  });

  it('draws every part of a date and time across its range', () => {
    const dates = formatted('date').map((text) => text.split('-').map(Number));
    expect(extremes(dates.map(([year]) => year as number))).toEqual([1970, 2099]);
    expect(extremes(dates.map(([, month]) => month as number))).toEqual([1, 12]);
    expect(extremes(dates.map(([, , day]) => day as number))).toEqual([1, 28]);
    const times = formatted('time');
    expect(extremes(times.map((text) => Number(text.slice(0, 2))))).toEqual([0, 23]);
    expect(extremes(times.map((text) => Number(text.slice(3, 5))))).toEqual([0, 59]);
    expect(extremes(times.map((text) => Number(text.slice(6, 8))))).toEqual([0, 59]);
    expect(new Set(times.map((text) => text.slice(8)))).toEqual(new Set(['Z', '+00:00', '.5Z']));
  });

  it('draws durations, names, addresses, patterns and bytes across their ranges', () => {
    expect(extremes(formatted('duration').flatMap((text) => (text.match(/\d+/g) ?? []).map(Number)))).toEqual([1, 9]);
    expect(extremes(formatted('hostname').flatMap((text) => text.split('.').slice(0, 2).map((part) => part.length)))).toEqual([1, 6]);
    expect(extremes(formatted('ipv4').flatMap((text) => text.split('.').map(Number)))).toEqual([0, 255]);
    expect(new Set(formatted('regex', 500))).toEqual(new Set(['^a$', '[0-9]+', 'x|y', String.raw`\d{2,4}`]));
    const bytes = formatted('byte').map((text) => [...Buffer.from(text, 'base64')]);
    expect(extremes(bytes.map((list) => list.length))).toEqual([0, 9]);
    expect(extremes(bytes.flat())).toEqual([0, 255]);
  });

  it('reports a length beside a format it makes', () => {
    expect([...(sample({ type: 'string', format: 'uuid', minLength: 1 }, { count: 1 })[0]?.reported.keys() ?? [])]).toEqual(['format-length']);
  });

  it('makes any JSON value at the top, numbers across the window, and only scalars at the soft depth and below it', () => {
    const random = randomFrom(4);
    const top = Array.from({ length: 6000 }, () => anyValue(drawFrom(random, {}, '2020-12'), 0));
    expect(new Set(top.map(kindOf))).toEqual(new Set(['null', 'boolean', 'integer', 'number', 'string', 'array', 'object']));
    expect(new Set(top.filter((value) => typeof value === 'boolean'))).toEqual(new Set([true, false]));
    expect(extremes(top.filter((value) => kindOf(value) === 'integer') as number[])).toEqual([-100, 100]);
    const fractions = top.filter((value) => kindOf(value) === 'number') as number[];
    expect(extremes(fractions)[0]).toBeLessThan(-90);
    expect(extremes(fractions)[1]).toBeGreaterThan(90);
    expect(extremes(top.filter(Array.isArray).map((items) => items.length))).toEqual([0, 2]);
    expect(top.filter(Array.isArray).flat().includes(undefined)).toBe(false);
    expect(extremes(top.filter((value) => kindOf(value) === 'object').map((entries) => Object.keys(entries as object).length))).toEqual([0, 2]);
    const deep = Array.from({ length: 300 }, () => anyValue(drawFrom(random, {}, '2020-12'), SOFT_DEPTH));
    expect(deep.some((value) => typeof value === 'object' && value !== null)).toBe(false);
    const below = Array.from({ length: 1000 }, () => anyValue(drawFrom(random, {}, '2020-12'), SOFT_DEPTH - 1));
    const children = below.flatMap((value) => (kindOf(value) === 'array' || kindOf(value) === 'object' ? Object.values(value as object) : []));
    expect(children.length).toBeGreaterThan(0);
    expect(children.some((value) => typeof value === 'object' && value !== null)).toBe(false);
  });
});

describe('make: depth, told apart', () => {
  it('makes only the items and properties required, one level past the soft depth', () => {
    expect(new Set(madeAt({ type: 'array', minItems: 1, items: { type: 'array', items: { const: 0 } } }, SOFT_DEPTH - 1).flatMap((value) => (value as unknown[][]).map((inner) => inner.length)))).toEqual(new Set([0]));
    const objects = madeAt({ type: 'object', properties: { a: { type: 'object', properties: { b: { const: 1 } } } } }, SOFT_DEPTH - 1) as { a?: unknown }[];
    expect(objects.some((value) => 'a' in value)).toBe(true);
    expect(objects.every((value) => !('a' in value) || JSON.stringify(value.a) === '{}')).toBe(true);
    expect(madeAt({ type: 'object', minProperties: 2, properties: { a: { const: 1 }, b: { const: 2 } }, additionalProperties: false }, SOFT_DEPTH, 20)).toEqual(Array.from({ length: 20 }, () => ({ a: 1, b: 2 })));
    expect(new Set(madeAt({ type: 'object', minProperties: 3 }, SOFT_DEPTH, 20).map((value) => Object.keys(value as object).join()))).toEqual(new Set(['extra,extra_,extra__']));
  });

  it('counts a level for each reference, all-of and any-of it passes through', () => {
    const root = { $defs: { s: { type: 'array', items: { const: 0 } } } };
    const through = (schema: unknown): number[] => {
      const random = randomFrom(3);
      return Array.from({ length: 100 }, () => (make(drawFrom(random, root, '2020-12'), schema, '', SOFT_DEPTH - 1)?.value as unknown[]).length);
    };
    expect(new Set(through({ $ref: '#/$defs/s' }))).toEqual(new Set([0]));
    expect(new Set(through({ allOf: [{ $ref: '#/$defs/s' }] }))).toEqual(new Set([0]));
    expect(new Set(through({ anyOf: [{ type: 'array', items: { const: 0 } }] }))).toEqual(new Set([0]));
    expect(new Set(through({ $ref: '#/$defs/s', minItems: 0 }))).toEqual(new Set([0]));
    const twoUp = randomFrom(3);
    const lengths = Array.from({ length: 100 }, () => (make(drawFrom(twoUp, root, '2020-12'), { $ref: '#/$defs/s', minItems: 0 }, '', SOFT_DEPTH - 2)?.value as unknown[]).length);
    expect(new Set(lengths)).toEqual(new Set([0]));
  });

  it('starts at the top when no depth is given', () => {
    // Three levels that must have an item, around one that may: at the top it sometimes does; a level lower it never would.
    let schema: unknown = { type: 'array', items: { const: 0 } };
    for (let level = 1; level < SOFT_DEPTH; level += 1) schema = { type: 'array', minItems: 1, items: schema };
    const random = randomFrom(3);
    expect(Array.from({ length: 50 }, () => JSON.stringify(make(drawFrom(random, {}, '2020-12'), schema)?.value)).some((text) => text.includes('0'))).toBe(true);
  });

  it('makes a value at the hard depth, and none past it', () => {
    expect(make(drawFrom(randomFrom(1), {}, '2020-12'), { type: 'null' }, '', HARD_DEPTH)).toEqual({ value: null });
  });
});

describe('make: objects, told apart', () => {
  it('stops at maxProperties, and never adds beside additionalProperties false or patternProperties', () => {
    const capped = values({ type: 'object', maxProperties: 1, properties: { a: { const: 1 }, b: { const: 2 }, c: { const: 3 } } }, { count: 300 });
    expect(capped).toHaveLength(300);
    expect(Math.max(...capped.map((value) => Object.keys(value as object).length))).toBe(1);
    expect(Math.max(...values({ type: 'object', maxProperties: 1 }, { count: 300 }).map((value) => Object.keys(value as object).length))).toBe(1);
    expect(values({ type: 'object', properties: { a: { const: 1 } }, additionalProperties: false }, { count: 300 }).every((value) => Object.keys(value as object).every((key) => key === 'a'))).toBe(true);
    expect(values({ type: 'object', patternProperties: { '^x': true } }, { count: 300 }).every((value) => Object.keys(value as object).length === 0)).toBe(true);
    expect(values({ type: 'object' }, { count: 300 }).some((value) => 'extra' in (value as object))).toBe(true);
  });

  it('makes a required property it does not name from what the schema allows beside them', () => {
    expect(values({ type: 'object', required: ['n'] }, { count: 20 })).toHaveLength(20);
  });

  it('reports a keyword where it was met: in a property, or in what is allowed beside them', () => {
    const named = sample({ type: 'object', minProperties: 1, properties: { a: { type: 'string', pattern: 'x' } } }, { count: 20 });
    expect(named.every(({ reported }) => [...(reported.get('pattern') ?? [])].join() === '/properties/a')).toBe(true);
    const beside = sample({ type: 'object', minProperties: 1, additionalProperties: { type: 'string', pattern: 'x' } }, { count: 20 });
    expect(beside.every(({ reported }) => [...(reported.get('pattern') ?? [])].join() === '/additionalProperties')).toBe(true);
  });

  it('does not report a list beside annotations only', () => {
    const [drawn] = sample({ const: 1, description: 'one' }, { count: 1 });
    expect([drawn?.exact, drawn?.reported.size]).toEqual([true, 0]);
  });
});

describe('make: arrays and unions, told apart', () => {
  it('always fills a closed tuple', () => {
    expect(values({ type: 'array', prefixItems: [{ const: 1 }, { const: 2 }], items: false }, { count: 100 })).toHaveLength(100);
  });

  it('draws from an any-of, and reads an empty one as none', () => {
    expect(values({ anyOf: [{ type: 'string', minLength: 1 }] }, { count: 100 }).every((value) => typeof value === 'string' && value.length > 0)).toBe(true);
    const fromEmpty = values({ anyOf: [], type: 'string' }, { count: 50 });
    expect(fromEmpty).toHaveLength(50);
    expect(fromEmpty.every((value) => typeof value === 'string')).toBe(true);
    expect(values({ oneOf: [{ type: 'string', minLength: 1 }] }, { count: 100 }).every((value) => typeof value === 'string' && value.length > 0)).toBe(true);
  });
});

