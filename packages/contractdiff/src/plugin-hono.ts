/**
 * The built-in `hono` target (apicontract-servers R1–R7): a typed route table and
 * `registerRoutes(app, handlers)`, which validates every request and every answer, from an OpenAPI
 * document; a `handlers.ts` the user owns, written once; and a contract test per operation, which
 * calls the app with `app.request`. Hono is the user's dependency, never contractdiff's.
 *
 * Options: `validators` and `types`, the import paths of the `validator` and `types` targets'
 * output, and `testRunner`. The shared generator is `plugin-server-router.ts`.
 */
import { type Contract } from './core/model.js';
import { type Generator, type GeneratorResult, type Options, type Plugin } from './host.js';
import { read } from './openapi.js';
import { colonPath } from './plugin-server-code.js';
import { SERVER_OPTIONS } from './plugin-server-contract.js';
import { type Framework, runRouter } from './plugin-server-router.js';
import { SAMPLE_DOCUMENT } from './plugin-server-sample.js';

export const HONO: Framework = {
  target: 'hono',
  name: 'Hono',
  path: colonPath,
  imports: ["import { type Env, type Hono } from 'hono';"],
  register: [
    '/** Register every route on `app`: each reads and checks the request, calls its handler, and checks what it answers. */',
    'export const registerRoutes = <E extends Env>(app: Hono<E>, handlers: Handlers): void => {',
    '  for (const route of routes) {',
    '    app.on(route.method, route.path, async (c) => {',
    '      const answer = await handle(route, handlers, { path: c.req.param(), query: c.req.queries(), header: c.req.header(), body: route.body === undefined ? undefined : await c.req.text() });',
    '      return new Response(answer.body ?? null, { status: answer.status, headers: answer.headers });',
    '    });',
    '  }',
    '};',
  ],
  usage: 'Serve them with `registerRoutes(app, handlers)` from routes.ts.',
  harness: {
    framework: ["import { Hono } from 'hono';"],
    hooks: [],
    local: ["import { handlers } from './handlers.js';", "import { registerRoutes } from './routes.js';"],
    setup: ['  const app = new Hono();', '  registerRoutes(app, handlers);', ''],
    call: (url, init) => `app.request(${url}, ${init})`,
  },
};

export const run = (contract: Contract, options: Options): GeneratorResult => runRouter(HONO, contract, options);

const hono: Generator = {
  description: 'Hono routes: a generated route table and registerRoutes(app, handlers) that validate requests and responses, handlers you own, and a contract test per operation',
  inputs: ['openapi'],
  options: SERVER_OPTIONS,
  sample: {
    document: SAMPLE_DOCUMENT,
    // The text of every file is pinned by the golden files in `__fixtures__/servers/hono/`.
    files: run(read(SAMPLE_DOCUMENT), {}).files,
  },
  run,
};

export const plugin: Plugin = { name: 'hono', generators: { hono } };
