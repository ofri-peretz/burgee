import { describe, expect, it } from 'vitest';

import { generateAll, load, shop } from './__fixtures__/clients/harness.js';
import { checkPlugin, createHost, validate } from './host.js';
import { builtinAdapters } from './inputs.js';
import { plugin, QUERIES_FILE } from './plugin-tanstack-query.js';
import { builtins } from './plugins.js';

const host = () => {
  const created = createHost();
  created.register({ name: 'contractdiff', adapters: builtinAdapters });
  created.register(plugin);
  return created;
};

interface Queries {
  readonly stable: (value: unknown) => unknown;
  readonly getPetQueryOptions: (client: unknown, input: unknown) => { queryKey: unknown; queryFn: () => Promise<unknown> };
  readonly getHealthQueryOptions: (client: unknown, input?: unknown) => { queryKey: unknown };
  readonly createPetMutationOptions: (client: unknown) => { mutationKey: unknown; mutationFn: (input: unknown) => Promise<unknown> };
}

describe('the tanstack-query plugin', () => {
  it('is a built-in the host accepts, with one generator that reads OpenAPI', () => {
    expect(() => validate(plugin)).not.toThrow();
    expect(builtins).toContain(plugin);
    expect(plugin.name).toBe('tanstack-query');
    expect(Object.keys(plugin.generators ?? {})).toEqual(['tanstack-query']);
    expect(plugin.generators?.['tanstack-query']?.inputs).toEqual(['openapi']);
  });

  it('produces exactly its sample, on every run', async () => {
    expect(await checkPlugin(plugin)).toEqual([]);
  });

  it('writes queries.ts for the fixture spec: a query for each GET and HEAD, a mutation for the rest', async () => {
    const { files, findings } = await host().run('tanstack-query', shop);
    expect(files.map((file) => [file.path, file.owner])).toEqual([[QUERIES_FILE, 'generated']]);
    expect(files[0]?.symbols?.map((symbol) => symbol.symbol)).toEqual([
      'createPetMutationOptions',
      'deletePetMutationOptions',
      'getHealthQueryOptions',
      'getPetQueryOptions',
      'getPhotoQueryOptions',
      'listPetsQueryOptions',
      'loginMutationOptions',
      'uploadPhotoMutationOptions',
    ]);
    expect(findings).toEqual([]);
    await expect(files[0]?.content).toMatchFileSnapshot('./__fixtures__/clients/shop/queries.ts.snap');
  });

  it('makes a query of a HEAD operation too', async () => {
    const [file] = await host().generate('tanstack-query', { openapi: '3.1.0', paths: { '/x': { head: { operationId: 'probe', responses: {} } } } });
    expect(file?.content).toContain('export const probeQueryOptions = (client: Client, input: ProbeInput = {}) => ({\n');
  });

  it('imports the client from the path option `client`, and only the client when there is no operation', async () => {
    const [file] = await host().generate('tanstack-query', { openapi: '3.1.0', info: { title: 't', version: '1' }, paths: {} }, { client: '../api/client.js' });
    expect(file?.content.split('\n', 1)[0]).toBe('import { type Client } from "../api/client.js";');
    expect(file?.content.endsWith('};\n')).toBe(true);
  });

  it('makes the same key for the same input in any property order, and calls the client', async () => {
    const { files } = await generateAll(shop);
    const queries = await load<Queries>(files['queries.ts'] as string);
    const calls: unknown[] = [];
    const client = {
      getPet: async (input: unknown) => {
        calls.push(['getPet', input]);
        return 'pet';
      },
      createPet: async (input: unknown) => {
        calls.push(['createPet', input]);
        return 'made';
      },
    };
    const one = queries.getPetQueryOptions(client, { path: { petId: 'p1' }, query: { b: [{ y: 1, x: 2 }], a: null } });
    const two = queries.getPetQueryOptions(client, { query: { a: null, b: [{ x: 2, y: 1 }] }, path: { petId: 'p1' } });
    expect(JSON.stringify(one.queryKey)).toBe(JSON.stringify(two.queryKey));
    expect(JSON.stringify(one.queryKey)).toBe('["getPet",{"path":{"petId":"p1"},"query":{"a":null,"b":[{"x":2,"y":1}]}}]');
    expect(queries.getHealthQueryOptions(client).queryKey).toEqual(['get /health', {}]);
    expect(await one.queryFn()).toBe('pet');
    const mutation = queries.createPetMutationOptions(client);
    expect(mutation.mutationKey).toEqual(['createPet']);
    expect(await mutation.mutationFn({ body: { name: 'Rex' } })).toBe('made');
    expect(calls).toEqual([
      ['getPet', { path: { petId: 'p1' }, query: { b: [{ y: 1, x: 2 }], a: null } }],
      ['createPet', { body: { name: 'Rex' } }],
    ]);
  });
});
