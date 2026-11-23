import { describe, expect, it } from 'vitest';

import { read } from './openapi.js';
import { exampleUrl, runnerImport, serverOptions } from './plugin-server-contract.js';
import { type Route, routesOf } from './plugin-server-routes.js';
import { UsageError } from './run-config.js';

const only = (paths: unknown): Route => routesOf(read({ openapi: '3.1.0', paths }), 'Hono').controllers[0]?.routes[0] as Route;

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

describe('runnerImport', () => {
  it('imports describe, it and the hooks used, under the names each runner gives them', () => {
    expect(runnerImport('vitest', ['afterAll', 'beforeAll'])).toBe("import { afterAll, beforeAll, describe, it } from 'vitest';");
    expect(runnerImport('node', ['afterAll', 'beforeAll'])).toBe("import { after as afterAll, before as beforeAll, describe, it } from 'node:test';");
    expect(runnerImport('jest', [])).toBe("import { describe, it } from '@jest/globals';");
  });
});

const refusal = (options: Record<string, unknown>): string => {
  try {
    serverOptions('hono', options);
  } catch (error) {
    expect(error).toBeInstanceOf(UsageError);
    return (error as Error).message;
  }
  throw new Error('expected a refusal');
};

describe('serverOptions', () => {
  it('defaults every option, and keeps the ones given', () => {
    expect(serverOptions('hono', {})).toEqual({ validators: './validators.js', types: './types.js', testRunner: 'vitest' });
    expect(serverOptions('hono', { validators: './v.js', types: './t.js', testRunner: 'jest' })).toEqual({ validators: './v.js', types: './t.js', testRunner: 'jest' });
  });

  it('refuses a runner it cannot write for, and an import path that is not one, naming the target, with a fix line', () => {
    expect(refusal({ testRunner: 'mocha' })).toBe('hono: testRunner is "mocha". fix: set `testRunner` to one of vitest, node, jest');
    expect(refusal({ validators: '' })).toBe('hono: `validators` is not an import path. fix: set it to where the validator target writes, e.g. "./validators.js"');
    expect(refusal({ types: 3 })).toBe('hono: `types` is not an import path. fix: set it to where the types target writes, e.g. "./types.js"');
  });
});
