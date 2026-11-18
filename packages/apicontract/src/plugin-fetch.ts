/**
 * The built-in `fetch` target (apicontract-clients R1–R3): `client.ts`, a typed client over the
 * platform `fetch` with no runtime dependency. It is typed from the `types` target's output, which
 * it imports by the path option `types` (default `./types.js`), so run `gen types` beside it.
 *
 * The body carries no header: the writer adds it.
 */
import { type Contract } from './core/model.js';
import { type GeneratedFile, type Generator, type GeneratorResult, type Options, type Plugin } from './host.js';
import { clientFile } from './plugin-fetch-client.js';
import { routesOf } from './plugin-fetch-routes.js';
import { document, SAMPLE_CLIENT } from './plugin-fetch-sample.js';

/** The file the target writes, relative to the output folder. */
export const CLIENT_FILE = 'client.ts';

const run = (contract: Contract, options: Options): GeneratorResult => {
  const { routes, findings } = routesOf(contract);
  const types = typeof options.types === 'string' ? options.types : './types.js';
  const files: GeneratedFile[] = [
    { path: CLIENT_FILE, owner: 'generated', content: clientFile(routes, types), symbols: routes.map((route) => ({ operation: route.id, symbol: route.name })) },
  ];
  return { files, findings };
};

const fetchTarget: Generator = {
  description: 'A typed client over the platform fetch: one method per operation, every response a typed result, nothing thrown on a non-2xx',
  inputs: ['openapi'],
  sample: { document, files: [{ path: CLIENT_FILE, owner: 'generated', content: SAMPLE_CLIENT }] },
  run,
};

export const plugin: Plugin = { name: 'fetch', generators: { fetch: fetchTarget } };
