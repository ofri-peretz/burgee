import { describe, expect, it } from 'vitest';

import { draftOf, payloadJudge, rooted, validatorJudge } from './props-judge.js';

describe('the judge', () => {
  it('reads a contract dialect from its document', () => {
    expect(draftOf({ document: { openapi: '3.0.3' } })).toBe('openapi-3.0');
    expect(draftOf({ document: { openapi: '3.1.0' } })).toBe('2020-12');
    expect(draftOf({ document: { $schema: 'http://json-schema.org/draft-07/schema#' } })).toBe('draft-07');
    expect(draftOf({ document: [] })).toBe('2020-12');
    expect(draftOf({ document: { $schema: 'https://json-schema.org/draft/2020-12/schema' } })).toBe('2020-12');
  });

  it('carries the definitions a payload points into beside it, without overwriting its own', () => {
    expect(rooted(true, {})).toEqual({});
    expect(rooted(false, {})).toEqual({ not: {} });
    expect(rooted({ $ref: '#/components/schemas/A' }, { components: { schemas: {} }, paths: {} })).toEqual({ components: { schemas: {} }, $ref: '#/components/schemas/A' });
    expect(rooted({ $defs: { mine: {} } }, { $defs: { theirs: {} }, definitions: {} })).toEqual({ definitions: {}, $defs: { mine: {} } });
    expect(rooted({ type: 'string' }, 'not a document')).toEqual({ type: 'string' });
    expect(Object.keys(rooted({ type: 'string' }, { components: {} }) as object)).toEqual(['components', 'type']);
  });

  it('gives the places a value is refused at, and none when it is accepted', () => {
    expect(validatorJudge({ type: 'string' }, '2020-12').paths(1)).toEqual(['']);
    expect(validatorJudge({ type: 'string' }, '2020-12').paths('x')).toEqual([]);
    expect(validatorJudge({ type: 'string' }, '2020-12').accepts('x')).toBe(true);
  });

  it('reads a definition once for every payload of a document, not once for each', () => {
    let reads = 0;
    const id = new Proxy({ type: 'string', minLength: 3 }, { get: (target, key, receiver) => {
      if (key === 'type') reads += 1;
      return Reflect.get(target, key, receiver) as unknown;
    } });
    const document = { openapi: '3.0.3', components: { schemas: { Id: id } } };
    const judges = Array.from({ length: 4 }, (_, index) => payloadJudge({ type: 'object', required: [`k${String(index)}`], properties: { [`k${String(index)}`]: { $ref: '#/components/schemas/Id' } } }, document, 'openapi-3.0'));
    expect(reads).toBe(1);
    expect(judges.map((judge) => judge.accepts({ k0: 'abc', k1: 'abc', k2: 'abc', k3: 'abc' }))).toEqual([true, true, true, true]);
    expect(judges[2]?.paths({ k2: 'ab' })).toEqual(['/k2']);
  });

  it('judges a payload as validatorJudge does on it rooted, its own definitions and root included', () => {
    const document = { $defs: { theirs: { type: 'integer' } }, components: { schemas: { N: { type: 'number', maximum: 3 } } } };
    const payloads: unknown[] = [
      { $ref: '#/components/schemas/N' },
      { $defs: { theirs: { type: 'string' } }, $ref: '#/$defs/theirs' },
      { type: 'array', items: { $ref: '#' }, maxItems: 1 },
      { type: 'object', properties: { a: { $ref: '#/properties/b' }, b: { type: 'integer' } } },
      { allOf: [{ $ref: '#/components/schemas/N' }, { $ref: '#/allOf/0' }] },
      { anyOf: [{ $ref: 'other.json#/N' }, { type: 'string' }] },
      true,
      false,
      'not a schema',
    ];
    for (const payload of payloads) {
      const shared = payloadJudge(payload, document, '2020-12');
      const alone = validatorJudge(rooted(payload, document), '2020-12');
      for (const value of [2, 5, 'x', [], [[]], [[], []], null, { a: 1 }, { a: 'x' }, ['x']]) expect([payload, value, shared.accepts(value)]).toEqual([payload, value, alone.accepts(value)]);
    }
    expect(payloadJudge({ type: 'string' }, 'not a document', '2020-12').accepts('x')).toBe(true);
  });

  it('reads a payload in its contract\'s dialect', () => {
    const document = { openapi: '3.0.3', components: { schemas: { Name: { type: 'string', nullable: true } } } };
    expect(payloadJudge({ $ref: '#/components/schemas/Name' }, document, 'openapi-3.0').accepts(null)).toBe(true);
    expect(payloadJudge({ $ref: '#/components/schemas/Name' }, document, '2020-12').accepts(null)).toBe(false);
  });

  it('refuses a payload whose definition cannot be read, every time, and not its neighbours', () => {
    const document = { components: { schemas: { Bad: { type: 'string', maxLength: 'ten' }, Good: { type: 'string' } } } };
    expect(() => payloadJudge({ $ref: '#/components/schemas/Bad' }, document, '2020-12')).toThrow(/maxLength/u);
    expect(payloadJudge({ $ref: '#/components/schemas/Good' }, document, '2020-12').accepts('x')).toBe(true);
    expect(() => payloadJudge({ items: { $ref: '#/components/schemas/Bad' } }, document, '2020-12')).toThrow(/maxLength/u);
  });
});
