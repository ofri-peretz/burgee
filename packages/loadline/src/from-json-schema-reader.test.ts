import { describe, expect, it } from 'vitest';

import { check } from './check.js';
import { fromJsonSchema, jsonSchemaReader } from './from-json-schema.js';

/**
 * One document, many schemas read against it (`jsonSchemaReader`): each `$ref` is read once and
 * shared by every schema that names it, which is what makes reading every payload of a large
 * OpenAPI document cost one reading of its components rather than one for each payload.
 */

/** A document whose `components` count how often each schema in them is read. */
const counted = (): { document: unknown; reads: Map<string, number> } => {
  const reads = new Map<string, number>();
  const watched = (name: string, schema: Record<string, unknown>): unknown =>
    new Proxy(schema, {
      get: (target, key, receiver) => {
        if (key === 'type') reads.set(name, (reads.get(name) ?? 0) + 1);
        return Reflect.get(target, key, receiver) as unknown;
      },
    });
  const schemas = {
    Id: watched('Id', { type: 'string', minLength: 3 }),
    Item: watched('Item', { type: 'object', required: ['id'], properties: { id: { $ref: '#/components/schemas/Id' }, next: { $ref: '#/components/schemas/Item' } } }),
  };
  return { document: { openapi: '3.0.3', components: { schemas } }, reads };
};

describe('jsonSchemaReader', () => {
  it('reads each reference once, however many schemas name it', () => {
    const { document, reads } = counted();
    const reader = jsonSchemaReader(document, { draft: 'openapi-3.0' });
    const schemas = Array.from({ length: 5 }, () => reader.read({ type: 'array', items: { $ref: '#/components/schemas/Item' } }));
    expect(reads.get('Item')).toBe(1);
    expect(reads.get('Id')).toBe(1);
    for (const schema of schemas) {
      expect(check(schema, [{ id: 'abc', next: { id: 'def' } }])).toBe(true);
      expect(check(schema, [{ id: 'ab' }])).toBe(false);
    }
  });

  it('gives each schema the verdicts fromJsonSchema gives it with the definitions beside it', () => {
    const { document } = counted();
    const reader = jsonSchemaReader(document, { draft: 'openapi-3.0' });
    const schema = { type: 'object', properties: { item: { $ref: '#/components/schemas/Item' } } };
    const alone = fromJsonSchema({ ...(document as object), ...schema }, { draft: 'openapi-3.0' }).schema;
    const shared = reader.read(schema);
    for (const value of [{}, { item: { id: 'abc' } }, { item: { id: 'a' } }, { item: { id: 'abc', next: { id: 'x' } } }, 7, null]) {
      expect(check(shared, value)).toBe(check(alone, value));
    }
  });

  it('refuses every schema that reaches a broken reference, and only those, however deep it is', () => {
    const document = {
      $defs: {
        broken: { type: 'string', minLength: 'three' },
        wrapper: { type: 'object', properties: { inner: { $ref: '#/$defs/broken' } } },
        fine: { type: 'number' },
      },
    };
    const reader = jsonSchemaReader(document, { draft: '2020-12' });
    const refusal = /cannot read the JSON Schema at "\/\$defs\/broken": "minLength" is "three"/u;
    expect(() => reader.read({ $ref: '#/$defs/wrapper' })).toThrow(refusal);
    expect(check(reader.read({ $ref: '#/$defs/fine' }), 1)).toBe(true);
    // The wrapper has been read; the reference under it is still broken, and still refused.
    expect(() => reader.read({ items: { $ref: '#/$defs/wrapper' } })).toThrow(refusal);
    expect(() => reader.read({ $ref: '#/$defs/broken' })).toThrow(refusal);
  });

  it('keeps the findings of every schema it read, each reference\'s once', () => {
    const document = { $defs: { stamp: { type: 'string', format: 'not-a-format' } } };
    const reader = jsonSchemaReader(document);
    reader.read({ $ref: '#/$defs/stamp' }, '/first');
    reader.read({ properties: { at: { $ref: '#/$defs/stamp' } }, unevaluatedProperties: false }, '/second');
    expect(reader.findings.map(({ path, keyword }) => [path, keyword])).toEqual([
      ['/$defs/stamp', 'format'],
      ['/second', 'unevaluatedProperties'],
    ]);
  });

  it('refuses a dialect it does not read, as fromJsonSchema does', () => {
    expect(() => jsonSchemaReader({}, { draft: 'draft-04' as never })).toThrow(/cannot read the dialect "draft-04"/u);
  });
});
