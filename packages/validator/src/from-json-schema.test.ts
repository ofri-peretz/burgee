import { describe, expect, it } from 'vitest';

import { verdicts } from './__fixtures__/readers.js';
import { fromJsonSchema, type ImportOptions } from './from-json-schema.js';
import { array, type AnySchema, intersection, never, number, object, properties, string, tuple, union, unknown } from './schema.js';

/**
 * The JSON Schema reader, keyword by keyword: what each one is read as, in each dialect, where its
 * findings and refusals point, and that what is not there leaves no trace on the schema.
 */

/** A document read with no finding. */
const read = (document: unknown, options?: ImportOptions): AnySchema => {
  const { schema, findings } = fromJsonSchema(document, options);
  expect(findings).toEqual([]);
  return schema;
};

/** The findings of a document's reading. */
const found = (document: unknown, options?: ImportOptions): { path: string; keyword: string; message: string }[] => fromJsonSchema(document, options).findings;

/** The message a document is refused with. */
const refusal = (path: string, what: string): string => `cannot read the JSON Schema at "${path}": ${what}. fix: correct the document, or validate it against its dialect's meta-schema first`;

const refused = (document: unknown, options?: ImportOptions): (() => unknown) => () => fromJsonSchema(document, options);

/** The keys an object schema was built with. */
const keysOf = (schema: AnySchema): unknown => (schema as unknown as { keys: string[] }).keys;

const DRAFT_07 = 'http://json-schema.org/draft-07/schema#';

describe('formats', () => {
  it('reads every format it names, and checks it', () => {
    const cases: [string, string, string][] = [
      ['date', '2020-01-31', '2020-13-01'],
      ['date-time', '2020-01-31T10:00:00Z', '2020-01-31'],
      ['time', '10:00:00Z', '25:00:00Z'],
      ['duration', 'P1D', '1D'],
      ['email', 'a@b.co', 'a.b.co'],
      ['hostname', 'example.com', 'a b'],
      ['ipv4', '1.2.3.4', '1.2.3'],
      ['ipv6', '::1', '1.2.3.4'],
      ['uuid', '123e4567-e89b-12d3-a456-426614174000', '123e4567'],
      ['regex', '^a+$', '('],
      ['byte', 'YQ==', 'Y'],
    ];
    for (const [format, good, bad] of cases) expect(verdicts(read({ type: 'string', format }), [good, bad]), format).toEqual([true, false]);
  });

  it('reports a format it does not read, and leaves it unchecked', () => {
    expect(found({ format: 'iri' })).toEqual([
      { path: '', keyword: 'format', message: 'the format "iri" is not one this library reads, and is not checked: pass a reading of it in `formats`' },
    ]);
  });
});

describe('keywords it does not read', () => {
  it('reports each one by name', () => {
    for (const keyword of ['unevaluatedProperties', 'unevaluatedItems', '$dynamicRef', '$recursiveRef', 'contentSchema']) {
      expect(found({ properties: { a: { [keyword]: false } } }), keyword).toEqual([
        { path: '/properties/a', keyword, message: `the keyword "${keyword}" is not read: the schema accepts more than the document` },
      ]);
    }
  });
});

describe('refusals', () => {
  it('shows a value that is not a string or an object as itself', () => {
    expect(refused({ minLength: true })).toThrow(refusal('', '"minLength" is true, not a number'));
    expect(refused({ minLength: {} })).toThrow(refusal('', '"minLength" is a value of the type object, not a number'));
    expect(refused({ minLength: null })).toThrow(refusal('', '"minLength" is null, not a number'));
    expect(refused({ required: ['a', 5] })).toThrow(refusal('', '"required" is a value of the type object, not a list of strings'));
  });

  it('refuses a bound that is not finite, or not a number', () => {
    expect(refused({ minimum: Infinity })).toThrow(refusal('', '"minimum" is Infinity, not a number'));
    expect(refused({ minimum: '1' })).toThrow(refusal('', '"minimum" is "1", not a number'));
  });

  it('takes a count of zero', () => {
    expect(verdicts(read({ type: 'string', minLength: 0, maxLength: 0 }), ['', 'a'])).toEqual([true, false]);
    expect(refused({ minLength: -1 })).toThrow(refusal('', '"minLength" is -1, not a whole number of zero or more'));
  });

  it('refuses an array as a schema', () => {
    expect(refused([])).toThrow(refusal('', 'a schema is an object or a boolean, and this is an array'));
    expect(refused({ not: [] })).toThrow(refusal('/not', 'a schema is an object or a boolean, and this is an array'));
    expect(refused({ not: null })).toThrow(refusal('/not', 'a schema is an object or a boolean, and this is null'));
    expect(refused({ dependentSchemas: { a: ['b'] } })).toThrow(refusal('/dependentSchemas/a', 'a schema is an object or a boolean, and this is an array'));
  });

  it('points at the value that is not JSON, wherever it is', () => {
    expect(refused({ const: Infinity })).toThrow(refusal('/const', 'Infinity is not a JSON value'));
    expect(refused({ const: { 'a/b': { c: undefined } } })).toThrow(refusal('/const/a~1b/c', 'undefined is not a JSON value'));
    expect(refused({ const: { 'a~b': undefined } })).toThrow(refusal('/const/a~0b', 'undefined is not a JSON value'));
    expect(refused({ enum: [1, Infinity] })).toThrow(refusal('/enum/1', 'Infinity is not a JSON value'));
  });

  it('points at the schema under the keyword that holds it', () => {
    expect(refused({ contains: 5 })).toThrow(refusal('/contains', 'a schema is an object or a boolean, and this is 5'));
    expect(refused({ additionalProperties: 5 })).toThrow(refusal('/additionalProperties', 'a schema is an object or a boolean, and this is 5'));
    expect(refused({ propertyNames: 5 })).toThrow(refusal('/propertyNames', 'a schema is an object or a boolean, and this is 5'));
    expect(refused({ if: 5 })).toThrow(refusal('/if', 'a schema is an object or a boolean, and this is 5'));
    expect(refused({ if: true, else: 5 })).toThrow(refusal('/else', 'a schema is an object or a boolean, and this is 5'));
    expect(refused({ allOf: [true, 5] })).toThrow(refusal('/allOf/1', 'a schema is an object or a boolean, and this is 5'));
    expect(refused({ prefixItems: [true, 5] })).toThrow(refusal('/prefixItems/1', 'a schema is an object or a boolean, and this is 5'));
    expect(refused({ items: [true, 5] }, { draft: 'draft-07' })).toThrow(refusal('/items/1', 'a schema is an object or a boolean, and this is 5'));
  });

  it('points at the key of dependentRequired that is not a list of names', () => {
    expect(refused({ dependentRequired: { 'a/b': 5 } })).toThrow(refusal('/dependentRequired/a~1b', '"a/b" is 5, not a list of strings'));
  });
});

describe('the shape of what is read', () => {
  it('reads a key named "__proto__" as a key, not as the shape\'s prototype', () => {
    expect(keysOf(read({ type: 'object', required: ['__proto__'] }))).toEqual(['__proto__']);
    const typed = JSON.parse('{"type": "object", "properties": {"__proto__": {"type": "number"}}}') as unknown;
    expect(keysOf(read(typed))).toEqual(['__proto__']);
  });

  it('adds nothing for what the document does not say', () => {
    expect(read({ type: 'string' })).toStrictEqual(string());
    expect(read({ type: 'string', allOf: [true] })).toStrictEqual(string());
    expect(read({ type: ['number', 'integer'] })).toStrictEqual(number());
    expect(read({ enum: [] })).toStrictEqual(never());
    expect(read({ type: 'object', additionalProperties: true })).toStrictEqual(object({}));
    expect(read({ type: 'object', additionalProperties: false })).toStrictEqual(object({}, { unknown: 'strict' }));
    expect(read({ type: 'object' })).toStrictEqual(object({}));
  });

  it('bounds an object with either count alone', () => {
    expect(read({ type: 'object', minProperties: 1 })).toStrictEqual(properties(object({}), { min: 1 }));
    expect(read({ type: 'object', maxProperties: 1 })).toStrictEqual(properties(object({}), { max: 1 }));
    expect(verdicts(read({ minProperties: 1 }), [{}, { a: 1 }, 1])).toEqual([false, true, true]);
    expect(verdicts(read({ maxProperties: 0 }), [{}, { a: 1 }, 1])).toEqual([true, false, true]);
  });

  it('bounds an array with either count alone', () => {
    expect(read({ type: 'array', maxItems: 1 })).toStrictEqual(array(unknown(), { max: 1 }));
    expect(read({ type: 'array', minItems: 1 })).toStrictEqual(array(unknown(), { min: 1 }));
    expect(verdicts(read({ type: 'array', prefixItems: [true], maxItems: 1 }), [[], [1], [1, 2]])).toEqual([true, true, false]);
    expect(read({ type: 'array', prefixItems: [true] })).toStrictEqual(union([tuple([]), tuple([unknown()], { rest: unknown() })]));
    expect(read({ type: 'array', prefixItems: [true], minItems: 1 })).toStrictEqual(intersection([union([tuple([]), tuple([unknown()], { rest: unknown() })]), array(unknown(), { min: 1 })]));
  });

  it('keeps only the words about the schema that are of their kind', () => {
    expect(read({ title: 5, description: 5, examples: 5, readOnly: false })).toStrictEqual(unknown());
    expect(read({})).toStrictEqual(unknown());
  });
});

describe('keywords with no type beside them', () => {
  it('binds the values of their own type', () => {
    expect(verdicts(read({ exclusiveMinimum: 5 }), [5, 6, 'x'])).toEqual([false, true, true]);
    expect(verdicts(read({ exclusiveMaximum: 5 }), [5, 4, 'x'])).toEqual([false, true, true]);
    expect(verdicts(read({ prefixItems: [{ type: 'string' }] }), [[1], ['a'], 1])).toEqual([false, true, true]);
    expect(verdicts(read({ maxItems: 1 }), [[1, 2], [1], 1])).toEqual([false, true, true]);
    expect(verdicts(read({ contains: { type: 'string' } }), [[1], ['a'], 1])).toEqual([false, true, true]);
    expect(verdicts(read({ additionalProperties: false }), [{ a: 1 }, {}, 1])).toEqual([false, true, true]);
    expect(verdicts(read({ propertyNames: { maxLength: 1 } }), [{ ab: 1 }, { a: 1 }, 1])).toEqual([false, true, true]);
    expect(verdicts(read({ dependentSchemas: { a: { required: ['b'] } } }), [{ a: 1 }, { a: 1, b: 1 }, 1])).toEqual([false, true, true]);
    expect(verdicts(read({ $schema: DRAFT_07, dependencies: { a: ['b'] } }), [{ a: 1 }, { a: 1, b: 1 }, 1])).toEqual([false, true, true]);
    expect(verdicts(read({ type: 'array', uniqueItems: false }), [[1, 1]])).toEqual([true]);
  });

  it('reports patternProperties', () => {
    expect(found({ patternProperties: { '^a': { type: 'string' } } })).toEqual([
      {
        path: '',
        keyword: 'patternProperties',
        message: 'keys matched by a pattern are not held to its schema, and additionalProperties beside it is not applied: the schema accepts more than the document',
      },
    ]);
  });

  it('reads a draft-07 dependency on a schema as a schema', () => {
    expect(verdicts(read({ $schema: DRAFT_07, dependencies: { a: { required: ['b'] } } }), [{ a: 1 }, { a: 1, b: 1 }])).toEqual([false, true]);
  });
});

describe('numbers', () => {
  it('reports a fractional multipleOf', () => {
    expect(found({ multipleOf: 0.1 })).toEqual([
      { path: '', keyword: 'multipleOf', message: 'a multiple of 0.1 is read within one rounding error, so 0.3 is a multiple of 0.1; a validator that tests the bare remainder refuses it' },
    ]);
  });

  it('reads OpenAPI 3.0 exclusive bounds as booleans, and numbers as numbers', () => {
    const openapi = { draft: 'openapi-3.0' } as const;
    expect(verdicts(read({ minimum: 1, exclusiveMinimum: false }, openapi), [0, 1])).toEqual([false, true]);
    expect(verdicts(read({ minimum: 1, exclusiveMinimum: true }, openapi), [1, 2])).toEqual([false, true]);
    expect(verdicts(read({ exclusiveMinimum: 5 }, openapi), [5, 6])).toEqual([false, true]);
    expect(refused({ minimum: 1, exclusiveMinimum: true })).toThrow(refusal('', '"exclusiveMinimum" is true, not a number'));
  });
});

describe('patterns', () => {
  it('reads a pattern by code points, under the u flag', () => {
    expect(verdicts(read({ type: 'string', pattern: '^.$' }), ['😀', 'ab'])).toEqual([true, false]);
  });
});

describe('nullable', () => {
  it('adds null in OpenAPI 3.0 only when it is true', () => {
    expect(verdicts(read({ type: 'string', nullable: false }, { draft: 'openapi-3.0' }), [null, 'a'])).toEqual([false, true]);
    expect(verdicts(read({ type: 'string', nullable: true }, { draft: 'openapi-3.0' }), [null, 'a'])).toEqual([true, true]);
  });
});

describe('$ref', () => {
  const list = Array.from({ length: 101 }, (_, index) => ({ const: index }));

  it('reads an array index with no leading zero', () => {
    expect(verdicts(read({ $defs: { list }, $ref: '#/$defs/list/10' }), [10, 1])).toEqual([true, false]);
    expect(verdicts(read({ $defs: { list }, $ref: '#/$defs/list/100' }), [100, 10])).toEqual([true, false]);
    expect(refused({ $defs: { list }, $ref: '#/$defs/list/01' })).toThrow(refusal('', '"$ref" "#/$defs/list/01" names nothing in the document'));
    expect(refused({ $defs: { list }, $ref: '#/$defs/list/1a' })).toThrow(refusal('', '"$ref" "#/$defs/list/1a" names nothing in the document'));
  });

  it('names only what the document wrote', () => {
    expect(refused({ $defs: { s: 'abc' }, $ref: '#/$defs/s/length' })).toThrow(refusal('', '"$ref" "#/$defs/s/length" names nothing in the document'));
    expect(refused({ $ref: '#/constructor' })).toThrow(refusal('', '"$ref" "#/constructor" names nothing in the document'));
  });

  it('reports a reference out of the document', () => {
    expect(found({ $ref: 'other.json#/a' })).toEqual([
      { path: '', keyword: '$ref', message: 'the reference "other.json#/a" is not a JSON Pointer into this document, and is not followed: the schema accepts any value there' },
    ]);
  });

  it('reads every reference, those behind a reference too', () => {
    expect(refused({ $defs: { a: { $ref: '#/$defs/b' }, b: { $ref: '#/$defs/none' } }, $ref: '#/$defs/a' })).toThrow(refusal('/$defs/b', '"$ref" "#/$defs/none" names nothing in the document'));
  });
});

describe('a schema met twice', () => {
  it('is read each time, not taken for one that holds itself', () => {
    const shared = { type: 'string' };
    expect(verdicts(read({ properties: { a: shared, b: shared } }), [{ a: 'x', b: 'y' }, { a: 1 }])).toEqual([true, false]);
    expect(verdicts(read({ allOf: [shared, shared] }), ['x', 1])).toEqual([true, false]);
  });
});

describe('dialects', () => {
  it('reads a dialect it does not know as 2020-12, with a finding', () => {
    const { schema, findings } = fromJsonSchema({ $schema: 'http://json-schema.org/draft-04/schema#', prefixItems: [{ type: 'string' }] });
    expect(findings).toEqual([{ path: '', keyword: '$schema', message: 'the dialect "http://json-schema.org/draft-04/schema#" is not one this library reads: the document is read as 2020-12' }]);
    expect(verdicts(schema, [[1], ['a']])).toEqual([false, true]);
  });

  it('takes each dialect it reads by name', () => {
    expect(verdicts(read({ type: 'string', nullable: true }, { draft: 'openapi-3.0' }), [null])).toEqual([true]);
    expect(verdicts(read({ items: [{ type: 'string' }] }, { draft: 'draft-07' }), [[1], ['a']])).toEqual([false, true]);
    expect(verdicts(read({ prefixItems: [{ type: 'string' }] }, { draft: '2020-12' }), [[1], ['a']])).toEqual([false, true]);
  });
});
