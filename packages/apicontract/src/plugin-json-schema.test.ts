import { describe, expect, it } from 'vitest';

import { scratchDirs } from './__fixtures__/run/scratch-dir.js';
import { draft07, legacy, shop } from './__fixtures__/validate/corpus.js';
import { ajvCheck, load } from './__fixtures__/validate/harness.js';
import { checkPlugin, createHost, validate } from './host.js';
import { builtinAdapters } from './inputs.js';
import { plugin, RECHECK_FILE } from './plugin-json-schema.js';
import { builtins } from './plugins.js';

const scratch = scratchDirs();

const host = () => {
  const made = createHost();
  made.register({ name: 'apicontract', adapters: builtinAdapters });
  made.register(plugin);
  return made;
};

const pets = {
  openapi: '3.1.0',
  paths: {
    '/pets': {
      post: {
        operationId: 'createPet',
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } } },
        responses: { '200': { description: 'Pet', content: { 'application/json': { schema: { type: 'string' } } } }, '204': { description: 'None' } },
      },
    },
  },
  components: { schemas: { Pet: { type: 'object', required: ['name'], properties: { name: { type: 'string', minLength: 1 }, tag: { type: 'string', 'x-a': 1 } } } } },
};

describe('the json-schema plugin', () => {
  it('is a built-in plugin the host accepts, with a sample it produces on every run', async () => {
    expect(() => validate(plugin)).not.toThrow();
    expect(builtins).toContain(plugin);
    expect(plugin.name).toBe('json-schema');
    expect(plugin.generators?.['json-schema']?.inputs).toEqual(['openapi', 'swagger2', 'asyncapi', 'mcp', 'jsonschema']);
    expect(await checkPlugin(plugin)).toEqual([]);
  });

  it('writes one document per payload, by name, with its symbol, and reports what it left out', async () => {
    const { files, findings } = await host().run('json-schema', pets);
    expect(files.map(({ path, owner, symbols }) => [path, owner, symbols])).toEqual([
      ['CreatePetBody.json', 'generated', [{ operation: 'createPet', symbol: 'CreatePetBody' }]],
      ['CreatePetResponse200.json', 'generated', [{ operation: 'createPet', symbol: 'CreatePetResponse200' }]],
      ['CreatePetResponse204.json', 'generated', [{ operation: 'createPet', symbol: 'CreatePetResponse204' }]],
    ]);
    expect(files[1]?.content).toBe('{\n  "$schema": "https://json-schema.org/draft/2020-12/schema",\n  "type": "string"\n}\n');
    expect(findings.map((finding) => [finding.code, finding.pointer])).toEqual([['keyword-dropped', '#/components/schemas/Pet/properties/tag']]);
  });

  it('writes draft-07 and inlines references when asked', async () => {
    const [body] = (await host().run('json-schema', pets, { draft: '07', refs: 'inline' })).files;
    expect(JSON.parse(body?.content ?? '')).toEqual({
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      required: ['name'],
      properties: { name: { type: 'string', minLength: 1 }, tag: { type: 'string' } },
    });
  });

  it('refuses an option it does not take, naming the ones it does', async () => {
    await expect(host().run('json-schema', pets, { draft: '04' })).rejects.toThrow('json-schema: the option `draft` is "04". fix: use one of: 2020-12, 07');
    await expect(host().run('json-schema', pets, { refs: 'drop' })).rejects.toThrow('json-schema: the option `refs` is "drop". fix: use one of: keep, inline');
    await expect(host().run('json-schema', pets, { dialect: 'llama' })).rejects.toThrow('json-schema: the option `dialect` is "llama". fix: use one of: anthropic, gemini, mcp, mcp-elicitation, openai');
    await expect(host().run('json-schema', pets, { dialect: 'openai', draft: '07' })).rejects.toThrow('json-schema: `dialect: openai` writes 2020-12, and `draft` is 07. fix: leave `draft` out, or drop `dialect`');
    expect((await host().run('json-schema', pets, { dialect: 'openai', draft: '2020-12' })).files.length).toBe(2);
  });

  it('declares its options', () => {
    expect(Object.keys(plugin.generators?.['json-schema']?.options ?? {})).toEqual(['draft', 'refs', 'dialect']);
  });
});

describe('a provider dialect: narrow, then re-check (R7)', () => {
  it('writes the narrowed schema and a re-check for the full one, listing what was dropped', async () => {
    const { files, findings } = await host().run('json-schema', pets, { dialect: 'anthropic' });
    expect(files.map(({ path, symbols }) => [path, symbols])).toEqual([
      ['CreatePetBody.anthropic.json', [{ operation: 'createPet', symbol: 'CreatePetBody' }]],
      [RECHECK_FILE, [{ operation: 'createPet', symbol: 'CreatePetBodyRecheck' }]],
    ]);
    expect(JSON.parse(files[0]?.content ?? '')).toEqual({
      type: 'object',
      required: ['name'],
      properties: { name: { type: 'string', description: '(minLength: 1)' }, tag: { type: 'string' } },
      additionalProperties: false,
    });
    const recheck = files[1]?.content ?? '';
    expect(recheck).toContain(' * Re-checks an answer to `CreatePetBody.anthropic.json` against the full schema of `createPet` body:application/json.\n * anthropic was given less than the full schema; the narrowed schema does not say:\n * - /properties/name: `minLength` 1\n */\nexport const CreatePetBodyRecheck: (value: unknown) => boolean = (() => {');
    expect(findings.map((finding) => finding.code)).toEqual(['keyword-dropped', 'dialect-rewritten', 'dialect-root-not-object']);
    const module = await load(recheck, scratch('apicontract-recheck-'), 'recheck');
    const check = module.CreatePetBodyRecheck as (value: unknown) => boolean;
    expect([check({ name: 'a' }), check({ name: '' }), check({})]).toEqual([true, false, false]);
  });

  it('writes no re-check when nothing was dropped, and leaves out a payload that sends nothing', async () => {
    const { files, findings } = await host().run('json-schema', pets, { dialect: 'mcp' });
    expect(files.map(({ path }) => path)).toEqual(['CreatePetBody.mcp.json', 'CreatePetResponse200.mcp.json']);
    expect(findings.map((finding) => finding.code)).toEqual(['keyword-dropped']);
  });

  it('reports a per-request limit over the whole generated set', async () => {
    const properties = Object.fromEntries(Array.from({ length: 25 }, (_, index) => [`p${String(index)}`, { type: 'string' }]));
    const many = { ...pets, components: { schemas: { Pet: { type: 'object', properties } } } };
    const { findings } = await host().run('json-schema', many, { dialect: 'anthropic' });
    expect(findings.at(-1)).toEqual({
      code: 'dialect-limit',
      pointer: '',
      message: 'the generated schemas have 25 optional together, and anthropic takes at most 24 in one request',
      fix: 'split the payloads across requests, or simplify them: anthropic refuses a request over the limit',
    });
  });

  it('writes every dialect of the corpus as JSON that ajv compiles', async () => {
    const runs = await Promise.all(['openai', 'anthropic', 'gemini', 'mcp', 'mcp-elicitation'].map(async (name) => host().run('json-schema', shop, { dialect: name })));
    const files = runs.flatMap((run) => run.files).filter(({ path }) => path.endsWith('.json'));
    expect(files.length).toBeGreaterThan(5);
    for (const file of files) expect(() => ajvCheck({ $schema: 'https://json-schema.org/draft/2020-12/schema', ...JSON.parse(file.content) })).not.toThrow();
  });
});

describe('J1: every document compiles in ajv 8 unchanged', () => {
  it.each([
    ['shop', shop],
    ['legacy', legacy],
    ['draft07', draft07],
  ])('%s', async (_, document) => {
    const runs = await Promise.all([{}, { refs: 'inline' }, { draft: '07' }, { draft: '07', refs: 'inline' }].map(async (options) => host().run('json-schema', document, options)));
    const files = runs.flatMap((run) => run.files);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) expect(() => ajvCheck(JSON.parse(file.content))).not.toThrow();
  });
});
