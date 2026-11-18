import { describe, expect, it } from 'vitest';

import { read } from './openapi.js';
import { routesOf } from './plugin-fetch-routes.js';

const ok = { '200': { description: 'OK' } };
const of = (paths: Record<string, unknown>, extra: Record<string, unknown> = {}) => routesOf(read({ openapi: '3.1.0', info: { title: 't', version: '1' }, paths, ...extra }));

const body = (content: Record<string, unknown>, required?: boolean) => ({ '/': { post: { operationId: 'x', requestBody: { content, ...(required === undefined ? {} : { required }) }, responses: ok } } });
const op = (operationId: string) => ({ operationId, responses: ok });

describe('routesOf', () => {
  it('reads method, path, parameters, body and responses, sorted by operation id', () => {
    const { routes, findings } = of(
      {
        '/b/{id}': {
          parameters: [
            { name: 'id', in: 'path', schema: { type: 'string' } },
            { name: 'q', in: 'query', required: true },
          ],
          post: {
            operationId: 'zeta',
            parameters: [{ name: 'q', in: 'query', style: 'pipeDelimited', explode: true }, { $ref: '#/components/parameters/H' }],
            requestBody: { $ref: '#/components/requestBodies/B' },
            responses: { '201': { description: 'made', content: { 'application/json': { schema: { type: 'object' } }, 'text/plain': {} } }, default: { $ref: '#/components/responses/E' } },
          },
        },
        '/a': { get: { operationId: 'alpha', responses: ok } },
      },
      {
        components: {
          parameters: { H: { name: 'X-H', in: 'header' } },
          requestBodies: { B: { required: true, content: { 'application/json': { schema: { type: 'object' } } } } },
          responses: { E: { description: 'error', content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/E' } } } } },
          schemas: { E: { type: 'object' } },
        },
      },
    );
    expect(findings).toEqual([]);
    expect(routes).toEqual([
      { id: 'alpha', name: 'Alpha', method: 'get', path: '/a', parameters: [], responses: [{ key: '200', media: [] }] },
      {
        id: 'zeta',
        name: 'Zeta',
        method: 'post',
        path: '/b/{id}',
        parameters: [
          { name: 'id', in: 'path', style: 'simple', explode: false, required: true },
          { name: 'q', in: 'query', style: 'pipeDelimited', explode: true, required: false },
          { name: 'X-H', in: 'header', style: 'simple', explode: false, required: false },
        ],
        body: { type: 'application/json', required: true },
        responses: [
          {
            key: '201',
            media: [
              { type: 'application/json', schema: { type: 'object' }, pointer: '#/paths/~1b~1{id}/post/responses/201/content/application~1json', declared: { schema: { type: 'object' } } },
              { type: 'text/plain', schema: true, pointer: '#/paths/~1b~1{id}/post/responses/201/content/text~1plain', declared: {} },
            ],
          },
          {
            key: 'default',
            media: [
              {
                type: 'application/problem+json',
                schema: { $ref: '#/components/schemas/E' },
                pointer: '#/paths/~1b~1{id}/post/responses/default/content/application~1problem+json',
                declared: { schema: { $ref: '#/components/schemas/E' } },
              },
            ],
          },
        ],
      },
    ]);
  });

  it('defaults a query parameter to form and exploded, and a cookie to form; the spec can say otherwise', () => {
    const { routes } = of({
      '/': {
        get: {
          operationId: 'x',
          parameters: [
            { name: 'a', in: 'query' },
            { name: 'b', in: 'query', explode: false },
            { name: 'c', in: 'cookie' },
            { name: 'd', in: 'header', explode: true, required: true },
          ],
          responses: ok,
        },
      },
    });
    expect(routes[0]?.parameters.map(({ name, style, explode, required }) => [name, style, explode, required])).toEqual([
      ['a', 'form', true, false],
      ['b', 'form', false, false],
      ['c', 'form', true, false],
      ['d', 'simple', true, true],
    ]);
  });

  it('chooses JSON, then a form, then multipart for a body, and reports each media type it does not offer', () => {
    expect(of(body({ 'text/plain': {}, 'multipart/form-data': {}, 'application/x-www-form-urlencoded': {} })).routes[0]?.body).toEqual({ type: 'application/x-www-form-urlencoded', required: false });
    expect(of(body({ 'text/plain': {}, 'multipart/form-data': {} }, true)).routes[0]?.body).toEqual({ type: 'multipart/form-data', required: true });
    expect(of(body({ 'application/xml': {} })).routes[0]?.body).toEqual({ type: 'application/xml', required: false });
    expect(of(body({})).routes[0]?.body).toEqual({ type: 'application/json', required: false });
    expect(of(body({ 'application/xml': {}, 'application/json': {} })).findings).toEqual([
      {
        code: 'media-type-skipped',
        pointer: '#/paths/~1/post/requestBody',
        message: 'the body is sent as application/json; application/xml is not offered',
        fix: 'call the operation with fetch yourself to send application/xml',
      },
    ]);
  });

  it('reports, never drops silently, what a client cannot send', () => {
    const { routes, findings } = of(
      {
        '/p/{id}': {
          get: {
            operationId: 'x',
            parameters: [
              { name: 'id', in: 'path', style: 'label' },
              { name: 'raw', in: 'querystring', content: { 'application/json': {} } },
              { name: 'q', in: 'query', style: 'matrix' },
            ],
            responses: ok,
          },
          additionalOperations: { COPY: { operationId: 'copy', responses: ok } },
        },
      },
      { webhooks: { ping: { post: { operationId: 'ping', responses: ok } } } },
    );
    expect(routes.map((route) => route.id)).toEqual(['x']);
    expect(routes[0]?.parameters.map(({ name, style }) => [name, style])).toEqual([
      ['id', 'simple'],
      ['q', 'form'],
    ]);
    expect(findings).toEqual([
      {
        code: 'style-translated',
        pointer: '#/paths/~1p~1{id}/get/parameters/0',
        message: 'the path style "label" is sent as "simple"',
        fix: 'declare `style: simple`, or send the parameter yourself',
      },
      {
        code: 'parameter-skipped',
        pointer: '#/paths/~1p~1{id}/get/parameters/1',
        message: 'the parameter "raw" is in "querystring", which the client does not send',
        fix: 'declare it in path, query, header or cookie',
      },
      {
        code: 'style-translated',
        pointer: '#/paths/~1p~1{id}/get/parameters/2',
        message: 'the query style "matrix" is sent as "form"',
        fix: 'declare `style: form`, or send the parameter yourself',
      },
      {
        code: 'operation-skipped',
        pointer: '#/paths/~1p~1{id}/additionalOperations/COPY',
        message: '"copy" is not a request a client sends',
        fix: 'call it yourself; the client covers operations under `paths` with a standard method',
      },
      {
        code: 'operation-skipped',
        pointer: '#/webhooks/ping/post',
        message: '"ping" is not a request a client sends',
        fix: 'call it yourself; the client covers operations under `paths` with a standard method',
      },
    ]);
  });

  it('reads every standard method, and nothing from responses written as a list', () => {
    const methods = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];
    const { routes } = of({ '/m': Object.fromEntries(methods.map((method) => [method, { operationId: method, responses: [{ description: 'listed' }] }])) });
    expect(routes.map((route) => [route.method, route.responses])).toEqual(methods.toSorted().map((method) => [method, []]));
  });

  it('reads nothing from a null where an object belongs', () => {
    const { routes } = of({ '/n': { parameters: null, get: { operationId: 'x', parameters: [null], responses: null } } });
    expect(routes).toEqual([{ id: 'x', name: 'X', method: 'get', path: '/n', parameters: [], responses: [] }]);
  });

  it('decodes the path and encodes the media type in a pointer', () => {
    const { routes } = of({ '/a~b/c': { get: { operationId: 'x', responses: { '200': { description: 'OK', content: { 'application/x~y': {} } } } } } });
    expect(routes[0]?.path).toBe('/a~b/c');
    expect(routes[0]?.responses[0]?.media[0]?.pointer).toBe('#/paths/~1a~0b~1c/get/responses/200/content/application~1x~0y');
  });

  it('reports a path-level parameter at the path, and a reference that refers to itself', () => {
    const { findings } = of(
      { '/p': { parameters: [{ name: 'q', in: 'query', style: 'matrix' }], get: { operationId: 'x', parameters: [{ $ref: '#/components/parameters/Loop' }], responses: ok } } },
      { components: { parameters: { Loop: { $ref: '#/components/parameters/Loop' } } } },
    );
    expect(findings.map((finding) => [finding.code, finding.pointer])).toEqual([
      ['style-translated', '#/paths/~1p/parameters/0'],
      ['parameter-skipped', '#/paths/~1p/get/parameters/0'],
    ]);
  });

  it('names each operation as a type, unique in the file', () => {
    const { routes } = of({ '/a': { get: op('a-b'), put: op('a_b'), post: op('1x'), delete: op('ab'), patch: op('a.b') }, '/b': { get: { responses: ok } } });
    expect(routes.map((route) => [route.id, route.name])).toEqual([
      ['1x', 'Op1x'],
      ['a-b', 'AB'],
      ['a.b', 'AB2'],
      ['a_b', 'AB3'],
      ['ab', 'Ab'],
      ['get /b', 'GetB'],
    ]);
  });
});
