import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { checkPlugin, createHost, validate } from './host.js';
import { builtinAdapters } from './inputs.js';
import { read } from './openapi.js';
import { optionsOf, plugin, run } from './plugin-nest.js';
import { SAMPLE_DOCUMENT } from './plugin-server-sample.js';
import { builtins } from './plugins.js';
import { UsageError } from './run-config.js';

const golden = (name: string): string => readFileSync(new URL(`__fixtures__/servers/nest/sample/${name}.golden.txt`, import.meta.url), 'utf8');

const host = () => {
  const created = createHost();
  created.register({ name: 'apicontract', adapters: builtinAdapters });
  created.register(plugin);
  return created;
};

const SAMPLE_PATHS = [
  'api.module.ts',
  'contract-runtime.ts',
  'createPet.contract.test.ts',
  'getPet.contract.test.ts',
  'getPets.contract.test.ts',
  'pets.controller.base.ts',
  'pets.controller.ts',
];

describe('the nest plugin', () => {
  it('is a built-in plugin the host accepts, reading OpenAPI', () => {
    expect(() => validate(plugin)).not.toThrow();
    expect(builtins).toContain(plugin);
    expect(plugin.name).toBe('nest');
    expect(plugin.generators?.nest?.inputs).toEqual(['openapi']);
    expect(plugin.generators?.nest?.description).toBe(
      'NestJS controllers: a generated abstract base per tag that validates requests and responses, a controller you own, and a contract test per operation',
    );
  });

  it('samples the document the golden files were written from', () => {
    expect(SAMPLE_DOCUMENT).toStrictEqual(JSON.parse(readFileSync(new URL('__fixtures__/servers/nest/sample/openapi.json', import.meta.url), 'utf8')));
  });

  it('produces exactly its sample, on every run', async () => {
    expect(await checkPlugin(plugin)).toEqual([]);
    expect(plugin.generators?.nest?.sample.document).toBe(SAMPLE_DOCUMENT);
  });

  it('writes the sample byte for byte as the golden files hold it, sorted by path, the controller as the user’s', async () => {
    const { files } = await host().run('nest', SAMPLE_DOCUMENT);
    expect(files.map((file) => file.path)).toEqual(SAMPLE_PATHS);
    for (const file of files) expect(file.content, file.path).toBe(golden(file.path));
    expect(files.filter((file) => file.owner === 'user').map((file) => file.path)).toEqual(['pets.controller.ts']);
    expect(files.find((file) => file.path === 'pets.controller.base.ts')?.symbols).toEqual([
      { operation: 'createPet', symbol: 'PetsControllerBase' },
      { operation: 'get /pets', symbol: 'PetsControllerBase' },
      { operation: 'getPet', symbol: 'PetsControllerBase' },
    ]);
    expect(plugin.generators?.nest?.sample.files).toEqual(files);
  });

  it('reports what it synthesised and the Problem Details answers the spec does not declare', async () => {
    const { findings } = await host().run('nest', SAMPLE_DOCUMENT);
    expect(findings).toEqual([
      {
        code: 'server-example-synthesised',
        pointer: '#/paths/~1pets/get',
        message: '`get /pets` query parameter "limit" has no example: the contract test sends one made from its schema',
        fix: 'add an `example` to the spec, so the contract test sends a value you chose',
      },
      {
        code: 'server-problem-undeclared',
        pointer: '#/paths/~1pets/get',
        message: '`get /pets` answers a request the contract refuses with 400 Problem Details, which its responses do not declare',
        fix: 'declare a `400` response with `application/problem+json` content',
      },
      {
        code: 'server-problem-undeclared',
        pointer: '#/paths/~1pets~1{petId}/get',
        message: '`getPet` answers a request the contract refuses with 400 Problem Details, which its responses do not declare',
        fix: 'declare a `400` response with `application/problem+json` content',
      },
    ]);
  });

  it('names NestJS in a finding for an operation it does not route', () => {
    expect(run(read({ openapi: '3.1.0', paths: { '/a': { trace: { operationId: 'a', responses: {} } } } }), {}).findings[0]?.message).toBe(
      '`a` is not a route NestJS serves (a webhook, or a method the target does not route)',
    );
  });

  it('writes only the runtime for a spec without routes', () => {
    expect(run(read({ openapi: '3.1.0', paths: {} }), {}).files.map((file) => file.path)).toEqual(['contract-runtime.ts']);
  });

  it('imports the other targets from the paths the options give, and writes the tests for the runner chosen', () => {
    const { files } = run(read(SAMPLE_DOCUMENT), { validators: '../validate/index.js', types: '../types/api.js', testRunner: 'node' });
    const base = files.find((file) => file.path === 'pets.controller.base.ts')?.content ?? '';
    expect(base).toContain('import { type paths } from "../types/api.js";\nimport { operations as validators } from "../validate/index.js";\n');
    const test = files.find((file) => file.path === 'getPet.contract.test.ts')?.content ?? '';
    expect(test).toContain("import { after as afterAll, before as beforeAll, describe, it } from 'node:test';\n");
    expect(test).toContain('import { operations as validators } from "../validate/index.js";\n');
    const jest = run(read(SAMPLE_DOCUMENT), { testRunner: 'jest' }).files.find((file) => file.path === 'getPet.contract.test.ts')?.content;
    expect(jest).toContain("import { afterAll, beforeAll, describe, it } from '@jest/globals';\n");
  });

  it('declares its options for --help', () => {
    expect(plugin.generators?.nest?.options).toEqual({
      validators: { type: 'string', description: 'import path of the `validator` target\'s output; default "./validators.js"' },
      types: { type: 'string', description: 'import path of the `types` target\'s output; default "./types.js"' },
      testRunner: { type: 'string', choices: ['vitest', 'node', 'jest'], description: 'the runner the contract tests import: vitest (default), node or jest' },
    });
  });
});

const refusal = (options: Record<string, unknown>): string => {
  try {
    optionsOf(options);
  } catch (error) {
    expect(error).toBeInstanceOf(UsageError);
    return (error as Error).message;
  }
  throw new Error('expected a refusal');
};

describe('optionsOf', () => {
  it('defaults every option', () => {
    expect(optionsOf({})).toEqual({ validators: './validators.js', types: './types.js', testRunner: 'vitest' });
  });

  it('refuses a runner it cannot write for, and an import path that is not one, with a fix line', () => {
    expect(refusal({ testRunner: 'mocha' })).toBe('nest: testRunner is "mocha". fix: set `testRunner` to one of vitest, node, jest');
    expect(refusal({ validators: '' })).toBe('nest: `validators` is not an import path. fix: set it to where the validator target writes, e.g. "./validators.js"');
    expect(refusal({ types: 3 })).toBe('nest: `types` is not an import path. fix: set it to where the types target writes, e.g. "./types.js"');
  });
});
