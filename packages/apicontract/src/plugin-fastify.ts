/**
 * The built-in `fastify` target (apicontract-servers R1–R7): a Fastify plugin, `registerRoutes`,
 * that registers a typed route table and validates every request and every answer, from an OpenAPI
 * document; a `handlers.ts` the user owns, written once; and a contract test per operation, which
 * listens on a free port. Fastify is the user's dependency, never contractdiff's.
 *
 * Validation is the `validator` target's (R2), as in every server target, not Fastify's own: the
 * plugin reads each body as text, so a body the contract refuses answers the same RFC 9457 Problem
 * Details as a refused parameter. Options and the shared generator as `plugin-hono.ts`.
 */
import { type Contract } from './core/model.js';
import { type Generator, type GeneratorResult, type Options, type Plugin } from './host.js';
import { read } from './openapi.js';
import { colonPath } from './plugin-server-code.js';
import { SERVER_OPTIONS } from './plugin-server-contract.js';
import { type Framework, runRouter } from './plugin-server-router.js';
import { SAMPLE_DOCUMENT } from './plugin-server-sample.js';

export const FASTIFY: Framework = {
  target: 'fastify',
  name: 'Fastify',
  path: colonPath,
  imports: ["import { type FastifyPluginAsync } from 'fastify';"],
  register: [
    '/**',
    ' * A Fastify plugin registering every route: each reads and checks the request, calls its handler,',
    ' * and checks what it answers. Inside it every body arrives as text, which `handle` parses.',
    ' */',
    'export const registerRoutes: FastifyPluginAsync<{ readonly handlers: Handlers }> = async (fastify, { handlers }) => {',
    '  fastify.removeAllContentTypeParsers();',
    "  fastify.addContentTypeParser('*', { parseAs: 'string' }, (_request, body, done) => {",
    '    done(null, body);',
    '  });',
    '  for (const route of routes) {',
    '    fastify.route({',
    '      method: route.method,',
    '      url: route.path,',
    '      exposeHeadRoute: false,',
    '      handler: async (request, reply) => {',
    '        const answer = await handle(route, handlers, { path: request.params as Readonly<Record<string, unknown>>, query: request.query as Readonly<Record<string, unknown>>, header: request.headers, body: request.body });',
    '        return reply.code(answer.status).headers(answer.headers).send(answer.body);',
    '      },',
    '    });',
    '  }',
    '};',
  ],
  usage: 'Serve them with `app.register(registerRoutes, { handlers })` from routes.ts.',
  harness: {
    framework: ["import Fastify, { type FastifyInstance } from 'fastify';"],
    hooks: ['afterAll', 'beforeAll'],
    local: ["import { handlers } from './handlers.js';", "import { registerRoutes } from './routes.js';"],
    setup: [
      '  let app: FastifyInstance;',
      '  let base: string;',
      '',
      '  beforeAll(async () => {',
      '    app = Fastify();',
      '    await app.register(registerRoutes, { handlers });',
      "    base = await app.listen({ port: 0, host: '127.0.0.1' });",
      '  });',
      '',
      '  afterAll(async () => {',
      '    await app.close();',
      '  });',
      '',
    ],
    call: (url, init) => `fetch(new URL(${url}, base), ${init})`,
  },
};

export const run = (contract: Contract, options: Options): GeneratorResult => runRouter(FASTIFY, contract, options);

const fastify: Generator = {
  description: 'Fastify routes: a generated plugin that registers every route and validates requests and responses, handlers you own, and a contract test per operation',
  inputs: ['openapi'],
  options: SERVER_OPTIONS,
  sample: {
    document: SAMPLE_DOCUMENT,
    // The text of every file is pinned by the golden files in `__fixtures__/servers/fastify/`.
    files: run(read(SAMPLE_DOCUMENT), {}).files,
  },
  run,
};

export const plugin: Plugin = { name: 'fastify', generators: { fastify } };
