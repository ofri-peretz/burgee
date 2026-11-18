import { describe, expect, it } from 'vitest';

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
  it('is a plugin the host accepts, named `types`, with one generator that reads OpenAPI', () => {
    expect(() => validate(plugin)).not.toThrow();
    expect(plugin.name).toBe('types');
    expect(Object.keys(plugin.generators ?? {})).toEqual(['types']);
    expect(plugin.generators?.types?.inputs).toEqual(['openapi']);
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

  it('refuses a document that is not OpenAPI, with a fix', async () => {
    const refusal = (await hostWithTypes()
      .generate('types', { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object' })
      .catch((cause: unknown) => cause)) as Error;
    expect(refusal.message).toMatch(/fix: pass one of: openapi;/u);
  });
});
