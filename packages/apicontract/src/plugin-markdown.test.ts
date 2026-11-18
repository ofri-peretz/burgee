import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { parse } from 'seniority/yaml';
import { describe, expect, it } from 'vitest';

import { toMarkdown } from './command-explain-text.js';
import { explain } from './command-explain.js';
import { checkPlugin, createHost, validate } from './host.js';
import { builtinAdapters } from './inputs.js';
import { plugin } from './plugin-markdown.js';
import { builtins } from './plugins.js';

const FIXTURE = fileURLToPath(new URL('__fixtures__/agents/pets.openapi.yaml', import.meta.url));
const pets = parse(readFileSync(FIXTURE, 'utf8'));

const host = () => {
  const created = createHost();
  created.register({ name: 'apicontract', adapters: builtinAdapters });
  created.register(plugin);
  return created;
};

describe('the markdown plugin', () => {
  it('is a built-in plugin the host accepts, with one generator', () => {
    expect(() => validate(plugin)).not.toThrow();
    expect(builtins).toContain(plugin);
    expect(Object.keys(plugin.generators ?? {})).toEqual(['markdown']);
  });

  it('produces exactly its sample, on every run, with no header in any body', async () => {
    expect(await checkPlugin(plugin)).toEqual([]);
    for (const file of plugin.generators?.markdown?.sample.files ?? []) expect(file.content.startsWith('# ')).toBe(true);
  });

  it('writes, for each operation, the page `explain` prints, then index.md and llms.txt', async () => {
    const files = await host().generate('markdown', pets);
    expect(files.map((file) => file.path)).toEqual(['listPets.md', 'createPet.md', 'deletePet.md', 'getTree.md', 'index.md', 'llms.txt']);
    const explained = await explain({ cwd: '/', input: FIXTURE, operation: 'getTree' });
    expect(files[3]?.content).toBe(toMarkdown(explained as Parameters<typeof toMarkdown>[0]));
    expect(files[4]?.content).toBe(
      '# Pets\n\nA pet store, for the agents lane\'s tests.\n\n- [listPets](listPets.md) — `GET /pets` — List pets\n- [createPet](createPet.md) — `POST /pets`\n- [deletePet](deletePet.md) — `DELETE /pets/{petId}`\n- [getTree](getTree.md) — `GET /tree`\n',
    );
    expect(files[5]?.content.split('\n').slice(0, 7)).toEqual(['# Pets', '', "> A pet store, for the agents lane's tests.", '', '## Operations', '', '- [listPets](listPets.md): `GET /pets` — List pets']);
  });

  it('caps each page with maxBytes, as explain does, and ignores a maxBytes that is not a number', async () => {
    const [page] = await host().generate('markdown', pets, { maxBytes: 500 });
    expect(page?.content).toContain('Truncated to 500 bytes; emptied:');
    const [whole] = await host().generate('markdown', pets, { maxBytes: '500' });
    expect(whole?.content).not.toContain('Truncated');
  });

  it('declares its options for --help', () => {
    expect(plugin.generators?.markdown?.options).toEqual({ maxBytes: { type: 'number', description: 'cap each page as `explain --max-bytes` does: deepest schemas first' } });
  });

  it('keeps colliding page names within 100 characters', async () => {
    const long = 'x'.repeat(100);
    const paths = { '/a': { get: { operationId: `${long}/`, responses: {} } }, '/b': { get: { operationId: `${long}?`, responses: {} } } };
    const files = await host().generate('markdown', { openapi: '3.1.0', paths });
    expect(files.slice(0, 2).map((file) => file.path.length)).toEqual([103, 103]);
  });

  it('ignores an empty or non-text title and description', async () => {
    const runs = await Promise.all(
      [{ title: '', description: '' }, { title: 3, description: 3 }, null].map(async (info) => host().generate('markdown', { openapi: '3.1.0', info, paths: { '/a': { get: { operationId: 'a', responses: {} } } } })),
    );
    for (const files of runs) expect(files[1]?.content).toBe('# API\n\n- [a](a.md) — `GET /a`\n');
  });

  it('titles a document without info "API", and links an operation with no route by its id alone', async () => {
    const files = await host().generate('markdown', { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'string' });
    expect(files.at(-2)?.content).toMatch(/^# API\n\n- \[[^\]]+\]\([^)]+\.md\)\n$/u);
    expect(files.at(-1)?.content).toMatch(/\n- \[[^\]]+\]\([^)]+\.md\)\n$/u);
  });
});
