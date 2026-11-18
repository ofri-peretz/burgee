import { describe, expect, it } from 'vitest';

import { generateAll, shop, typecheck } from './__fixtures__/clients/harness.js';
import { checkPlugin, createHost, validate } from './host.js';
import { builtinAdapters } from './inputs.js';
import { CLIENT_FILE, plugin } from './plugin-fetch.js';
import { builtins } from './plugins.js';

const host = () => {
  const created = createHost();
  created.register({ name: 'apicontract', adapters: builtinAdapters });
  created.register(plugin);
  return created;
};

/** Code a user writes against the generated client and queries: it must type-check as written, and fail where it is wrong. */
const USE = `import { createClient } from './client.js';
import { getPetQueryOptions, createPetMutationOptions } from './queries.js';
import { handlers, handler } from './handlers.js';

const client = createClient({ baseUrl: 'https://api.example.com' });
const pet = await client.getPet({ path: { petId: 'p1' } });
if (pet.status === 200) {
  const id: number = pet.body.id;
  const status: 'available' | 'pending' | 'sold' = pet.body.status;
  void id;
  void status;
} else if (pet.status === '4XX') {
  const message: string = pet.body.message;
  void message;
} else {
  const code: number = pet.code;
  void code;
}
await client.listPets();
await client.listPets({ query: { tags: ['a'], filter: { status: 'sold' } }, header: { 'X-Request-Id': 'r' } });
await client.login({ body: { user: 'ada', password: 'secret' } });
await client['get /health']();
const removed = await client.deletePet({ path: { petId: 'p1' } });
if (removed.status === 204) {
  const nothing: undefined = removed.body;
  void nothing;
}
const query = getPetQueryOptions(client, { path: { petId: 'p1' } });
const key: readonly ['getPet', unknown] = query.queryKey;
void key;
const created = await createPetMutationOptions(client).mutationFn({ body: { name: 'Rex' } });
void created;
void handlers;
void handler('getPet', '4XX');
export {};
`;

const WRONG = `import { createClient } from './client.js';
const client = createClient({ baseUrl: '' });
await client.getPet({});
await client.login({ body: { user: 'ada' } });
const pet = await client.getPet({ path: { petId: 'p1' } });
if (pet.status === 200) {
  const name: number = pet.body.name;
  void name;
}
export {};
`;

describe('the fetch plugin', () => {
  it('is a built-in the host accepts, with one generator that reads OpenAPI', () => {
    expect(() => validate(plugin)).not.toThrow();
    expect(builtins).toContain(plugin);
    expect(plugin.name).toBe('fetch');
    expect(Object.keys(plugin.generators ?? {})).toEqual(['fetch']);
    expect(plugin.generators?.fetch?.inputs).toEqual(['openapi']);
  });

  it('produces exactly its sample, on every run', async () => {
    expect(await checkPlugin(plugin)).toEqual([]);
    const [file] = plugin.generators?.fetch?.sample.files ?? [];
    expect(file?.path).toBe(CLIENT_FILE);
    await expect(file?.content).toMatchFileSnapshot('./__fixtures__/clients/sample/client.ts.snap');
  });

  it('writes client.ts for the fixture spec, with a symbol per operation and nothing to report', async () => {
    const { files, findings } = await host().run('fetch', shop);
    expect(files.map((file) => [file.path, file.owner])).toEqual([[CLIENT_FILE, 'generated']]);
    expect(files[0]?.symbols).toEqual([
      { operation: 'createPet', symbol: 'CreatePet' },
      { operation: 'deletePet', symbol: 'DeletePet' },
      { operation: 'get /health', symbol: 'GetHealth' },
      { operation: 'getPet', symbol: 'GetPet' },
      { operation: 'getPhoto', symbol: 'GetPhoto' },
      { operation: 'listPets', symbol: 'ListPets' },
      { operation: 'login', symbol: 'Login' },
      { operation: 'uploadPhoto', symbol: 'UploadPhoto' },
    ]);
    expect(findings).toEqual([]);
    await expect(files[0]?.content).toMatchFileSnapshot('./__fixtures__/clients/shop/client.ts.snap');
  });

  it('imports the types from the path option `types`', async () => {
    const [file] = await host().generate('fetch', shop, { types: '../api/types.js' });
    expect(file?.content.startsWith('import type { paths } from "../api/types.js";\n')).toBe(true);
  });

  it('type-checks with the types target, and catches a wrong call', async () => {
    const { files } = await generateAll(shop);
    expect(typecheck({ ...files, 'use.ts': USE })).toEqual([]);
    expect(typecheck({ ...files, 'use.ts': WRONG }).map((line) => line.replace(/ .*\n?[^]*$/u, ''))).toEqual(['/virtual/use.ts:3', '/virtual/use.ts:4', '/virtual/use.ts:7']);
  });
});
