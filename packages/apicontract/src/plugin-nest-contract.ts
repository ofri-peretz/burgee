/**
 * Two more files `gen nest` writes, both generated: `contract-runtime.ts`, what every base
 * controller calls to validate a request and a response and to answer RFC 9457 Problem Details;
 * and one `<operation>.contract.test.ts` per operation (apicontract-servers R6), which boots the
 * module, calls the route with the spec's example and asserts the answer is one the spec declares.
 */
import { type Imports, lines, literal } from './plugin-nest-code.js';
import { type Route } from './plugin-nest-routes.js';

/** The test runners a contract test can be written for. */
export const RUNNERS = ['vitest', 'node', 'jest'] as const;
export type Runner = (typeof RUNNERS)[number];

const RUNNER_IMPORTS: Readonly<Record<Runner, string>> = {
  vitest: "import { afterAll, beforeAll, describe, it } from 'vitest';",
  node: "import { after as afterAll, before as beforeAll, describe, it } from 'node:test';",
  jest: "import { afterAll, beforeAll, describe, it } from '@jest/globals';",
};

/** `contract-runtime.ts`: the same for every spec. */
export const RUNTIME = lines(
  '/**',
  ' * What every generated controller calls: coercion of path, query and header strings, validation',
  ' * of the request and the response, and RFC 9457 Problem Details for a request the contract refuses.',
  ' */',
  '',
  "/** What a reply offers: Express's `Response` and Fastify's `FastifyReply` both do. */",
  'export interface Reply {',
  '  status(code: number): unknown;',
  '  header(name: string, value: string): unknown;',
  '}',
  '',
  '/** A validator the `validator` target generated. */',
  'export type Check = (value: unknown) => boolean;',
  '',
  '/** One error in a Problem Details answer: where in the request, and what is wrong there. */',
  'export interface ProblemError {',
  '  readonly pointer: string;',
  '  readonly detail: string;',
  '}',
  '',
  '/** RFC 9457 Problem Details, answered as `application/problem+json`. */',
  'export interface ProblemDetails {',
  '  readonly type: string;',
  '  readonly title: string;',
  '  readonly status: number;',
  '  readonly detail: string;',
  '  readonly errors?: readonly ProblemError[];',
  '}',
  '',
  '/** One part of the request, and the validator the contract gives it. */',
  'export interface Field {',
  '  readonly pointer: string;',
  '  readonly value: unknown;',
  '  readonly required: boolean;',
  '  readonly check: Check;',
  '}',
  '',
  '/** A declared response: its media type and validator, both absent when it has no content. */',
  'export interface Declared {',
  '  readonly media?: string;',
  '  readonly check?: Check;',
  '}',
  '',
  '/** What a handler returns. */',
  'export interface Output {',
  '  readonly status: number;',
  '  readonly body?: unknown;',
  '  readonly headers?: Readonly<Record<string, string>>;',
  '}',
  '',
  'const number = (value: unknown): unknown => {',
  "  if (typeof value !== 'string' || value.trim() === '') return value;",
  '  const parsed = Number(value);',
  '  return Number.isNaN(parsed) ? value : parsed;',
  '};',
  '',
  'const boolean = (value: unknown): unknown => {',
  "  if (value === 'true') return true;",
  "  return value === 'false' ? false : value;",
  '};',
  '',
  '/** A string from the URL or a header as the contract types it: `number`, `boolean`, `string`, or a list of one (`number[]`). */',
  'export const coerce = (value: unknown, kind: string): unknown => {',
  '  if (value === undefined) return undefined;',
  "  if (kind.endsWith('[]')) return (Array.isArray(value) ? value : [value]).map((item) => coerce(item, kind.slice(0, -2)));",
  "  if (kind === 'number') return number(value);",
  "  return kind === 'boolean' ? boolean(value) : value;",
  '};',
  '',
  '/** Every part of the request the contract refuses: a missing required part, or a value its validator rejects. */',
  'export const invalid = (fields: readonly Field[]): ProblemError[] =>',
  '  fields.flatMap((field): ProblemError[] => {',
  "    if (field.value === undefined) return field.required ? [{ pointer: field.pointer, detail: 'is required' }] : [];",
  "    return field.check(field.value) ? [] : [{ pointer: field.pointer, detail: 'does not match the contract' }];",
  '  });',
  '',
  '/** Answer Problem Details. */',
  'export const problem = (reply: Reply, status: number, title: string, detail: string, errors?: readonly ProblemError[]): ProblemDetails => {',
  '  reply.status(status);',
  "  reply.header('content-type', 'application/problem+json');",
  "  return { type: 'about:blank', title, status, detail, ...(errors === undefined ? {} : { errors }) };",
  '};',
  '',
  '/** The declared response a status answers under: its own code, then its range (`4XX`), then `default`. */',
  'export const declared = (responses: Readonly<Record<string, Declared>>, status: number): Declared | undefined =>',
  '  responses[String(status)] ?? responses[`${String(status).charAt(0)}XX`] ?? responses.default;',
  '',
  '/** Send what a handler returned. One the contract does not declare is not sent: the client gets a 500. */',
  'export const send = (reply: Reply, output: Output, responses: Readonly<Record<string, Declared>>): unknown => {',
  '  const response = declared(responses, output.status);',
  '  if (response === undefined || (response.check !== undefined && !response.check(output.body))) {',
  "    return problem(reply, 500, 'Internal Server Error', `The handler answered ${String(output.status)} with a response the contract does not declare.`);",
  '  }',
  '  reply.status(output.status);',
  "  if (response.media !== undefined) reply.header('content-type', response.media);",
  '  for (const [name, value] of Object.entries(output.headers ?? {})) reply.header(name, value);',
  '  return output.body;',
  '};',
);

/** The example request as a URL relative to the server: path parameters filled in, query parameters appended. */
export const exampleUrl = (route: Route): string => {
  let path = route.path;
  for (const param of route.params.filter((candidate) => candidate.part === 'path')) path = path.replaceAll(`{${param.name}}`, encodeURIComponent(String(param.example)));
  const query = new URLSearchParams();
  for (const param of route.params.filter((candidate) => candidate.part === 'query')) {
    for (const value of Array.isArray(param.example) ? (param.example as unknown[]) : [param.example]) query.append(param.name, typeof value === 'string' ? value : JSON.stringify(value));
  }
  const search = query.toString();
  return search === '' ? path : `${path}?${search}`;
};

const json = (media: string): boolean => media === 'application/json' || media.endsWith('+json');

/** `<operation>.contract.test.ts`: the route, called with the spec's example, answers a response the spec declares. */
export const contractTest = (route: Route, imports: Imports, runner: Runner): string => {
  const headers = Object.fromEntries(route.params.filter((param) => param.part === 'header').map((param) => [param.name, typeof param.example === 'string' ? param.example : JSON.stringify(param.example)]));
  if (route.body !== undefined) headers['content-type'] = route.body.media;
  const init = [`method: ${literal(route.method.toUpperCase())}`, `headers: ${literal(headers)}`, ...(route.body === undefined ? [] : [`body: ${literal(JSON.stringify(route.body.example))}`])];
  return lines(
    "import assert from 'node:assert/strict';",
    '',
    "import { type INestApplication } from '@nestjs/common';",
    "import { NestFactory } from '@nestjs/core';",
    RUNNER_IMPORTS[runner],
    '',
    "import { ApiModule } from './api.module.js';",
    ...(route.responses.some((response) => response.content !== undefined) ? [`import { operations as validators } from ${literal(imports.validators)};`] : []),
    '',
    '/** Each declared response: its validator, and whether its body is JSON. Absent for a response with no content. */',
    'const responses: Readonly<Record<string, { readonly check: (value: unknown) => boolean; readonly json: boolean } | undefined>> = {',
    ...route.responses.map(({ status, content }) =>
      content === undefined
        ? `  ${literal(status)}: undefined,`
        : `  ${literal(status)}: { check: validators[${literal(route.id)}][${literal(content.payload)}], json: ${String(json(content.media))} },`,
    ),
    '};',
    '',
    `describe(${literal(`${route.name}: ${route.method.toUpperCase()} ${route.path}`)}, () => {`,
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
    "  it('answers the example request with a response the spec declares', async () => {",
    `    const response = await fetch(new URL(${literal(exampleUrl(route))}, base), { ${init.join(', ')} });`,
    '    const status = String(response.status);',
    "    const key = [status, `${status.charAt(0)}XX`, 'default'].find((candidate) => candidate in responses);",
    '    assert.ok(key !== undefined, `the route answered ${status}, which the spec does not declare`);',
    '    const declared = responses[key];',
    '    const text = await response.text();',
    '    if (declared === undefined) return;',
    '    assert.ok(declared.check(declared.json ? JSON.parse(text) : text), `the route answered ${status} with a body the spec does not declare: ${text}`);',
    '  });',
    '});',
  );
};
