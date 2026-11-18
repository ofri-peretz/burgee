import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse as parseYaml } from 'seniority/yaml';
import { describe, expect, it } from 'vitest';

import { scratchDirs } from './__fixtures__/run/scratch-dir.js';
import { bundle } from './gen-ts-bundle.js';
import { COMMENT_HEADER, generate, GenerateError } from './gen-ts-index.js';

const fixture = (path: string): string => fileURLToPath(new URL(`__fixtures__/types/${path}`, import.meta.url));
const read = (path: string): unknown => {
  const text = readFileSync(fixture(path), 'utf8');
  return path.endsWith('.json') ? JSON.parse(text) : parseYaml(text);
};
const bundled = (path: string): Record<string, unknown> => bundle(read(path), fixture(path)) as Record<string, unknown>;

const refusal = (attempt: () => unknown): string => {
  try {
    attempt();
  } catch (error) {
    expect(error).toBeInstanceOf(GenerateError);
    return (error as Error).message;
  }
  throw new Error('expected a refusal');
};

const scratch = scratchDirs();

/** A document whose one schema is `ref`. */
const document = (ref: string): unknown => ({ openapi: '3.1.0', components: { schemas: { A: { $ref: ref } } } });

describe('bundle', () => {
  it('returns a document that names no other file as given', () => {
    const document = { openapi: '3.1.0', components: { schemas: { A: { $ref: '#/components/schemas/B' }, B: { type: 'string', default: null } } } };
    expect(bundle(document, '/nowhere/openapi.yaml')).toBe(document);
    const data = { openapi: '3.1.0', components: { schemas: { B: { example: { $ref: './data.yaml' } } } } };
    expect(bundle(data, '/nowhere/openapi.yaml')).toEqual(data);
    expect(bundle('openapi: 3.1.0', '/nowhere/openapi.yaml')).toBe('openapi: 3.1.0');
    expect(bundle(null, '/nowhere/openapi.yaml')).toBeNull();
    expect(bundle({ 'x-files': { $ref: './data.yaml' } }, '/nowhere/openapi.yaml')).toEqual({ 'x-files': { $ref: './data.yaml' } });
  });

  it('types a document split over five files byte for byte as openapi-typescript 7.13.0 does', () => {
    const want = readFileSync(fixture('external/openapi-typescript.7.13.0.txt'), 'utf8');
    expect(COMMENT_HEADER + generate(bundled('external/openapi.yaml'))).toBe(want);
  });

  it('hoists what the files name into components, after the document\'s own, and writes a path item in place', () => {
    const document = read('external/openapi.yaml');
    const before = structuredClone(document);
    const out = bundle(document, fixture('external/openapi.yaml')) as { paths: Record<string, unknown>; components: Record<string, Record<string, unknown>> };
    expect(document).toEqual(before);
    expect(Object.keys(out.components.schemas ?? {})).toEqual(['Local', 'Pet', 'Frontend', 'schemas-Local', 'components-schemas-Local', 'LoadBalancer']);
    expect(out.components.schemas?.Pet).toEqual({ type: 'object', properties: { id: { type: 'integer' } } });
    expect(out.components.parameters).toEqual({ Name: { name: 'name', in: 'path', required: true, schema: { type: 'string' } } });
    expect(out.components.responses?.error).toMatchObject({ description: 'An error' });
    expect(out.paths['/health']).toEqual({ get: { operationId: 'health', responses: { '204': { description: 'Healthy' } } } });
    expect(out.paths['/load-balancers/{name}']).toMatchObject({ parameters: [{ $ref: '#/components/parameters/Name' }] });
  });

  it('names a member by more of its pointer, then by its file, then by a number, when the name is taken', () => {
    const out = bundled('naming/openapi.yaml') as { components: { schemas: Record<string, { $ref?: string }> } };
    const { schemas } = out.components;
    expect(Object.fromEntries(['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'].map((name) => [name, schemas[name]?.$ref]))).toEqual({
      one: '#/components/schemas/part_components-schemas-Part-2',
      two: '#/components/schemas/part-2',
      three: '#/components/schemas/Same',
      four: '#/components/schemas/Same',
      five: '#/components/schemas/Twin',
      six: '#/components/schemas/Twin-2',
      seven: '#/components/schemas/Equal',
      eight: '#/components/schemas/a~1b',
      nine: '#/components/schemas/part-3',
    });
    expect(Object.keys(schemas).slice(14)).toEqual(['part_components-schemas-Part-2', 'part-2', 'Same', 'Twin', 'Twin-2', 'Equal', 'a/b', 'part-3']);
    expect(schemas.Twin).toEqual({ type: 'object', properties: { a: { type: 'string' } } });
    expect(schemas['Twin-2']).toEqual({ type: 'object', properties: { b: { type: 'string' } } });
  });

  it('reuses a member of the document with the same content', () => {
    const root = scratch('apicontract-bundle-');
    writeFileSync(join(root, 'part.yaml'), 'Id:\n  type: string\nOther:\n  type: number\nt~e:\n  type: boolean\n');
    const document = {
      openapi: '3.1.0',
      components: {
        schemas: {
          Id: { type: 'string' },
          Other: { type: 'string' },
          A: { $ref: './part.yaml#/Id' },
          B: { $ref: './part.yaml#/Other' },
          C: { $ref: '#/components/schemas/Other' },
          D: { $ref: './part.yaml#/t~0e', description: 'kept' },
        },
      },
    };
    const out = bundle(document, join(root, 'openapi.yaml')) as { components: { schemas: Record<string, unknown> } };
    expect(out.components.schemas).toEqual({
      Id: { type: 'string' },
      Other: { type: 'string' },
      A: { $ref: '#/components/schemas/Id' },
      B: { $ref: '#/components/schemas/part_Other' },
      C: { $ref: '#/components/schemas/Other' },
      D: { $ref: '#/components/schemas/t~0e', description: 'kept' },
      part_Other: { type: 'number' },
      't~e': { type: 'boolean' },
    });
  });

  it('hoists a Swagger 2.0 document\'s definitions and parameters to its root, references that circle included', () => {
    const out = bundled('swagger2/network.json') as Record<string, Record<string, unknown>>;
    expect(out.components).toBeUndefined();
    expect(Object.keys(out.definitions ?? {})).toEqual(['LoadBalancerListResult', 'FrontendIPConfiguration', 'LoadBalancer', 'CloudError']);
    expect(out.definitions?.FrontendIPConfiguration).toEqual({
      type: 'object',
      required: ['privateIPAddress'],
      properties: { privateIPAddress: { type: 'string' }, loadBalancer: { $ref: '#/definitions/LoadBalancer' } },
    });
    expect(out.definitions?.LoadBalancer).toEqual({
      type: 'object',
      properties: { name: { type: 'string' }, frontendIPConfigurations: { type: 'array', items: { $ref: '#/definitions/FrontendIPConfiguration' } } },
    });
    expect(out.parameters).toEqual({ ApiVersionParameter: { name: 'api-version', in: 'query', required: true, type: 'string' } });
    expect(JSON.stringify(out)).not.toContain('.json#');
  });

  it('gives OpenAPI 3 a Components Object when it has none', () => {
    const root = scratch('apicontract-bundle-');
    writeFileSync(join(root, 'part.json'), '{"type":"string"}');
    const document = { openapi: '3.1.0', paths: { '/a': { get: { responses: { '200': { description: 'A', content: { 'text/plain': { schema: { $ref: 'part.json' } } } } } } } } };
    expect((bundle(document, join(root, 'openapi.yaml')) as { components: unknown }).components).toEqual({ schemas: { part: { type: 'string' } } });
  });

  it.each([
    ['a sibling that is not there', 'refusals/network.json', "Can't resolve $ref at #/definitions/LoadBalancerListResult/properties/value/items: `./loadBalancer.json#/definitions/LoadBalancer` names loadBalancer.json, which does not exist. fix: add loadBalancer.json next to network.json, or replace the `$ref` with what it names"],
    ['a pointer that leads nowhere', 'refusals/nowhere.yaml', "Can't resolve $ref at #/components/schemas/Thing: `./part.yaml#/components/nothing/Absent` leads nowhere in part.yaml. fix: point the `$ref` at a member part.yaml has"],
    ['a remote address', 'refusals/remote.yaml', "Can't resolve $ref at #/components/schemas/Thing: `https://example.com/schemas.yaml#/Thing` is a remote address, and this package does not fetch. fix: download it next to remote.yaml and point the `$ref` at the copy"],
    ['a path item that contains itself', 'refusals/loop.yaml', "Can't bundle $ref at loop-path.yaml#/post/callbacks/onEvent/{$request.body#~1url}: `./loop-path.yaml` contains itself, and is written in place. fix: move the part that repeats into a schema, which is hoisted and named"],
  ])('refuses %s, naming it', (_, path, message) => {
    expect(refusal(() => bundled(path))).toBe(message);
  });

  it('follows a pointer through objects only, and refuses one through text or null', () => {
    const root = scratch('apicontract-bundle-');
    writeFileSync(join(root, 'part.yaml'), 'Text: abc\nNothing: null\n');
    const refused = (pointer: string): string => refusal(() => bundle({ openapi: '3.1.0', components: { schemas: { A: { $ref: `./part.yaml#${pointer}` } } } }, join(root, 'openapi.yaml')));
    expect(refused('/Text/0')).toContain('leads nowhere in part.yaml');
    expect(refused('/Nothing/x')).toContain('leads nowhere in part.yaml');
  });

  it('refuses a remote address of any scheme, and reads a colon further in as part of a name', () => {
    const root = scratch('apicontract-bundle-');
    writeFileSync(join(root, 'part.yaml'), 'a:b:\n  type: string\n');
    expect(refusal(() => bundle(document('s3://bucket/part.yaml'), join(root, 'openapi.yaml')))).toContain('is a remote address');
    expect(bundle(document('./part.yaml#/a:b'), join(root, 'openapi.yaml'))).toEqual({
      openapi: '3.1.0',
      components: { schemas: { A: { $ref: '#/components/schemas/a:b' }, 'a:b': { type: 'string' } } },
    });
  });

  it('reads a reference back into the document from the document it was given, not from the disk', () => {
    const document = read('external/openapi.yaml') as { components: { schemas: { Local: Record<string, unknown> } } };
    document.components.schemas.Local.description = 'in memory';
    const out = bundle(document, fixture('external/openapi.yaml')) as { components: { schemas: Record<string, { description?: string }> } };
    expect(out.components.schemas['components-schemas-Local']?.description).toBe('in memory');
  });

  it('replaces a member that refers to the same target, and only that one', () => {
    const root = scratch('apicontract-bundle-');
    writeFileSync(join(root, 'part.yaml'), 'A:\n  type: string\nOther:\n  type: number\n');
    writeFileSync(join(root, 'other.yaml'), 'A:\n  type: boolean\n');
    const document = {
      openapi: '3.1.0',
      components: { schemas: { A: { $ref: './other.yaml#/A' }, Other: { $ref: './part.yaml#/A' }, C: { $ref: './part.yaml#/Other' } } },
    };
    // `Other` names part.yaml#/A, not other.yaml#/A; `C` names part.yaml#/Other, not part.yaml#/A.
    expect((bundle(document, join(root, 'openapi.yaml')) as { components: unknown }).components).toEqual({
      schemas: {
        A: { type: 'boolean' },
        Other: { $ref: '#/components/schemas/part_A' },
        C: { $ref: '#/components/schemas/part_Other' },
        part_A: { type: 'string' },
        part_Other: { type: 'number' },
      },
    });
  });

  it('writes the same path item in place twice, and keeps the document\'s own references to its paths', () => {
    const root = scratch('apicontract-bundle-');
    writeFileSync(join(root, 'item.yaml'), 'summary: item\n');
    const document = { openapi: '3.1.0', paths: { '/a': { $ref: './item.yaml' }, '/b': { $ref: './item.yaml' }, '/c': { $ref: '#/paths/~1a' } } };
    expect(bundle(document, join(root, 'openapi.yaml'))).toEqual({ openapi: '3.1.0', paths: { '/a': { summary: 'item' }, '/b': { summary: 'item' }, '/c': { $ref: '#/paths/~1a' } } });
  });

  it('reads a map member named `$ref` as a name, not a reference', () => {
    const root = scratch('apicontract-bundle-');
    writeFileSync(join(root, 'part.yaml'), 'type: string\n');
    const document = { openapi: '3.1.0', paths: { $ref: './part.yaml' }, components: { schemas: { A: { $ref: './part.yaml' } } } };
    expect((bundle(document, join(root, 'openapi.yaml')) as { paths: unknown }).paths).toEqual({ $ref: './part.yaml' });
  });

  it('refuses a sibling that is not JSON or YAML', () => {
    expect(refusal(() => bundled('refusals/broken.yaml'))).toMatch(/^broken\.json is not JSON or YAML \(.+\)\. fix: correct broken\.json$/u);
  });

  it('names a file in a folder below with `/`, and reads YAML anywhere but in `.json`', () => {
    const root = scratch('apicontract-bundle-');
    const document = { openapi: '3.1.0', components: { schemas: { A: { $ref: './nested/absent.yaml' } } } };
    expect(refusal(() => bundle(document, join(root, 'openapi.yaml')))).toContain('names nested/absent.yaml, which does not exist');
  });
});

// One reference into `part.yaml` at each place the bundler knows, and where it goes from there.
const PART = { description: 'part' };

const ref = { $ref: './part.yaml' };
/** A document fragment with `ref` at `path`; a `0` stands for the first item of an array. */
const set = (path: readonly string[]): Record<string, unknown> => {
  let node: unknown = ref;
  for (const key of path.toReversed()) node = key === '0' ? [node] : { [key]: node };
  return node as Record<string, unknown>;
};
const at = (node: unknown, path: readonly string[]): unknown => path.reduce<unknown>((value, key) => (value as Record<string, unknown>)[key], node);

describe('bundle, by where the reference is', () => {
  const root = scratch('apicontract-bundle-');
  writeFileSync(join(root, 'part.yaml'), 'description: part\n');
  const operation = ['paths', '/a', 'get'];
  const media = [...operation, 'responses', '200', 'content', 'application/json'];
  const schema = [...media, 'schema'];
  it.each([
    [[...schema], 'schemas'],
    [[...schema, 'properties', 'default'], 'schemas'],
    [[...schema, 'patternProperties', '^a'], 'schemas'],
    [[...schema, 'dependentSchemas', 'a'], 'schemas'],
    [[...schema, '$defs', 'a'], 'schemas'],
    [[...schema, 'definitions', 'a'], 'schemas'],
    [[...schema, 'allOf', '0'], 'schemas'],
    [[...schema, 'anyOf', '0'], 'schemas'],
    [[...schema, 'oneOf', '0'], 'schemas'],
    [[...schema, 'prefixItems', '0'], 'schemas'],
    [[...schema, 'items'], 'schemas'],
    [[...schema, 'additionalItems'], 'schemas'],
    [[...schema, 'additionalProperties'], 'schemas'],
    [[...schema, 'unevaluatedItems'], 'schemas'],
    [[...schema, 'unevaluatedProperties'], 'schemas'],
    [[...schema, 'propertyNames'], 'schemas'],
    [[...schema, 'contains'], 'schemas'],
    [[...schema, 'not'], 'schemas'],
    [[...schema, 'if'], 'schemas'],
    [[...schema, 'then'], 'schemas'],
    [[...schema, 'else'], 'schemas'],
    [[...schema, 'xml'], undefined],
    [[...media, 'examples', 'a'], 'examples'],
    [[...media, 'encoding', 'a', 'headers', 'X'], 'headers'],
    [[...operation, 'responses', '200'], 'responses'],
    [[...operation, 'responses', '200', 'headers', 'X'], 'headers'],
    [[...operation, 'responses', '200', 'headers', 'X', 'schema'], 'schemas'],
    [[...operation, 'responses', '200', 'headers', 'X', 'content', 'text/plain', 'schema'], 'schemas'],
    [[...operation, 'responses', '200', 'headers', 'X', 'examples', 'a'], 'examples'],
    [[...operation, 'responses', '200', 'links', 'a'], 'links'],
    [[...operation, 'requestBody'], 'requestBodies'],
    [[...operation, 'requestBody', 'content', 'text/plain', 'schema'], 'schemas'],
    [[...operation, 'parameters', '0'], 'parameters'],
    [[...operation, 'parameters', '0', 'schema'], 'schemas'],
    [[...operation, 'parameters', '0', 'content', 'text/plain', 'schema'], 'schemas'],
    [[...operation, 'parameters', '0', 'examples', 'a'], 'examples'],
    [[...operation, 'callbacks', 'a'], 'callbacks'],
    [[...operation, 'callbacks', 'a', 'b', 'parameters', '0'], 'parameters'],
    [['paths', '/a', 'parameters', '0'], 'parameters'],
    ...['put', 'post', 'delete', 'options', 'head', 'patch', 'trace'].map((method) => [['paths', '/a', method, 'requestBody'], 'requestBodies'] as const),
    [['paths', '/a'], undefined],
    [['webhooks', 'a', 'post', 'requestBody'], 'requestBodies'],
    [['components', 'schemas', 'A', 'not'], 'schemas'],
    [['components', 'parameters', 'A', 'schema'], 'schemas'],
    [['components', 'responses', 'A', 'headers', 'X'], 'headers'],
    [['components', 'requestBodies', 'A', 'content', 'text/plain', 'schema'], 'schemas'],
    [['components', 'headers', 'A', 'schema'], 'schemas'],
    [['components', 'examples', 'A'], 'examples'],
    [['components', 'links', 'A'], 'links'],
    [['components', 'callbacks', 'A', 'b', 'get', 'requestBody'], 'requestBodies'],
    [['components', 'pathItems', 'A', 'get', 'requestBody'], 'requestBodies'],
    [['components', 'securitySchemes', 'A'], 'securitySchemes'],
    [['info'], undefined],
  ] as const)('%j goes to %s', (path, group) => {
    const out = bundle({ openapi: '3.1.0', ...set(path) }, join(root, 'openapi.yaml'));
    if (group === undefined) {
      expect(at(out, path)).toEqual(PART);
    } else {
      expect(at(out, path)).toEqual({ $ref: `#/components/${group}/part` });
      expect(at(out, ['components', group, 'part'])).toEqual(PART);
    }
  });

  it.each([
    [['definitions', 'A', 'items'], 'definitions'],
    [['parameters', 'A', 'items'], 'definitions'],
    [['responses', 'A', 'schema'], 'definitions'],
    [['paths', '/a', 'get', 'parameters', '0'], 'parameters'],
    [['paths', '/a', 'get', 'responses', '200'], 'responses'],
    [['paths', '/a', 'get', 'responses', '200', 'headers', 'X'], undefined],
    [['paths', '/a', 'get', 'requestBody'], undefined],
  ] as const)('Swagger 2.0: %j goes to %s', (path, group) => {
    const out = bundle({ swagger: '2.0', ...set(path) }, join(root, 'swagger.yaml'));
    if (group === undefined) {
      expect(at(out, path)).toEqual(PART);
    } else {
      expect(at(out, path)).toEqual({ $ref: `#/${group}/part` });
      expect(at(out, [group, 'part'])).toEqual(PART);
    }
  });

  it('leaves a reference inside data as it is', () => {
    const document = { openapi: '3.1.0', components: { schemas: { A: { default: ref, enum: [ref], example: ref, const: ref, 'x-a': ref, not: ref } } } };
    const out = bundle(document, join(root, 'openapi.yaml')) as { components: { schemas: { A: Record<string, unknown> } } };
    expect(out.components.schemas.A).toEqual({ default: ref, enum: [ref], example: ref, const: ref, 'x-a': ref, not: { $ref: '#/components/schemas/part' } });
  });
});
