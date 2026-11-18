/**
 * ts-rest contracts in the shape `c.router(…)` hands back, written as plain data so ts-rest is not
 * installed (it is archived). `c.type<T>()` and `c.noBody()` are the symbols ts-rest makes at run
 * time (libs/ts-rest/core/src/lib/dsl.ts).
 *
 * `readme`: https://github.com/ts-rest/ts-rest/blob/3d572e3336bd998b0c33a9d65b12292b158d0aec/README.md
 * (the contract example), as `c.router` returns it. `blog`: a nested router with the other forms.
 */
// eslint-disable-next-line import-next/no-extraneous-dependencies -- a test fixture: Zod is read by the extractor, never shipped
import { z } from 'zod';

/** What `c.type<T>()` returns at run time. */
const plainType = Symbol('ContractPlainType');
/** What `c.noBody()` returns. */
const noBody = Symbol('ContractNoBody');

export const readme = {
  getPosts: {
    method: 'GET',
    path: '/posts',
    query: z.object({ skip: z.number(), take: z.number() }),
    responses: { 200: plainType },
    headers: z.object({ 'x-pagination-page': z.coerce.number().optional() }),
  },
};

export const Post = z.object({ id: z.string(), title: z.string(), body: z.string() });

export const blog = {
  posts: {
    createPost: { method: 'POST', path: '/posts', body: z.object({ title: z.string(), body: z.string() }), responses: { 201: Post }, summary: 'Create a post' },
    getPost: { method: 'GET', path: '/posts/:id', pathParams: z.object({ id: z.string().uuid() }), responses: { 200: Post, 404: noBody }, summary: 'Get a post by id' },
    deletePost: { method: 'DELETE', path: '/posts/:id', body: noBody, responses: { 204: noBody } },
  },
  files: {
    upload: { method: 'POST', path: '/files', contentType: 'multipart/form-data', body: z.object({ name: z.string() }), responses: { 200: { contentType: 'text/plain', body: z.string() } } },
  },
};
