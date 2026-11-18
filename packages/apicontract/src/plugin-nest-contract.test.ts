import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import { scratchDirs } from './__fixtures__/run/scratch-dir.js';
import { read } from './openapi.js';
import { contractTest, exampleUrl, RUNTIME } from './plugin-nest-contract.js';
import { type Route, routesOf } from './plugin-nest-routes.js';

const scratch = scratchDirs();
const even = (value: unknown): boolean => value === 2;
const IMPORTS = { validators: './v.js', types: './t.js' };

const only = (paths: unknown): Route => routesOf(read({ openapi: '3.1.0', paths })).controllers[0]?.routes[0] as Route;

describe('exampleUrl', () => {
  it('fills the path parameters and appends the query, a list as repeated parameters', () => {
    const route = only({
      '/a/{id}/b/{id2}': {
        get: {
          operationId: 'a',
          parameters: [
            { name: 'id', in: 'path', example: 'x y' },
            { name: 'id2', in: 'path', example: 2 },
            { name: 'tags', in: 'query', example: ['p', 'q'] },
            { name: 'filter', in: 'query', example: { k: 1 } },
            { name: 'h', in: 'header', example: 'not in the url' },
          ],
          responses: {},
        },
      },
    });
    expect(exampleUrl(route)).toBe('/a/x%20y/b/2?tags=p&tags=q&filter=%7B%22k%22%3A1%7D');
    expect(exampleUrl(only({ '/a': { get: { operationId: 'a', responses: {} } } }))).toBe('/a');
    // Only a path parameter fills a template, even when a query parameter has its name.
    expect(exampleUrl(only({ '/a/{x}': { get: { operationId: 'a', parameters: [{ name: 'x', in: 'query', example: 'q' }], responses: {} } } }))).toBe('/a/{x}?x=q');
  });
});

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

describe('contract-runtime.ts', () => {
  interface Runtime {
    coerce: (value: unknown, kind: string) => unknown;
    invalid: (fields: readonly { pointer: string; value: unknown; required: boolean; check: (value: unknown) => boolean }[]) => unknown[];
    problem: (reply: Reply, status: number, title: string, detail: string, errors?: unknown[]) => unknown;
    declared: (responses: Record<string, unknown>, status: number) => unknown;
    send: (reply: Reply, output: { status: number; body?: unknown; headers?: Record<string, string> }, responses: Record<string, unknown>) => unknown;
  }
  interface Reply {
    status: (code: number) => unknown;
    header: (name: string, value: string) => unknown;
    calls: string[];
  }
  let runtime: Runtime;
  const reply = (): Reply => {
    const calls: string[] = [];
    return { calls, status: (code) => calls.push(`status ${String(code)}`), header: (name, value) => calls.push(`${name}: ${value}`) };
  };

  beforeAll(async () => {
    const file = join(scratch('apicontract-nest-runtime-'), 'contract-runtime.ts');
    writeFileSync(file, RUNTIME);
    // eslint-disable-next-line node-security/no-dynamic-dependency-loading -- the point of the test: the generated runtime as written to disk, loaded as a user's server loads it
    runtime = (await import(pathToFileURL(file).href)) as Runtime;
  });

  it('coerces strings from the URL and headers to the kinds the contract types', () => {
    const { coerce } = runtime;
    expect(coerce(undefined, 'number')).toBeUndefined();
    expect(coerce('42', 'number')).toBe(42);
    expect(coerce('4x', 'number')).toBe('4x');
    expect(coerce(' ', 'number')).toBe(' ');
    expect(coerce(7, 'number')).toBe(7);
    expect(coerce('true', 'boolean')).toBe(true);
    expect(coerce('false', 'boolean')).toBe(false);
    expect(coerce('yes', 'boolean')).toBe('yes');
    expect(coerce('1', 'string')).toBe('1');
    expect(coerce('1', 'number[]')).toEqual([1]);
    expect(coerce(['1', 'true'], 'boolean[]')).toEqual(['1', true]);
  });

  it('lists a missing required part and a rejected value, and nothing for a missing optional one', () => {
    expect(
      runtime.invalid([
        { pointer: '/a', value: undefined, required: true, check: even },
        { pointer: '/b', value: undefined, required: false, check: even },
        { pointer: '/c', value: 3, required: false, check: even },
        { pointer: '/d', value: 2, required: true, check: even },
      ]),
    ).toEqual([
      { pointer: '/a', detail: 'is required' },
      { pointer: '/c', detail: 'does not match the contract' },
    ]);
  });

  it('answers Problem Details, with errors only when there are some', () => {
    const answer = reply();
    expect(runtime.problem(answer, 400, 'Bad Request', 'no', [{ pointer: '/a' }])).toEqual({ type: 'about:blank', title: 'Bad Request', status: 400, detail: 'no', errors: [{ pointer: '/a' }] });
    expect(answer.calls).toEqual(['status 400', 'content-type: application/problem+json']);
    expect(runtime.problem(reply(), 500, 'x', 'y')).toStrictEqual({ type: 'about:blank', title: 'x', status: 500, detail: 'y' });
  });

  it('finds the declared response by code, then range, then default', () => {
    const responses = { '200': 'ok', '4XX': 'client', default: 'any' };
    expect(runtime.declared(responses, 200)).toBe('ok');
    expect(runtime.declared(responses, 404)).toBe('client');
    expect(runtime.declared(responses, 503)).toBe('any');
    expect(runtime.declared({ '200': 'ok' }, 201)).toBeUndefined();
  });

  it('sends a declared response with its media type and headers, and a 500 for one the contract does not declare', () => {
    const json = { media: 'application/json', check: (value: unknown): boolean => value === 'good' };
    const sent = reply();
    expect(runtime.send(sent, { status: 200, body: 'good', headers: { etag: '1' } }, { '200': json })).toBe('good');
    expect(sent.calls).toEqual(['status 200', 'content-type: application/json', 'etag: 1']);
    const empty = reply();
    expect(runtime.send(empty, { status: 204 }, { '204': {} })).toBeUndefined();
    expect(empty.calls).toEqual(['status 204']);
    const wrong = reply();
    expect(runtime.send(wrong, { status: 200, body: 'bad' }, { '200': json })).toEqual({
      type: 'about:blank',
      title: 'Internal Server Error',
      status: 500,
      detail: 'The handler answered 200 with a response the contract does not declare.',
    });
    expect(wrong.calls).toEqual(['status 500', 'content-type: application/problem+json']);
    expect(runtime.send(reply(), { status: 418 }, { '200': json })).toMatchObject({ status: 500, detail: 'The handler answered 418 with a response the contract does not declare.' });
  });
});
