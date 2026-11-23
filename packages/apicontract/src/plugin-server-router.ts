/**
 * The generator `hono`, `fastify` and `express` share (apicontract-servers R1–R7): a route table
 * the framework registers, a `Handlers` interface the user's `handlers.ts` implements, and a
 * contract test per operation. Each framework gives only what differs ({@link Framework}): how a
 * path is written, how the table is registered, and how its contract test starts a server.
 *
 * Files: `routes.ts` (generated: each route's typed `input` and response union, `Handlers`, the
 * table, and the framework's registration), `handlers.ts` (the user's, written once, each method
 * answering the spec's example), `contract-runtime.ts` (generated: `handle`, validation and RFC
 * 9457 Problem Details) and `<operation>.contract.test.ts`. A new operation is a new member of
 * `Handlers`, so `handlers.ts` stops compiling; nothing of the user's is rewritten.
 */
import { type Contract, type ContractFinding } from './core/model.js';
import { type GeneratedFile, type GeneratorResult, type Options } from './host.js';
import { lines, literal, operationTypes, pascal, readAs, stubResponse, where } from './plugin-server-code.js';
import { contractTest, type Harness, type ServerOptions, serverOptions } from './plugin-server-contract.js';
import { type Route, routesOf } from './plugin-server-routes.js';
import { ROUTER_RUNTIME } from './plugin-server-runtime.js';

/** What one framework writes its own way. */
export interface Framework {
  /** The target's name, in a refusal: `hono`. */
  readonly target: string;
  /** The framework's name, in a finding and a comment: `Hono`. */
  readonly name: string;
  /** The route as the framework reads it, or `undefined` when it cannot be written there. */
  readonly path: (path: string) => string | undefined;
  /** `routes.ts`'s import of the framework. */
  readonly imports: readonly string[];
  /** `routes.ts`'s last lines: what registers the table. */
  readonly register: readonly string[];
  /** How `handlers.ts` is put to use, one sentence. */
  readonly usage: string;
  readonly harness: Harness;
}

/** A route the framework can serve, with its path as the framework reads it. */
interface Served {
  readonly route: Route;
  readonly path: string;
}

/** Static segments before parameters: `/pets/mine` is registered before `/pets/{petId}`, so a router that tries routes in order reaches it. */
const specificity = (served: Served): string => served.route.path.replaceAll(/\{[^}]*\}/gu, '\uFFFF');
/** The routes by specificity, sorted by UTF-16 code unit, each key's routes in the spec's order. */
const bySpecificity = (served: readonly Served[]): Served[] =>
  [...new Set(served.map((entry) => specificity(entry)))].toSorted().flatMap((key) => served.filter((entry) => specificity(entry) === key));

/** One row of the route table. */
const row = (served: Served): string[] => {
  const { route } = served;
  const validator = (payload: string): string => `validators[${literal(route.id)}][${literal(payload)}]`;
  const { body } = route;
  return [
    '  {',
    `    operation: ${literal(route.name)},`,
    `    method: ${literal(route.method)},`,
    `    path: ${literal(served.path)},`,
    ...(route.params.length === 0
      ? ['    params: [],']
      : [
          '    params: [',
          ...route.params.map(
            (param) =>
              `      { part: ${literal(param.part)}, name: ${literal(param.name)}, key: ${literal(readAs(param.part, param.name))}, kind: ${literal(param.kind)}, required: ${String(param.required)}, check: ${validator(param.payload)} },`,
          ),
          '    ],',
        ]),
    ...(body === undefined ? [] : [`    body: { media: ${literal(body.media)}, required: ${String(body.required)}, check: ${validator(body.payload)} },`]),
    ...(route.responses.length === 0
      ? ['    responses: {},']
      : [
          '    responses: {',
          ...route.responses.map(({ status, content }) => `      ${literal(status)}: ${content === undefined ? '{}' : `{ media: ${literal(content.media)}, check: ${validator(content.payload)} }`},`),
          '    },',
        ]),
    '  },',
  ];
};

/** `routes.ts`: the types, `Handlers`, the table and its registration, rewritten every run. */
export const routesFile = (framework: Framework, served: readonly Served[], options: ServerOptions): string => {
  const routes = served.map(({ route }) => route);
  const validated = routes.some((route) => route.params.length > 0 || route.body !== undefined || route.responses.some((response) => response.content !== undefined));
  return lines(
    ...framework.imports,
    '',
    "import { handle, type Route } from './contract-runtime.js';",
    `import { type paths } from ${literal(options.types)};`,
    ...(validated ? [`import { operations as validators } from ${literal(options.validators)};`] : []),
    '',
    ...routes.flatMap((route) => [...operationTypes(route), '']),
    '/**',
    ' * One method per operation; `handlers.ts` implements it. A new operation in the spec is a new',
    ' * member here, so `handlers.ts` stops compiling until it has one.',
    ' */',
    'export interface Handlers {',
    ...routes.map((route) => `  /** ${where(route)}. */\n  ${route.name}(input: ${pascal(route.name)}Input): ${pascal(route.name)}Output | Promise<${pascal(route.name)}Output>;`),
    '}',
    '',
    `/** Every route, as ${framework.name} reads it: the handler it calls, what it reads and checks, and what it may answer. */`,
    'export const routes: readonly Route<Handlers>[] = [',
    ...served.flatMap((entry) => row(entry)),
    '];',
    '',
    ...framework.register,
  );
};

/** `handlers.ts`: the user's handlers, written once, each answering the spec's example. */
export const handlersFile = (framework: Framework, routes: readonly Route[]): string =>
  lines(
    '/**',
    ' * The handlers the routes call, one per operation. apicontract wrote this file once and never',
    ' * rewrites it: change it freely. `Handlers` (routes.ts, regenerated) declares one method per',
    " * operation, and the routes validate every request and response; each method here answers the spec's",
    ` * example until you replace it. ${framework.usage}`,
    ' */',
    "import { type Handlers } from './routes.js';",
    '',
    'export const handlers: Handlers = {',
    ...routes.flatMap((route, index) => [...(index === 0 ? [] : ['']), `  /** ${where(route)}. */`, `  ${route.name}(_input) {`, `    ${stubResponse(route)}`, '  },']),
    '};',
  );

/** Run the generator for `framework`. */
export const runRouter = (framework: Framework, contract: Contract, options: Options): GeneratorResult => {
  const checked = serverOptions(framework.target, options);
  const { controllers, findings } = routesOf(contract, framework.name);
  const served: Served[] = [];
  const unsupported: ContractFinding[] = [];
  for (const route of controllers.flatMap((controller) => controller.routes)) {
    const path = framework.path(route.path);
    if (path === undefined) {
      unsupported.push({
        code: 'server-path-unsupported',
        pointer: route.source,
        message: `\`${route.id}\` is served at ${route.path}, which ${framework.name} cannot route: a parameter must be a whole segment, and a \`:\`, \`*\` or \`?\` cannot be written`,
        fix: 'serve it outside the generated routes, or give it a path the framework can route',
      });
    } else served.push({ route, path });
  }
  const table = bySpecificity(served);
  const routes = table.map(({ route }) => route);
  const files: GeneratedFile[] = [
    { path: 'contract-runtime.ts', owner: 'generated', content: ROUTER_RUNTIME },
    ...(table.length === 0
      ? []
      : [
          { path: 'routes.ts', owner: 'generated' as const, content: routesFile(framework, table, checked), symbols: routes.map((route) => ({ operation: route.id, symbol: 'Handlers' })) },
          {
            path: 'handlers.ts',
            owner: 'user' as const,
            content: handlersFile(framework, routes),
            // The member that answers each operation: `Handlers` (routes.ts) requires it, so its name holds while the file is the user's.
            symbols: routes.map((route) => ({ operation: route.id, symbol: `handlers.${route.name}` })),
          },
        ]),
    ...routes.map((route): GeneratedFile => ({ path: `${route.name}.contract.test.ts`, owner: 'generated', content: contractTest(route, checked, checked.testRunner, framework.harness) })),
  ];
  // Sorted by UTF-16 code unit, the default sort, so every machine and locale agrees.
  const byPath = new Map(files.map((file) => [file.path, file]));
  return { files: [...byPath.keys()].toSorted().map((key) => byPath.get(key) as GeneratedFile), findings: [...findings, ...unsupported] };
};
