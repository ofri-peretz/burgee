import { describe, expect, it } from 'vitest';

import { RefError } from './core/resolve.js';

import { detect, openapi, OpenApiError, read } from './openapi.js';

const Pet = { type: 'object', properties: { name: { type: 'string' } } };

const document = {
  openapi: '3.1.0',
  paths: {
    '/pets/{id}': {
      parameters: [
        { name: 'id', in: 'path', schema: { type: 'string' } },
        { name: 'trace', in: 'header', schema: { type: 'string' } },
      ],
      get: {
        operationId: 'getPet',
        parameters: [{ $ref: '#/components/parameters/Trace' }, { name: 'fields', in: 'query' }],
        responses: {
          200: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } }, 'text/plain': {} } },
          404: { $ref: '#/components/responses/Missing' },
        },
      },
      put: {
        requestBody: { $ref: '#/components/requestBodies/Pet' },
        responses: { 204: { description: 'saved' } },
      },
      delete: { requestBody: { content: { 'application/json': { schema: Pet } } } },
      summary: 'not an operation',
    },
    '/shared': { $ref: '#/components/pathItems/Shared' },
  },
  webhooks: {
    'pet/born': { post: { requestBody: { required: true, content: { 'application/json': { schema: Pet } } }, responses: { 200: {} } } },
    named: { post: { operationId: 'onNamed' } },
  },
  components: {
    schemas: { Pet },
    parameters: { Trace: { name: 'trace', in: 'header', required: true, schema: { type: 'integer' } } },
    responses: { Missing: { $ref: '#/components/responses/Gone' }, Gone: { content: { 'application/json': { schema: false } } } },
    requestBodies: { Pet: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } } } },
    pathItems: { Shared: { head: { responses: {} } } },
  },
};

describe('detect', () => {
  it('accepts OpenAPI 3.x and nothing else', () => {
    expect(detect({ openapi: '3.0.3' })).toBe(true);
    expect(detect({ openapi: '3.2.0' })).toBe(true);
    for (const other of [{ openapi: '2.0' }, { openapi: 3 }, { swagger: '2.0' }, {}, [], null, 'openapi: 3.1.0']) {
      expect(detect(other)).toBe(false);
    }
  });
});

describe('read', () => {
  const contract = read(document);
  const byId = Object.fromEntries(contract.operations.map((operation) => [operation.id, operation]));

  it('keeps the format and the document it was given', () => {
    expect(contract.format).toBe('openapi');
    expect(contract.document).toBe(document);
  });

  it('finds every operation, in document order, with a stable id and a pointer to its source', () => {
    expect(contract.operations.map(({ id, source }) => [id, source])).toEqual([
      ['getPet', '#/paths/~1pets~1{id}/get'],
      ['put /pets/{id}', '#/paths/~1pets~1{id}/put'],
      ['delete /pets/{id}', '#/paths/~1pets~1{id}/delete'],
      ['head /shared', '#/paths/~1shared/head'],
      ['webhook post pet/born', '#/webhooks/pet~1born/post'],
      ['onNamed', '#/webhooks/named/post'],
    ]);
  });

  it("merges the path's parameters with the operation's, the operation's winning", () => {
    expect(byId.getPet?.payloads.slice(0, 3)).toEqual([
      // A path parameter is required even when the document does not say so.
      { name: 'param:path:id', direction: 'request', schema: { type: 'string' }, required: true },
      // The operation's `trace` (a reference) replaced the path's, in the path's position.
      { name: 'param:header:trace', direction: 'request', schema: { type: 'integer' }, required: true },
      // No schema means any value.
      { name: 'param:query:fields', direction: 'request', schema: true, required: false },
    ]);
  });

  it('reads each response per status and media type, following references to the response', () => {
    expect(byId.getPet?.payloads.slice(3)).toEqual([
      { name: 'response:200:application/json', direction: 'response', schema: { $ref: '#/components/schemas/Pet' }, required: true },
      { name: 'response:200:text/plain', direction: 'response', schema: true, required: true },
      { name: 'response:404:application/json', direction: 'response', schema: false, required: true },
    ]);
  });

  it('reads a request body, required or not, and a response with no content as nothing sent', () => {
    expect(byId['put /pets/{id}']?.payloads.slice(2)).toEqual([
      { name: 'body:application/json', direction: 'request', schema: { $ref: '#/components/schemas/Pet' }, required: true },
      { name: 'response:204', direction: 'response', schema: false, required: true },
    ]);
    expect(byId['delete /pets/{id}']?.payloads.at(-1)).toEqual({
      name: 'body:application/json',
      direction: 'request',
      schema: Pet,
      required: false,
    });
  });

  it('follows a referenced path item, and reads an operation with nothing declared', () => {
    expect(byId['head /shared']?.payloads).toEqual([]);
    expect(byId.onNamed?.payloads).toEqual([]);
  });

  it('reads a webhook as the API publishing a request and subscribing to the answer', () => {
    expect(byId['webhook post pet/born']?.payloads).toEqual([
      { name: 'body:application/json', direction: 'publish', schema: Pet, required: true },
      { name: 'response:200', direction: 'subscribe', schema: false, required: true },
    ]);
  });

  it('reads a document with no paths as no operations', () => {
    expect(read({ openapi: '3.0.0', paths: [] }).operations).toEqual([]);
  });

  it('stops on a reference that points at itself, and fails on one that points nowhere', () => {
    const loop = { openapi: '3.1.0', paths: { '/a': { get: { requestBody: { $ref: '#/x' } } } }, x: { $ref: '#/x' } };
    expect(read(loop).operations[0]?.payloads).toEqual([{ name: 'body', direction: 'request', schema: false, required: false }]);
    const broken = { openapi: '3.1.0', paths: { '/a': { get: { requestBody: { $ref: '#/nowhere' } } } } };
    expect(() => read(broken)).toThrow(RefError);
  });

  it('refuses Swagger 2 and anything that is not OpenAPI, each with a fix line', () => {
    expect(() => read({ swagger: '2.0' })).toThrow('it is Swagger 2.0. fix: convert it to OpenAPI 3.1 first');
    expect(() => read({ info: {} })).toThrow('it has no `openapi: 3.x` member. fix: pass an OpenAPI 3.0, 3.1 or 3.2 document');
    expect(() => read(null)).toThrow(OpenApiError);
    expect.assertions(4);
    try {
      read(7);
    } catch (error) {
      expect((error as Error).name).toBe('OpenApiError');
    }
  });
});

describe('the adapter object', () => {
  it('is frozen data plus the two functions it names', () => {
    expect(Object.isFrozen(openapi)).toBe(true);
    expect(openapi).toEqual({ name: 'openapi', description: 'OpenAPI 3.0, 3.1 and 3.2 documents, including webhooks', detect, read });
  });
});
