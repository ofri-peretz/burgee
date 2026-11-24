/**
 * Gap A-20261118-diff-false-breaking-equivalent-rewrites: a pair that accepts the same values is no
 * break, however each side is written; a pair that looks alike but accepts fewer values still is.
 */
import { date, datetime, duration, email, hostname, ipv4, ipv6, time, uuid } from 'truefit/formats';
import { describe, expect, it } from 'vitest';

import { classify } from './diff-classify.js';
import { normalise, typeOfValue, valuesOfTypes } from './diff-normalise.js';
import { compareSchemas, type Documents } from './diff-schema.js';

const changes = (a: unknown, b: unknown, documents?: Documents) => compareSchemas(a as never, b as never, 'request', documents);

/** The worst verdict on a request payload under `full`: any change of the value set breaks. */
const verdict = (a: unknown, b: unknown, documents?: Documents): string => {
  const verdicts = changes(a, b, documents).map((change) => classify(change, 'request', 'full', 'caller'));
  if (verdicts.includes('breaking')) return 'breaking';
  return verdicts.includes('unknown') ? 'unknown' : 'non-breaking';
};

const tuple = { type: 'array', prefixItems: [{ type: 'string' }, { type: 'number' }], items: false };
const byLength = {
  anyOf: [
    { type: 'array', maxItems: 0 },
    { type: 'array', prefixItems: [{ type: 'string' }], items: false, minItems: 1 },
    { type: 'array', prefixItems: [{ type: 'string' }, { type: 'number' }], items: { not: {} }, minItems: 2 },
  ],
};

type Pair = readonly [shape: string, a: unknown, b: unknown];

describe('equivalent rewrites: no change at all, in either direction', () => {
  it.each<Pair>([
    ['`type: null` as `const: null`', { type: 'null' }, { const: null }],
    ['`type: null` as a one-member `enum`', { type: 'null' }, { enum: [null] }],
    ['`type: boolean` as both its values', { type: 'boolean' }, { enum: [false, true] }],
    ['`type: [T, null]` as `anyOf` of the two types', { type: ['string', 'null'] }, { anyOf: [{ type: 'string' }, { type: 'null' }] }],
    ['`type: [T, null]` as `oneOf` of the two types', { type: ['string', 'null'] }, { oneOf: [{ type: 'null' }, { type: 'string' }] }],
    ['`nullable: true` as `anyOf` with `const: null`', { type: 'string', nullable: true }, { anyOf: [{ type: 'string' }, { const: null }] }],
    ['an `enum` as `anyOf` of `const`', { enum: ['open', 'paid', 'shipped'] }, { anyOf: [{ const: 'open' }, { const: 'paid' }, { const: 'shipped' }] }],
    ['an `enum` as `oneOf` of value lists', { enum: ['a', 'b', 'c'] }, { oneOf: [{ const: 'a' }, { enum: ['b', 'c'] }] }],
    ['an `enum` and `null` as `anyOf` of a value and a null type', { enum: ['a', null] }, { anyOf: [{ const: 'a' }, { type: 'null' }] }],
    ['`const` as a one-member `enum`', { const: 42 }, { enum: [42] }],
    ['a type its `enum` already implies', { type: 'string', enum: ['a'] }, { enum: ['a'] }],
    [
      'a typed `enum` as `allOf` of the type and `anyOf` of `const`',
      { type: 'string', enum: ['open', 'paid'] },
      { allOf: [{ type: 'string' }, { anyOf: [{ const: 'open' }, { const: 'paid' }] }] },
    ],
    [
      'one schema as `allOf` of its keywords',
      { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 10, uniqueItems: true },
      { allOf: [{ type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 10 }, { type: 'array', uniqueItems: true }] },
    ],
    ['a one-branch `allOf`', { type: 'string', minLength: 1 }, { allOf: [{ type: 'string', minLength: 1 }] }],
    ['a one-branch `anyOf` beside other keywords', { type: 'string', minLength: 1 }, { type: 'string', anyOf: [{ minLength: 1 }] }],
    ['a one-branch `oneOf`', { type: 'integer' }, { oneOf: [{ type: 'integer' }] }],
    ['an `allOf` branch that is `true`', { type: 'integer' }, { type: 'integer', allOf: [true] }],
    ['`{ not: {} }` as `false`', { type: 'array', items: false }, { type: 'array', items: { not: {} } }],
    ['`{ not: true }` as `false`', { type: 'array', items: false }, { type: 'array', items: { not: true } }],
    ['a tuple as `anyOf` of each length', tuple, byLength],
    [
      'a tuple with `minItems` as `anyOf` of the lengths from it',
      { ...tuple, minItems: 1 },
      { anyOf: [{ type: ['array'], prefixItems: [{ type: 'string' }], maxItems: 1, minItems: 1 }, { type: 'array', prefixItems: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }], minItems: 2, maxItems: 2 }] },
    ],
    ['keyword order', { type: 'object', required: ['a'], properties: { a: { type: 'string' } } }, { properties: { a: { type: 'string' } }, required: ['a'], type: 'object' }],
    ['annotations', { type: 'string', description: 'x' }, { type: 'string', examples: ['b'] }],
    ...[date, datetime, duration, email, hostname, ipv4, ipv6, time, uuid].map((format) => [`format ${format.name} as its pattern`, { type: 'string', format: format.name }, { type: 'string', pattern: format.pattern.source }] satisfies Pair),
    ['a format beside its own pattern', { type: 'string', format: 'uuid' }, { type: 'string', format: 'uuid', pattern: uuid.pattern.source }],
  ])('%s', (_shape, a, b) => {
    expect(changes(a, b)).toEqual([]);
    expect(changes(b, a)).toEqual([]);
  });

  it('`$ref` as its inlined target, and the target as a rewrite of the inline schema', () => {
    const documents = { old: {}, new: { $defs: { Status: { anyOf: [{ const: 'a' }, { const: 'b' }] } } } };
    expect(changes({ enum: ['a', 'b'] }, { $ref: '#/$defs/Status' }, documents)).toEqual([]);
    const both = { old: { A: { allOf: [{ type: 'string' }] } }, new: { A: { type: 'string' } } };
    expect(changes({ $ref: '#/A', minLength: 1 }, { $ref: '#/A', minLength: 1 }, both)).toEqual([]);
    expect(changes({ $ref: '#/A', type: 'string' }, { type: 'string' }, both)).toEqual([]);
  });
});

describe('near misses: written alike, accepting fewer values, still breaking', () => {
  it.each<Pair>([
    ['`type: boolean` to one of its values', { type: 'boolean' }, { const: true }],
    ['`type: [T, null]` to `const: null`', { type: ['string', 'null'] }, { const: null }],
    ['`anyOf` of a type and null to the type', { anyOf: [{ type: 'string' }, { type: 'null' }] }, { type: 'string' }],
    ['`nullable` to `anyOf` without the null', { type: 'string', nullable: true }, { anyOf: [{ type: 'string' }, { const: 'x' }] }],
    ['an `enum` to `anyOf` of fewer `const`', { enum: ['a', 'b', 'c'] }, { anyOf: [{ const: 'a' }, { const: 'b' }] }],
    ['`allOf` whose `additionalProperties` cannot see the other branch`s properties', { type: 'object', properties: { a: {} }, additionalProperties: false }, { allOf: [{ type: 'object', properties: { a: {} } }, { additionalProperties: false }] }],
    ['`allOf` of two types', { type: 'string' }, { allOf: [{ type: 'string' }, { type: 'integer' }] }],
    ['`allOf` of two lengths', { minLength: 1 }, { allOf: [{ minLength: 1 }, { minLength: 2 }] }],
    ['a pattern one character off the format`s', { type: 'string', format: 'email' }, { type: 'string', pattern: email.pattern.source.slice(0, -1) }],
    ['a pattern beside a different format', { type: 'string', format: 'date' }, { type: 'string', format: 'date', pattern: uuid.pattern.source }],
    ['`items: { not: {} }` where items were allowed', { type: 'array', items: { type: 'string' } }, { type: 'array', items: { not: {} } }],
    ['a tuple to one length short of it', tuple, { anyOf: byLength.anyOf.slice(1) }],
    ['a type with an `enum` it does not admit', { type: 'string' }, { type: 'string', const: null }],
  ])('%s', (_shape, a, b) => {
    expect(verdict(a, b)).toBe('breaking');
  });

  it('`oneOf` of overlapping branches is not read as their union: an integer matches both', () => {
    expect(normalise({ oneOf: [{ type: 'integer' }, { type: 'number' }] })).toEqual({ oneOf: [{ type: 'integer' }, { type: 'number' }] });
    expect(normalise({ oneOf: [{ type: 'string' }, { type: 'string' }] })).toEqual({ oneOf: [{ type: 'string' }, { type: 'string' }] });
    expect(normalise({ oneOf: [{ const: 1 }, { enum: [1, 2] }] })).toEqual({ oneOf: [{ const: 1 }, { enum: [1, 2] }] });
    expect(normalise({ anyOf: [{ type: 'integer' }, { type: 'number' }] })).toEqual({ type: ['integer', 'number'] });
    expect(normalise({ oneOf: [{ type: 'integer' }, { type: 'string' }] })).toEqual({ type: ['integer', 'string'] });
    expect(normalise({ anyOf: [{ const: 1 }, { enum: [1, 2] }] })).toEqual({ enum: [1, 1, 2] });
  });

  it('a gap in the lengths is no tuple', () => {
    expect(verdict(tuple, { anyOf: [byLength.anyOf[0], byLength.anyOf[2]] })).not.toBe('non-breaking');
  });
});

/** Every annotation, each written differently for each `n`. */
const notes = (n: number) => ({ title: `t${String(n)}`, description: `d${String(n)}`, examples: [n], example: n, default: n, deprecated: n === 1, $comment: `c${String(n)}` });

/** A union of the empty array and `branch`. */
const two = (branch: unknown) => normalise({ anyOf: [{ type: 'array', maxItems: 0 }, branch] });

describe('normalise', () => {
  it('leaves what is not a schema object as it is', () => {
    expect(normalise(true)).toBe(true);
    expect(normalise(false)).toBe(false);
    expect(normalise('x')).toBe('x');
  });

  it('reads `not` as `false` only when nothing else constrains, and the negated schema is empty or `true`', () => {
    expect(normalise({ not: {} })).toBe(false);
    expect(normalise({ not: true })).toBe(false);
    expect(normalise({ not: { type: 'string' } })).toEqual({ not: { type: 'string' } });
    expect(normalise({ not: false })).toEqual({ not: false });
    expect(normalise({ not: {}, type: 'string' })).toEqual({ not: {}, type: 'string' });
  });

  it('writes a value list as a type only when it lists every value of each type, and the declared type admits them', () => {
    expect(normalise({ const: null })).toEqual({ type: 'null' });
    expect(normalise({ enum: [true, false, null] })).toEqual({ type: ['boolean', 'null'] });
    expect(normalise({ type: ['boolean', 'string'], enum: [true, false] })).toEqual({ type: 'boolean' });
    expect(normalise({ enum: [true] })).toEqual({ enum: [true] });
    expect(normalise({ enum: [true, true] })).toEqual({ enum: [true, true] });
    expect(normalise({ enum: [null, 'a'] })).toEqual({ enum: [null, 'a'] });
    expect(normalise({ enum: [] })).toEqual({ enum: [] });
    expect(normalise({ enum: 'x' })).toEqual({ enum: 'x' });
    expect(normalise({ type: 'string', const: null })).toEqual({ type: 'string', const: null });
    expect(normalise({ const: true, enum: [true, false] })).toEqual({ const: true, enum: [true, false] });
    // `const` and `enum` together accept their intersection, here nothing.
    expect(normalise({ const: null, enum: ['a'] })).toEqual({ const: null, enum: ['a'] });
    expect(normalise({ type: 'null', enum: [null, true, false] })).toEqual({ type: 'null', enum: [null, true, false] });
  });

  it('collapses a union only when every branch is bare, and nothing it writes is already beside it', () => {
    expect(normalise({ anyOf: [{ type: 'string' }, { type: ['integer', 'string'] }] })).toEqual({ type: ['string', 'integer'] });
    expect(normalise({ anyOf: [{ type: 'string' }, { type: 'null', title: 't' }] })).toEqual({ anyOf: [{ type: 'string' }, { type: 'null', title: 't' }] });
    expect(normalise({ anyOf: [{ const: 'a' }, { const: 'b', title: 't' }] })).toEqual({ anyOf: [{ const: 'a' }, { const: 'b', title: 't' }] });
    expect(normalise({ type: 'string', anyOf: [{ type: 'string' }, { type: 'null' }] })).toEqual({ type: 'string', anyOf: [{ type: 'string' }, { type: 'null' }] });
    expect(normalise({ title: 't', anyOf: [{ type: 'string' }, { type: 'null' }] })).toEqual({ title: 't', type: ['string', 'null'] });
    expect(normalise({ anyOf: [{ type: 'string' }, { const: 'a' }] })).toEqual({ anyOf: [{ type: 'string' }, { const: 'a' }] });
    expect(normalise({ anyOf: [{ type: 'string' }, true] })).toEqual({ anyOf: [{ type: 'string' }, true] });
  });

  it('reads a tuple branch only when it is an array of exactly one length, no longer than its items', () => {
    const one = { type: 'array', prefixItems: [{ type: 'string' }], items: false, minItems: 1 };
    expect(two(one)).toEqual({ type: 'array', prefixItems: [{ type: 'string' }], items: false });
    expect(two({ type: 'array', prefixItems: [{ type: 'string' }], minItems: 1, maxItems: 1 })).toEqual({ type: 'array', prefixItems: [{ type: 'string' }], items: false });
    for (const branch of [
      { ...one, type: 'object' },
      { ...one, title: 't' },
      { ...one, minItems: 0 },
      { ...one, minItems: '1' },
      { type: 'array', prefixItems: [{ type: 'string' }], minItems: 2, maxItems: 2 },
      { type: 'array', minItems: 1 },
      true,
    ]) {
      expect(two(branch)).toEqual({ anyOf: [{ type: 'array', maxItems: 0 }, branch] });
    }
    // Items that are not the first items of the longest branch.
    expect(normalise({ anyOf: [{ ...one, prefixItems: [{ type: 'number' }] }, { type: 'array', prefixItems: [{ type: 'string' }, {}], items: false, minItems: 2 }] })).toEqual({
      anyOf: [{ ...one, prefixItems: [{ type: 'number' }] }, { type: 'array', prefixItems: [{ type: 'string' }, {}], items: false, minItems: 2 }],
    });
    // A branch of lengths 0 to 2 beside one of length 1: their union is up to 2, not up to 1.
    const upToTwo = { type: 'array', prefixItems: [{ type: 'string' }, { type: 'number' }], items: false, minItems: 0 };
    expect(normalise({ anyOf: [upToTwo, one] })).toEqual({ anyOf: [upToTwo, one] });
    // A branch that asks for more items than it describes accepts nothing, so is no length of the tuple.
    const none = { type: 'array', prefixItems: [{ type: 'string' }], minItems: 2, maxItems: 2 };
    expect(normalise({ anyOf: [{ type: 'array', maxItems: 0 }, one, none] })).toEqual({ anyOf: [{ type: 'array', maxItems: 0 }, one, none] });
    // Open after its prefix, a branch has no one length.
    expect(two({ type: 'array', prefixItems: [{ type: 'string' }], minItems: 1 })).toEqual({ anyOf: [{ type: 'array', maxItems: 0 }, { type: 'array', prefixItems: [{ type: 'string' }], minItems: 1 }] });
    // Within its prefix, `items` never applies.
    expect(two({ type: 'array', prefixItems: [{ type: 'string' }], items: { type: 'number' }, minItems: 1, maxItems: 1 })).toEqual({ type: 'array', prefixItems: [{ type: 'string' }], items: false });
    // Two branches of one length.
    expect(normalise({ anyOf: [one, one] })).toEqual({ anyOf: [one, one] });
  });

  it('reads the lengths in any order', () => {
    const [zero, first, second] = byLength.anyOf;
    for (const order of [[second, first, zero], [first, second, zero], [second, zero, first]]) {
      expect(normalise({ anyOf: order })).toEqual(tuple);
    }
  });

  it('keeps a union whose spelling would replace a keyword beside it', () => {
    const schema = { items: { type: 'string' }, anyOf: byLength.anyOf.slice(0, 2) };
    expect(normalise(schema)).toEqual({ items: { type: 'string' }, anyOf: [byLength.anyOf[0], { type: 'array', prefixItems: [{ type: 'string' }], items: false, minItems: 1 }] });
  });

  it('merges parts that differ only in what describes', () => {
    expect(normalise({ allOf: [{ type: 'string', ...notes(1) }, { minLength: 1, ...notes(2) }] })).toEqual({ type: 'string', minLength: 1, ...notes(2) });
  });

  it('merges `allOf` unless two parts disagree, a part is a `$ref` or `false`, or a keyword is split from the one it reads', () => {
    expect(normalise({ allOf: [{ type: 'string' }, { minLength: 1, title: 'a' }], title: 'b' })).toEqual({ type: 'string', minLength: 1, title: 'a' });
    expect(normalise({ allOf: [] })).toEqual({ allOf: [] });
    for (const schema of [
      { allOf: [{ type: 'string' }, { type: 'integer' }] },
      { allOf: [{ $ref: '#/A' }] },
      { $ref: '#/A', allOf: [{ type: 'string' }] },
      { allOf: [{ type: 'string' }, false] },
      { properties: { a: {} }, allOf: [{ patternProperties: { b: {} } }] },
      { allOf: [{ prefixItems: [{}] }, { unevaluatedItems: false }] },
      { allOf: [{ contains: {} }, { minContains: 2 }] },
      { allOf: [{ if: {} }, { then: {} }] },
      { allOf: [{ properties: { a: {} } }, { unevaluatedProperties: false }] },
      { allOf: [{ items: {} }, { items: {} }] },
      { allOf: [{ maxContains: 2 }, { contains: {} }] },
      { allOf: [{ else: {} }, { if: {} }] },
    ]) {
      expect(normalise(schema)).toEqual(schema);
    }
    // A one-branch `anyOf` and `oneOf` are `allOf`; two branches are not.
    expect(normalise({ anyOf: [{ minLength: 1 }], oneOf: [{ maxLength: 2 }] })).toEqual({ minLength: 1, maxLength: 2 });
    expect(normalise({ anyOf: [{ minLength: 1 }, { maxLength: 2 }] })).toEqual({ anyOf: [{ minLength: 1 }, { maxLength: 2 }] });
  });

  it('normalises the subschemas the comparison walks', () => {
    const inner = { const: null };
    expect(
      normalise({ properties: { a: inner }, items: inner, additionalProperties: inner, prefixItems: [inner], allOf: [{ properties: { b: inner } }], anyOf: [inner, { minLength: 1 }], oneOf: [inner, { maxLength: 1 }] }),
    ).toEqual({
      properties: { a: { type: 'null' } },
      // Not merged: `properties` on both sides of the `allOf`, with `additionalProperties` beside one.
      allOf: [{ properties: { b: { type: 'null' } } }],
      items: { type: 'null' },
      additionalProperties: { type: 'null' },
      prefixItems: [{ type: 'null' }],
      anyOf: [{ type: 'null' }, { minLength: 1 }],
      oneOf: [{ type: 'null' }, { maxLength: 1 }],
    });
    expect(normalise({ properties: 'x', not: { const: null } })).toEqual({ properties: 'x', not: { const: null } });
  });

  it('reads a pattern as a format only when it is that format`s, and no other format is named', () => {
    expect(normalise({ pattern: ipv4.pattern.source })).toEqual({ format: 'ipv4' });
    expect(normalise({ pattern: '^a$' })).toEqual({ pattern: '^a$' });
    expect(normalise({ pattern: ipv4.pattern.source, format: 'ipv6' })).toEqual({ pattern: ipv4.pattern.source, format: 'ipv6' });
  });
});

describe('the helpers the comparison reads against a peer', () => {
  it('names the JSON type of each value, a whole number as an integer', () => {
    expect([null, [], 1, 1.5, 'a', true, {}].map((value) => typeOfValue(value))).toEqual(['null', 'array', 'integer', 'number', 'string', 'boolean', 'object']);
  });

  it('lists the values of a type only against a peer that lists values', () => {
    expect(changes({ type: 'null' }, { type: 'boolean' }).map((change) => change.rule)).toEqual(['became-not-nullable', 'type-widened']);
  });

  it('follows a reference to a reference, and keeps keywords beside one apart from the target they cannot see', () => {
    const documents = { old: { A: { $ref: '#/B' }, B: { type: 'string' }, P: { properties: { a: {} } } }, new: {} };
    expect(changes({ $ref: '#/A' }, { type: 'string' }, documents)).toEqual([]);
    expect(changes({ $ref: '#/A', type: 'integer' }, { type: 'integer' }, documents).map((change) => [change.rule, change.pointer])).toEqual([['all-of-removed', '/allOf/0']]);
    expect(verdict({ $ref: '#/P', additionalProperties: false }, { properties: { a: {} }, additionalProperties: false }, documents)).toBe('breaking');
  });

  it('lists the values of finite types only', () => {
    expect(valuesOfTypes(['null', 'boolean'])).toEqual([null, false, true]);
    expect(valuesOfTypes(['null', 'string'])).toBeUndefined();
    expect(valuesOfTypes(['toString'])).toBeUndefined();
  });

  it('reads an untyped value list against a typed peer, and a finite type against a listing peer', () => {
    expect(changes({ type: 'boolean' }, { enum: [true] }).map((change) => [change.rule, change.effect])).toEqual([['enum-value-removed', 'narrows']]);
    expect(changes({ type: 'string' }, { enum: ['a', 1] }).map((change) => [change.rule, change.effect])).toEqual([
      ['type-widened', 'widens'],
      ['enum-set', 'narrows'],
    ]);
    expect(changes({}, { enum: ['a'] }).map((change) => change.rule)).toEqual(['enum-set']);
    expect(changes({ type: 'string' }, { const: 'a' }).map((change) => change.rule)).toEqual(['enum-set']);
  });
});
