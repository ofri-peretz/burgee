/**
 * The built-in `tanstack-query` target (apicontract-clients R4): `queries.ts`, a `queryOptions`-shaped
 * factory for every `GET` and `HEAD` operation and a `mutationOptions`-shaped one for every other,
 * over the `fetch` target's client, which it imports by the path option `client` (default
 * `./client.js`). A query key is the operation id and the input with its object keys sorted, so the
 * same input in any property order is the same key.
 *
 * The factories return plain objects, so the file imports nothing from TanStack and works with every
 * adapter (React, Vue, Solid, Svelte, Angular). Like the client, a query resolves to the response
 * whatever its status: narrow on `status` where it is used.
 *
 * The body carries no header: the writer adds it.
 */
import { type Contract } from './core/model.js';
import { type Generator, type GeneratorResult, type Options, type Plugin } from './host.js';
import { optional } from './plugin-fetch-client.js';
import { type Route, routesOf } from './plugin-fetch-routes.js';
import { lines, literal } from './plugin-fetch-text.js';
import { document, SAMPLE_QUERIES } from './plugin-tanstack-query-sample.js';

export const QUERIES_FILE = 'queries.ts';

export const QUERY_METHODS: readonly string[] = ['get', 'head'];

export const STABLE = [
  '/** A value with its object keys sorted at every depth: the same input in any property order is the same key. */',
  'export const stable = (value: unknown): unknown => {',
  '  if (Array.isArray(value)) return value.map(stable);',
  '  if (typeof value !== "object" || value === null) return value;',
  '  const record = value as Readonly<Record<string, unknown>>;',
  '  return Object.fromEntries(Object.keys(record).sort().map((name) => [name, stable(record[name])]));',
  '};',
];

export const camel = (name: string): string => `${name.charAt(0).toLowerCase()}${name.slice(1)}`;

const factory = (route: Route): string[] => {
  const input = `input: ${route.name}Input${optional(route) ? ' = {}' : ''}`;
  const call = `client[${literal(route.id)}]`;
  if (QUERY_METHODS.includes(route.method)) {
    return [
      `export const ${camel(route.name)}QueryOptions = (client: Client, ${input}) => ({`,
      `  queryKey: [${literal(route.id)}, stable(input)] as const,`,
      `  queryFn: async () => ${call}(input),`,
      '});',
      '',
    ];
  }
  return [
    `export const ${camel(route.name)}MutationOptions = (client: Client) => ({`,
    `  mutationKey: [${literal(route.id)}] as const,`,
    `  mutationFn: async (input: ${route.name}Input) => ${call}(input),`,
    '});',
    '',
  ];
};

/** `queries.ts` for these routes, over the client module at `client`. */
export const queriesFile = (routes: readonly Route[], client: string): string =>
  lines(
    `import { ${['type Client', ...routes.map((route) => `type ${route.name}Input`)].join(', ')} } from ${literal(client)};`,
    '',
    ...STABLE,
    '',
    ...routes.flatMap((route) => factory(route)),
  ).replace(/\n\n$/u, '\n');

const run = (contract: Contract, options: Options): GeneratorResult => {
  const { routes, findings } = routesOf(contract);
  const client = typeof options.client === 'string' ? options.client : './client.js';
  const symbols = routes.map((route) => ({ operation: route.id, symbol: `${camel(route.name)}${QUERY_METHODS.includes(route.method) ? 'Query' : 'Mutation'}Options` }));
  return { files: [{ path: QUERIES_FILE, owner: 'generated', content: queriesFile(routes, client), symbols }], findings };
};

const tanstackQuery: Generator = {
  description: 'TanStack Query options for every operation over the fetch client, with stable query keys',
  inputs: ['openapi'],
  sample: {
    document,
    files: [
      {
        path: QUERIES_FILE,
        owner: 'generated',
        content: SAMPLE_QUERIES,
      },
    ],
  },
  run,
};

export const plugin: Plugin = { name: 'tanstack-query', generators: { 'tanstack-query': tanstackQuery } };
