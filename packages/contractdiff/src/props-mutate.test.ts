import { describe, expect, it } from 'vitest';

import { type Draft, drawFrom, make } from './props-generate.js';
import { rooted, validatorJudge } from './props-judge.js';
import { mutants, mutate } from './props-mutate.js';
import { randomFrom } from './props-random.js';

/** Every break `mutate` makes of values drawn from `schema`: the keyword, where, and whether the validator refused it there. */
const breaks = (schema: unknown, options: { draft?: Draft; root?: unknown; count?: number } = {}) => {
  const draft = options.draft ?? '2020-12';
  const root = options.root ?? schema;
  const judge = validatorJudge(rooted(schema, root), draft);
  const random = randomFrom(5);
  return Array.from({ length: options.count ?? 200 }, () => {
    const draw = drawFrom(random, root, draft);
    const made = make(draw, schema, '', 0);
    const mutant = made === undefined ? undefined : mutate(draw, schema, made.value);
    return mutant === undefined ? undefined : { ...mutant, refusedAt: judge.paths(mutant.value) };
  }).filter((found) => found !== undefined);
};

const keywords = (schema: unknown, options: Parameters<typeof breaks>[1] = {}): Set<string> => new Set(breaks(schema, options).map((found) => `${found.keyword} ${found.path}`));

describe('mutate', () => {
  it.each([
    ['type', { type: 'string' }, ['type ']],
    ['a value list', { type: 'string', enum: ['a', 'b'] }, ['type ', 'enum ']],
    ['a value list of mixed kinds', { type: ['string', 'object', 'null', 'boolean', 'number', 'array'], enum: ['abx', { b: 1 }] }, ['enum ']],
    ['a constant', { type: 'integer', const: 3 }, ['type ', 'const ']],
    ['integer bounds', { type: 'integer', minimum: 1, maximum: 5 }, ['type ', 'minimum ', 'maximum ']],
    ['exclusive integer bounds', { type: 'integer', exclusiveMinimum: 0.5, exclusiveMaximum: 5 }, ['type ', 'exclusiveMinimum ', 'exclusiveMaximum ']],
    ['number bounds', { type: 'number', minimum: 1.5, maximum: 2.5 }, ['type ', 'minimum ', 'maximum ']],
    ['exclusive number bounds', { type: 'number', exclusiveMinimum: 1, exclusiveMaximum: 2 }, ['type ', 'exclusiveMinimum ', 'exclusiveMaximum ']],
    ['a multiple', { type: 'integer', multipleOf: 3, minimum: 0, maximum: 9 }, ['type ', 'minimum ', 'maximum ', 'multipleOf ']],
    ['string lengths', { type: 'string', minLength: 2, maxLength: 4 }, ['type ', 'minLength ', 'maxLength ']],
    ['array lengths', { type: 'array', minItems: 1, maxItems: 2, items: { type: 'boolean' } }, ['type ', 'minItems ', 'maxItems ', 'type /0', 'type /1']],
    ['a tuple', { type: 'array', prefixItems: [{ type: 'integer' }], items: { type: 'string' }, minItems: 2, maxItems: 2 }, ['type ', 'minItems ', 'maxItems ', 'type /0', 'type /1']],
    ['an object', { type: 'object', required: ['a'], properties: { a: { type: 'string' } }, additionalProperties: false }, ['type ', 'required /a', 'additionalProperties /extra', 'type /a']],
  ])('breaks %s, and the validator refuses each break where it was made', (_name, schema, expected) => {
    const found = breaks(schema);
    expect(new Set(found.map((each) => `${each.keyword} ${each.path}`))).toEqual(new Set(expected));
    for (const each of found) expect(each.refusedAt, JSON.stringify(each)).toContain(each.path);
  });

  it('breaks OpenAPI 3.0 boolean exclusive bounds at the bound, and never with a type `nullable` allows', () => {
    const schema = { type: 'integer', nullable: true, minimum: 1, exclusiveMinimum: true, maximum: 4, exclusiveMaximum: true };
    const found = breaks(schema, { draft: 'openapi-3.0' });
    expect(new Set(found.map((each) => `${each.keyword}=${JSON.stringify(each.value)}`))).toEqual(new Set(['type=true', 'exclusiveMinimum=1', 'exclusiveMaximum=4']));
  });

  it('follows a reference that is the whole of its schema, and breaks nothing behind one with siblings in 2020-12', () => {
    const root = { $defs: { Name: { type: 'string', maxLength: 3 } } };
    expect(keywords({ $ref: '#/$defs/Name' }, { root })).toEqual(new Set(['type ', 'maxLength ']));
    expect(keywords({ $ref: '#/$defs/Name', minLength: 1 }, { root })).toEqual(new Set());
    expect(keywords({ $ref: '#/$defs/Name', minLength: 1 }, { root, draft: 'draft-07' })).toEqual(new Set(['type ', 'maxLength ']));
    expect(keywords({ $ref: '#/$defs/Name', description: 'a note' }, { root })).toEqual(new Set(['type ', 'maxLength ']));
  });

  it('breaks nothing it cannot be sure of: unions, reported keywords, untyped schemas, a reference that names nothing', () => {
    for (const schema of [{ anyOf: [{ type: 'string' }] }, { type: 'string', pattern: 'a' }, { type: 'string', allOf: [{ maxLength: 2 }] }, { minLength: 1 }, true]) {
      expect(keywords(schema, { count: 30 })).toEqual(new Set());
    }
    expect(mutate(drawFrom(randomFrom(1), {}, '2020-12'), { $ref: '#/nowhere' }, 'x')).toBeUndefined();
    expect(mutate(drawFrom(randomFrom(1), {}, '2020-12'), { type: ['string', 'number', 'integer', 'boolean', 'null', 'array', 'object'] }, 'x')).toBeUndefined();
  });

  it('keeps `minProperties` and `maxProperties` from failing alongside the break', () => {
    const tight = { type: 'object', required: ['a'], properties: { a: { const: 1 } }, minProperties: 1, maxProperties: 1, additionalProperties: false };
    expect(keywords(tight)).toEqual(new Set(['type ']));
    const room = { type: 'object', required: ['a'], properties: { a: { const: 1 } }, minProperties: 0, maxProperties: 2, additionalProperties: false };
    // `a` has no `type`, so nothing below the object is broken: an untyped schema has no sure break.
    expect(keywords(room)).toEqual(new Set(['type ', 'required /a', 'additionalProperties /extra']));
  });

  it('breaks no bound that is not there to break', () => {
    expect(keywords({ type: 'array', minItems: 0, maxItems: 0 })).toEqual(new Set(['type ']));
    const draw = drawFrom(randomFrom(1), {}, '2020-12');
    for (let index = 0; index < 20; index += 1) expect(mutate(draw, { type: 'object', required: ['a'] }, {})?.keyword).toBe('type');
  });

  it('breaks a multiple only where a neighbour is still in range, and gives up past the depth limit', () => {
    expect(keywords({ type: 'integer', multipleOf: 2, minimum: 4, maximum: 4 })).toEqual(new Set(['type ', 'minimum ', 'maximum ']));
    let deep: unknown = { type: 'integer' };
    for (let index = 0; index < 10; index += 1) deep = { type: 'object', required: ['n'], properties: { n: deep } };
    expect([...keywords(deep)].every((found) => found.split('/').length <= 10)).toBe(true);
  });

  it('prefers a rarer break to a `type` break: three times in four, and half the rest', () => {
    const found = breaks({ type: 'string', maxLength: 3 }, { count: 400 });
    const rarer = found.filter((each) => each.keyword !== 'type').length;
    // 0.75 + 0.25 × 1/2 = 0.875 of 400 is 350.
    expect(rarer).toBeGreaterThan(320);
    expect(rarer).toBeLessThan(380);
  });

  it('leaves an extra property name free of every name the value and schema hold', () => {
    const schema = { type: 'object', properties: { extra: { type: 'integer' } }, additionalProperties: false };
    const draw = drawFrom(randomFrom(2), schema, '2020-12');
    const seen = new Set<string>();
    for (let index = 0; index < 50; index += 1) seen.add(mutate(draw, schema, { extra: 1 })?.path ?? '');
    expect(seen).toContain('/extra_');
  });
});

/** Every break of `value` under `schema`, as [keyword, path, broken value]. */
const every = (schema: unknown, value: unknown, draft: Draft = '2020-12'): unknown[] => mutants(drawFrom(randomFrom(1), schema, draft), schema, value).map((found) => [found.keyword, found.path, found.value]);

/** `levels` arrays around a string, and a value of that shape. */
const nested = (levels: number): [unknown, unknown] => {
  let schema: unknown = { type: 'string' };
  let value: unknown = 's';
  for (let level = 0; level < levels; level += 1) {
    schema = { type: 'array', items: schema };
    value = [value];
  }
  return [schema, value];
};

/** A string schema behind `links` references, one after another. */
const chained = (links: number): Record<string, unknown> => {
  const defs: Record<string, unknown> = { d0: { type: 'string' } };
  for (let link = 1; link <= links; link += 1) defs[`d${String(link)}`] = { $ref: `#/$defs/d${String(link - 1)}` };
  return { $defs: defs, $ref: `#/$defs/d${String(links)}` };
};

describe('mutants', () => {
  it.each([
    ['null', { type: 'null' }, null, [['type', '', true]]],
    ['an object', { type: 'object' }, {}, [['type', '', null]]],
    ['all but numbers', { type: ['null', 'boolean', 'string', 'integer'] }, 1, [['type', '', 1.5]]],
    ['all but arrays', { type: ['null', 'boolean', 'string', 'number', 'object'] }, 1, [['type', '', []]]],
    ['a schema a union could make valid again', { type: 'integer', maximum: 3, anyOf: [{}] }, 1, []],
    ['a constant', { type: 'integer', const: 5 }, 5, [['type', '', null], ['const', '', { not: 5 }]]],
    ['a value list', { type: 'string', enum: ['a', 'bc'] }, 'a', [['type', '', null], ['enum', '', '"a""bc"x']]],
    ['integer bounds off whole numbers', { type: 'integer', minimum: 0.5, maximum: 3.5 }, 2, [['type', '', null], ['minimum', '', 0], ['maximum', '', 4]]],
    ['number bounds', { type: 'number', minimum: 0.5, maximum: 3.5 }, 2, [['type', '', null], ['minimum', '', -0.5], ['maximum', '', 4.5]]],
    ['number bounds where one more rounds back onto them', { type: 'number', minimum: -(2 ** 53), maximum: 2 ** 53 }, 0, [['type', '', null], ['minimum', '', -(2 ** 53) - 2], ['maximum', '', 2 ** 53 + 2]]],
    ['an int64 bound written as the double 2^63', { type: 'integer', minimum: 0, maximum: 2 ** 63 }, 1, [['type', '', null], ['minimum', '', -1], ['maximum', '', 2 ** 63 + 2048]]],
    ['excluded number bounds', { type: 'number', exclusiveMinimum: 0.5, exclusiveMaximum: 3.5 }, 2, [['type', '', null], ['exclusiveMinimum', '', 0.5], ['exclusiveMaximum', '', 3.5]]],
    ['a multiple at the top of its range', { type: 'integer', multipleOf: 3, minimum: 0, maximum: 6 }, 6, [['type', '', null], ['minimum', '', -1], ['maximum', '', 7], ['multipleOf', '', 5]]],
    ['a multiple at the bottom of its range', { type: 'integer', multipleOf: 3, minimum: 0, maximum: 6 }, 0, [['type', '', null], ['minimum', '', -1], ['maximum', '', 7], ['multipleOf', '', 1]]],
    ['a multiple with no room beside it', { type: 'integer', multipleOf: 3, minimum: 3, maximum: 3 }, 3, [['type', '', null], ['minimum', '', 2], ['maximum', '', 4]]],
    ['a multiple that may step up to its top', { type: 'integer', multipleOf: 3, minimum: 0, maximum: 4 }, 3, [['type', '', null], ['minimum', '', -1], ['maximum', '', 5], ['multipleOf', '', 4]]],
    ['a multiple that may only step down to its bottom', { type: 'integer', multipleOf: 3, minimum: 2, maximum: 3 }, 3, [['type', '', null], ['minimum', '', 1], ['maximum', '', 4], ['multipleOf', '', 2]]],
    ['a multiple of one', { type: 'integer', multipleOf: 1 }, 3, [['type', '', null]]],
    ['a fractional multiple', { type: 'number', multipleOf: 2.5 }, 5, [['type', '', null]]],
    ['string lengths, in code points', { type: 'string', minLength: 2, maxLength: 4 }, 'a😀c', [['type', '', null], ['minLength', '', 'a'], ['maxLength', '', 'a😀caa']]],
    ['an empty string', { type: 'string', minLength: 0, maxLength: 1 }, '', [['type', '', null], ['maxLength', '', 'aa']]],
    ['a long string', { type: 'string', minLength: 1 }, 'ab', [['type', '', null], ['minLength', '', '']]],
    ['a number keyword on a string', { type: 'string', minimum: 1 }, 'a', [['type', '', null]]],
    ['array lengths', { type: 'array', minItems: 2, maxItems: 3, items: { type: 'integer' } }, [1, 2], [['type', '', null], ['minItems', '', [1]], ['maxItems', '', [1, 2, 1, 1]], ['type', '/0', [null, 2]], ['type', '/1', [1, null]]]],
    ['an empty array', { type: 'array', minItems: 0, maxItems: 0 }, [], [['type', '', null]]],
    ['an array of one', { type: 'array', maxItems: 1 }, [1], [['type', '', null], ['maxItems', '', [1, 1]]]],
    ['a tuple item with a bound of its own', { type: 'array', prefixItems: [{ type: 'integer', maximum: 3 }], items: { type: 'integer' } }, [1, 2], [['type', '', null], ['type', '/0', [null, 2]], ['maximum', '/0', [4, 2]], ['type', '/1', [1, null]]]],
    ['a required property inside a property', { type: 'object', properties: { o: { type: 'object', required: ['a'] } } }, { o: { a: 1 } }, [['type', '', null], ['type', '/o', { o: null }], ['required', '/o/a', { o: {} }]]],
    ['a long array', { type: 'array', minItems: 1 }, [1, 2], [['type', '', null], ['minItems', '', []]]],
    ['a tuple', { type: 'array', prefixItems: [{ type: 'integer' }], items: { type: 'string' } }, [1, 's'], [['type', '', null], ['type', '/0', [null, 's']], ['type', '/1', [1, null]]]],
    [
      'an object',
      { type: 'object', required: ['a', 'b'], properties: { a: { type: 'string' } }, additionalProperties: false },
      { a: 's', b: 1 },
      [['type', '', null], ['required', '/a', { b: 1 }], ['required', '/b', { a: 's' }], ['additionalProperties', '/extra', { a: 's', b: 1, extra: null }], ['type', '/a', { a: null, b: 1 }]],
    ],
    ['an object with no room for fewer or more', { type: 'object', required: ['a'], minProperties: 1, maxProperties: 1, additionalProperties: false }, { a: 1 }, [['type', '', null]]],
    [
      'objects in an array',
      { type: 'array', items: { type: 'object', required: ['a'], properties: { a: { type: 'integer' } }, additionalProperties: false } },
      [{ a: 1 }, { a: 2 }],
      [
        ['type', '', null],
        ['type', '/0', [null, { a: 2 }]],
        ['required', '/0/a', [{}, { a: 2 }]],
        ['additionalProperties', '/0/extra', [{ a: 1, extra: null }, { a: 2 }]],
        ['type', '/0/a', [{ a: null }, { a: 2 }]],
        ['type', '/1', [{ a: 1 }, null]],
        ['required', '/1/a', [{ a: 1 }, {}]],
        ['additionalProperties', '/1/extra', [{ a: 1 }, { a: 2, extra: null }]],
        ['type', '/1/a', [{ a: 1 }, { a: null }]],
      ],
    ],
  ])('%s', (_name, schema, value, expected) => {
    expect(every(schema, value)).toEqual(expected);
  });

  it('reads OpenAPI 3.0 exclusive flags', () => {
    expect(every({ type: 'integer', minimum: 1, exclusiveMinimum: false, maximum: 4, exclusiveMaximum: true }, 2, 'openapi-3.0')).toEqual([['type', '', null], ['minimum', '', 0], ['exclusiveMaximum', '', 4]]);
    expect(every({ type: 'integer', minimum: 1, exclusiveMinimum: true, maximum: 4, exclusiveMaximum: false }, 2, 'openapi-3.0')).toEqual([['type', '', null], ['exclusiveMinimum', '', 1], ['maximum', '', 5]]);
  });

  it('follows a reference, ignoring its siblings before 2020-12, and gives up on one that names nothing', () => {
    expect(every({ $defs: { s: { type: 'string', maxLength: 1 } }, $ref: '#/$defs/s', type: 'string' }, 's', 'draft-07')).toEqual([['type', '', null], ['maxLength', '', 'sa']]);
    expect(every({ $ref: '#/nowhere', type: 'string' }, 's', 'draft-07')).toEqual([]);
  });

  it('follows eight references and walks eight levels down, and no further', () => {
    expect(every(chained(7), 's')).toEqual([['type', '', null]]);
    expect(every(chained(8), 's')).toEqual([]);
    expect(every(...nested(8))).toHaveLength(9);
    expect(every(...nested(9))).toHaveLength(9);
  });
});

describe('mutate', () => {
  it('draws nothing from the random stream when nothing can be broken', () => {
    const random = randomFrom(9);
    expect(mutate(drawFrom(random, {}, '2020-12'), {}, 1)).toBeUndefined();
    expect(random.next()).toBe(randomFrom(9).next());
  });
});
