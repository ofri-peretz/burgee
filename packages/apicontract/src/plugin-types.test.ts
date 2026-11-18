import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { bundle } from './gen-ts-bundle.js';
import { checkPlugin, createHost, validate } from './host.js';
import { builtinAdapters } from './inputs.js';
import openapiTS from './openapi-typescript.js';
import { plugin, TYPES_FILE } from './plugin-types.js';
import { builtins } from './plugins.js';

const document = {
  openapi: '3.0.3',
  info: { title: 'Shop', version: '1' },
  paths: { '/orders': { post: { operationId: 'createOrder', requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Order' } } } }, responses: { '201': { description: 'Created' } } } } },
  components: { schemas: { Order: { type: 'object', properties: { total: { type: 'number' }, state: { type: 'string', enum: ['open', 'paid'] } } } } },
};

const hostWithTypes = () => {
  const host = createHost();
  host.register({ name: 'apicontract', adapters: builtinAdapters });
  host.register(plugin);
  return host;
};

describe('the types plugin', () => {
  it('is a plugin the host accepts, named `types`, with one generator that reads OpenAPI 3 and Swagger 2.0', () => {
    expect(() => validate(plugin)).not.toThrow();
    expect(plugin.name).toBe('types');
    expect(Object.keys(plugin.generators ?? {})).toEqual(['types']);
    expect(plugin.generators?.types?.inputs).toEqual(['openapi', 'swagger2']);
    expect(plugin.generators?.types?.description).toMatch(/openapi-typescript 7\.13\.0/u);
  });

  it('is a built-in', () => {
    expect(builtins).toContain(plugin);
  });

  it('produces exactly its sample, on every run', async () => {
    expect(await checkPlugin(plugin)).toEqual([]);
  });

  it('writes the sample body with no header line: the writer adds headers', () => {
    const [file] = plugin.generators?.types?.sample.files ?? [];
    expect(file?.path).toBe('types.ts');
    expect(file?.owner).toBe('generated');
    expect(file?.content.startsWith('export interface paths {\n')).toBe(true);
  });

  it('writes what the openapi-typescript drop-in prints for the same document, as one generated file', async () => {
    expect(await hostWithTypes().generate('types', document)).toEqual([{ path: TYPES_FILE, owner: 'generated', content: await openapiTS(document) }]);
  });

  it('passes options through to the generator', async () => {
    const [file] = await hostWithTypes().generate('types', document, { enum: true, exportType: true });
    expect(file?.content).toBe(await openapiTS(document, { enum: true, exportType: true }));
    expect(file?.content).toContain('export enum ');
  });

  it('writes types for a Swagger 2.0 document, through its OpenAPI 3.1 form', async () => {
    const swagger = {
      swagger: '2.0',
      info: { title: 'pets', version: '1' },
      paths: { '/pets/{id}': { get: { operationId: 'getPet', parameters: [{ name: 'id', in: 'path', required: true, type: 'integer' }], responses: { '200': { description: 'ok', schema: { $ref: '#/definitions/Pet' } } } } } },
      definitions: { Pet: { type: 'object', properties: { name: { type: 'string', 'x-nullable': true } } } },
    };
    const [file] = await hostWithTypes().generate('types', swagger);
    expect(file?.content).toContain('name?: string | null;');
    expect(file?.content).toContain('id: number;');
    expect(file?.content).toContain('"application/json": components["schemas"]["Pet"];');
  });

  // Gap A-20261118-types-external-refs-dangle: the Azure shape, `./loadBalancer.json#/definitions/…`.
  it('writes types for a Swagger 2.0 document whose sibling files are bundled in, and refuses one whose are not', async () => {
    const path = fileURLToPath(new URL('__fixtures__/types/swagger2/network.json', import.meta.url));
    const document = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    const [file] = await hostWithTypes().generate('types', bundle(document, path));
    expect(file?.content).toContain('frontendIPConfigurations?: components["schemas"]["FrontendIPConfiguration"][];');
    expect(file?.content).toContain('"api-version": string;');
    expect(file?.content).not.toContain('definitions[');
    const refusal = (await hostWithTypes().generate('types', document).catch((cause: unknown) => cause)) as Error;
    expect(refusal.message).toMatch(/^`\.\/loadBalancer\.json#\/definitions\/LoadBalancer` at #\/paths\/.+ is in another file, \.\/loadBalancer\.json, which is not part of the document\. fix: /u);
  });

  it('refuses a document that is not OpenAPI, with a fix', async () => {
    const refusal = (await hostWithTypes()
      .generate('types', { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object' })
      .catch((cause: unknown) => cause)) as Error;
    expect(refusal.message).toMatch(/fix: pass one of: openapi, swagger2;/u);
  });
});
