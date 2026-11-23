/**
 * `gen nest`'s contract tests (apicontract-servers R6), one `<operation>.contract.test.ts` per
 * operation, generated: each boots `ApiModule` with `NestFactory`, calls the route with the spec's
 * example and asserts the answer is one the spec declares. The test itself is every server
 * target's (`plugin-server-contract.ts`); this file says how NestJS starts.
 */
import { type Imports } from './plugin-server-code.js';
import { type Harness, contractTest as serverContractTest, type Runner } from './plugin-server-contract.js';
import { type Route } from './plugin-server-routes.js';

/** How a NestJS contract test starts the application: `ApiModule` on a free port, called with `fetch`. */
export const NEST_HARNESS: Harness = {
  framework: ["import { type INestApplication } from '@nestjs/common';", "import { NestFactory } from '@nestjs/core';"],
  hooks: ['afterAll', 'beforeAll'],
  local: ["import { ApiModule } from './api.module.js';"],
  setup: [
    '  let app: INestApplication;',
    '  let base: string;',
    '',
    '  beforeAll(async () => {',
    '    app = await NestFactory.create(ApiModule, { logger: false });',
    "    await app.listen(0, '127.0.0.1');",
    '    base = await app.getUrl();',
    '  });',
    '',
    '  afterAll(async () => {',
    '    await app.close();',
    '  });',
    '',
  ],
  call: (url, init) => `fetch(new URL(${url}, base), ${init})`,
};

/** `<operation>.contract.test.ts`: the route, called with the spec's example, answers a response the spec declares. */
export const contractTest = (route: Route, imports: Imports, runner: Runner): string => serverContractTest(route, imports, runner, NEST_HARNESS);
