/**
 * The built-in `express` target (apicontract-servers R1–R7): an Express 5 router, from
 * `createRouter(handlers)`, with validation of every request and every answer per operation, from
 * an OpenAPI document; a `handlers.ts` the user owns, written once; and a contract test per
 * operation, which listens on a free port. A handler that throws or rejects reaches the app's error
 * middleware, as Express 5 passes async errors on. Express is the user's dependency, never
 * contractdiff's.
 *
 * Routes are written as path-to-regexp 8 reads them, its reserved characters escaped. Options and
 * the shared generator as `plugin-hono.ts`.
 */
import { type Contract } from './core/model.js';
import { type Generator, type GeneratorResult, type Options, type Plugin } from './host.js';
import { read } from './openapi.js';
import { routePath } from './plugin-server-code.js';
import { SERVER_OPTIONS } from './plugin-server-contract.js';
import { type Framework, runRouter } from './plugin-server-router.js';
import { SAMPLE_DOCUMENT } from './plugin-server-sample.js';

export const EXPRESS: Framework = {
  target: 'express',
  name: 'Express',
  path: routePath,
  imports: ["import { Router, text } from 'express';"],
  register: [
    '/**',
    ' * An Express 5 router serving every route: each reads and checks the request, calls its handler,',
    ' * and checks what it answers. A body arrives as text, unless a parser before the router read it.',
    ' */',
    'export const createRouter = (handlers: Handlers): Router => {',
    '  const router = Router();',
    '  for (const route of routes) {',
    '    router[route.method](route.path, text({ type: () => true }), async (request, response) => {',
    '      const answer = await handle(route, handlers, { path: request.params, query: request.query, header: request.headers, body: request.body as unknown });',
    '      response.status(answer.status).set(answer.headers);',
    '      if (answer.body === undefined) response.end();',
    '      else response.send(answer.body);',
    '    });',
    '  }',
    '  return router;',
    '};',
  ],
  usage: 'Serve them with `app.use(createRouter(handlers))` from routes.ts.',
  harness: {
    framework: ["import { type Server } from 'node:http';", "import { type AddressInfo } from 'node:net';", '', "import express from 'express';"],
    hooks: ['afterAll', 'beforeAll'],
    local: ["import { handlers } from './handlers.js';", "import { createRouter } from './routes.js';"],
    setup: [
      '  let server: Server;',
      '  let base: string;',
      '',
      '  beforeAll(async () => {',
      '    const app = express();',
      '    app.use(createRouter(handlers));',
      '    server = await new Promise<Server>((resolve) => {',
      "      const listening = app.listen(0, '127.0.0.1', () => resolve(listening));",
      '    });',
      '    base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;',
      '  });',
      '',
      '  afterAll(async () => {',
      '    await new Promise((resolve) => server.close(resolve));',
      '  });',
      '',
    ],
    call: (url, init) => `fetch(new URL(${url}, base), ${init})`,
  },
};

export const run = (contract: Contract, options: Options): GeneratorResult => runRouter(EXPRESS, contract, options);

const express: Generator = {
  description: 'Express 5 routes: a generated router that validates requests and responses per operation, handlers you own, and a contract test per operation',
  inputs: ['openapi'],
  options: SERVER_OPTIONS,
  sample: {
    document: SAMPLE_DOCUMENT,
    // The text of every file is pinned by the golden files in `__fixtures__/servers/express/`.
    files: run(read(SAMPLE_DOCUMENT), {}).files,
  },
  run,
};

export const plugin: Plugin = { name: 'express', generators: { express } };
