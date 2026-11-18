import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { blog, Post } from './__fixtures__/extract/ts-rest-contract.js';
import { checkPlugin, createHost, validate } from './host.js';
import { contractOf, plugin, routesOf } from './plugin-extract-ts-rest.js';
import { builtins } from './plugins.js';

type Doc = Record<string, any>;

const host = createHost();
host.register(plugin);
const run = async (options: Record<string, unknown>): Promise<Doc> => (await host.extractor('ts-rest').run(options)) as Doc;
const FIXTURE = fileURLToPath(new URL('__fixtures__/extract/ts-rest-contract.ts', import.meta.url));

describe('the ts-rest extractor', () => {
  it('is a built-in plugin the host accepts, whose sample is what it returns', async () => {
    expect(() => validate(plugin)).not.toThrow();
    expect(builtins).toContain(plugin);
    expect(plugin.name).toBe('extract-ts-rest');
    expect(await checkPlugin(plugin)).toEqual([]);
  });

  it("reads ts-rest's README contract, and says its c.type<T>() response has no schema", async () => {
    const document = await run({ module: FIXTURE, export: 'readme' });
    expect(document.paths['/posts'].get).toEqual({
      operationId: 'getPosts',
      parameters: [
        { name: 'skip', in: 'query', required: true, schema: { type: 'number' } },
        { name: 'take', in: 'query', required: true, schema: { type: 'number' } },
        { name: 'x-pagination-page', in: 'header', required: false, schema: { type: 'number' } },
      ],
      responses: { '200': { description: 'OK' } },
    });
    expect(document['x-findings']).toEqual([
      {
        code: 'type-only',
        pointer: '/getPosts/responses/200',
        message: 'the 200 response is `c.type<T>()`, which has no schema at run time, so OpenAPI gets no schema for it',
        fix: 'give it a Standard Schema (a Zod 4 schema, for one) in place of `c.type<T>()`',
      },
    ]);
  });

  it('reads a nested router: ids by key path, :params, c.noBody(), other media types, exported schemas by name', async () => {
    const document = await run({ module: { blog, Post }, export: 'blog' });
    expect(document).not.toHaveProperty('x-findings');
    expect(Object.keys(document.paths)).toEqual(['/files', '/posts', '/posts/{id}']);
    const posts = document.paths['/posts/{id}'];
    expect(posts.get.operationId).toBe('posts.getPost');
    expect(posts.get.summary).toBe('Get a post by id');
    expect(posts.get.parameters[0]).toMatchObject({ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } });
    expect(posts.get.responses).toEqual({ '200': { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/Post' } } } }, '404': { description: 'Not Found' } });
    expect(posts.delete).toEqual({ operationId: 'posts.deletePost', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '204': { description: 'No Content' } } });
    const upload = document.paths['/files'].post;
    expect(Object.keys(upload.requestBody.content)).toEqual(['multipart/form-data']);
    expect(upload.responses['200'].content).toEqual({ 'text/plain': { schema: { type: 'string' } } });
    expect(Object.keys(document.components.schemas)).toEqual(['Post']);
  });

  it("reads the module's own exports as the router by default", async () => {
    const document = await run({ module: { getPost: blog.posts.getPost, Post: Post } });
    expect(document.paths['/posts/{id}'].get.operationId).toBe('getPost');
    expect((await run({ module: { getPost: blog.posts.getPost }, export: '*' })).paths).toHaveProperty('/posts/{id}');
  });

  it('reports a body or a response that is not a schema, c.noBody() nor c.type<T>()', async () => {
    const document = await run({
      module: { r: { method: 'POST', path: '/', body: 'text', responses: { 200: { contentType: 'text/plain', body: Symbol('ContractPlainType') }, 500: 3 } } },
    });
    expect(document['x-findings']).toEqual([
      { code: 'type-only', pointer: '/r/responses/200/body', message: 'the 200 response is `c.type<T>()`, which has no schema at run time, so OpenAPI gets no schema for it', fix: 'give it a Standard Schema (a Zod 4 schema, for one) in place of `c.type<T>()`' },
      { code: 'unknown-body', pointer: '/r/responses/500', message: 'the 500 response is neither a schema, `c.noBody()` nor `c.type<T>()`', fix: 'give a Standard Schema, or `c.noBody()`' },
      { code: 'unknown-body', pointer: '/r/body', message: "r's body is neither a schema, `c.noBody()` nor `c.type<T>()`", fix: 'give a Standard Schema, or `c.noBody()`' },
    ]);
    expect(document.paths['/'].post.responses).toEqual({ '200': { description: 'OK' }, '500': { description: 'Internal Server Error' } });
  });

  it('gives a route without responses a 204, and ignores responses that are not a map', async () => {
    expect((await run({ module: { r: { method: 'GET', path: '/', responses: [1] } } })).paths['/'].get.responses).toEqual({ '204': { description: 'No Content' } });
  });

  it('refuses a contract the module does not have', async () => {
    await expect(run({ module: { a: 1 }, export: 'a' })).rejects.toThrow('the module has no ts-rest contract "a". fix: name the export that `c.router(…)` made, or write "*"');
    await expect(run({ module: {}, export: 'toString' })).rejects.toThrow('no ts-rest contract "toString"');
    await expect(run({ module: {}, export: 3 })).rejects.toThrow('no ts-rest contract 3');
  });
});

describe('routesOf', () => {
  it('walks object literals only: not schemas, class instances, arrays or scalars', () => {
    class Box {
      readonly method = 'GET';
      readonly path = '/box';
    }
    const router = { schema: z.object({ method: z.string(), path: z.string() }), box: new Box(), list: [{ method: 'GET', path: '/l' }], n: 1, bare: Object.assign(Object.create(null) as object, { method: 'GET', path: '/bare' }) };
    expect(routesOf(router).routes.map((route) => route.id)).toEqual(['bare']);
  });

  it('escapes keys in the pointer, joins them with . in the id, and lowercases the method', () => {
    const [route] = routesOf({ 'a/b': { c: { method: 'PATCH', path: '/x/:id' } } }).routes;
    expect(route).toMatchObject({ id: 'a/b.c', pointer: '/a~1b/c', method: 'patch', path: '/x/{id}' });
  });

  it('is not a route without a string method and path', () => {
    expect(routesOf({ a: { method: 'GET' }, b: { path: '/' }, c: { method: 1, path: '/' } }).routes).toEqual([]);
  });
});

describe('contractOf', () => {
  it('is the module for * or nothing, and the export named otherwise', () => {
    const namespace = { c: { r: 1 } };
    expect(contractOf(namespace, undefined)).toBe(namespace);
    expect(contractOf(namespace, '*')).toBe(namespace);
    expect(contractOf(namespace, 'c')).toBe(namespace.c);
  });
});
