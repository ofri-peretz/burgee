import { describe, expect, it } from 'vitest';

import { read } from './openapi.js';
import { camel, classOf, fallbackName, kebab, kindOf, routesOf, stubStatus, unique } from './plugin-nest-routes.js';

const routes = (paths: unknown, extra: Record<string, unknown> = {}) => routesOf(read({ openapi: '3.1.0', paths, ...extra }));

const ok = { '200': { description: 'ok' } };

describe('naming', () => {
  it('camelCases an operationId, and starts one that would start with a digit with _', () => {
    expect(camel('ListPets')).toBe('listPets');
    expect(camel('list-pets')).toBe('listPets');
    expect(camel('list_pets.v2')).toBe('listPetsV2');
    expect(camel('2fa')).toBe('_2fa');
    expect(camel('--')).toBe('operation');
  });

  it('names an operation without an id after its method and path, path parameters as By<Param>', () => {
    expect(fallbackName('get', '/pets/{petId}')).toBe('getPetsByPetId');
    expect(fallbackName('post', '/stores/{store-id}/pets')).toBe('postStoresByStoreIdPets');
    expect(fallbackName('get', '/')).toBe('get');
    expect(fallbackName('get', '/{}x')).toBe('getX');
  });

  it('suffixes a taken name, ignoring case, and takes what it returns', () => {
    const taken = new Set<string>();
    expect(unique('getPet', taken)).toBe('getPet');
    expect(unique('GETPET', taken)).toBe('GETPET2');
    expect(unique('getPet', taken)).toBe('getPet3');
    expect([...taken]).toEqual(['getpet', 'getpet2', 'getpet3']);
  });

  it('files a tag in kebab-case and names its class in PascalCase', () => {
    expect(kebab('Pet Store')).toBe('pet-store');
    expect(kebab('!!')).toBe('default');
    expect(classOf('pet-store')).toBe('PetStore');
    expect(classOf('2fa')).toBe('_2fa');
  });

  it('stubs the first 2xx, else the first response', () => {
    expect(stubStatus(['400', '201', '200'])).toBe('201');
    expect(stubStatus(['404', 'default'])).toBe('404');
    expect(stubStatus([])).toBeUndefined();
  });
});

const deref = (value: unknown) => (value === 'ref' ? { type: 'integer' } : (value as Record<string, unknown>));

const declared = (responses: Record<string, unknown>) =>
  routes({ '/a': { post: { operationId: 'a', requestBody: { content: { 'application/json': { example: 1 } } }, responses } } }).findings.map((finding) => finding.code);

describe('kindOf', () => {
  it('reads numbers, booleans and lists of them, through references and nullable types', () => {
    expect(kindOf({ type: 'number' }, deref)).toBe('number');
    expect(kindOf({ type: 'integer' }, deref)).toBe('number');
    expect(kindOf({ type: ['null', 'boolean'] }, deref)).toBe('boolean');
    expect(kindOf({ type: 'array', items: 'ref' as never }, deref)).toBe('number[]');
    expect(kindOf({ type: 'string' }, deref)).toBe('string');
    expect(kindOf({}, deref)).toBe('string');
  });
});

describe('routesOf', () => {
  it('leaves out webhooks and methods NestJS has no decorator for, with a finding each', () => {
    const { controllers, findings } = routes(
      { '/a': { trace: { operationId: 'traceA', responses: ok }, additionalOperations: { COPY: { operationId: 'copyA', responses: ok } } } },
      { openapi: '3.2.0', webhooks: { ping: { post: { operationId: 'ping', responses: ok } } } },
    );
    expect(controllers).toEqual([]);
    expect(findings).toEqual(
      ['copyA', 'ping', 'traceA'].map((id) => ({
        code: 'server-operation-skipped',
        pointer: { copyA: '#/paths/~1a/additionalOperations/COPY', ping: '#/webhooks/ping/post', traceA: '#/paths/~1a/trace' }[id],
        message: `\`${id}\` is not a route NestJS declares (a webhook, or a method it has no decorator for)`,
        fix: 'serve it outside the generated controllers',
      })),
    );
  });

  it('reads path, query and header parameters, from the path item and by reference, and leaves out cookies with a finding', () => {
    const { controllers, findings } = routes(
      {
        '/pets/{petId}': {
          parameters: [{ $ref: '#/components/parameters/PetId' }],
          get: {
            operationId: 'getPet',
            parameters: [
              { name: 'expand', in: 'query', required: true, schema: { type: 'array', items: { type: 'boolean' } }, examples: { one: { value: [true] } } },
              { name: 'X-Trace', in: 'header', schema: { type: 'string' }, example: 't' },
              { name: 'session', in: 'cookie', schema: { type: 'string' } },
            ],
            responses: { '400': { description: 'bad' } },
          },
        },
      },
      { components: { parameters: { PetId: { name: 'petId', in: 'path', schema: { type: 'integer' }, example: 7 } } } },
    );
    expect(controllers).toEqual([
      {
        file: 'default',
        name: 'Default',
        routes: [
          {
            id: 'getPet',
            method: 'get',
            path: '/pets/{petId}',
            source: '#/paths/~1pets~1{petId}/get',
            name: 'getPet',
            handler: 'handleGetPet',
            params: [
              { name: 'petId', part: 'path', payload: 'param:path:petId', required: true, kind: 'number', example: 7 },
              { name: 'expand', part: 'query', payload: 'param:query:expand', required: true, kind: 'boolean[]', example: [true] },
              { name: 'X-Trace', part: 'header', payload: 'param:header:X-Trace', required: false, kind: 'string', example: 't' },
            ],
            responses: [{ status: '400' }],
          },
        ],
      },
    ]);
    expect(findings).toEqual([
      {
        code: 'server-parameter-skipped',
        pointer: '#/paths/~1pets~1{petId}/get',
        message: '`getPet` reads cookie parameter "session", which the generated route does not pass on',
        fix: 'read it from the request in your controller',
      },
    ]);
  });

  it('serves one media type per body and response, JSON first, leaves out streams, and reports the others', () => {
    const { controllers, findings } = routes({
      '/upload': {
        post: {
          operationId: 'upload',
          requestBody: {
            content: {
              'text/plain': { schema: { type: 'string' } },
              'application/merge-patch+json': { schema: { type: 'object' }, example: { a: 1 } },
            },
          },
          responses: {
            '200': { description: 'ok', content: { 'text/csv': { schema: { type: 'string' }, example: 'a,b' }, 'text/plain': { schema: { type: 'string' } } } },
            '4XX': { description: 'no', content: { 'application/problem+json': { schema: { type: 'object' } } } },
            '201': { description: 'stream', content: { 'application/jsonl': { itemSchema: { type: 'object' } } } },
          },
        },
      },
    });
    const [route] = controllers[0]?.routes ?? [];
    expect(route?.body).toEqual({ payload: 'body:application/merge-patch+json', media: 'application/merge-patch+json', required: false, example: { a: 1 } });
    expect(route?.responses).toEqual([
      { status: '200', content: { media: 'text/csv', payload: 'response:200:text/csv', example: 'a,b' } },
      { status: '201' },
      { status: '4XX', content: { media: 'application/problem+json', payload: 'response:4XX:application/problem+json', example: undefined } },
    ]);
    expect(findings).toEqual([
      {
        code: 'server-stream-skipped',
        pointer: '#/paths/~1upload/post',
        message: '`upload` streams response:201:application/jsonl item by item, which the generated route does not',
        fix: 'stream it from your controller, outside the generated route',
      },
      {
        code: 'server-media-type-skipped',
        pointer: '#/paths/~1upload/post',
        message: '`upload` accepts a body in text/plain is not served: the route serves one media type, JSON first',
        fix: 'serve the other media type outside the generated controller',
      },
      {
        code: 'server-media-type-skipped',
        pointer: '#/paths/~1upload/post',
        message: '`upload` answers 200 in text/plain is not served: the route serves one media type, JSON first',
        fix: 'serve the other media type outside the generated controller',
      },
    ]);
  });

  it('reports a request it validates without a declared 400, 4XX or default response', () => {
    expect(declared(ok)).toEqual(['server-problem-undeclared']);
    expect(declared({ ...ok, '400': { description: 'x' } })).toEqual([]);
    expect(declared({ ...ok, '4XX': { description: 'x' } })).toEqual([]);
    expect(declared({ ...ok, default: { description: 'x' } })).toEqual([]);
    expect(routes({ '/a': { get: { operationId: 'a', responses: ok } } }).findings).toEqual([]);
  });

  it('synthesises a missing example with a finding, and reads a body example by reference', () => {
    const { controllers, findings } = routes(
      {
        '/a': {
          put: {
            operationId: 'putA',
            requestBody: { $ref: '#/components/requestBodies/A' },
            responses: { '200': { $ref: '#/components/responses/A' } },
          },
        },
      },
      {
        components: {
          requestBodies: { A: { required: true, content: { 'application/json': { schema: { type: 'integer', minimum: 3 } } } } },
          responses: { A: { description: 'a', content: { 'application/json': { schema: { type: 'string' }, examples: { x: { $ref: '#/components/examples/X' } } } } } },
          examples: { X: { value: 'from ref' } },
        },
      },
    );
    const [route] = controllers[0]?.routes ?? [];
    expect(route?.body).toEqual({ payload: 'body:application/json', media: 'application/json', required: true, example: 3 });
    expect(route?.responses).toEqual([{ status: '200', content: { media: 'application/json', payload: 'response:200:application/json', example: 'from ref' } }]);
    expect(findings[0]).toEqual({
      code: 'server-example-synthesised',
      pointer: '#/paths/~1a/put',
      message: '`putA` body has no example: the contract test sends one made from its schema',
      fix: 'add an `example` to the spec, so the contract test sends a value you chose',
    });
    const response = routes({ '/b': { get: { operationId: 'b', responses: { '200': { description: 'b', content: { 'application/json': { schema: { type: 'boolean' } } } } } } } });
    expect(response.findings.map((finding) => finding.message)).toEqual(['`b` response 200 has no example: the contract test sends one made from its schema']);
    expect(response.controllers[0]?.routes[0]?.responses[0]?.content?.example).toBe(true);
  });

  it('groups routes by first tag in id order, names collisions apart, and never gives a handler an operation’s name', () => {
    const { controllers } = routes({
      '/x': {
        get: { operationId: 'handleGetPet', tags: ['Pet Store', 'other'], responses: ok },
        post: { operationId: 'get-pet', tags: ['Pet Store'], responses: ok },
        put: { operationId: 'GetPet', tags: [3], responses: ok },
        patch: { tags: ['Admin'], responses: ok },
      },
    });
    expect(controllers.map((controller) => [controller.file, controller.name, controller.routes.map((route) => [route.id, route.name, route.handler])])).toEqual([
      ['admin', 'Admin', [['patch /x', 'patchX', 'handlePatchX']]],
      ['default', 'Default', [['GetPet', 'getPet', 'handleGetPet2']]],
      [
        'pet-store',
        'PetStore',
        [
          ['get-pet', 'getPet2', 'handleGetPet22'],
          ['handleGetPet', 'handleGetPet', 'handleHandleGetPet'],
        ],
      ],
    ]);
  });

  it('decodes the path from the pointer', () => {
    const { controllers } = routes({ '/a~b/{c}': { get: { operationId: 'a', responses: ok } } });
    expect(controllers[0]?.routes[0]?.path).toBe('/a~b/{c}');
  });
});
