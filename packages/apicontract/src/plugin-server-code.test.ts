import { describe, expect, it } from 'vitest';

import { read } from './openapi.js';
import { colonPath, commented, lines, literal, operationTypes, readAs, routePath, stubResponse, where } from './plugin-server-code.js';
import { type Route, routesOf } from './plugin-server-routes.js';

const route = (responses: Route['responses']): Route => ({ id: 'a', method: 'get', path: '/a', source: '#', name: 'a', handler: 'handleA', params: [], responses });

describe('text helpers', () => {
  it('writes a value as a literal that cannot close a script or end a line', () => {
    expect(literal('</script>\u2028\u2029')).toBe('"\\u003C/script\\u003E\\u2028\\u2029"');
    expect(literal(undefined)).toBe('undefined');
    expect(literal({ a: [1] })).toBe('{"a":[1]}');
  });

  it('keeps spec text from ending a comment', () => {
    expect(commented('/a*/b')).toBe('/a*\\/b');
  });

  it('ends the lines with a newline', () => {
    expect(lines('a', 'b')).toBe('a\nb\n');
  });

  it('writes a route as path-to-regexp 8 reads it', () => {
    expect(routePath('/pets/{petId}/photos/{photo-id}')).toBe('/pets/:petId/photos/:photo_id');
    expect(routePath('/a(b)[c]?+!*:d')).toBe('/a\\(b\\)\\[c\\]\\?\\+\\!\\*\\:d');
    expect(routePath('/')).toBe('/');
    // A backslash in the spec is escaped too, so it cannot escape the character after it.
    expect(routePath(String.raw`/a\(b`)).toBe(String.raw`/a\\\(b`);
  });
});

describe('stubResponse', () => {
  it('answers the first 2xx with its example, a range or default as its first code, and throws without a response', () => {
    expect(stubResponse(route([{ status: '404' }, { status: '201', content: { media: 'application/json', payload: 'p', example: { a: '<' } } }]))).toBe(
      'return { status: 201, body: {"a":"\\u003C"} };',
    );
    expect(stubResponse(route([{ status: '2XX' }]))).toBe('return { status: 200 };');
    expect(stubResponse(route([{ status: '4XX' }]))).toBe('return { status: 400 };');
    expect(stubResponse(route([{ status: 'default' }]))).toBe('return { status: 200 };');
    expect(stubResponse(route([]))).toBe('throw new Error("not implemented");');
  });
});


describe('colonPath', () => {
  it('writes each whole-segment parameter as :name, and leaves the rest as it is', () => {
    expect(colonPath('/pets/{petId}/photos/{photo-id}')).toBe('/pets/:petId/photos/:photo_id');
    expect(colonPath('/')).toBe('/');
    expect(colonPath('/a(b)+!.c')).toBe('/a(b)+!.c');
  });

  it('cannot write a parameter inside a segment, or a literal colon, star or question mark', () => {
    expect(colonPath('/files/{name}.json')).toBeUndefined();
    expect(colonPath('/v1/{name}:cancel')).toBeUndefined();
    expect(colonPath('/a/:b')).toBeUndefined();
    expect(colonPath('/a/b*')).toBeUndefined();
    expect(colonPath('/a/b?')).toBeUndefined();
    expect(colonPath('/a/{}')).toBeUndefined();
    expect(colonPath('/a/{b}}')).toBeUndefined();
    expect(colonPath('/a{b}')).toBeUndefined();
  });
});

describe('readAs and where', () => {
  it('reads a header lower-cased, a path parameter by its segment name, and a query parameter as named', () => {
    expect(readAs('header', 'X-Trace')).toBe('x-trace');
    expect(readAs('path', 'photo-id')).toBe('photo_id');
    expect(readAs('query', 'page-size')).toBe('page-size');
  });

  it('names a route by its method and path, safe inside a comment', () => {
    expect(where({ ...route([]), method: 'patch', path: '/a/*/b' })).toBe('PATCH /a/*\\/b');
  });
});

describe('operationTypes', () => {
  it('types each part read, a required body, and each response', () => {
    const [only] = routesOf(
      read({
        openapi: '3.1.0',
        paths: { '/a/{id}': { post: { operationId: 'postA', parameters: [{ name: 'id', in: 'path', example: 1 }], requestBody: { required: true, content: { 'application/json': { example: {} } } }, responses: { '201': { description: 'a' } } } } },
      }),
      'Hono',
    ).controllers[0]?.routes ?? [];
    expect(operationTypes(only as Route).join('\n')).toBe(
      [
        'type PostAOperation = paths["/a/{id}"]["post"];',
        '',
        '/** What `postA` receives: POST /a/{id}. */',
        'export interface PostAInput {',
        '  readonly path: NonNullable<PostAOperation["parameters"]["path"]>;',
        '  readonly body: NonNullable<PostAOperation["requestBody"]>["content"]["application/json"];',
        '}',
        '',
        '/** What `postA` answers: one member per response the spec declares. */',
        'export type PostAOutput =',
        '  | { readonly status: 201; readonly body?: undefined; readonly headers?: Readonly<Record<string, string>> };',
      ].join('\n'),
    );
  });
});
