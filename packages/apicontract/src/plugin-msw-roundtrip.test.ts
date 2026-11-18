/**
 * The in-lane round trip (apicontract-clients, success criteria): a local `node:http` server answers
 * from the `msw` target's scenarios, and every fixture operation is called through the `fetch`
 * target's client, once per declared response. Each answer must arrive as the declared branch, and
 * every scenario body must validate against its schema. It is the check that would catch the client
 * and the mocks disagreeing about a route, a status or a body.
 *
 * Generated TypeScript is run by transpiling it with the TypeScript compiler (the client imports
 * only types, and the scenarios nothing). MSW itself is never run: the server reads the scenario data.
 */
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { type AddressInfo } from 'node:net';

 
import { Ajv2020 } from 'ajv/dist/2020.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { generateAll, load, shop } from './__fixtures__/clients/harness.js';
import { read } from './openapi.js';
import { routesOf } from './plugin-fetch-routes.js';
import { type Scenario } from './plugin-msw-files.js';

type Result = { readonly status: number | string; readonly code: number; readonly body: unknown; readonly headers: Headers; readonly errors?: readonly unknown[] };
type Method = (input?: unknown) => Promise<Result>;
interface ClientModule {
  readonly createClient: (options: Record<string, unknown>) => Record<string, Method>;
}

interface Received {
  readonly method: string;
  readonly url: string;
  readonly headers: IncomingMessage['headers'];
  readonly body: string;
}

const routes = routesOf(read(shop)).routes;
const pattern = (path: string): RegExp => new RegExp(`^${path.replaceAll(/\{[^}]+\}/gu, '[^/]+')}(?:\\?|$)`, 'u');

let scenarios: Readonly<Record<string, Readonly<Record<string, Scenario>>>>;
let client: ClientModule;
let server: Server;
let baseUrl: string;
const received: Received[] = [];

/** Answer from the scenarios: the route by method and path, the scenario by `x-scenario` (else the first). */
const answer = (request: IncomingMessage, body: string): { status: number; type?: string | undefined; text: string } => {
  received.push({ method: request.method ?? '', url: request.url ?? '', headers: request.headers, body });
  const wanted = request.headers['x-scenario'];
  if (wanted === 'teapot') return { status: 418, text: 'not json' };
  if (wanted === 'bad-json') return { status: 200, type: 'application/json', text: '{' };
  const route = routes.find((candidate) => candidate.method.toUpperCase() === request.method && pattern(candidate.path).test(request.url ?? ''));
  const byStatus = scenarios[route?.id ?? ''] ?? {};
  const scenario = byStatus[typeof wanted === 'string' ? wanted : (Object.keys(byStatus)[0] ?? '')];
  if (scenario === undefined) return { status: 599, text: '' };
  if (scenario.body === undefined) return { status: scenario.status, text: '' };
  const json = /[/+]json$/u.test(scenario.contentType ?? '');
  return { status: scenario.status, type: scenario.contentType, text: json ? JSON.stringify(scenario.body) : String(scenario.body) };
};

beforeAll(async () => {
  const { files } = await generateAll(shop);
  ({ scenarios } = await load<{ scenarios: typeof scenarios }>(files['scenarios.ts'] as string));
  client = await load<ClientModule>(files['client.ts'] as string);
  server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const { status, type, text } = answer(request, Buffer.concat(chunks).toString('utf8'));
      response.writeHead(status, type === undefined ? {} : { 'content-type': type });
      response.end(text);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}/`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

/** The input each operation is called with. */
const INPUTS: Readonly<Record<string, unknown>> = {
  createPet: { body: { name: 'Rex' } },
  deletePet: { path: { petId: 'p1' } },
  'get /health': undefined,
  getPet: { path: { petId: 'p1' } },
  getPhoto: { path: { petId: 'p1' } },
  listPets: {},
  login: { body: { user: 'ada', password: 'secret' } },
  uploadPhoto: { path: { petId: 'p1' }, body: { caption: 'hi' } },
};

/** The formats the synthesiser writes, checked rather than ignored. */
const formats = {
  date: /^\d{4}-\d{2}-\d{2}$/u,
  'date-time': /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u,
  email: /^[^\s@]+@[^\s@]+$/u,
  uuid: /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/u,
};
const ajv = new Ajv2020({ strict: false, allErrors: true, formats });
const components = (shop as { components: unknown }).components;

const valid = (schema: unknown, body: unknown): boolean => ajv.validate((typeof schema === 'object' ? { ...schema, components } : schema) as boolean | object, body);

const bodyOf = async (result: Result): Promise<unknown> => (result.body instanceof Blob ? result.body.text() : result.body);

describe('the fetch client against a server answering from the msw scenarios', () => {
  it('has a scenario for every declared response of every fixture operation', () => {
    expect(Object.keys(scenarios)).toEqual(routes.map((route) => route.id));
    expect(Object.keys(INPUTS)).toEqual(routes.map((route) => route.id));
    for (const route of routes) expect(Object.keys(scenarios[route.id] ?? {})).toEqual(route.responses.map((response) => response.key));
  });

  it('round-trips every scenario of every operation as its declared branch, with a body that validates against its schema', async () => {
    let checked = 0;
    for (const route of routes) {
      for (const response of route.responses) {
        const scenario = scenarios[route.id]?.[response.key] as Scenario;
        const call = client.createClient({ baseUrl, headers: { 'x-scenario': response.key } })[route.id] as Method;
        const result = await call(INPUTS[route.id]);
        const where = `${route.id} ${response.key}`;
        expect(result.status, where).toBe(/^\d+$/u.test(response.key) ? Number(response.key) : response.key);
        expect(result.code, where).toBe(scenario.status);
        expect(await bodyOf(result), where).toEqual(scenario.body);
        const [media] = response.media;
        if (media !== undefined) expect(valid(media.schema, scenario.body), `${where}: ${ajv.errorsText()}`).toBe(true);
        checked += 1;
      }
    }
    expect(checked).toBe(11);
  });

  it('sends path, query, header and cookie parameters as their styles say', async () => {
    const api = client.createClient({ baseUrl: `${baseUrl}//`, headers: { 'x-scenario': '200' } });
    await api.listPets?.({
      query: { tags: ['a b', 'c'], ids: [1, 2], sort: ['name', '-age'], near: [1.5, 2], filter: { status: 'sold', gone: undefined }, page: { size: 10, after: 'x/y' } },
      header: { 'X-Request-Id': 'r-1' },
      cookie: { session: 's 1' },
    });
    const sent = received.at(-1) as Received;
    expect(sent.url).toBe('/pets?tags=a%20b&tags=c&ids=1,2&sort=name|-age&near=1.5%202&filter%5Bstatus%5D=sold&size=10&after=x%2Fy');
    expect(sent.headers['x-request-id']).toBe('r-1');
    expect(sent.headers.cookie).toBe('session=s%201');
    await api.getPet?.({ path: { petId: 'a/b c' } });
    expect(received.at(-1)?.url).toBe('/pets/a%2Fb%20c');
  });

  it('sends a JSON body, a form body and a multipart body by the media type the operation declares', async () => {
    const api = client.createClient({ baseUrl });
    await api.createPet?.({ body: { name: 'Rex' } });
    expect(received.at(-1)).toMatchObject({ method: 'POST', body: '{"name":"Rex"}', headers: { 'content-type': 'application/json' } });
    await api.login?.({ body: { user: 'ada', password: 's&cret' } });
    expect(received.at(-1)).toMatchObject({ body: 'user=ada&password=s%26cret', headers: { 'content-type': 'application/x-www-form-urlencoded' } });
    await api.uploadPhoto?.({ path: { petId: 'p1' }, body: { caption: 'hi', file: new Blob(['PNG']), labels: ['a', 'b'], meta: { x: 1 } } });
    const sent = received.at(-1) as Received;
    expect(sent.headers['content-type']).toMatch(/^multipart\/form-data; boundary=/u);
    for (const part of ['name="caption"\r\n\r\nhi', 'name="file"; filename="blob"', 'PNG', 'name="labels"\r\n\r\na', 'name="labels"\r\n\r\nb', 'name="meta"\r\n\r\n{"x":1}']) {
      expect(sent.body).toContain(part);
    }
    await api.uploadPhoto?.({ path: { petId: 'p1' } });
    expect(received.at(-1)?.body).toBe('');
  });

  it('answers an undeclared status, or a body `validate` refuses, as `unexpected`, and never throws', async () => {
    const teapot = await client.createClient({ baseUrl, headers: { 'x-scenario': 'teapot' } }).deletePet?.({ path: { petId: 'p1' } });
    expect(teapot).toMatchObject({ status: 'unexpected', code: 418, body: 'not json' });
    const broken = await client.createClient({ baseUrl, headers: { 'x-scenario': 'bad-json' } }).getPet?.({ path: { petId: 'p1' } });
    expect(broken).toMatchObject({ status: 200, body: '{' });
    const checks: unknown[] = [];
    const validate = (check: unknown): unknown[] => {
      checks.push(check);
      return ['no'];
    };
    const refused = await client.createClient({ baseUrl, validate, headers: { 'x-scenario': '200' } }).listPets?.();
    expect(refused).toMatchObject({ status: 'unexpected', code: 200, errors: ['no'] });
    expect(checks).toEqual([{ operation: 'listPets', status: '200', body: scenarios.listPets?.['200']?.body }]);
    const accepted = await client.createClient({ baseUrl, validate: () => [], headers: { 'x-scenario': '200' } }).listPets?.();
    expect(accepted?.status).toBe(200);
  });

  it('calls the fetch it is given', async () => {
    const calls: [string, RequestInit][] = [];
    const fetch = async (url: string, init: RequestInit): Promise<Response> => {
      calls.push([url, init]);
      return new Response(null, { status: 204 });
    };
    const result = await client.createClient({ baseUrl: 'https://api.example.com/v1', fetch }).deletePet?.({ path: { petId: 'p1' } });
    expect(result).toMatchObject({ status: 204, code: 204, body: undefined });
    expect(calls.map(([url, init]) => [url, init.method])).toEqual([['https://api.example.com/v1/pets/p1', 'DELETE']]);
  });
});
