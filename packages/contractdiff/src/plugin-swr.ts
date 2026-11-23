/**
 * The built-in `swr` target: `swr.ts`, a `{ key, fetcher }` pair for `useSWR` for every `GET` and
 * `HEAD` operation and one for `useSWRMutation` for every other, over the `fetch` target's client,
 * imported by the path option `client` (default `./client.js`). Keys are built as the
 * `tanstack-query` target builds them, so the same input in any property order is the same key.
 *
 * It imports nothing from SWR: `const { key, fetcher } = getPetSWR(client, input); useSWR(key, fetcher)`.
 * Like the client, a fetcher resolves to the response whatever its status.
 *
 * The body carries no header: the writer adds it.
 */
import { type Contract } from './core/model.js';
import { type Generator, type GeneratorResult, type Options, type Plugin } from './host.js';
import { optional } from './plugin-fetch-client.js';
import { type Route, routesOf } from './plugin-fetch-routes.js';
import { lines, literal } from './plugin-fetch-text.js';
import { document, SAMPLE_SWR } from './plugin-swr-sample.js';
import { camel, QUERY_METHODS, STABLE } from './plugin-tanstack-query.js';

export const SWR_FILE = 'swr.ts';

const symbolOf = (route: Route): string => `${camel(route.name)}${QUERY_METHODS.includes(route.method) ? 'SWR' : 'SWRMutation'}`;

const pair = (route: Route): string[] => {
  const call = `client[${literal(route.id)}]`;
  if (QUERY_METHODS.includes(route.method)) {
    return [
      `export const ${symbolOf(route)} = (client: Client, input: ${route.name}Input${optional(route) ? ' = {}' : ''}) => ({`,
      `  key: [${literal(route.id)}, stable(input)] as const,`,
      `  fetcher: async () => ${call}(input),`,
      '});',
      '',
    ];
  }
  return [
    `export const ${symbolOf(route)} = (client: Client) => ({`,
    `  key: [${literal(route.id)}] as const,`,
    `  fetcher: async (_key: unknown, { arg }: { readonly arg: ${route.name}Input }) => ${call}(arg),`,
    '});',
    '',
  ];
};

/** `swr.ts` for these routes, over the client module at `client`. */
export const swrFile = (routes: readonly Route[], client: string): string =>
  lines(
    `import { ${['type Client', ...routes.map((route) => `type ${route.name}Input`)].join(', ')} } from ${literal(client)};`,
    '',
    ...STABLE,
    '',
    ...routes.flatMap((route) => pair(route)),
  ).replace(/\n\n$/u, '\n');

const run = (contract: Contract, options: Options): GeneratorResult => {
  const { routes, findings } = routesOf(contract);
  const client = typeof options.client === 'string' ? options.client : './client.js';
  const symbols = routes.map((route) => ({ operation: route.id, symbol: symbolOf(route) }));
  return { files: [{ path: SWR_FILE, owner: 'generated', content: swrFile(routes, client), symbols }], findings };
};

const swr: Generator = {
  description: 'SWR keys and fetchers for every operation over the fetch client, with stable keys',
  inputs: ['openapi'],
  sample: { document, files: [{ path: SWR_FILE, owner: 'generated', content: SAMPLE_SWR }] },
  run,
};

export const plugin: Plugin = { name: 'swr', generators: { swr } };
