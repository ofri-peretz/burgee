import { readFileSync } from 'node:fs';

import { parse } from 'seniority/yaml';
import { describe, expect, it } from 'vitest';

import { stableHash } from './command-explain-name.js';
import { type Contract } from './core/model.js';
import { openapi } from './openapi.js';
import { MAX_NAME, MAX_TOOLS, optionsOf, snake, toolNames, toolsOf } from './plugin-mcp-tools.js';

const pets = openapi.read(parse(readFileSync(new URL('__fixtures__/agents/pets.openapi.yaml', import.meta.url), 'utf8')));
const stdio = { transport: 'stdio' } as const;

describe('snake', () => {
  it.each([
    ['listPets', 'list_pets'],
    ['HTTPServer2Go', 'http_server2_go'],
    ['get /pets/{id}', 'get_pets_id'],
    ['__x__', 'x'],
    ['already_snake', 'already_snake'],
    ['{}', 'operation'],
  ])('%s → %s', (id, name) => {
    expect(snake(id)).toBe(name);
  });
});

describe('toolNames', () => {
  it('cuts a long name to 64 characters with the hash of the id, the same on every run', () => {
    const id = `get${'Thing'.repeat(20)}`;
    const name = toolNames([id]).get(id) as string;
    expect(name).toHaveLength(MAX_NAME);
    expect(name.endsWith(`_${stableHash(id)}`)).toBe(true);
    expect(toolNames([id]).get(id)).toBe(name);
  });

  it('gives two ids that snake to one name each their own hash', () => {
    const names = toolNames(['getPet', 'get_pet']);
    expect(names.get('getPet')).toBe(`get_pet_${stableHash('getPet')}`);
    expect(names.get('get_pet')).toBe(`get_pet_${stableHash('get_pet')}`);
  });
});

describe('optionsOf', () => {
  it('defaults to stdio and no include', () => {
    expect(optionsOf({})).toEqual({ transport: 'stdio' });
    expect(optionsOf({ transport: 'http', include: ['a', 'tag:b'] })).toEqual({ transport: 'http', include: ['a', 'tag:b'] });
  });

  it('refuses a transport or an include it cannot use, with a fix', () => {
    expect(() => optionsOf({ transport: 'sse' })).toThrow('mcp: transport is "sse". fix: set `transport` to "stdio" or "http"');
    for (const include of ['a', [''], [1]]) expect(() => optionsOf({ include })).toThrow('fix: set `include` to ids or `tag:<name>` entries');
  });
});

const contract = (content: Record<string, unknown>, required = false): Contract =>
  openapi.read({ openapi: '3.2.0', paths: { '/x': { post: { operationId: 'x', requestBody: { required, content }, responses: { '201': { description: 'ok' } } } } } });
const body = (content: Record<string, unknown>, required?: boolean) => toolsOf(contract(content, required), stdio).tools[0]?.inputSchema;
const responses = (declared: Record<string, unknown>) =>
  toolsOf(openapi.read({ openapi: '3.1.0', paths: { '/x': { get: { operationId: 'x', responses: declared } } } }), stdio).tools[0]?.outputSchema;
const json = (type: string) => ({ description: 'd', content: { 'application/json': { schema: { type } } } });
const many = (count: number) =>
  openapi.read({ openapi: '3.1.0', paths: Object.fromEntries(Array.from({ length: count }, (_, at) => [`/p${String(at)}`, { get: { operationId: `op${String(at)}`, responses: {} } }])) });

describe('toolsOf', () => {
  const tools = toolsOf(pets, stdio);
  const tool = (name: string) => tools.tools.find((candidate) => candidate.name === name);

  it('makes a tool per HTTP operation, read-only for GET', () => {
    expect(tools.tools.map((candidate) => [candidate.name, candidate.annotations.readOnlyHint])).toEqual([
      ['list_pets', true],
      ['create_pet', false],
      ['delete_pet', false],
      ['get_tree', true],
    ]);
  });

  it('groups parameters by location beside the body, and requires what the operation requires', () => {
    expect(tool('list_pets')?.inputSchema).toEqual({
      type: 'object',
      properties: { query: { type: 'object', properties: { limit: { type: 'integer' } } } },
      additionalProperties: false,
    });
    expect(tool('delete_pet')?.inputSchema).toMatchObject({ properties: { path: { required: ['petId'] } }, required: ['path'] });
    expect(tool('create_pet')?.inputSchema).toMatchObject({ properties: { body: { type: 'object', required: ['id'] } }, required: ['body'] });
  });

  it('takes an object response as the output schema and wraps any other under `result`', () => {
    expect(tool('create_pet')?.outputSchema).toMatchObject({ type: 'object', required: ['id'] });
    expect(tool('create_pet')?.route).toEqual({ operationId: 'createPet', method: 'POST', path: '/pets', output: true, wrap: false });
    expect(tool('list_pets')?.outputSchema).toMatchObject({ type: 'object', properties: { result: { type: 'array' } }, required: ['result'] });
    expect(tool('list_pets')?.route.wrap).toBe(true);
    expect(tool('delete_pet')?.outputSchema).toBeUndefined();
    expect(tool('delete_pet')?.route).toMatchObject({ output: false, wrap: false });
  });

  it('describes a tool by its summary and description, else by its route', () => {
    expect(tool('list_pets')).toMatchObject({ title: 'List pets', description: 'List pets' });
    expect(tool('create_pet')?.description).toBe('Adds a pet to the store.');
    expect(tool('create_pet')?.title).toBeUndefined();
    expect(tool('delete_pet')?.description).toBe('DELETE /pets/{petId}');
  });

  it('reports a recursive schema as a finding', () => {
    expect(tools.findings).toEqual([
      expect.objectContaining({ code: 'mcp-cycle-cut', pointer: '#/paths/~1tree/get', message: expect.stringContaining('#/components/schemas/Node') as unknown }),
    ]);
  });

  it('includes operations by id and by tag, and reports an entry that matches nothing', () => {
    const chosen = toolsOf(pets, { ...stdio, include: ['tag:admin', 'getTree', 'tag:none', 'nope'] });
    expect(chosen.tools.map((candidate) => candidate.name)).toEqual(['create_pet', 'get_tree']);
    expect(chosen.findings.filter((found) => found.code === 'mcp-include-unmatched').map((found) => found.message)).toEqual([
      '`include` names "tag:none", which matches no operation',
      '`include` names "nope", which matches no operation',
    ]);
  });

  it('prefers a JSON body, takes another when there is none, and skips a stream item and a missing body', () => {
    expect(body({ 'text/plain': { schema: { type: 'string' } }, 'application/json': { schema: { type: 'number' } } })).toEqual({ type: 'object', properties: { body: { type: 'number' } }, additionalProperties: false });
    expect(body({ 'text/plain': { schema: { type: 'string' } } }, true)).toEqual({ type: 'object', properties: { body: { type: 'string' } }, required: ['body'], additionalProperties: false });
    expect(body({ 'application/jsonl': { itemSchema: { type: 'string' } } })).toEqual({ type: 'object', properties: {}, additionalProperties: false });
  });

  it('takes the lowest 2xx JSON response, and none when only an error or a non-JSON response has a body', () => {
    expect(responses({ '202': json('string'), '200': json('object') })).toEqual({ type: 'object' });
    expect(responses({ '400': json('object'), '200': { description: 'd', content: { 'text/csv': { schema: { type: 'string' } } } } })).toBeUndefined();
  });

  it('leaves a webhook out with a finding: the API calls it, an agent does not', () => {
    const contract = openapi.read({ openapi: '3.1.0', webhooks: { born: { post: { operationId: 'born', responses: {} } } } });
    const result = toolsOf(contract, stdio);
    expect(result.tools).toEqual([]);
    expect(result.findings).toEqual([expect.objectContaining({ code: 'mcp-not-http', pointer: '#/webhooks/born/post' })]);
  });

  it(`generates no tool past ${String(MAX_TOOLS)} operations without include, and says why and how`, () => {
    expect(toolsOf(many(MAX_TOOLS), stdio).tools).toHaveLength(MAX_TOOLS);
    const over = toolsOf(many(MAX_TOOLS + 1), stdio);
    expect(over.tools).toEqual([]);
    expect(over.findings).toEqual([
      {
        code: 'mcp-too-many-tools',
        pointer: '#/paths',
        message: 'the spec has 41 operations and no tool was generated: past 40 tools an agent picks worse',
        fix: 'set the `include` option of the mcp target to the operation ids or `tag:<name>` entries the agent needs',
      },
    ]);
    expect(toolsOf(many(MAX_TOOLS + 1), { ...stdio, include: ['op0'] }).tools).toHaveLength(1);
  });
});
