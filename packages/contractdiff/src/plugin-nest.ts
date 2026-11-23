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
 * `jest`). NestJS is the user's dependency, never contractdiff's.
 */
import { type Contract } from './core/model.js';
import { type GeneratedFile, type Generator, type GeneratorResult, type Options, type Plugin } from './host.js';
import { read } from './openapi.js';
import { baseFile, controllerFile, moduleFile } from './plugin-nest-code.js';
import { contractTest } from './plugin-nest-contract.js';
import { SERVER_OPTIONS, type ServerOptions, serverOptions } from './plugin-server-contract.js';
import { routesOf } from './plugin-server-routes.js';
import { RUNTIME } from './plugin-server-runtime.js';
import { SAMPLE_DOCUMENT } from './plugin-server-sample.js';

/** The options, checked. */
export const optionsOf = (options: Options): ServerOptions => serverOptions('nest', options);

export const run = (contract: Contract, options: Options): GeneratorResult => {
  const checked = optionsOf(options);
  const { controllers, findings } = routesOf(contract, 'NestJS');
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
      {
        path: `${controller.file}.controller.ts`,
        owner: 'user',
        content: controllerFile(controller),
        // The method that answers each operation: the base declares it abstract, so its name holds while the class is the user's.
        symbols: controller.routes.map((route) => ({ operation: route.id, symbol: `${controller.name}Controller.${route.name}` })),
      },
      ...controller.routes.map((route): GeneratedFile => ({ path: `${route.name}.contract.test.ts`, owner: 'generated', content: contractTest(route, checked, checked.testRunner) })),
    ]),
  ];
  // Sorted by UTF-16 code unit, the default sort, so every machine and locale agrees.
  const byPath = new Map(files.map((file) => [file.path, file]));
  return { files: [...byPath.keys()].toSorted().map((key) => byPath.get(key) as GeneratedFile), findings };
};

const nest: Generator = {
  description: 'NestJS controllers: a generated abstract base per tag that validates requests and responses, a controller you own, and a contract test per operation',
  inputs: ['openapi'],
  options: SERVER_OPTIONS,
  sample: {
    document: SAMPLE_DOCUMENT,
    // The text of every file is pinned by the golden files in `__fixtures__/servers/nest/`.
    files: run(read(SAMPLE_DOCUMENT), {}).files,
  },
  run,
};

export const plugin: Plugin = { name: 'nest', generators: { nest } };
