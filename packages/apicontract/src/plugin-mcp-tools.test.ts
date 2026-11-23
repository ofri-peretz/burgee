import { readFileSync } from 'node:fs';

import { parse } from 'seniority/yaml';
import { describe, expect, it } from 'vitest';

import { stableHash } from './command-explain-name.js';
import { type Contract } from './core/model.js';
import { openapi } from './openapi.js';
import { CHARS_PER_TOKEN, MAX_NAME, MAX_TOOLS, optionsOf, snake, tokensOf, toolNames, toolsOf } from './plugin-mcp-tools.js';

const pets = openapi.read(parse(readFileSync(new URL('__fixtures__/agents/pets.openapi.yaml', import.meta.url), 'utf8')));
const stdio = { transport: 'stdio' } as const;

describe('snake', () => {
  it.each([
    ['listPets', 'list_pets'],
    ['HTTPServer2Go', 'http_server2_go'],
    ['get /pets/{id}', 'get_pets_id'],
    ['__x__', 'x'],
    ['already_snake', 'already_snake'],
    ['XMLHttpRequest', 'xml_http_request'],
    ['-a-', 'a'],
    ['{}', 'operation'],
  ])('%s → %s', (id, name) => {
    expect(snake(id)).toBe(name);
  });
});

describe('toolNames', () => {
  it('cuts a long name to 64 characters with the hash of the id, the same on every run', () => {
    const id = `get${'Thing'.repeat(20)}`;
    const name = toolNames([id]).get(id) as string;
    expect(name).toHaveLength(64);
    expect(MAX_NAME).toBe(64);
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
    for (const include of ['a', [''], [1], ['a', 1]]) expect(() => optionsOf({ include })).toThrow('fix: set `include` to ids or `tag:<name>` entries');
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
      {
        code: 'mcp-cycle-cut',
        pointer: '#/paths/~1tree/get',
        message: '"getTree" has a recursive schema; the tool\'s schema accepts anything where it repeats (#/components/schemas/Node)',
        fix: 'accept the looser schema, or validate the recursion in the handler',
      },
    ]);
  });

  it('lists every cycle of a tool in its finding', () => {
    const document = {
      openapi: '3.1.0',
      paths: { '/x': { get: { operationId: 'x', responses: { '200': { description: 'd', content: { 'application/json': { schema: { $ref: '#/A' } } } } } } } },
      A: { properties: { a: { $ref: '#/A' }, b: { $ref: '#/B' } } },
      B: { properties: { b: { $ref: '#/B' } } },
    };
    expect(toolsOf(openapi.read(document), stdio).findings[0]?.message).toBe('"x" has a recursive schema; the tool\'s schema accepts anything where it repeats (#/A, #/B)');
  });

  it('leaves title and outputSchema out when there are none, and joins summary and description', () => {
    expect('title' in (tool('delete_pet') ?? {})).toBe(false);
    expect('outputSchema' in (tool('delete_pet') ?? {})).toBe(false);
    const both = openapi.read({ openapi: '3.1.0', paths: { '/x': { get: { operationId: 'x', summary: 'S', description: 'D', responses: {} } } } });
    expect(toolsOf(both, stdio).tools[0]).toMatchObject({ title: 'S', description: 'S\n\nD' });
  });

  it('groups header and cookie parameters too, and marks HEAD and OPTIONS read-only', () => {
    const contract = openapi.read({
      openapi: '3.1.0',
      paths: {
        '/x': {
          head: { operationId: 'h', parameters: [{ name: 'X-Id', in: 'header', required: true, schema: { type: 'string' } }], responses: {} },
          options: { operationId: 'o', parameters: [{ name: 'sid', in: 'cookie', schema: { type: 'string' } }], responses: {} },
        },
      },
    });
    const head = toolsOf(contract, stdio).tools.find((candidate) => candidate.name === 'h');
    const options = toolsOf(contract, stdio).tools.find((candidate) => candidate.name === 'o');
    expect(head?.inputSchema).toEqual({
      type: 'object',
      properties: { header: { type: 'object', properties: { 'X-Id': { type: 'string' } }, required: ['X-Id'] } },
      required: ['header'],
      additionalProperties: false,
    });
    expect(options?.inputSchema).toEqual({ type: 'object', properties: { cookie: { type: 'object', properties: { sid: { type: 'string' } } } }, additionalProperties: false });
    expect([head?.annotations.readOnlyHint, options?.annotations.readOnlyHint]).toEqual([true, true]);
  });

  it('includes operations by id and by tag, and reports an entry that matches nothing', () => {
    const chosen = toolsOf(pets, { ...stdio, include: ['tag:admin', 'getTree', 'tag:none', 'nope'] });
    expect(chosen.tools.map((candidate) => candidate.name)).toEqual(['create_pet', 'get_tree']);
    const fix = 'use an operation id from `apicontract explain --list`, or `tag:<name>` with a tag the spec declares';
    expect(chosen.findings.filter((found) => found.code === 'mcp-include-unmatched')).toEqual([
      { code: 'mcp-include-unmatched', pointer: '#', message: '`include` names "tag:none", which matches no operation', fix },
      { code: 'mcp-include-unmatched', pointer: '#', message: '`include` names "nope", which matches no operation', fix },
    ]);
  });

  it('prefers a JSON body, takes another when there is none, and skips a stream item and a missing body', () => {
    expect(body({ 'text/plain': { schema: { type: 'string' } }, 'application/json': { schema: { type: 'number' } } })).toEqual({ type: 'object', properties: { body: { type: 'number' } }, additionalProperties: false });
    expect(body({ 'text/plain': { schema: { type: 'string' } } }, true)).toEqual({ type: 'object', properties: { body: { type: 'string' } }, required: ['body'], additionalProperties: false });
    expect(body({ 'application/jsonl': { itemSchema: { type: 'string' } } })).toEqual({ type: 'object', properties: {}, additionalProperties: false });
  });

  it('takes the lowest 2xx JSON response, and none when only an error or a non-JSON response has a body', () => {
    expect(responses({ '202': json('string'), '200': json('object') })).toEqual({ type: 'object' });
    expect(responses({ '200': { description: 'd', content: { 'application/json;charset=utf-8': { schema: { type: 'object' } } } } })).toEqual({ type: 'object' });
    expect(responses({ '200': { description: 'd', content: { 'application/jsonl': { itemSchema: { type: 'object' } } } } })).toBeUndefined();
    expect(responses({ '400': json('object'), '200': { description: 'd', content: { 'text/csv': { schema: { type: 'string' } } } } })).toBeUndefined();
  });

  it('leaves a webhook out with a finding: the API calls it, an agent does not', () => {
    const contract = openapi.read({ openapi: '3.1.0', webhooks: { born: { post: { operationId: 'born', responses: {} } } } });
    const result = toolsOf(contract, stdio);
    expect(result.tools).toEqual([]);
    expect(result.findings).toEqual([
      { code: 'mcp-not-http', pointer: '#/webhooks/born/post', message: '"born" has no HTTP route, so it is not a tool', fix: 'leave it out of `include`; a webhook is called by the API, not by an agent' },
    ]);
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
    const all = many(MAX_TOOLS + 1);
    expect(toolsOf(all, { ...stdio, include: all.operations.map((operation) => operation.id) }).tools).toHaveLength(MAX_TOOLS + 1);
  });
});

describe('hidden tags and the budget (contractdiff-compat-depth R6)', () => {
  const tagged = openapi.read({
    openapi: '3.1.0',
    paths: {
      '/pets': { get: { operationId: 'listPets', tags: ['pets'], description: 'Every pet. '.repeat(40), responses: {} } },
      '/health': { get: { operationId: 'health', tags: ['health'], responses: {} } },
      '/admin': { get: { operationId: 'reindex', tags: ['internal', 'pets'], responses: {} } },
      '/one': { get: { operationId: 'one', responses: {} } },
    },
  });
  const names = (options: Parameters<typeof toolsOf>[1]) => toolsOf(tagged, options).tools.map((tool) => tool.route.operationId);

  it('leaves out operations tagged internal or health unless include names them, and says which', () => {
    const result = toolsOf(tagged, stdio);
    expect(result.tools.map((tool) => tool.route.operationId)).toEqual(['listPets', 'one']);
    expect(result.findings).toEqual([
      { code: 'mcp-hidden', pointer: '#/paths', message: 'left out 2 operation(s) tagged internal or health: health, reindex', fix: 'name one in `include` (its id, or `tag:internal`) if an agent should call it' },
    ]);
    expect(names({ ...stdio, include: ['tag:pets'] })).toEqual(['listPets']);
    expect(names({ ...stdio, include: ['health', 'tag:internal'] })).toEqual(['health', 'reindex']);
    expect(toolsOf(tagged, { ...stdio, include: ['one'] }).findings).toEqual([]);
  });

  it('reports the size against the budget, and generates nothing over it, naming the largest tools', () => {
    const fits = toolsOf(tagged, { ...stdio, budget: 4000 });
    const size = tokensOf(fits.tools);
    expect(size).toBe(Math.ceil(JSON.stringify(fits.tools.map(({ route: _route, ...tool }) => tool)).length / CHARS_PER_TOKEN));
    expect(fits.findings.at(-1)).toEqual({ code: 'mcp-budget', pointer: '#', message: `2 tool(s), about ${String(size)} of 4000 tokens (estimate: characters ÷ 4)`, fix: 'nothing to do' });
    expect(toolsOf(tagged, { ...stdio, budget: size }).tools).toHaveLength(2);
    const over = toolsOf(tagged, { ...stdio, budget: size - 1 });
    expect(over.tools).toEqual([]);
    expect(over.findings.at(-1)).toEqual({
      code: 'mcp-over-budget',
      pointer: '#',
      message: `no tool was generated: 2 tool(s) take about ${String(size)} of ${String(size - 1)} tokens (estimate: characters ÷ 4); the largest are list_pets (${String(tokensOf([fits.tools[0] as never]))}), one (${String(tokensOf([fits.tools[1] as never]))})`,
      fix: 'narrow `include` to the operation ids or `tag:<name>` entries the agent needs, or raise `budget`',
    });
    expect(toolsOf(tagged, { ...stdio, include: ['one'], budget: size - 1 }).tools).toHaveLength(1);
  });

  it('refuses a budget that is not a whole number of tokens above 0', () => {
    expect(optionsOf({ budget: 10 })).toEqual({ transport: 'stdio', budget: 10 });
    for (const budget of [0, -1, 1.5, '10', Number.NaN]) expect(() => optionsOf({ budget })).toThrow('fix: set `budget` to a whole number of tokens above 0');
  });
});
