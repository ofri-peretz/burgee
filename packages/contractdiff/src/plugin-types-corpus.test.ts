import { execFile } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { beforeAll, describe, expect, it } from 'vitest';

import { scratchDirs } from './__fixtures__/run/scratch-dir.js';
import { createHost } from './host.js';
import { builtinAdapters } from './inputs.js';
import { plugin } from './plugin-types.js';

/**
 * The shapes behind the 50 documents of the 2026-11-18 full corpus (4,265 OpenAPI documents) that the
 * types target generated but tsc rejected, or refused without a fix. Each document below is the
 * smallest one that shape needs, and `types.ts` must type-check under strict on every TypeScript line
 * the repository holds.
 */

const ROOT = join(import.meta.dirname, '../../..');
const scratch = scratchDirs();

const COMPILERS = [
  ['5.9', 'typescript-5.9'],
  ['6.0', 'typescript'],
  ['7.0', 'typescript-7.0'],
] as const;

const object = (properties: Record<string, unknown>, extra: Record<string, unknown> = {}): Record<string, unknown> => ({ type: 'object', properties, ...extra });
const openapi = (schemas: Record<string, unknown>, rest: Record<string, unknown> = {}): Record<string, unknown> => ({
  openapi: '3.0.3',
  info: { title: 't', version: '1' },
  paths: {},
  ...rest,
  components: { ...(rest.components as object | undefined), schemas },
});

/** Each shape, named for the corpus document it came from. */
export const SHAPES: Readonly<Record<string, unknown>> = {
  // Azure: a reference into another schema's `allOf`.
  allOfMember: openapi({
    A: { allOf: [object({ a: { type: 'string' } })] },
    B: object({ x: { $ref: '#/components/schemas/A/allOf/0' } }),
  }),
  // Azure: a reference through two properties, the first optional.
  twoProperties: openapi({
    A: object({ p: object({ q: { type: 'string' } }) }),
    B: object({ y: { $ref: '#/components/schemas/A/properties/p/properties/q' } }),
  }),
  // codat: a reference into a schema's own `definitions`.
  nestedDefinitions: openapi({
    A: { type: 'object', allOf: [object({ a: { type: 'string' } })], definitions: { D: { type: 'string' } } },
    B: object({ z: { $ref: '#/components/schemas/A/definitions/D' } }),
  }),
  // codat: a reference to a parameter's schema, where the parameter prints as its value's type.
  parameterSchema: openapi(
    { B: object({ id: { $ref: '#/components/parameters/Id/schema' } }) },
    { components: { parameters: { Id: { name: 'id', in: 'query', schema: { type: 'string' } } } } },
  ),
  // digitalocean, opensuse: a reference into an optional request body.
  requestBody: openapi(
    { B: object({ body: { $ref: '#/paths/~1a/post/requestBody/content/application~1json/schema' } }) },
    { paths: { '/a': { post: { requestBody: { content: { 'application/json': { schema: object({ k: { type: 'string' } }) } } }, responses: { '204': { description: 'ok' } } } } } },
  ),
  // digitalocean, enode: a parameter reused from another operation, in a group with nothing required.
  optionalQuery: {
    openapi: '3.0.3',
    info: { title: 't', version: '1' },
    paths: {
      '/a': { get: { parameters: [{ name: 'per_page', in: 'query', schema: { type: 'integer' } }], responses: { '204': { description: 'ok' } } } },
      '/b': { get: { parameters: [{ $ref: '#/paths/~1a/get/parameters/0' }], responses: { '204': { description: 'ok' } } } },
    },
  },
  // apple sirikit: a child that lists the discriminator property its parent declares.
  discriminatorListed: openapi({
    Parent: object({ class: { type: 'string' } }, { required: ['class'], discriminator: { propertyName: 'class' } }),
    Child: { allOf: [{ $ref: '#/components/schemas/Parent' }], type: 'object', properties: { class: { type: 'string', enum: ['Child'] } } },
  }),
  // plaid: `allOf` requiring keys of a nullable schema.
  nullableRequired: openapi({
    Error: object({ code: { type: 'string' } }, { nullable: true }),
    Wrapped: { allOf: [{ $ref: '#/components/schemas/Error' }], required: ['code'] },
  }),
  // vercel: `type: null` beside a `oneOf` whose array variant names the schema itself.
  nullSelfReference: openapi({
    Value: { type: 'null', oneOf: [{ type: 'string' }, { type: 'array', items: { $ref: '#/components/schemas/Value' } }] },
  }),
  // bethmardutho: a Swagger 2.0 reference into a response's schema, which 3.x keeps under `content`.
  swagger2ResponseSchema: {
    swagger: '2.0',
    info: { title: 't', version: '1' },
    produces: ['application/json'],
    paths: {
      '/word/{id}': {
        get: {
          parameters: [{ name: 'id', in: 'path', required: true, type: 'string' }],
          responses: { '200': { description: 'ok', schema: object({ person: { type: 'string' } }) } },
        },
      },
      '/lexeme': {
        get: { responses: { '200': { description: 'ok', schema: object({ who: { $ref: '#/paths/~1word~1%7Bid%7D/get/responses/200/schema/properties/person' } }) } } },
      },
    },
  },
};

const tsc = async (dir: string, cwd: string): Promise<string> => {
  try {
    await promisify(execFile)(process.execPath, [join(ROOT, 'node_modules', dir, 'bin', 'tsc'), '-p', cwd], { cwd, encoding: 'utf8' });
    return '';
  } catch (error) {
    return String((error as { stdout?: unknown }).stdout);
  }
};

describe('types from the corpus shapes that failed', () => {
  let dir = '';
  const written = new Map<string, string>();

  beforeAll(async () => {
    dir = scratch('apicontract-types-corpus-');
    const host = createHost();
    host.register({ name: 'contractdiff', adapters: builtinAdapters });
    host.register(plugin);
    const results = await Promise.all(Object.entries(SHAPES).map(async ([name, document]) => [name, (await host.run('types', document)).files[0]?.content ?? ''] as const));
    for (const [name, content] of results) {
      written.set(name, content);
      writeFileSync(join(dir, `${name}.ts`), content);
    }
    const compilerOptions = { strict: true, noEmit: true, target: 'esnext', module: 'esnext', moduleResolution: 'bundler', skipLibCheck: true, types: [] };
    writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({ compilerOptions, files: Object.keys(SHAPES).map((name) => `${name}.ts`) }));
  });

  it.each(COMPILERS)('type-checks under TypeScript %s', { timeout: 120_000 }, async (_, compiler) => {
    expect(await tsc(compiler, dir)).toBe('');
  });

  it('names a reference it cannot index once, as an alias at the end of the file', () => {
    expect(written.get('allOfMember')).toContain('x?: Ref_components_schemas_A_allOf_0;');
    expect(written.get('allOfMember')).toContain('export type Ref_components_schemas_A_allOf_0 = {');
    expect(written.get('nullSelfReference')).toContain('Ref_components_schemas_Value[]');
  });

  it('keeps the indexed access upstream writes where tsc accepts it', () => {
    expect(written.get('nullableRequired')).toContain('WithRequired<NonNullable<components["schemas"]["Error"]>, "code">');
    expect(written.get('optionalQuery')).toContain('per_page?: NonNullable<paths["/a"]["get"]["parameters"]["query"]>["per_page"];');
  });
});
