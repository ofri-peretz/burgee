import { describe, expect, it } from 'vitest';

import { EDITS, isOpenApi3, resolve } from './diff-edits.js';
import { parseDocument, pick, shuffled } from './diff-pairs.js';

/** One small document with somewhere for every edit, its schemas shared by request and response. */
const PETS = {
  openapi: '3.0.3',
  info: { title: 'pets', version: '1' },
  paths: {
    '/pets': {
      get: {
        parameters: [{ $ref: '#/components/parameters/Kind' }],
        responses: { 200: { description: 'ok', content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } } }, 404: { description: 'none' } },
      },
      post: {
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } } },
        responses: { 201: { description: 'made' } },
      },
    },
    '/pets/{petId}': {
      parameters: [{ name: 'petId', in: 'path', required: true, schema: { type: 'string' } }],
      delete: { responses: { 204: { description: 'gone' } } },
    },
  },
  components: {
    parameters: { Kind: { name: 'kind', in: 'query', schema: { type: 'string', enum: ['cat', 'dog'] } } },
    schemas: {
      Pet: {
        type: 'object',
        required: ['name'],
        properties: { age: { type: 'integer' }, id: { type: 'string', readOnly: true }, name: { type: 'string' } },
      },
    },
  },
} as const;

type Json = Record<string, any>;
const edit = (id: string): Json | undefined => (EDITS.find((e) => e.id === id) as (typeof EDITS)[number]).apply(PETS);
const at = (id: string): Json => edit(id) as Json;

describe('the catalogue', () => {
  it('holds at least 20 edits, at least 8 of them non-breaking, each with an id, a label and a why', () => {
    expect(EDITS.length).toBeGreaterThanOrEqual(20);
    expect(EDITS.filter((e) => e.label === 'non-breaking').length).toBeGreaterThanOrEqual(8);
    expect(new Set(EDITS.map((e) => e.id)).size).toBe(EDITS.length);
    for (const e of EDITS) expect(e.why.length).toBeGreaterThan(10);
  });

  it('applies every edit to the fixture, changes it, and leaves the input alone', () => {
    const before = structuredClone(PETS);
    for (const e of EDITS) {
      const out = e.apply(PETS);
      expect(out, e.id).toBeDefined();
      expect(out, e.id).not.toEqual(PETS);
    }
    expect(PETS).toEqual(before);
  });

  it('answers undefined for what is not OpenAPI 3.x', () => {
    for (const e of EDITS) {
      expect(e.apply({ swagger: '2.0', paths: {} })).toBeUndefined();
      expect(e.apply({ openapi: '3.1.0' })).toBeUndefined();
    }
    expect(isOpenApi3([])).toBe(false);
    expect(isOpenApi3(null)).toBe(false);
  });

  it('answers undefined when the document has nowhere for the edit', () => {
    const bare = { openapi: '3.1.0', info: {}, paths: { '/a': { get: { responses: { 200: { description: 'ok' } } } } }, security: [{ key: [] }] };
    const none = ['request-body-made-required', 'request-property-made-required', 'request-property-type-changed', 'request-enum-value-removed', 'response-property-removed', 'response-property-type-changed', 'path-parameter-renamed', 'success-status-removed', 'security-requirement-added', 'optional-request-property-added', 'request-property-made-optional', 'request-enum-value-added', 'response-property-added', 'example-changed'];
    for (const id of none) expect((EDITS.find((e) => e.id === id) as (typeof EDITS)[number]).apply(bare), id).toBeUndefined();
    expect((EDITS.find((e) => e.id === 'operation-deprecated') as (typeof EDITS)[number]).apply({ ...bare, paths: { '/a': { get: { deprecated: true } } } })).toBeUndefined();
    expect((EDITS.find((e) => e.id === 'operation-added') as (typeof EDITS)[number]).apply({ ...bare, paths: { '/bench_planted': {} } })).toBeUndefined();
  });
});

describe('each edit', () => {
  it('operation-removed drops the first operation and an emptied path', () => {
    expect(Object.keys(at('operation-removed').paths['/pets'])).toEqual(['post']);
    const one = { openapi: '3.0.0', paths: { '/a': { get: {} }, '/b': { get: {} } } };
    expect(Object.keys((EDITS[0] as (typeof EDITS)[number]).apply(one)?.paths as Json)).toEqual(['/b']);
  });

  it('required and optional query parameters are added to the first operation', () => {
    expect(at('required-request-parameter-added').paths['/pets'].get.parameters[1]).toEqual({ name: 'bench_planted', in: 'query', required: true, schema: { type: 'string' } });
    expect(at('optional-request-parameter-added').paths['/pets'].get.parameters[1].required).toBe(false);
    expect(at('optional-request-parameter-added').paths['/pets/{petId}'].delete.parameters).toBeUndefined();
  });

  it('request body edits inline the shared schema, so the response is untouched', () => {
    const required = at('request-body-made-required');
    expect(required.paths['/pets'].post.requestBody.required).toBe(true);
    const made = at('request-property-made-required');
    expect(made.paths['/pets'].post.requestBody.content['application/json'].schema.required).toEqual(['name', 'age']);
    expect(made.components.schemas.Pet.required).toEqual(['name']);
    expect(made.paths['/pets'].get.responses[200].content['application/json'].schema).toEqual({ $ref: '#/components/schemas/Pet' });
    const optional = at('request-property-made-optional').paths['/pets'].post.requestBody.content['application/json'].schema;
    expect(optional.required).toBeUndefined();
    const added = at('optional-request-property-added').paths['/pets'].post.requestBody.content['application/json'].schema;
    expect(added.properties.bench_planted).toEqual({ type: 'string' });
  });

  it('type changes swap string and integer, never a read-only or an enum property', () => {
    expect(at('request-property-type-changed').paths['/pets'].post.requestBody.content['application/json'].schema.properties.age).toEqual({ type: 'string' });
    const response = at('response-property-type-changed').paths['/pets'].get.responses[200].content['application/json'].schema;
    expect(response.properties.name).toEqual({ type: 'integer' });
  });

  it('response edits remove a required property, add one, and change an example', () => {
    const removed = at('response-property-removed').paths['/pets'].get.responses[200].content['application/json'].schema;
    expect(Object.keys(removed.properties)).toEqual(['age', 'id']);
    expect(removed.required).toEqual([]);
    expect(at('response-property-added').paths['/pets'].get.responses[200].content['application/json'].schema.properties.bench_planted).toEqual({ type: 'string' });
    expect(at('example-changed').paths['/pets'].get.responses[200].content['application/json'].schema.properties.id.example).toBe('bench_planted');
  });

  it('enum edits inline the parameter and drop or add a value', () => {
    expect(at('request-enum-value-removed').paths['/pets'].get.parameters[0].schema.enum).toEqual(['cat']);
    expect(at('request-enum-value-added').paths['/pets'].get.parameters[0].schema.enum).toEqual(['cat', 'dog', 'bench_planted']);
    expect(at('request-enum-value-added').components.parameters.Kind.schema.enum).toEqual(['cat', 'dog']);
  });

  it('finds an enum among request body properties, and skips header and non-enum parameters', () => {
    const doc = {
      openapi: '3.0.0',
      paths: {
        '/a': {
          post: {
            parameters: [{ name: 'h', in: 'header', schema: { enum: ['x', 'y'] } }, { name: 'q', in: 'query', schema: { type: 'string' } }, { name: 'n', in: 'query' }],
            requestBody: { content: { 'application/json': { schema: { properties: { mode: { type: 'string', enum: ['on', 'off'] } } } } } },
          },
        },
      },
    };
    const out = (EDITS.find((e) => e.id === 'request-enum-value-removed') as (typeof EDITS)[number]).apply(doc) as Json;
    expect(out.paths['/a'].post.requestBody.content['application/json'].schema.properties.mode.enum).toEqual(['on']);
  });

  it('path-parameter-renamed renames the template and every parameter that names it, keeping key order', () => {
    const out = at('path-parameter-renamed');
    expect(Object.keys(out.paths)).toEqual(['/pets', '/pets/{petId_bench_planted}']);
    expect(out.paths['/pets/{petId_bench_planted}'].parameters[0].name).toBe('petId_bench_planted');
    const opLevel = { openapi: '3.0.0', paths: { '/x/{id}': { get: { parameters: [{ name: 'id', in: 'path' }, { name: 'id', in: 'query' }] } } } };
    const renamed = (EDITS.find((e) => e.id === 'path-parameter-renamed') as (typeof EDITS)[number]).apply(opLevel) as Json;
    expect(renamed.paths['/x/{id_bench_planted}'].get.parameters).toEqual([{ name: 'id_bench_planted', in: 'path' }, { name: 'id', in: 'query' }]);
  });

  it('success-status-removed removes the first 2xx of an operation with more than one response', () => {
    expect(Object.keys(at('success-status-removed').paths['/pets'].get.responses)).toEqual(['404']);
  });

  it('security-requirement-added declares a scheme and demands it on an operation with none', () => {
    const out = at('security-requirement-added');
    expect(out.components.securitySchemes).toEqual({ bench_planted: { type: 'http', scheme: 'bearer' } });
    expect(out.paths['/pets'].get.security).toEqual([{ bench_planted: [] }]);
    const noComponents = { openapi: '3.0.0', paths: { '/a': { get: { security: [] } } } };
    expect((EDITS.find((e) => e.id === 'security-requirement-added') as (typeof EDITS)[number]).apply(noComponents)?.components).toEqual({ securitySchemes: { bench_planted: { type: 'http', scheme: 'bearer' } } });
  });

  it('operation-added, description-changed and operation-deprecated touch one operation', () => {
    expect(at('operation-added').paths['/bench_planted']).toEqual({ get: { operationId: 'bench_planted', responses: { 200: { description: 'planted' } } } });
    expect(at('description-changed').paths['/pets'].get.description).toBe('(edited)');
    const described = { openapi: '3.0.0', paths: { '/a': { get: { description: 'Lists.' } } } };
    expect(((EDITS.find((e) => e.id === 'description-changed') as (typeof EDITS)[number]).apply(described) as Json).paths['/a'].get.description).toBe('Lists. (edited)');
    expect(at('operation-deprecated').paths['/pets'].get.deprecated).toBe(true);
  });
});

describe('resolve', () => {
  it('follows local refs, decodes escapes, and refuses external, broken and circular ones', () => {
    const doc = { a: { 'b/c': { $ref: '#/d' } }, d: 1, loop: { $ref: '#/loop' } };
    expect(resolve(doc, { $ref: '#/a/b~1c' })).toBe(1);
    expect(resolve(doc, { $ref: 'other.json#/x' })).toBeUndefined();
    expect(resolve(doc, { $ref: '#/missing/x' })).toBeUndefined();
    expect(resolve(doc, { $ref: '#/loop' })).toBeUndefined();
  });
});

describe('pairs', () => {
  it('picks the edit at the turn, or the next one that applies', () => {
    expect(pick(PETS, 0)?.edit.id).toBe(EDITS[0]?.id);
    const bare = { openapi: '3.0.0', paths: {} };
    expect(pick(bare, 3)?.edit.id).toBe('operation-added');
    expect(pick({ swagger: '2.0' }, 0)).toBeUndefined();
  });

  it('shuffles the same way for the same seed', () => {
    const items = Array.from({ length: 10 }, (_, i) => i);
    expect(shuffled(items, 7)).toEqual(shuffled(items, 7));
    expect(shuffled(items, 7).toSorted((a, b) => a - b)).toEqual(items);
    expect(shuffled(items, 7)).not.toEqual(shuffled(items, 8));
  });

  it('reads JSON and YAML documents, and answers undefined for neither', () => {
    expect(parseDocument('{"a":1}', 'x.json')).toEqual({ a: 1 });
    expect(parseDocument('a: 1\n', 'x.yaml')).toEqual({ a: 1 });
    expect(parseDocument('{', 'x.json')).toBeUndefined();
  });
});
