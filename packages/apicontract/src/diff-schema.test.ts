import { describe, expect, it } from 'vitest';

import { canonical, compareSchemas, serverReceives } from './diff-schema.js';

const diff = (a: unknown, b: unknown, direction: 'request' | 'response' = 'request') =>
  compareSchemas(a as never, b as never, direction).map(({ rule, pointer, before, after, effect }) => [rule, pointer, before, after, effect]);

const obj = (properties: object, required: string[] = [], rest: object = {}) => ({ type: 'object', properties, required, ...rest });
const doc = (pet: object) => ({ components: { schemas: { Pet: pet, Name: { type: 'string' } } } });
const tree = (leaf: string) => ({ Node: { type: 'object', properties: { value: { type: leaf }, next: { $ref: '#/Node' } } } });

const typeAt = (type: string) => ({ A: { type } });

describe('compareSchemas, keyword by keyword', () => {
  it.each(['title', 'description', 'examples', 'example', 'default', 'deprecated', 'readOnly', 'writeOnly', '$comment', '$schema', '$id', '$anchor', '$defs', 'definitions', 'externalDocs', 'xml', 'x-anything'])(
    'ignores %s, which only describes',
    (keyword) => {
      expect(diff({ [keyword]: 1 }, { [keyword]: 2 })).toEqual([]);
    },
  );

  it.each([
    ['minimum', 'narrows', 'widens'],
    ['exclusiveMinimum', 'narrows', 'widens'],
    ['minLength', 'narrows', 'widens'],
    ['minItems', 'narrows', 'widens'],
    ['minProperties', 'narrows', 'widens'],
    ['maximum', 'widens', 'narrows'],
    ['exclusiveMaximum', 'widens', 'narrows'],
    ['maxLength', 'widens', 'narrows'],
    ['maxItems', 'widens', 'narrows'],
    ['maxProperties', 'widens', 'narrows'],
  ])('%s raised %s, lowered %s', (keyword, raising, lowering) => {
    expect(diff({ [keyword]: 1 }, { [keyword]: 2 })).toEqual([[`${keyword}-increased`, `/${keyword}`, 1, 2, raising]]);
    expect(diff({ [keyword]: 2 }, { [keyword]: 1 })).toEqual([[`${keyword}-decreased`, `/${keyword}`, 2, 1, lowering]]);
    expect(diff({ [keyword]: 1 }, { [keyword]: 1 })).toEqual([]);
  });

  it('reports equal predicates and equal unknown keywords as nothing, and unknown ones in keyword order', () => {
    expect(diff({ pattern: 'a', format: 'uuid', multipleOf: 2 }, { pattern: 'a', format: 'uuid', multipleOf: 2 })).toEqual([]);
    expect(diff({ not: {}, else: {} }, {}).map((row) => row[1])).toEqual(['/else', '/not']);
  });

  it('a type number admits integers, and nothing else', () => {
    expect(diff({ type: ['string', 'number'] }, { type: 'number' })).toEqual([['type-narrowed', '', ['string', 'number'], ['number'], 'narrows']]);
  });

  it('reports nothing for equal schemas, or for keywords that only describe', () => {
    expect(diff({ type: 'string' }, { type: 'string', description: 'x', title: 't', examples: ['a'], 'x-internal': true, default: 'a' })).toEqual([]);
    expect(diff(true, {})).toEqual([]);
    expect(diff(false, false)).toEqual([]);
  });

  it.each([
    ['type set', {}, { type: 'string' }, [['type-set', '', undefined, ['string'], 'narrows']]],
    ['type unset', { type: 'string' }, {}, [['type-unset', '', ['string'], undefined, 'widens']]],
    ['type replaced', { type: 'string' }, { type: 'integer' }, [['type-narrowed', '', ['string'], ['integer'], 'narrows'], ['type-widened', '', ['string'], ['integer'], 'widens']]],
    ['integer to number', { type: 'integer' }, { type: 'number' }, [['type-widened', '', ['integer'], ['number'], 'widens']]],
    ['number to integer', { type: 'number' }, { type: 'integer' }, [['type-narrowed', '', ['number'], ['integer'], 'narrows']]],
    ['null added by a type array', { type: 'string' }, { type: ['string', 'null'] }, [['became-nullable', '', ['string'], ['string', 'null'], 'widens']]],
    ['null removed by nullable', { type: 'string', nullable: true }, { type: 'string' }, [['became-not-nullable', '', ['string', 'null'], ['string'], 'narrows']]],
    ['nullable without a type is nothing', { nullable: true }, {}, []],
    ['enum set', {}, { enum: ['a'] }, [['enum-set', '', undefined, ['a'], 'narrows']]],
    ['enum unset', { enum: ['a'] }, {}, [['enum-unset', '', ['a'], undefined, 'widens']]],
    ['enum values', { enum: ['a', { k: 1, j: 2 }] }, { enum: [{ j: 2, k: 1 }, 'b'] }, [['enum-value-removed', '', 'a', undefined, 'narrows'], ['enum-value-added', '', undefined, 'b', 'widens']]],
    ['const as a one-value enum', { const: 1 }, { enum: [1, 2] }, [['enum-value-added', '', undefined, 2, 'widens']]],
    ['minLength raised', { minLength: 1 }, { minLength: 2 }, [['minLength-increased', '/minLength', 1, 2, 'narrows']]],
    ['minimum lowered', { minimum: 2 }, { minimum: 1 }, [['minimum-decreased', '/minimum', 2, 1, 'widens']]],
    ['maxItems raised', { maxItems: 1 }, { maxItems: 2 }, [['maxItems-increased', '/maxItems', 1, 2, 'widens']]],
    ['maximum lowered', { maximum: 2 }, { maximum: 1 }, [['maximum-decreased', '/maximum', 2, 1, 'narrows']]],
    ['maxLength set', {}, { maxLength: 3 }, [['maxLength-set', '/maxLength', undefined, 3, 'narrows']]],
    ['minProperties unset', { minProperties: 1 }, {}, [['minProperties-unset', '/minProperties', 1, undefined, 'widens']]],
    ['OpenAPI 3.0 boolean exclusiveMinimum', { exclusiveMinimum: true }, { exclusiveMinimum: 0 }, [['exclusiveMinimum-changed', '/exclusiveMinimum', true, 0, 'unknown']]],
    ['a non-number on the new side', { maxProperties: 1 }, { maxProperties: '2' }, [['maxProperties-changed', '/maxProperties', 1, '2', 'unknown']]],
    ['pattern set', {}, { pattern: 'a' }, [['pattern-set', '/pattern', undefined, 'a', 'narrows']]],
    ['pattern unset', { pattern: 'a' }, {}, [['pattern-unset', '/pattern', 'a', undefined, 'widens']]],
    ['format changed', { format: 'date' }, { format: 'uuid' }, [['format-changed', '/format', 'date', 'uuid', 'unknown']]],
    ['true to false', true, false, [['accepts-nothing', '', true, false, 'narrows']]],
    ['false to a schema', false, { type: 'string' }, [['accepts-something', '', false, { type: 'string' }, 'widens']]],
    ['a keyword not understood', { multipleOf: 2 }, { multipleOf: 4 }, [['keyword-changed', '/multipleOf', 2, 4, 'unknown']]],
    ['an escaped keyword', { 'a/b': 1 }, {}, [['keyword-changed', '/a~1b', 1, undefined, 'unknown']]],
    ['an external ref', { $ref: 'a.yaml#/A' }, { $ref: 'b.yaml#/A' }, [['external-ref-changed', '/$ref', 'a.yaml#/A', 'b.yaml#/A', 'unknown']]],
    ['the same external ref', { $ref: 'a.yaml#/A', minLength: 1 }, { $ref: 'a.yaml#/A', minLength: 1 }, []],
  ])('%s', (_name, a, b, changes) => {
    expect(diff(a, b)).toEqual(changes);
  });
});

describe('objects', () => {

  it('a property becoming required narrows, becoming optional widens', () => {
    expect(diff(obj({ a: {} }), obj({ a: {} }, ['a']))).toEqual([['property-became-required', '/properties/a', false, true, 'narrows']]);
    expect(diff(obj({ a: {} }, ['a']), obj({ a: {} }))).toEqual([['property-became-optional', '/properties/a', true, false, 'widens']]);
  });

  it('a required property added or removed says so once', () => {
    expect(diff(obj({}), obj({ a: { type: 'string' } }, ['a']))).toEqual([['required-property-added', '/properties/a', false, true, 'narrows']]);
    expect(diff(obj({ a: {} }, ['a']), obj({}))).toEqual([['required-property-removed', '/properties/a', true, false, 'widens']]);
  });

  it('an optional property declared or dropped on an open object is neutral', () => {
    expect(diff(obj({}), obj({ a: { type: 'string' } }))).toEqual([['property-added', '/properties/a', undefined, { type: 'string' }, 'neutral']]);
    expect(diff(obj({ a: { type: 'string' } }), obj({}, [], { additionalProperties: true }))).toEqual([
      ['property-removed', '/properties/a', { type: 'string' }, undefined, 'neutral'],
    ]);
  });

  it('on a closed object, a property is compared against what was allowed in its place', () => {
    expect(diff(obj({}, [], { additionalProperties: false }), obj({ a: {} }, [], { additionalProperties: false }))).toEqual([
      ['accepts-something', '/properties/a', false, {}, 'widens'],
    ]);
    expect(diff(obj({ a: {} }, [], { additionalProperties: false }), obj({}, [], { additionalProperties: false }))).toEqual([
      ['accepts-nothing', '/properties/a', {}, false, 'narrows'],
    ]);
    expect(diff(obj({}, [], { additionalProperties: { type: 'string' } }), obj({ a: { type: 'string', maxLength: 2 } }, [], { additionalProperties: { type: 'string' } }))).toEqual([
      ['maxLength-set', '/properties/a/maxLength', undefined, 2, 'narrows'],
    ]);
  });

  it('a property in both is compared, its name escaped in the pointer', () => {
    expect(diff(obj({ 'a/b~': { type: 'string' } }), obj({ 'a/b~': { type: 'integer' } }))).toEqual([
      ['type-narrowed', '/properties/a~1b~0', ['string'], ['integer'], 'narrows'],
      ['type-widened', '/properties/a~1b~0', ['string'], ['integer'], 'widens'],
    ]);
  });

  it('additionalProperties is compared as a schema', () => {
    expect(diff({}, { additionalProperties: false })).toEqual([['accepts-nothing', '/additionalProperties', true, false, 'narrows']]);
    expect(diff({ additionalProperties: { type: 'string' } }, {})).toEqual([['type-unset', '/additionalProperties', ['string'], undefined, 'widens']]);
  });

  it('a request never sees a readOnly property; a response never sees a writeOnly one', () => {
    const before = obj({ id: { readOnly: true, type: 'string' }, secret: { writeOnly: true, type: 'string' } });
    const after = obj({ id: { readOnly: true, type: 'integer' }, secret: { writeOnly: true, type: 'integer' } }, ['id', 'secret']);
    expect(diff(before, after, 'request').map((row) => row[1])).toEqual(['/properties/secret', '/properties/secret', '/properties/secret']);
    expect(diff(before, after, 'response').map((row) => row[1])).toEqual(['/properties/id', '/properties/id', '/properties/id']);
    expect(diff(obj({}), obj({ id: { readOnly: true } }, ['id']), 'request')).toEqual([]);
    expect(diff(obj({ id: { readOnly: true } }, ['id']), obj({}), 'request')).toEqual([]);
  });

  it('a property only required, on a closed object, is the required-ness alone', () => {
    expect(diff({ additionalProperties: false }, { required: ['x'], additionalProperties: false })).toEqual([['required-property-added', '/properties/x', false, true, 'narrows']]);
  });

  it('lists properties in name order', () => {
    expect(diff(obj({ b: { type: 'string' }, a: { type: 'string' } }), obj({ b: {}, a: {} })).map((row) => row[1])).toEqual(['/properties/a', '/properties/b']);
  });

  it('reads properties and required only when they are what they should be', () => {
    expect(diff({ properties: [], required: 'a' }, { properties: [], required: 'a' })).toEqual([]);
  });
});

describe('arrays', () => {
  it('compares items, and prefixItems position by position', () => {
    expect(diff({ items: { type: 'string' } }, { items: { type: 'integer' } }).map((row) => row[1])).toEqual(['/items', '/items']);
    expect(diff({}, { items: false })).toEqual([['accepts-nothing', '/items', true, false, 'narrows']]);
    expect(diff({ items: { type: 'string' } }, {})).toEqual([['type-unset', '/items', ['string'], undefined, 'widens']]);
    expect(diff({ prefixItems: [{}, { enum: [1] }] }, { prefixItems: [{}, { enum: [2] }] })).toEqual([
      ['enum-value-removed', '/prefixItems/1', 1, undefined, 'narrows'],
      ['enum-value-added', '/prefixItems/1', undefined, 2, 'widens'],
    ]);
    expect(diff({ prefixItems: [{}] }, {})).toEqual([['prefixItems-changed', '/prefixItems', 1, 0, 'unknown']]);
    expect(diff({ prefixItems: 'x' }, {})).toEqual([]);
  });
});

describe('compositions', () => {
  it('compares branches in place when there are as many', () => {
    expect(diff({ oneOf: [{ type: 'string' }] }, { oneOf: [{ type: 'string', minLength: 1 }] })).toEqual([['minLength-set', '/oneOf/0/minLength', undefined, 1, 'narrows']]);
  });

  it.each([
    ['oneOf', 'one-of', 'widens', 'narrows'],
    ['anyOf', 'any-of', 'widens', 'narrows'],
    ['allOf', 'all-of', 'narrows', 'widens'],
  ])('a %s branch added %s… is %s, removed is %s', (keyword, name, adding, removing) => {
    const a = { [keyword]: [{ type: 'string' }, { type: 'integer' }] };
    const b = { [keyword]: [{ type: 'integer' }, { type: 'boolean' }, { type: 'null' }] };
    expect(diff(a, b)).toEqual([
      [`${name}-removed`, `/${keyword}/0`, { type: 'string' }, undefined, removing],
      [`${name}-added`, `/${keyword}/1`, undefined, { type: 'boolean' }, adding],
      [`${name}-added`, `/${keyword}/2`, undefined, { type: 'null' }, adding],
    ]);
  });

  it('compares a branch kept by equal text when the count changed: its reference may point at a changed target', () => {
    const documents = { old: { A: { type: 'string' }, B: {}, C: {} }, new: { A: { type: 'string', maxLength: 5 }, B: {}, C: {} } };
    const changes = compareSchemas({ allOf: [{ $ref: '#/A' }, { $ref: '#/B' }] }, { allOf: [{ $ref: '#/A' }, { $ref: '#/B' }, { $ref: '#/C' }] }, 'request', documents);
    expect(changes).toEqual([
      { rule: 'maxLength-set', pointer: '/allOf/0/maxLength', before: undefined, after: 5, effect: 'narrows' },
      { rule: 'all-of-added', pointer: '/allOf/2', before: undefined, after: { $ref: '#/C' }, effect: 'narrows' },
    ]);
    // Paired by text, not by place: the kept branch moved from 1 to 0.
    expect(
      compareSchemas({ anyOf: [{ type: 'null' }, { $ref: '#/A' }] }, { anyOf: [{ $ref: '#/A' }] }, 'request', documents).map((c) => [c.rule, c.pointer]),
    ).toEqual([
      ['any-of-removed', '/anyOf/0'],
      ['maxLength-set', '/anyOf/0/maxLength'],
    ]);
  });

  it('ignores a composition keyword that is not an array', () => {
    expect(diff({ anyOf: 'x' }, { anyOf: 'x' })).toEqual([]);
    expect(diff({ allOf: 'x' }, { allOf: [{}] })).toEqual([['all-of-added', '/allOf/0', undefined, {}, 'narrows']]);
  });
});

describe('$ref', () => {

  it('compares references by their resolved targets, in their own documents', () => {
    const changes = compareSchemas({ $ref: '#/components/schemas/Pet' }, { $ref: '#/components/schemas/Pet' }, 'response', {
      old: doc({ type: 'object', properties: { name: { $ref: '#/components/schemas/Name' } } }),
      new: doc({ type: 'object', properties: { name: { $ref: '#/components/schemas/Name' }, age: { type: 'integer' } } }),
    });
    expect(changes).toEqual([{ rule: 'property-added', pointer: '/properties/age', before: undefined, after: { type: 'integer' }, effect: 'neutral' }]);
  });

  it('compares a reference with an inline schema, and keeps keywords beside a $ref', () => {
    const documents = { old: doc({ type: 'string' }), new: doc({ type: 'string' }) };
    expect(compareSchemas({ type: 'string' }, { $ref: '#/components/schemas/Pet' }, 'request', documents)).toEqual([]);
    expect(compareSchemas({ $ref: '#/components/schemas/Pet', maxLength: 3 }, { type: 'string' }, 'request', documents)).toEqual([
      { rule: 'maxLength-unset', pointer: '/maxLength', before: 3, after: undefined, effect: 'widens' },
    ]);
    // A keyword the target also has: the target moves under `allOf`, after any `allOf` beside it.
    expect(compareSchemas({ $ref: '#/components/schemas/Pet', type: 'string' }, { type: 'string', allOf: [{ type: 'string' }] }, 'request', documents)).toEqual([]);
    expect(compareSchemas({ $ref: '#/components/schemas/Pet', type: 'string', allOf: [{ minLength: 1 }] }, { type: 'string', allOf: [{ type: 'string' }, { minLength: 1 }] }, 'request', documents)).toEqual([]);
    expect(compareSchemas({ $ref: '#/components/schemas/Pet', type: 'string', allOf: 'x' }, { type: 'string', allOf: [{ type: 'string' }] }, 'request', documents)).toEqual([]);
  });

  it('compares the same reference again on a sibling path: only a cycle stops the walk', () => {
    const twice = { properties: { x: { $ref: '#/A' }, y: { $ref: '#/A' } } };
    expect(compareSchemas(twice, twice, 'request', { old: typeAt('string'), new: typeAt('integer') }).map((c) => c.pointer)).toEqual(['/properties/x', '/properties/x', '/properties/y', '/properties/y']);
  });

  it('a reference to `false` or `true` is that schema', () => {
    const documents = { old: { F: false, T: true }, new: { F: false, T: true } };
    expect(compareSchemas({ $ref: '#/T' }, { $ref: '#/F' }, 'request', documents)).toEqual([{ rule: 'accepts-nothing', pointer: '', before: {}, after: false, effect: 'narrows' }]);
  });

  it('stops at a cycle, after comparing it once', () => {
    expect(compareSchemas({ $ref: '#/Node' }, { $ref: '#/Node' }, 'request', { old: tree('string'), new: tree('integer') }).map((c) => [c.rule, c.pointer])).toEqual([
      ['type-narrowed', '/properties/value'],
      ['type-widened', '/properties/value'],
    ]);
    // One side recursive, the other written out two levels deep: the written side ends the walk.
    expect(
      compareSchemas({ $ref: '#/Node' }, { type: 'object', properties: { value: { type: 'string' }, next: { type: 'object', properties: { value: { type: 'string' } } } } }, 'request', {
        old: tree('string'),
      }).map((c) => [c.rule, c.pointer]),
    ).toEqual([['property-removed', '/properties/next/properties/next']]);
  });

  it('throws the resolver error, fix line and all, for a reference with no target', () => {
    expect(() => compareSchemas({ $ref: '#/nope' }, {}, 'request')).toThrow('cannot resolve `#/nope`: nothing is at `nope`. fix: point it at a value the document defines');
  });
});

describe('helpers', () => {
  it('canonical sorts object keys at every depth and leaves arrays in order', () => {
    expect(canonical({ b: 1, a: { d: [2, 1], c: null } })).toBe('{"a":{"c":null,"d":[2,1]},"b":1}');
  });

  it.each([
    ['request', true],
    ['subscribe', true],
    ['tool-call', true],
    ['argv', true],
    ['response', false],
    ['publish', false],
    ['tool-result', false],
  ] as const)('the server receives a %s: %s', (direction, receives) => {
    expect(serverReceives(direction)).toBe(receives);
  });
});
