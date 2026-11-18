/**
 * The built-in `msw` target (apicontract-clients R5): `scenarios.ts`, a response for every declared
 * status of every operation, and `handlers.ts`, MSW handlers answering from it. Values come from the
 * spec's `example`, then `examples[0]`, then a seeded synthesis over the schema, which is reported
 * as a finding. It reads routes the way the `fetch` target does, so the mocks answer what the client asks.
 *
 * The bodies carry no header: the writer adds it.
 */
import { type Contract } from './core/model.js';
import { type Generator, type GeneratorResult, type Plugin } from './host.js';
import { routesOf } from './plugin-fetch-routes.js';
import { handlersFile, scenariosFile, scenariosOf } from './plugin-msw-files.js';
import { document, SAMPLE_HANDLERS, SAMPLE_SCENARIOS } from './plugin-msw-sample.js';

export const HANDLERS_FILE = 'handlers.ts';
export const SCENARIOS_FILE = 'scenarios.ts';

const run = (contract: Contract): GeneratorResult => {
  const { routes, findings } = routesOf(contract);
  const built = scenariosOf(routes, contract.document);
  const symbols = routes.map((route) => ({ operation: route.id, symbol: route.id }));
  return {
    files: [
      { path: HANDLERS_FILE, owner: 'generated', content: handlersFile(routes), symbols },
      { path: SCENARIOS_FILE, owner: 'generated', content: scenariosFile(built), symbols },
    ],
    findings: [...findings, ...built.findings],
  };
};

const msw: Generator = {
  description: 'MSW handlers and a scenario for every declared response, from the spec’s examples or a seeded synthesis',
  inputs: ['openapi'],
  sample: {
    document,
    files: [
      { path: HANDLERS_FILE, owner: 'generated', content: SAMPLE_HANDLERS },
      { path: SCENARIOS_FILE, owner: 'generated', content: SAMPLE_SCENARIOS },
    ],
  },
  run,
};

export const plugin: Plugin = { name: 'msw', generators: { msw } };
