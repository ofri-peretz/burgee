/**
 * The built-in `nest` target (apicontract-servers R1–R7): NestJS controllers from an OpenAPI
 * document, as a generated abstract base and a user-owned class that extends it.
 *
 * Per controller (one per first tag): `<tag>.controller.base.ts`, generated, holds each route's
 * typed `input` and response union and the decorated handlers that validate the request, call the
 * user's method and check its answer; `<tag>.controller.ts`, the user's, written once, answers each
 * operation with the spec's example until it is replaced. Also generated: `api.module.ts`,
 * `contract-runtime.ts` (validation, RFC 9457 Problem Details) and one
 * `<operation>.contract.test.ts` per operation.
 *
 * A new operation is a new abstract method: the user's class stops compiling, and nothing of the
 * user's is rewritten. Options: `validators` and `types`, the import paths of the `validator` and
 * `types` targets' output (`./validators.js`, `./types.js`), and `testRunner` (`vitest`, `node` or
 * `jest`). NestJS is the user's dependency, never apicontract's.
 */
import { type Contract } from './core/model.js';
import { type GeneratedFile, type Generator, type GeneratorResult, type Options, type Plugin } from './host.js';
import { read } from './openapi.js';
import { baseFile, controllerFile, type Imports, moduleFile } from './plugin-nest-code.js';
import { contractTest, type Runner, RUNNERS, RUNTIME } from './plugin-nest-contract.js';
import { routesOf } from './plugin-nest-routes.js';
import { UsageError } from './run-config.js';

export interface NestOptions extends Imports {
  readonly testRunner: Runner;
}

const path = (options: Options, name: 'validators' | 'types', fallback: string): string => {
  const value = options[name] ?? fallback;
  if (typeof value !== 'string' || value === '') throw new UsageError(`nest: \`${name}\` is not an import path. fix: set it to where the ${name === 'types' ? 'types' : 'validator'} target writes, e.g. "${fallback}"`);
  return value;
};

/** The options, checked. */
export const optionsOf = (options: Options): NestOptions => {
  const { testRunner = 'vitest' } = options;
  if (!(RUNNERS as readonly unknown[]).includes(testRunner)) throw new UsageError(`nest: testRunner is "${String(testRunner)}". fix: set \`testRunner\` to one of ${RUNNERS.join(', ')}`);
  return { validators: path(options, 'validators', './validators.js'), types: path(options, 'types', './types.js'), testRunner: testRunner as Runner };
};

export const run = (contract: Contract, options: Options): GeneratorResult => {
  const checked = optionsOf(options);
  const { controllers, findings } = routesOf(contract);
  const files: GeneratedFile[] = [
    { path: 'contract-runtime.ts', owner: 'generated', content: RUNTIME },
    ...(controllers.length === 0 ? [] : [{ path: 'api.module.ts', owner: 'generated' as const, content: moduleFile(controllers) }]),
    ...controllers.flatMap((controller): GeneratedFile[] => [
      {
        path: `${controller.file}.controller.base.ts`,
        owner: 'generated',
        content: baseFile(controller, checked),
        symbols: controller.routes.map((route) => ({ operation: route.id, symbol: `${controller.name}ControllerBase` })),
      },
      { path: `${controller.file}.controller.ts`, owner: 'user', content: controllerFile(controller) },
      ...controller.routes.map((route): GeneratedFile => ({ path: `${route.name}.contract.test.ts`, owner: 'generated', content: contractTest(route, checked, checked.testRunner) })),
    ]),
  ];
  return { files: files.toSorted((a, b) => (a.path < b.path ? -1 : 1)), findings };
};

/** The sample (R7): a GET with a path parameter, a POST with a body and two responses, and a GET without an `operationId`. */
export const SAMPLE_DOCUMENT = {
  openapi: '3.1.0',
  info: { title: 'Pets', version: '1.0.0' },
  paths: {
    '/pets': {
      get: {
        tags: ['pets'],
        parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1 } }],
        responses: { '200': { description: 'Pets', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Pet' } }, example: [{ id: 1, name: 'Rex' }] } } } },
      },
      post: {
        operationId: 'createPet',
        tags: ['pets'],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/NewPet' }, example: { name: 'Rex' } } } },
        responses: {
          '201': { description: 'Created', content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' }, example: { id: 1, name: 'Rex' } } } },
          '400': { description: 'Invalid', content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } } },
        },
      },
    },
    '/pets/{petId}': {
      get: {
        operationId: 'getPet',
        tags: ['pets'],
        parameters: [{ name: 'petId', in: 'path', required: true, schema: { type: 'integer' }, example: 1 }],
        responses: {
          '200': { description: 'A pet', content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' }, example: { id: 1, name: 'Rex' } } } },
          '404': { description: 'Not found' },
        },
      },
    },
  },
  components: {
    schemas: {
      Pet: { type: 'object', required: ['id', 'name'], properties: { id: { type: 'integer' }, name: { type: 'string' } } },
      NewPet: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } },
      Problem: { type: 'object', required: ['title', 'status'], properties: { type: { type: 'string' }, title: { type: 'string' }, status: { type: 'integer' }, detail: { type: 'string' } } },
    },
  },
};

const nest: Generator = {
  description: 'NestJS controllers: a generated abstract base per tag that validates requests and responses, a controller you own, and a contract test per operation',
  inputs: ['openapi'],
  options: {
    validators: { type: 'string', description: 'import path of the `validator` target\'s output; default "./validators.js"' },
    types: { type: 'string', description: 'import path of the `types` target\'s output; default "./types.js"' },
    testRunner: { type: 'string', choices: [...RUNNERS], description: 'the runner the contract tests import: vitest (default), node or jest' },
  },
  sample: {
    document: SAMPLE_DOCUMENT,
    // The text of every file is pinned by the golden files in `__fixtures__/servers/nest/`.
    files: run(read(SAMPLE_DOCUMENT), {}).files,
  },
  run,
};

export const plugin: Plugin = { name: 'nest', generators: { nest } };
