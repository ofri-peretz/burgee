/**
 * zod-to-openapi's own documented examples, written as an operation map (B2). Each is graded by
 * `plugin-extract-openapi.test.ts` against the document zod-to-openapi says it produces.
 *
 * Source: https://github.com/asteasolutions/zod-to-openapi at 9af9229bddce110b9f21a7658b9bc799fba78f3f
 * - `readme`: README.md, "Purpose and quick example"
 * - `example`: example/index.ts, whose output is example/openapi-docs.yml
 *
 * `.openapi({ example })` is zod-to-openapi's extension; plain Zod 4 writes the same keyword through
 * `.meta({ example })`. `.openapi('User')` names a component; here the export's name does.
 */
// eslint-disable-next-line import-next/no-extraneous-dependencies -- a test fixture: Zod is read by the extractor, never shipped
import { z } from 'zod';

export const User = z.object({
  id: z.string().meta({ example: '1212121' }),
  name: z.string().meta({ example: 'John Doe' }),
  age: z.number().meta({ example: 42 }),
});

/** README.md: `registry.registerPath({ method: 'get', path: '/users/{id}', summary, request: { params }, responses: { 200 } })`. */
export const readme = {
  getUser: { method: 'get', path: '/users/{id}', summary: 'Get a single user', params: z.object({ id: z.string() }), output: User },
};

/** example/index.ts: the same route with a registered `UserId` parameter, a description and a 204. */
export const example = {
  getUser: {
    method: 'get',
    path: '/users/{id}',
    description: 'Get user data by its id',
    summary: 'Get a single user',
    params: z.object({ id: z.string().meta({ example: '1212121' }) }),
    responses: { 200: User, 204: null },
  },
};
