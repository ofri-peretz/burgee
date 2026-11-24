import { describe, expect, it } from 'vitest';

import { check } from './check.js';
import { type Draft, fromJsonSchema, type JsonSchema, toJsonSchema } from './json-schema.js';
import { type AnySchema, bigint, boolean, lazy, literal, number, object, string, tuple } from './schema.js';

/**
 * The JSON Schema round trip settles (gap A-20261118-validator-tuple-roundtrip-grows): a document
 * read by `fromJsonSchema` and written by `toJsonSchema` is written the same the next time round.
 * A tuple used to grow on every pass: its length, written as `minItems`, was read as "any fewer
 * items too", one more union of shorter tuples each time.
 */

const DRAFTS: readonly Draft[] = ['2020-12', 'draft-07'];

/** One pass: the document read, and written in the same draft. */
const pass = (document: JsonSchema, draft: Draft): JsonSchema => {
  const { schema, findings } = fromJsonSchema(document);
  expect(findings).toEqual([]);
  return toJsonSchema(schema, { draft }).schema;
};

const shared = string({ min: 1 });

/** Every shape of tuple the validator's tests build. */
const TUPLES: readonly (readonly [string, AnySchema])[] = [
  ['nothing', tuple([])],
  ['nothing but a rest', tuple([], { rest: number() })],
  ['one item', tuple([literal(1)])],
  ['two items', tuple([string(), number()])],
  ['two bounded numbers', tuple([number({ positive: true }), number({ negative: true })])],
  ['four literals', tuple([literal('a'), literal(0), literal(false), literal('')])],
  ['one item and a rest', tuple([string()], { rest: number() })],
  ['two items and a rest', tuple([string(), boolean()], { rest: tuple([number()]) })],
  ['a tuple in a tuple', tuple([tuple([string()]), tuple([], { rest: number() })])],
  ['a tuple in an object', object({ n: number(), t: tuple([literal(1)]) })],
  ['shared schemas by reference', tuple([lazy(() => shared), boolean(), lazy(() => shared), boolean()])],
];

describe('the round trip of a tuple', () => {
  it.each(TUPLES.flatMap(([name, schema]) => DRAFTS.map((draft) => [name, draft, schema] as const)))('settles after one pass: %s, in %s', (_, draft, schema) => {
    const first = toJsonSchema(schema, { draft }).schema;
    const second = pass(first, draft);
    // Written back as it was written: the pass changes nothing, so every pass after it changes nothing.
    expect(second).toStrictEqual(first);
    expect(pass(second, draft)).toStrictEqual(second);
  });

  it('writes a tuple that is not of JSON values the same on every pass too', () => {
    const { schema } = fromJsonSchema(toJsonSchema(tuple([string(), bigint()])).schema);
    const once = toJsonSchema(schema).schema;
    expect(toJsonSchema(fromJsonSchema(once).schema).schema).toStrictEqual(once);
  });
});

/** What a document of first items, a rest and two bounds accepts, worked out by hand: the oracle the reading is held to. */
const accepts = (shape: { prefix: number; rest: 'any' | 'none' | 'string'; min?: number; max?: number }, value: readonly unknown[]): boolean => {
  if (value.length < (shape.min ?? 0) || value.length > (shape.max ?? Number.POSITIVE_INFINITY)) return false;
  return value.every((item, index) => {
    if (index < shape.prefix) return typeof item === 'number';
    return shape.rest === 'any' || (shape.rest === 'string' && typeof item === 'string');
  });
};

const VALUES: readonly (readonly unknown[])[] = [[], [1], ['a'], [1, 2], [1, 'a'], [1, 2, 3], [1, 2, 'a'], [1, 2, 3, 4], [1, 2, 'a', 'b'], ['a', 'b', 'c', 'd']];
const BOUNDS = [undefined, 0, 1, 2, 3];

describe('the round trip of first items and bounds', () => {
  const shapes = [1, 2, 3].flatMap((prefix) =>
    (['any', 'none', 'string'] as const).flatMap((rest) => BOUNDS.flatMap((min) => BOUNDS.map((max) => ({ prefix, rest, ...(min !== undefined && { min }), ...(max !== undefined && { max }) })))),
  );

  it.each(DRAFTS)('reads every one as the document means it, and settles after one pass, in %s', (draft) => {
    for (const shape of shapes) {
      const items = Array.from({ length: shape.prefix }, () => ({ type: 'number' }));
      const rest = { any: {}, none: false, string: { type: 'string' } }[shape.rest];
      const [first, after] = draft === '2020-12' ? ['prefixItems', 'items'] : ['items', 'additionalItems'];
      const document = {
        $schema: toJsonSchema(tuple([]), { draft }).schema['$schema'],
        type: 'array',
        [first]: items,
        ...(shape.rest !== 'any' && { [after]: rest }),
        ...(shape.min !== undefined && { minItems: shape.min }),
        ...(shape.max !== undefined && { maxItems: shape.max }),
      };
      const { schema } = fromJsonSchema(document);
      expect(VALUES.map((value) => check(schema, value)), JSON.stringify(document)).toEqual(VALUES.map((value) => accepts(shape, value)));
      const once = pass(document, draft);
      expect(pass(once, draft), JSON.stringify(document)).toStrictEqual(once);
    }
  });
});
