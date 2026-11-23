import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { checkPlugin, createHost, type Plugin, validate } from './host.js';
import { builtinAdapters } from './inputs.js';
import { read } from './openapi.js';
import { EXPRESS, plugin as express, run as runExpress } from './plugin-express.js';
import { FASTIFY, plugin as fastify, run as runFastify } from './plugin-fastify.js';
import { HONO, plugin as hono, run as runHono } from './plugin-hono.js';
import { type Framework, handlersFile, routesFile, runRouter } from './plugin-server-router.js';
import { SAMPLE_DOCUMENT } from './plugin-server-sample.js';
import { builtins } from './plugins.js';
import { UsageError } from './run-config.js';

interface Target {
  readonly name: string;
  readonly plugin: Plugin;
  readonly framework: Framework;
  readonly run: typeof runHono;
  readonly description: string;
}

const TARGETS: readonly Target[] = [
  ['hono', hono, HONO, runHono, 'Hono routes: a generated route table and registerRoutes(app, handlers) that validate requests and responses, handlers you own, and a contract test per operation'],
  ['fastify', fastify, FASTIFY, runFastify, 'Fastify routes: a generated plugin that registers every route and validates requests and responses, handlers you own, and a contract test per operation'],
  ['express', express, EXPRESS, runExpress, 'Express 5 routes: a generated router that validates requests and responses per operation, handlers you own, and a contract test per operation'],
].map(([name, plugin, framework, run, description]) => ({ name, plugin, framework, run, description }) as Target);

const SAMPLE_PATHS = ['contract-runtime.ts', 'createPet.contract.test.ts', 'getPet.contract.test.ts', 'getPets.contract.test.ts', 'handlers.ts', 'routes.ts'];

const OPTIONS = { validators: './validators.js', types: './types.js', testRunner: 'vitest' } as const;

describe.each(TARGETS)('the $name plugin', ({ name, plugin, framework, run, description }) => {
  const golden = (path: string): string => readFileSync(new URL(`__fixtures__/servers/${name}/sample/${path}.golden.txt`, import.meta.url), 'utf8');
  const host = () => {
    const created = createHost();
    created.register({ name: 'contractdiff', adapters: builtinAdapters });
    created.register(plugin);
    return created;
  };

  it('is a built-in plugin the host accepts, reading OpenAPI', () => {
    expect(() => validate(plugin)).not.toThrow();
    expect(builtins).toContain(plugin);
    expect(plugin.name).toBe(name);
    expect(framework.target).toBe(name);
    expect(plugin.generators?.[name]?.inputs).toEqual(['openapi']);
    expect(plugin.generators?.[name]?.description).toBe(description);
    expect(plugin.generators?.[name]?.options).toEqual({
      validators: { type: 'string', description: 'import path of the `validator` target\'s output; default "./validators.js"' },
      types: { type: 'string', description: 'import path of the `types` target\'s output; default "./types.js"' },
      testRunner: { type: 'string', choices: ['vitest', 'node', 'jest'], description: 'the runner the contract tests import: vitest (default), node or jest' },
    });
  });

  it('produces exactly its sample, on every run', async () => {
    expect(await checkPlugin(plugin)).toEqual([]);
    expect(plugin.generators?.[name]?.sample.document).toBe(SAMPLE_DOCUMENT);
  });

  it('writes the sample byte for byte as the golden files hold it, sorted by path, the handlers as the user’s', async () => {
    const { files, findings } = await host().run(name, SAMPLE_DOCUMENT);
    expect(files.map((file) => file.path)).toEqual(SAMPLE_PATHS);
    for (const file of files) expect(file.content, file.path).toBe(golden(file.path));
    expect(files.filter((file) => file.owner === 'user').map((file) => file.path)).toEqual(['handlers.ts']);
    // The member the user owns for each operation, so a rule on code can find it through the map.
    expect(files.find((file) => file.path === 'handlers.ts')?.symbols).toEqual([
      { operation: 'createPet', symbol: 'handlers.createPet' },
      { operation: 'get /pets', symbol: 'handlers.getPets' },
      { operation: 'getPet', symbol: 'handlers.getPet' },
    ]);
    expect(files.find((file) => file.path === 'routes.ts')?.symbols).toEqual([
      { operation: 'createPet', symbol: 'Handlers' },
      { operation: 'get /pets', symbol: 'Handlers' },
      { operation: 'getPet', symbol: 'Handlers' },
    ]);
    expect(plugin.generators?.[name]?.sample.files).toEqual(files);
    expect(findings.map((finding) => [finding.code, finding.pointer])).toEqual([
      ['server-example-synthesised', '#/paths/~1pets/get'],
      ['server-problem-undeclared', '#/paths/~1pets/get'],
      ['server-problem-undeclared', '#/paths/~1pets~1{petId}/get'],
    ]);
  });

  it('refuses a bad option naming the target', () => {
    expect(() => run(read(SAMPLE_DOCUMENT), { testRunner: 'mocha' })).toThrow(new UsageError(`${name}: testRunner is "mocha". fix: set \`testRunner\` to one of vitest, node, jest`));
  });

  it('imports the other targets from the paths the options give, and writes the tests for the runner chosen', () => {
    const { files } = run(read(SAMPLE_DOCUMENT), { validators: '../validate/index.js', types: '../types/api.js', testRunner: 'node' });
    const routes = files.find((file) => file.path === 'routes.ts')?.content ?? '';
    expect(routes).toContain('import { type paths } from "../types/api.js";\nimport { operations as validators } from "../validate/index.js";\n');
    const test = files.find((file) => file.path === 'getPet.contract.test.ts')?.content ?? '';
    expect(test).toContain('import { operations as validators } from "../validate/index.js";\n');
    expect(test).toContain(" from 'node:test';\n");
  });

  it('writes only the runtime for a spec without routes', () => {
    expect(run(read({ openapi: '3.1.0', paths: {} }), {}).files.map((file) => file.path)).toEqual(['contract-runtime.ts']);
  });
});

const spec = (paths: unknown) => read({ openapi: '3.1.0', paths });

describe('runRouter', () => {
  it('names the framework in a finding for an operation it does not route', () => {
    const { findings } = runRouter(HONO, read({ openapi: '3.1.0', paths: { '/a': { trace: { operationId: 'a', responses: {} } } } }), {});
    expect(findings[0]?.message).toBe('`a` is not a route Hono serves (a webhook, or a method the target does not route)');
  });

  it('leaves out a path Hono and Fastify cannot route, with a finding, and routes it through Express', () => {
    const paths = { '/v1/{name}:cancel': { post: { operationId: 'cancel', responses: { '204': { description: 'ok' } } } }, '/a': { get: { operationId: 'a', responses: {} } } };
    for (const framework of [HONO, FASTIFY]) {
      const { files, findings } = runRouter(framework, spec(paths), {});
      expect(files.map((file) => file.path)).toEqual(['a.contract.test.ts', 'contract-runtime.ts', 'handlers.ts', 'routes.ts']);
      expect(findings).toEqual([
        {
          code: 'server-path-unsupported',
          pointer: '#/paths/~1v1~1{name}:cancel/post',
          message: `\`cancel\` is served at /v1/{name}:cancel, which ${framework.name} cannot route: a parameter must be a whole segment, and a \`:\`, \`*\` or \`?\` cannot be written`,
          fix: 'serve it outside the generated routes, or give it a path the framework can route',
        },
      ]);
    }
    const { files, findings } = runRouter(EXPRESS, spec(paths), {});
    expect(findings).toEqual([]);
    expect(files.find((file) => file.path === 'routes.ts')?.content).toContain('    path: "/v1/:name\\\\:cancel",\n');
  });

  it('registers static segments before parameters, and keeps the spec order otherwise', () => {
    const ok = { '200': { description: 'ok' } };
    const { files } = runRouter(
      HONO,
      spec({ '/pets/{id}': { get: { operationId: 'a', responses: ok } }, '/pets/mine': { get: { operationId: 'b', responses: ok } }, '/pets': { get: { operationId: 'c', responses: ok }, put: { operationId: 'd', responses: ok } }, '/pets/{id}/x': { get: { operationId: 'e', responses: ok } }, '/pets/~mine': { get: { operationId: 'f', responses: ok } } }),
      {},
    );
    const routes = files.find((file) => file.path === 'routes.ts')?.content ?? '';
    expect([...routes.matchAll(/ {4}path: "([^"]+)",/gu)].map((match) => match[1])).toEqual(['/pets', '/pets', '/pets/mine', '/pets/~mine', '/pets/:id', '/pets/:id/x']);
    expect([...routes.matchAll(/ {4}operation: "([^"]+)",/gu)].map((match) => match[1])).toEqual(['c', 'd', 'b', 'f', 'a', 'e']);
  });
});

describe('routesFile and handlersFile', () => {
  it('writes a body row, header and path keys as the framework reads them, empty lists, and no validators when nothing is checked', () => {
    const { files } = runRouter(
      EXPRESS,
      spec({
        '/items/{item-id}': {
          patch: {
            operationId: 'patchItem',
            parameters: [
              { name: 'item-id', in: 'path', schema: { type: 'string' }, example: 'x' },
              { name: 'X-Trace', in: 'header', schema: { type: 'string' }, example: 't' },
            ],
            requestBody: { content: { 'text/plain': { schema: { type: 'string' }, example: 'hi' } } },
            responses: { '204': { description: 'done' }, '400': { description: 'no' } },
          },
        },
      }),
      {},
    );
    const routes = files.find((file) => file.path === 'routes.ts')?.content ?? '';
    expect(routes).toContain(
      [
        '    path: "/items/:item_id",',
        '    params: [',
        '      { part: "path", name: "item-id", key: "item_id", kind: "string", required: true, check: validators["patchItem"]["param:path:item-id"] },',
        '      { part: "header", name: "X-Trace", key: "x-trace", kind: "string", required: false, check: validators["patchItem"]["param:header:X-Trace"] },',
        '    ],',
        '    body: { media: "text/plain", required: false, check: validators["patchItem"]["body:text/plain"] },',
        '    responses: {',
        '      "204": {},',
        '      "400": {},',
        '    },',
      ].join('\n'),
    );
    const bare = routesFile(HONO, [{ route: { id: 'a', method: 'head', path: '/a', source: '#', name: 'a', handler: 'handleA', params: [], responses: [] }, path: '/a' }], OPTIONS);
    expect(bare).toContain('import { type paths } from "./types.js";\n\ntype AOperation');
    expect(bare.split('\n').filter((line) => line.startsWith('type') || line.startsWith('import'))).toEqual([
      "import { type Env, type Hono } from 'hono';",
      "import { handle, type Route } from './contract-runtime.js';",
      'import { type paths } from "./types.js";',
      'type AOperation = paths["/a"]["head"];',
    ]);
    expect(bare).toContain('    params: [],\n    responses: {},\n  },\n];\n');
  });

  it('imports the validators for a body alone, and for a response alone', () => {
    const route = { id: 'a', method: 'post', path: '/a', source: '#', name: 'a', handler: 'handleA', params: [], responses: [] };
    expect(routesFile(HONO, [{ route: { ...route, body: { payload: 'body:application/json', media: 'application/json', required: true, example: 1 } }, path: '/a' }], OPTIONS)).toContain('import { operations as validators }');
    expect(routesFile(HONO, [{ route: { ...route, responses: [{ status: '200', content: { media: 'text/plain', payload: 'p', example: 'x' } }] }, path: '/a' }], OPTIONS)).toContain(
      'import { operations as validators }',
    );
  });

  it('imports the validators for one parameter alone, when any one route checks something, and not for a response without content', () => {
    const route = { id: 'a', method: 'get', path: '/a', source: '#', name: 'a', handler: 'handleA', params: [], responses: [{ status: '204' }] };
    expect(routesFile(HONO, [{ route, path: '/a' }], OPTIONS)).not.toContain('validators');
    const param = { name: 'q', part: 'query' as const, payload: 'param:query:q', required: false, kind: 'string', example: 'x' };
    expect(routesFile(HONO, [{ route: { ...route, params: [param] }, path: '/a' }], OPTIONS)).toContain('import { operations as validators }');
    expect(routesFile(HONO, [{ route, path: '/a' }, { route: { ...route, name: 'b', params: [param] }, path: '/a' }], OPTIONS)).toContain('import { operations as validators }');
  });

  it('writes one stub per operation, a blank line between them', () => {
    const route = { id: 'a', method: 'delete', path: '/a', source: '#', name: 'a', handler: 'handleA', params: [], responses: [{ status: '204' }] };
    expect(handlersFile(EXPRESS, [route, { ...route, name: 'b', method: 'get', responses: [] }])).toBe(`/**
 * The handlers the routes call, one per operation. contractdiff wrote this file once and never
 * rewrites it: change it freely. \`Handlers\` (routes.ts, regenerated) declares one method per
 * operation, and the routes validate every request and response; each method here answers the spec's
 * example until you replace it. Serve them with \`app.use(createRouter(handlers))\` from routes.ts.
 */
import { type Handlers } from './routes.js';

export const handlers: Handlers = {
  /** DELETE /a. */
  a(_input) {
    return { status: 204 };
  },

  /** GET /a. */
  b(_input) {
    throw new Error("not implemented");
  },
};
`);
  });
});
