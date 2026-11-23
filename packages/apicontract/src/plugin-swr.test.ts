import { describe, expect, it } from 'vitest';

import { generateAll, load, shop } from './__fixtures__/clients/harness.js';
import { checkPlugin, createHost, validate } from './host.js';
import { builtinAdapters } from './inputs.js';
import { plugin, SWR_FILE } from './plugin-swr.js';
import { builtins } from './plugins.js';

const host = () => {
  const created = createHost();
  created.register({ name: 'contractdiff', adapters: builtinAdapters });
  created.register(plugin);
  return created;
};

interface Swr {
  readonly getPetSWR: (client: unknown, input: unknown) => { key: unknown; fetcher: () => Promise<unknown> };
  readonly getHealthSWR: (client: unknown, input?: unknown) => { key: unknown };
  readonly createPetSWRMutation: (client: unknown) => { key: unknown; fetcher: (key: unknown, options: { arg: unknown }) => Promise<unknown> };
}

describe('the swr plugin', () => {
  it('is a built-in the host accepts, with one generator that reads OpenAPI, that produces exactly its sample', async () => {
    expect(() => validate(plugin)).not.toThrow();
    expect(builtins).toContain(plugin);
    expect(plugin.name).toBe('swr');
    expect(Object.keys(plugin.generators ?? {})).toEqual(['swr']);
    expect(plugin.generators?.swr?.inputs).toEqual(['openapi']);
    expect(await checkPlugin(plugin)).toEqual([]);
  });

  it('writes swr.ts for the fixture spec: a key and fetcher for each GET and HEAD, a mutation pair for the rest', async () => {
    const { files, findings } = await host().run('swr', shop, { client: '../api/client.js' });
    expect(files.map((file) => [file.path, file.owner])).toEqual([[SWR_FILE, 'generated']]);
    expect(files[0]?.symbols?.map((symbol) => symbol.symbol)).toEqual([
      'createPetSWRMutation',
      'deletePetSWRMutation',
      'getHealthSWR',
      'getPetSWR',
      'getPhotoSWR',
      'listPetsSWR',
      'loginSWRMutation',
      'uploadPhotoSWRMutation',
    ]);
    expect(findings).toEqual([]);
    await expect(files[0]?.content).toMatchFileSnapshot('./__fixtures__/clients/shop/swr.ts.snap');
  });

  it('makes the same key for the same input in any property order, and calls the client', async () => {
    const { files } = await generateAll(shop);
    const swr = await load<Swr>(files['swr.ts'] as string);
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
    const one = swr.getPetSWR(client, { path: { petId: 'p1' }, query: { b: 1, a: 2 } });
    const two = swr.getPetSWR(client, { query: { a: 2, b: 1 }, path: { petId: 'p1' } });
    expect(JSON.stringify(one.key)).toBe('["getPet",{"path":{"petId":"p1"},"query":{"a":2,"b":1}}]');
    expect(JSON.stringify(two.key)).toBe(JSON.stringify(one.key));
    expect(swr.getHealthSWR(client).key).toEqual(['get /health', {}]);
    expect(await one.fetcher()).toBe('pet');
    const mutation = swr.createPetSWRMutation(client);
    expect(mutation.key).toEqual(['createPet']);
    expect(await mutation.fetcher(mutation.key, { arg: { body: { name: 'Rex' } } })).toBe('made');
    expect(calls).toEqual([
      ['getPet', { path: { petId: 'p1' }, query: { b: 1, a: 2 } }],
      ['createPet', { body: { name: 'Rex' } }],
    ]);
  });
});
