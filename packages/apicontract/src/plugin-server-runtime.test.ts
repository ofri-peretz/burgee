import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import { scratchDirs } from './__fixtures__/run/scratch-dir.js';
import { ROUTER_RUNTIME, RUNTIME } from './plugin-server-runtime.js';

const scratch = scratchDirs();
const even = (value: unknown): boolean => value === 2;

/** The generated text, written to disk and loaded as a user's server loads it. */
const load = async <T>(text: string): Promise<T> => {
  const file = join(scratch('apicontract-server-runtime-'), 'contract-runtime.ts');
  writeFileSync(file, text);
  // eslint-disable-next-line node-security/no-dynamic-dependency-loading -- the point of the test: the generated runtime as written to disk, loaded as a user's server loads it
  return (await import(pathToFileURL(file).href)) as T;
};

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
    runtime = await load<Runtime>(RUNTIME);
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

/** A request to `PUT /pets/2?tags=2&tags=4` with `X-Two: 2` and a JSON body, as a framework hands it over. */
const request = (overrides: Record<string, unknown> = {}) => ({ path: { pet_id: '2' }, query: { tags: ['2', '4'] }, header: { 'x-two': '2' }, body: '{"name":"Rex"}', ...overrides });

describe('contract-runtime.ts for a route table', () => {
  interface Answer {
    status: number;
    headers: Record<string, string>;
    body: string | undefined;
  }
  interface Router {
    handle: (route: unknown, handlers: unknown, request: { path: Record<string, unknown>; query: Record<string, unknown>; header: Record<string, unknown>; body: unknown }) => Promise<Answer>;
  }
  let router: Router;
  const json = { media: 'application/json', check: (value: unknown): boolean => typeof value === 'object' && value !== null && 'id' in value };
  const route = {
    operation: 'putPet',
    method: 'put',
    path: '/pets/:pet_id',
    params: [
      { part: 'path', name: 'pet-id', key: 'pet_id', kind: 'number', required: true, check: even },
      { part: 'query', name: 'tags', key: 'tags', kind: 'number[]', required: false, check: Array.isArray },
      { part: 'header', name: 'X-Two', key: 'x-two', kind: 'number', required: false, check: even },
    ],
    body: { media: 'application/json', required: true, check: (value: unknown): boolean => typeof value === 'object' && value !== null },
    responses: { '200': json, '204': {}, '400': { media: 'application/problem+json' }, '418': { media: 'text/plain', check: (): boolean => true } },
  };
  const calls: unknown[] = [];
  const handlers = (output: unknown) => ({
    putPet(this: unknown, input: unknown) {
      calls.push({ self: this, input });
      return Promise.resolve(output);
    },
  });

  beforeAll(async () => {
    expect(ROUTER_RUNTIME.startsWith(`${RUNTIME}\n`)).toBe(true);
    router = await load<Router>(ROUTER_RUNTIME);
  });

  it('reads and coerces every part, parses the body, calls the handler on its object, and sends a declared answer as JSON', async () => {
    calls.length = 0;
    const own = handlers({ status: 200, body: { id: 2 }, headers: { etag: '"1"' } });
    expect(await router.handle(route, own, request())).toEqual({ status: 200, headers: { 'content-type': 'application/json', etag: '"1"' }, body: '{"id":2}' });
    expect(calls).toEqual([{ self: own, input: { path: { 'pet-id': 2 }, query: { tags: [2, 4] }, header: { 'X-Two': 2 }, body: { name: 'Rex' } } }]);
  });

  it('takes the first of a repeated value the parameter does not list, and keeps a body a parser already read', async () => {
    calls.length = 0;
    await router.handle(route, handlers({ status: 204 }), request({ path: { pet_id: ['2', '3'] }, query: {}, header: {}, body: { name: 'parsed' } }));
    expect(calls).toEqual([{ self: expect.anything() as unknown, input: { path: { 'pet-id': 2 }, query: { tags: undefined }, header: { 'X-Two': undefined }, body: { name: 'parsed' } } }]);
  });

  it('answers 400 Problem Details for a part the contract refuses, a missing body and a body that is not JSON', async () => {
    const refused = await router.handle(route, handlers({ status: 204 }), request({ path: { pet_id: '3' } }));
    expect(refused.status).toBe(400);
    expect(refused.headers).toEqual({ 'content-type': 'application/problem+json' });
    expect(JSON.parse(refused.body ?? '')).toEqual({ type: 'about:blank', title: 'Bad Request', status: 400, detail: 'The request does not match the contract.', errors: [{ pointer: '/path/pet-id', detail: 'does not match the contract' }] });
    const empty = await router.handle(route, handlers({ status: 204 }), request({ body: '' }));
    expect(JSON.parse(empty.body ?? '')).toMatchObject({ status: 400, errors: [{ pointer: '/body', detail: 'is required' }] });
    const malformed = await router.handle(route, handlers({ status: 204 }), request({ body: '{' }));
    expect(malformed.status).toBe(400);
    expect(JSON.parse(malformed.body ?? '')).toEqual({ type: 'about:blank', title: 'Bad Request', status: 400, detail: 'The request does not match the contract.', errors: [{ pointer: '/body', detail: 'is not JSON' }] });
  });

  it('sends no body without content, text as itself, and a 500 for an answer the contract does not declare', async () => {
    expect(await router.handle(route, handlers({ status: 204, body: 'ignored' }), request())).toEqual({ status: 204, headers: {}, body: undefined });
    expect(await router.handle(route, handlers({ status: 418, body: 'short and stout' }), request())).toEqual({ status: 418, headers: { 'content-type': 'text/plain' }, body: 'short and stout' });
    expect((await router.handle(route, handlers({ status: 418, body: { a: 1 } }), request())).body).toBe('{"a":1}');
    expect((await router.handle(route, handlers({ status: 418 }), request())).body).toBeUndefined();
    const wrong = await router.handle(route, handlers({ status: 200, body: 'no id' }), request());
    expect(wrong.status).toBe(500);
    expect(JSON.parse(wrong.body ?? '')).toEqual({ type: 'about:blank', title: 'Internal Server Error', status: 500, detail: 'The handler answered 200 with a response the contract does not declare.' });
  });

  it('reads a text body as text, and no body at all for a route that declares none', async () => {
    calls.length = 0;
    const text = { ...route, params: [], body: { media: 'text/plain', required: true, check: (value: unknown): boolean => value === '{' } };
    expect((await router.handle(text, handlers({ status: 204 }), request({ body: '{' }))).status).toBe(204);
    const bodiless = { ...route, params: [], body: undefined };
    expect((await router.handle(bodiless, handlers({ status: 204 }), request({ body: '{' }))).status).toBe(204);
    expect(calls.map((call) => (call as { input: unknown }).input)).toEqual([{ body: '{' }, {}]);
  });

  it('answers a JSON string as JSON', async () => {
    const strings = { ...route, params: [], body: undefined, responses: { '200': { media: 'application/json', check: (): boolean => true } } };
    expect((await router.handle(strings, handlers({ status: 200, body: 'x' }), request())).body).toBe('"x"');
  });
});
