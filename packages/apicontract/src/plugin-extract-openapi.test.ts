import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { example as expectedExample, readme as expectedReadme } from './__fixtures__/extract/zod-to-openapi-expected.js';
import { example, readme, User } from './__fixtures__/extract/zod-to-openapi.js';
import { type ContractFinding } from './core/model.js';
import { inline, normalise } from './extract-normalise.js';
import { checkPlugin, createHost, validate } from './host.js';
import { docsOf, extractOpenApi, namesOf, openapiPath, operationsOf, plugin, type Route, toOpenApi } from './plugin-extract-openapi.js';
import { builtins } from './plugins.js';

type Doc = Record<string, any>;

const host = createHost();
host.register(plugin);
/** What the extractor returns: the document, and its findings beside it. */
const result = async (options: Record<string, unknown>): Promise<{ document: Doc; findings: unknown[] }> =>
  (await host.extractor('openapi-from-schemas').run(options)) as { document: Doc; findings: unknown[] };
const run = async (options: Record<string, unknown>): Promise<Doc> => (await result(options)).document;

/** The grade: the paths of both documents, references resolved, in comparison form, without the operation ids zod-to-openapi was not given. */
const graded = (document: unknown): unknown => {
  const paths = (normalise(inline(document)) as Doc).paths as Doc;
  for (const item of Object.values(paths)) for (const operation of Object.values(item as Doc)) delete (operation as Doc).operationId;
  return paths;
};

const refusal = (wanted: string): string => `the module has no operation map ${wanted}. fix: name the export that holds \`{ [operationId]: { method, path, input, output } }\`, or write "*"`;

const Pet = z.object({ id: z.string(), name: z.string() });

describe('the openapi-from-schemas extractor', () => {
  it('is a built-in plugin the host accepts, whose sample is what it returns', async () => {
    expect(() => validate(plugin)).not.toThrow();
    expect(builtins).toContain(plugin);
    expect(plugin.name).toBe('extract-openapi');
    expect(plugin.extractors?.['openapi-from-schemas']?.options).toEqual({
      module: { type: 'string', description: 'the module to import, relative to the working folder; its code runs' },
      title: { type: 'string', description: 'info.title (default "API")' },
      version: { type: 'string', description: 'info.version (default "0.0.0")' },
      responseSide: { type: 'string', description: '"output" (default): responses as the schema hands them out; "input": as a client parses them' },
      export: { type: 'string', description: 'the export holding the operation map, or "*" when the module\'s own exports are the operations (default)' },
    });
    expect(await checkPlugin(plugin)).toEqual([]);
  });

  it('imports a module path whose exports are the operations', async () => {
    const path = fileURLToPath(new URL('__fixtures__/extract/operations.ts', import.meta.url));
    const { document, findings } = await result({ module: path, title: 'Pets', version: '2.0.0' });
    expect(findings).toEqual([]);
    expect(document.info).toEqual({ title: 'Pets', version: '2.0.0' });
    expect(Object.keys(document.paths)).toEqual(['/pets', '/pets/{id}']);
    expect(Object.keys(document.paths['/pets'])).toEqual(['get', 'post']);
    expect(document.paths['/pets'].post.requestBody).toEqual({ required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/NewPet' } } } });
    expect(Object.keys(document.components.schemas)).toEqual(['NewPet', 'Pet']);
    expect(document).not.toHaveProperty('x-findings');
  });

  describe("graded on zod-to-openapi's own examples (B2)", () => {
    const expected = { readme: expectedReadme, example: expectedExample };
    it.each([['readme'], ['example']] as const)('%s: the same paths, read as the client reads a response', (name) => {
      const ours = extractOpenApi({ User, readme, example }, { export: name, responseSide: 'input' }).document;
      expect(graded(ours)).toEqual(graded(expected[name]));
    });

    it.each([['readme'], ['example']] as const)("%s: as the server hands a response out, the one difference is Zod's own: an object's output has no other keys", (name) => {
      const ours = extractOpenApi({ User, readme, example }, { export: name }).document as Doc;
      const user = (ours.components as Doc).schemas.User as Doc;
      expect(user.additionalProperties).toBe(false);
      delete user.additionalProperties;
      expect(graded(ours)).toEqual(graded(expected[name]));
    });
  });
});

describe('operationsOf', () => {
  it('takes the operation-shaped exports of the module, and skips its schemas and helpers', () => {
    const { routes, findings } = operationsOf({ Pet, helper: () => 1, version: '1', nothing: null, pathOnly: { path: '/' }, getPet: { method: 'GET', path: '/pets/:id', output: Pet } }, '*');
    expect(routes.map((route) => [route.id, route.method, route.path, route.pointer])).toEqual([['getPet', 'get', '/pets/{id}', '/getPet']]);
    expect(findings).toEqual([]);
    expect(operationsOf({ a: { method: 'get', path: '/' } }, undefined).routes).toHaveLength(1);
  });

  it('reports an entry of a named map that is not an operation', () => {
    const { routes, findings } = operationsOf({ api: { 'a/b': { method: 'get' }, ok: { method: 'get', path: '/' } } }, 'api');
    expect(routes.map((route) => route.id)).toEqual(['ok']);
    expect(findings).toEqual([{ code: 'not-an-operation', pointer: '/a~1b', message: 'a/b has no method and path', fix: 'write `{ method, path, input, output }`' }]);
  });

  it('refuses an operation map the module does not have, or that is not a map', () => {
    expect(() => operationsOf({ notAMap: [1] }, 'missing')).toThrow(refusal('"missing"'));
    expect(() => operationsOf({ notAMap: [1] }, 3)).toThrow(refusal('3'));
    expect(() => operationsOf({ notAMap: [1] }, 'notAMap')).toThrow(refusal('"notAMap"'));
    expect(() => operationsOf({ notAMap: [1] }, 'toString')).toThrow(refusal('"toString"'));
  });

  it('finds the map by its own name, among others', () => {
    const { routes } = operationsOf({ first: { a: { method: 'get', path: '/a' } }, second: { b: { method: 'get', path: '/b' } } }, 'second');
    expect(routes.map((route) => route.id)).toEqual(['b']);
  });

  it('turns output and the responses map into responses, and reports one that is neither a schema nor null', () => {
    const { routes, findings } = operationsOf({ api: { a: { method: 'get', path: '/', output: Pet, responses: { 404: Pet, 204: null, 500: 'oops' } } } }, 'api');
    expect(routes[0]?.responses).toEqual([{ status: '200', schema: Pet }, { status: '204' }, { status: '404', schema: Pet }]);
    expect(findings).toEqual([{ code: 'unknown-response', pointer: '/a/responses/500', message: "a's 500 response is neither a schema nor null", fix: 'give a Standard Schema for a body, or null for none' }]);
  });

  it('gives an operation with no response a 204, and ignores responses that are not a map', () => {
    expect(operationsOf({ api: { a: { method: 'get', path: '/', responses: [Pet] } } }, 'api').routes[0]?.responses).toEqual([{ status: '204' }]);
  });
});

describe('docsOf', () => {
  it('copies summary, description, tags and deprecated when each is the right type', () => {
    expect(docsOf({ summary: 's', description: 'd', tags: ['a'], deprecated: true, other: 1 })).toEqual({ summary: 's', description: 'd', tags: ['a'], deprecated: true });
    expect(docsOf({ summary: 1, description: 1, tags: ['a', 1], deprecated: 'yes' })).toEqual({});
    expect(docsOf({ tags: 'a' })).toEqual({});
  });
});

describe('openapiPath', () => {
  it('writes :name as {name}, and leaves {name} as it is', () => {
    expect(openapiPath('/a/:id/b/:other_2')).toBe('/a/{id}/b/{other_2}');
    expect(openapiPath('/a/{id}')).toBe('/a/{id}');
    expect(openapiPath('/a/:1')).toBe('/a/:1');
  });
});

describe('namesOf', () => {
  it('names each exported schema once, by its first name in sorted order', () => {
    expect([...namesOf({ b: Pet, a: Pet, c: 1 })]).toEqual([[Pet, 'a']]);
  });
});

const route = (over: Partial<Route>): Route => ({ id: 'op', pointer: '/op', method: 'get', path: '/', responses: [{ status: '200' }], ...over });
const write = (routes: Route[], names: Map<unknown, string> = new Map(), options = {}): { document: Doc; findings: ContractFinding[] } => toOpenApi(routes, names, options) as { document: Doc; findings: ContractFinding[] };
const operation = (written: { document: Doc }, path = '/', method = 'get'): Doc => written.document.paths[path][method] as Doc;

describe('toOpenApi', () => {
  it('writes an OpenAPI 3.1 document, with a default title and version and no components when there are none', () => {
    expect(write([route({})]).document).toEqual({ openapi: '3.1.0', info: { title: 'API', version: '0.0.0' }, paths: { '/': { get: { operationId: 'op', responses: { '200': { description: 'OK' } } } } } });
    expect(write([], new Map(), { title: 1, version: 2 }).document.info).toEqual({ title: 'API', version: '0.0.0' });
  });

  it('describes a status Node does not know as a Response', () => {
    expect(operation(write([route({ responses: [{ status: '599' }] })])).responses).toEqual({ '599': { description: 'Response' } });
  });

  it('copies the docs onto the operation', () => {
    expect(operation(write([route({ docs: { summary: 'S' } })])).summary).toBe('S');
  });

  it('splits the input of a GET into path and query parameters, required as the schema says', () => {
    const input = z.object({ id: z.string(), limit: z.number().optional(), q: z.string() });
    expect(operation(write([route({ path: '/pets/{id}', input })]), '/pets/{id}').parameters).toEqual([
      { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
      { name: 'limit', in: 'query', required: false, schema: { type: 'number' } },
      { name: 'q', in: 'query', required: true, schema: { type: 'string' } },
    ]);
  });

  it('takes the input of a POST as the body, by name when the module exports it', () => {
    const written = write([route({ method: 'post', input: Pet })], new Map([[Pet, 'Pet']]));
    expect(operation(written, '/', 'post').requestBody).toEqual({ required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } } });
    expect(operation(written, '/', 'post')).not.toHaveProperty('parameters');
    expect(written.document.components.schemas.Pet).toMatchObject({ type: 'object', required: ['id', 'name'] });
  });

  it('takes the path parameters out of the input of a PUT, and the rest is the body', () => {
    const op = operation(write([route({ method: 'put', path: '/pets/{id}', input: Pet })]), '/pets/{id}', 'put');
    expect(op.parameters).toEqual([{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }]);
    expect(op.requestBody.content['application/json'].schema).toEqual({ type: 'object', properties: { name: { type: 'string' } }, required: ['name'] });
  });

  it('leaves required out of a body whose required properties were all in the path, or that had none', () => {
    const only = operation(write([route({ method: 'patch', path: '/{id}', input: z.object({ id: z.string() }) })]), '/{id}', 'patch');
    expect(only.requestBody.content['application/json'].schema).toEqual({ type: 'object', properties: {} });
    const loose = operation(write([route({ method: 'patch', path: '/{id}', input: z.object({ id: z.string().optional(), a: z.string().optional() }) })]), '/{id}', 'patch');
    expect(loose.parameters).toEqual([{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }]);
    expect(loose.requestBody.content['application/json'].schema).toEqual({ type: 'object', properties: { a: { type: 'string' } } });
  });

  it('reads params, query and headers as parameters, and a path parameter no schema names as a string', () => {
    const op = operation(
      write([route({ path: '/{a}/{b}', params: z.object({ a: z.number() }), query: z.object({ q: z.string() }), headers: z.object({ 'x-key': z.string().optional() }) })]),
      '/{a}/{b}',
    );
    expect(op.parameters).toEqual([
      { name: 'a', in: 'path', required: true, schema: { type: 'number' } },
      { name: 'q', in: 'query', required: true, schema: { type: 'string' } },
      { name: 'x-key', in: 'header', required: false, schema: { type: 'string' } },
      { name: 'b', in: 'path', required: true, schema: { type: 'string' } },
    ]);
  });

  it('takes body over the input, and writes the content types it is given', () => {
    const op = operation(write([route({ method: 'post', input: Pet, body: z.string(), contentType: 'text/plain', responses: [{ status: '201', schema: z.string(), contentType: 'text/csv' }] })]), '/', 'post');
    expect(op.requestBody).toEqual({ required: true, content: { 'text/plain': { schema: { type: 'string' } } } });
    expect(op.responses).toEqual({ '201': { description: 'Created', content: { 'text/csv': { schema: { type: 'string' } } } } });
  });

  it('writes a response by the side asked for', () => {
    const length = z.string().transform((text) => text.length);
    const asOutput = write([route({ responses: [{ status: '200', schema: length }] })]);
    expect(operation(asOutput).responses['200']).toEqual({ description: 'OK' });
    expect(asOutput.findings.map((found) => `${found.code} ${found.pointer}`)).toEqual(['not-representable /op/responses/200']);
    const asInput = write([route({ responses: [{ status: '200', schema: length }] })], new Map(), { responseSide: 'input' });
    expect(operation(asInput).responses['200'].content['application/json'].schema).toEqual({ type: 'string' });
    expect(() => write([], new Map(), { responseSide: 'both' })).toThrow('fix: write "input" or "output"');
  });

  it('writes an exported schema once, and keeps a side that differs beside it', () => {
    const written = write([route({ method: 'post', input: Pet, responses: [{ status: '200', schema: Pet }] }), route({ id: 'op2', path: '/2', responses: [{ status: '200', schema: Pet }] })], new Map([[Pet, 'Pet']]));
    expect(Object.keys(written.document.components.schemas)).toEqual(['Pet', 'Pet.output']);
    expect(written.document.components.schemas['Pet.output'].additionalProperties).toBe(false);
    expect(operation(written, '/', 'post').responses['200'].content['application/json'].schema).toEqual({ $ref: '#/components/schemas/Pet.output' });
    expect(operation(written, '/2').responses['200'].content['application/json'].schema).toEqual({ $ref: '#/components/schemas/Pet.output' });
    const same = write([route({ method: 'post', input: Pet, responses: [{ status: '200', schema: Pet }] })], new Map([[Pet, 'Pet']]), { responseSide: 'input' });
    expect(Object.keys(same.document.components.schemas)).toEqual(['Pet']);
  });

  it('keeps an unnamed recursive schema in the components, under the route, so it can refer to itself', () => {
    const Tree = z.object({ label: z.string(), get kids() { return z.array(Tree); } });
    const written = write([route({ responses: [{ status: '200', schema: Tree }] })]);
    expect(operation(written).responses['200'].content['application/json'].schema).toEqual({ $ref: '#/components/schemas/op.200' });
    expect(written.document.components.schemas['op.200']).toMatchObject({ properties: { kids: { items: { $ref: '#/components/schemas/op.200' } } } });
  });

  it('names an unnamed recursive input, body or query after the route, so it can refer to itself', () => {
    const Tree = z.object({ label: z.string(), get kids() { return z.array(Tree); } });
    const written = write([route({ method: 'post', input: Tree }), route({ id: 'b', path: '/b', method: 'post', body: Tree, query: Tree })]);
    expect(Object.keys(written.document.components.schemas)).toEqual(['b.body', 'b.query', 'op.input']);
    expect(operation(written, '/', 'post').requestBody.content['application/json'].schema).toEqual({ $ref: '#/components/schemas/op.input' });
    expect(operation(written, '/b', 'post').requestBody.content['application/json'].schema).toEqual({ $ref: '#/components/schemas/b.body' });
    expect(operation(written, '/b', 'post').parameters[1].schema).toEqual({ type: 'array', items: { $ref: '#/components/schemas/b.query' } });
  });

  it('writes an exported recursive schema once when both sides write it alike', () => {
    const Tree = z.object({ label: z.string(), get kids() { return z.array(Tree); } });
    const written = write([route({ method: 'post', input: Tree, responses: [{ status: '200', schema: Tree }] })], new Map([[Tree, 'Tree']]), { responseSide: 'input' });
    expect(Object.keys(written.document.components.schemas)).toEqual(['Tree']);
  });

  it('adds a path parameter by name even when a query parameter has that name', () => {
    const op = operation(write([route({ path: '/{q}', query: z.object({ q: z.string() }) })]), '/{q}');
    expect(op.parameters).toEqual([
      { name: 'q', in: 'query', required: true, schema: { type: 'string' } },
      { name: 'q', in: 'path', required: true, schema: { type: 'string' } },
    ]);
  });

  it('reports parameters that are not an object schema, or not a schema, and writes the rest', () => {
    const written = write([route({ path: '/{id}', input: z.string(), query: { not: 'a schema' }, params: z.object({ id: z.string() }) })]);
    expect(operation(written, '/{id}').parameters).toEqual([{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }]);
    expect(written.findings.map((found) => `${found.code} ${found.pointer}`)).toEqual(['not-an-object /op/input', 'not-a-standard-schema /op/query']);
    expect(written.findings[0]?.message).toBe('/op/input is not an object schema, so it cannot be split into parameters');
    expect(written.findings[0]?.fix).toBe('describe the parameters with an object schema, one property each');
  });

  it('reports an input of a GET that is not a schema, and a body that is not one', () => {
    const written = write([route({ input: 'x' }), route({ id: 'b', pointer: '/b', method: 'post', body: 'y' })]);
    expect(written.findings.map((found) => found.pointer)).toEqual(['/b/body', '/op/input']);
    expect(operation(written, '/', 'post')).not.toHaveProperty('requestBody');
  });

  it('reports a method OpenAPI does not have, and a second route on one path and method', () => {
    const written = write([route({ id: 'b' }), route({ id: 'a' }), route({ id: 'c', method: 'fetch' })]);
    expect(operation(written).operationId).toBe('a');
    expect(written.findings).toEqual([
      { code: 'duplicate-route', pointer: '/op', message: 'b is GET / again; the first is kept', fix: 'give each operation a path and method of its own' },
      { code: 'unknown-method', pointer: '/op', message: 'c has the method "fetch", which OpenAPI does not have', fix: 'use one of get, put, post, delete, options, head, patch, trace' },
    ]);
  });

  it('orders paths, methods, and components', () => {
    const written = write([route({ id: 'z', path: '/b' }), route({ id: 'y', path: '/a', method: 'post' }), route({ id: 'x', path: '/a', method: 'get' })]);
    expect(Object.keys(written.document.paths)).toEqual(['/a', '/b']);
    expect(Object.keys(written.document.paths['/a'])).toEqual(['get', 'post']);
  });
});

describe('extractOpenApi', () => {
  it('returns the findings of the map and of the writer beside the document, the map first', () => {
    const { document, findings } = extractOpenApi({ api: { a: { method: 'get', path: '/', responses: { 500: 1 }, input: 'x' } } }, { export: 'api' });
    expect(findings.map((found) => found.code)).toEqual(['unknown-response', 'not-a-standard-schema']);
    expect(document).not.toHaveProperty('x-findings');
  });
});
