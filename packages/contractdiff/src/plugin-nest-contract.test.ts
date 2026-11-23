import { describe, expect, it } from 'vitest';

import { read } from './openapi.js';
import { contractTest } from './plugin-nest-contract.js';
import { type Route, routesOf } from './plugin-server-routes.js';

const IMPORTS = { validators: './v.js', types: './t.js' };

const only = (paths: unknown): Route => routesOf(read({ openapi: '3.1.0', paths }), 'NestJS').controllers[0]?.routes[0] as Route;

describe('contractTest', () => {
  it('sends the example headers and body, and reads a non-JSON body as text', () => {
    const route = only({
      '/a': {
        post: {
          operationId: 'postA',
          parameters: [
            { name: 'X-Count', in: 'header', example: 2 },
            { name: 'X-Name', in: 'header', example: 'n' },
          ],
          requestBody: { content: { 'application/merge-patch+json': { example: { a: '<b>' } } } },
          responses: { '200': { description: 'a', content: { 'text/plain': { example: 'ok' } } }, '400': { description: 'b', content: { 'application/problem+json': {} } } },
        },
      },
    });
    const text = contractTest(route, IMPORTS, 'vitest');
    expect(text).toContain('import { operations as validators } from "./v.js";\n');
    expect(text).toContain(
      '  "200": { check: validators["postA"]["response:200:text/plain"], json: false },\n  "400": { check: validators["postA"]["response:400:application/problem+json"], json: true },\n',
    );
    expect(text).toContain('describe("postA: POST /a", () => {\n');
    expect(text).toContain(
      '    const response = await fetch(new URL("/a", base), { method: "POST", headers: {"X-Count":"2","X-Name":"n","content-type":"application/merge-patch+json"}, body: "{\\"a\\":\\"\\u003Cb\\u003E\\"}" });\n',
    );
  });

  it('imports no validators when no response has content', () => {
    const text = contractTest(only({ '/a': { delete: { operationId: 'a', responses: { '204': { description: 'gone' } } } } }), IMPORTS, 'jest');
    expect(text).not.toContain('validators');
    expect(text).toContain("import { afterAll, beforeAll, describe, it } from '@jest/globals';\n\nimport { ApiModule } from './api.module.js';\n\n");
    expect(text).toContain('  "204": undefined,\n};\n');
    expect(text).toContain('{ method: "DELETE", headers: {} }');
  });
});
