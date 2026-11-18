import { readdirSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { adapter, detect, McpError, read } from './input-mcp.js';

const FIXTURES = new URL('__fixtures__/inputs/mcp/', import.meta.url);

const fixtures: { file: string; document: Record<string, unknown> }[] = readdirSync(FIXTURES)
  .filter((file) => file.endsWith('.json'))
  .toSorted()
  .map((file) => ({ file, document: JSON.parse(readFileSync(new URL(file, FIXTURES), 'utf8')) as Record<string, unknown> }));

const tool = (name: string, extra: object = {}): object => ({ name, inputSchema: { type: 'object' }, ...extra });

describe('detect', () => {
  it('recognises the three list results, their JSON-RPC response, and one tool', () => {
    for (const document of [
      { tools: [] },
      { prompts: [] },
      { resourceTemplates: [] },
      { name: 'a', inputSchema: null },
      { jsonrpc: '2.0', id: 1, result: { tools: [] } },
      { jsonrpc: '2.0', result: { resourceTemplates: [] } },
    ]) {
      expect(detect(document)).toBe(true);
    }
  });

  it('declines anything else, and never throws', () => {
    for (const other of [
      {},
      { tools: {} },
      { name: 'a' },
      { name: 1, inputSchema: {} },
      { inputSchema: {} },
      { jsonrpc: 2, result: { tools: [] } },
      { jsonrpc: '2.0', result: [] },
      { jsonrpc: '2.0', result: { tools: 'x' } },
      { result: { tools: [] } },
      [],
      null,
      'tools',
    ]) {
      expect(detect(other)).toBe(false);
    }
  });
});

describe('read', () => {
  it('reads a tool as one operation: inputSchema is the call, outputSchema the result, as written', () => {
    const input = { type: 'object', properties: { q: { $ref: '#/$defs/q' } } };
    const output = { type: 'array' };
    const document = { tools: [{ name: 'search', inputSchema: input, outputSchema: output }, tool('ping')] };
    const contract = read(document);
    expect(contract.format).toBe('mcp');
    expect(contract.document).toBe(document);
    expect(contract.findings).toEqual([]);
    expect(contract.operations).toEqual([
      {
        id: 'search',
        source: '#/tools/0',
        payloads: [
          { name: 'arguments', direction: 'tool-call', schema: input, required: true },
          { name: 'structuredContent', direction: 'tool-result', schema: output, required: true },
        ],
      },
      { id: 'ping', source: '#/tools/1', payloads: [{ name: 'arguments', direction: 'tool-call', schema: { type: 'object' }, required: true }] },
    ]);
    expect(contract.operations[0]?.payloads[0]?.schema).toBe(input);
  });

  it('reads one tool on its own, pointing at the root', () => {
    expect(read({ name: 'solo', inputSchema: { type: 'object' } }).format).toBe('mcp');
    expect(read({ name: 'solo', inputSchema: { type: 'object' } }).operations).toEqual([
      { id: 'solo', source: '#', payloads: [{ name: 'arguments', direction: 'tool-call', schema: { type: 'object' }, required: true }] },
    ]);
  });

  it('reads the list inside a JSON-RPC response, pointing into `result`', () => {
    const contract = read({ jsonrpc: '2.0', id: 3, result: { tools: [tool('a')], nextCursor: 'n' } });
    expect(contract.operations.map(({ id, source }) => [id, source])).toEqual([['a', '#/result/tools/0']]);
    expect(contract.findings).toEqual([
      {
        code: 'page-incomplete',
        pointer: '#/result/nextCursor',
        message: 'this snapshot is one page of a longer list; entries on later pages are not read',
        fix: 'snapshot every page: repeat the request with `cursor` until no `nextCursor` comes back',
      },
    ]);
    expect(read({ tools: [], nextCursor: 4 }).findings).toEqual([]);
  });

  it('reads a tool without an object inputSchema as an object, and says so', () => {
    for (const inputSchema of [null, true, []]) {
      const contract = read({ tools: [{ name: 'bare', inputSchema }] });
      expect(contract.operations[0]?.payloads).toEqual([{ name: 'arguments', direction: 'tool-call', schema: { type: 'object' }, required: true }]);
      expect(contract.findings).toEqual([
        {
          code: 'input-schema-missing',
          pointer: '#/tools/0/inputSchema',
          message: 'tool `bare` has no object `inputSchema`, so its arguments are read as `{ "type": "object" }`',
          fix: 'declare `inputSchema` as an object schema; a tool without parameters has `{ "type": "object" }`',
        },
      ]);
    }
  });

  it('drops an outputSchema that is not an object schema, with a finding', () => {
    const contract = read({ tools: [tool('x', { outputSchema: null })] });
    expect(contract.operations[0]?.payloads.map(({ direction }) => direction)).toEqual(['tool-call']);
    expect(contract.findings).toEqual([
      {
        code: 'output-schema-dropped',
        pointer: '#/tools/0/outputSchema',
        message: 'tool `x` declares an `outputSchema` that is not an object schema, so its result is not read',
        fix: 'make `outputSchema` an object schema, or remove it',
      },
    ]);
  });

  it("builds a prompt's arguments into an object of strings, and says it was synthesised", () => {
    const contract = read({
      prompts: [
        {
          name: 'review',
          arguments: [{ name: 'code', description: 'The code', required: true }, { name: 'style', required: 'yes' }, { description: 'no name' }, 'code'],
        },
        { name: 'bare' },
      ],
    });
    expect(contract.operations).toStrictEqual([
      {
        id: 'prompt:review',
        source: '#/prompts/0',
        payloads: [
          {
            name: 'arguments',
            direction: 'tool-call',
            schema: { type: 'object', properties: { code: { type: 'string', description: 'The code' }, style: { type: 'string' } }, required: ['code'] },
            required: true,
          },
        ],
      },
      {
        id: 'prompt:bare',
        source: '#/prompts/1',
        payloads: [{ name: 'arguments', direction: 'tool-call', schema: { type: 'object', properties: {}, required: [] }, required: true }],
      },
    ]);
    expect(contract.findings?.[0]).toEqual({
      code: 'prompt-arguments-synthesised',
      pointer: '#/prompts/0/arguments',
      message: 'prompt `review` declares arguments, not a schema; its `tool-call` payload is an object of strings built from them',
      fix: 'nothing to do: prompt arguments are strings on the wire; describe each in `arguments[].description`',
    });
    expect(contract.findings?.map(({ pointer }) => pointer)).toEqual(['#/prompts/0/arguments']);
  });

  it("builds a resource template's variables into an object of strings, and says it was synthesised", () => {
    const contract = read({ resourceTemplates: [{ uriTemplate: 'repo://{owner}/{+path}{#frag}{/seg*}{.ext}{;p}{?q,lang:2}{&page}', name: 'Files' }] });
    expect(contract.operations).toEqual([
      {
        id: 'resource:repo://{owner}/{+path}{#frag}{/seg*}{.ext}{;p}{?q,lang:2}{&page}',
        source: '#/resourceTemplates/0',
        payloads: [
          {
            name: 'variables',
            direction: 'tool-call',
            schema: {
              type: 'object',
              properties: Object.fromEntries(['owner', 'path', 'frag', 'seg', 'ext', 'p', 'q', 'lang', 'page'].map((name) => [name, { type: 'string' }])),
              required: ['owner', 'path', 'frag'],
            },
            required: true,
          },
        ],
      },
    ]);
    expect(contract.findings).toEqual([
      {
        code: 'resource-variables-synthesised',
        pointer: '#/resourceTemplates/0/uriTemplate',
        message:
          'resource template `repo://{owner}/{+path}{#frag}{/seg*}{.ext}{;p}{?q,lang:2}{&page}` declares a URI template, not a schema; its `tool-call` payload is an object of strings built from its variables',
        fix: 'nothing to do: URI template variables are strings',
      },
    ]);
    const plain = read({ resourceTemplates: [{ uriTemplate: 'x://{a:}{b*c}{d.e}' }] }).operations[0]?.payloads[0]?.schema;
    expect(plain).toEqual({
      type: 'object',
      properties: { a: { type: 'string' }, 'b*c': { type: 'string' }, 'd.e': { type: 'string' } },
      required: ['a', 'b*c', 'd.e'],
    });
    expect(read({ resourceTemplates: [{ uriTemplate: 'x://static' }] }).operations[0]?.payloads[0]?.schema).toEqual({ type: 'object', properties: {}, required: [] });
  });

  it('reads tools, then prompts, then templates, and reports entries it cannot name or that repeat a name', () => {
    const contract = read({
      resourceTemplates: [{ name: 'no template' }],
      prompts: [{ name: 'a' }],
      tools: [tool('a'), { inputSchema: {} }, 'a', tool('a')],
    });
    expect(contract.operations.map(({ id }) => id)).toEqual(['a', 'prompt:a']);
    expect(contract.findings?.filter(({ code }) => code !== 'prompt-arguments-synthesised')).toEqual([
      { code: 'entry-unnamed', pointer: '#/tools/1', message: '`tools[1]` has no `name`, so it is not read', fix: 'give it a string `name`' },
      { code: 'entry-unnamed', pointer: '#/tools/2', message: '`tools[2]` has no `name`, so it is not read', fix: 'give it a string `name`' },
      { code: 'duplicate-name', pointer: '#/tools/3', message: '`a` is listed twice; the first is read', fix: 'give each entry a distinct name' },
      {
        code: 'entry-unnamed',
        pointer: '#/resourceTemplates/0',
        message: '`resourceTemplates[0]` has no `uriTemplate`, so it is not read',
        fix: 'give it a string `uriTemplate`',
      },
    ]);
  });

  it('refuses a document that is not an MCP snapshot, with a fix', () => {
    expect(() => read({ openapi: '3.1.0' })).toThrow(
      new McpError(
        'it has no `tools`, `prompts` or `resourceTemplates` list and is not a tool',
        'pass the `result` of `tools/list`, `prompts/list` or `resources/templates/list`, or one tool',
      ),
    );
    expect(new McpError('r', 'f')).toMatchObject({ name: 'McpError', message: 'not an MCP snapshot: r. fix: f' });
  });
});

describe('real snapshots: the MCP specification examples and github-mcp-server tool snapshots', () => {
  it('reads at least 20 documents without throwing', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(20);
    expect(fixtures.length).toBe(30);
    for (const { document } of fixtures) {
      expect(detect(document)).toBe(true);
      expect(() => read(document)).not.toThrow();
    }
  });

  it('turns every inputSchema into a tool-call payload and every outputSchema into a tool-result payload, as written', () => {
    let calls = 0;
    let results = 0;
    for (const { file, document } of fixtures) {
      const listed = Array.isArray(document.tools) ? (document.tools as Record<string, unknown>[]) : [];
      const declared = 'inputSchema' in document ? [document] : listed;
      const { operations } = read(document);
      for (const [index, { inputSchema, outputSchema }] of declared.entries()) {
        const payloads = operations[index]?.payloads ?? [];
        if (inputSchema !== null) {
          expect(payloads.find(({ direction }) => direction === 'tool-call')?.schema, file).toBe(inputSchema);
          calls += 1;
        }
        if (outputSchema !== undefined) {
          expect(payloads.find(({ direction }) => direction === 'tool-result')?.schema, file).toBe(outputSchema);
          results += 1;
        }
      }
    }
    expect([calls, results]).toEqual([26, 19]);
  });

  it('reports what it synthesised or could not read, by kind', () => {
    const tally: Record<string, number> = {};
    for (const { document } of fixtures) for (const { code } of read(document).findings ?? []) tally[code] = (tally[code] ?? 0) + 1;
    expect(tally).toEqual({ 'input-schema-missing': 2, 'page-incomplete': 3, 'prompt-arguments-synthesised': 1, 'resource-variables-synthesised': 1 });
  });
});

describe('adapter', () => {
  it('is the host shape, under its own name', () => {
    expect(adapter).toMatchObject({ name: 'mcp', detect, read });
    expect(adapter.description).toContain('tools/list');
    expect(Object.isFrozen(adapter)).toBe(true);
  });
});
