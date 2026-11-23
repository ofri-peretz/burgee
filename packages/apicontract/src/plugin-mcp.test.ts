import { readFileSync } from 'node:fs';

import { parse } from 'seniority/yaml';
import { describe, expect, it } from 'vitest';

import { checkPlugin, createHost, validate } from './host.js';
import { builtinAdapters } from './inputs.js';
import { clientFile, HANDLERS, serverFile, toolsFile } from './plugin-mcp-code.js';
import { toolsOf } from './plugin-mcp-tools.js';
import { plugin } from './plugin-mcp.js';
import { builtins } from './plugins.js';

const golden = (name: string): string => readFileSync(new URL(`__fixtures__/agents/${name}`, import.meta.url), 'utf8');
const pets = parse(readFileSync(new URL('__fixtures__/agents/pets.openapi.yaml', import.meta.url), 'utf8'));

const host = () => {
  const created = createHost();
  created.register({ name: 'contractdiff', adapters: builtinAdapters });
  created.register(plugin);
  return created;
};

/** The server every transport shares, between the imports and the start. */
const SHARED = `import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { handlers } from './handlers.js';
import { routes, tools } from './tools.js';

type Routed = Readonly<Record<string, { readonly output: boolean; readonly wrap: boolean } | undefined>>;

/** A server that lists the tools and calls the handler a tool names. */
export const createMcpServer = (): Server => {
  const server = new Server({ name: "Pets", version: "1" }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, () => ({ tools }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name } = request.params;
    const route = (routes as Routed)[name];
    const handler = handlers[name];
    if (route === undefined || handler === undefined) return { isError: true, content: [{ type: 'text', text: \`no tool is named \${name}\` }] };
    try {
      const result = await handler(request.params.arguments ?? {});
      const content = [{ type: 'text' as const, text: JSON.stringify(result) }];
      if (!route.output) return { content };
      return { content, structuredContent: route.wrap ? { result } : (result as Record<string, unknown>) };
    } catch (error) {
      return { isError: true, content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }] };
    }
  });
  return server;
};
`;

describe('the mcp plugin', () => {
  it('is a built-in plugin the host accepts, reading OpenAPI and Swagger 2', () => {
    expect(() => validate(plugin)).not.toThrow();
    expect(builtins).toContain(plugin);
    expect(plugin.generators?.mcp?.inputs).toEqual(['openapi', 'swagger2']);
  });

  it('produces exactly its sample, on every run', async () => {
    expect(await checkPlugin(plugin)).toEqual([]);
  });

  it('writes tools.ts, client.ts and server.ts as generated and handlers.ts as the user’s, with the findings', async () => {
    const { files, findings } = await host().run('mcp', pets);
    expect(files.map((file) => [file.path, file.owner])).toEqual([
      ['tools.ts', 'generated'],
      ['client.ts', 'generated'],
      ['server.ts', 'generated'],
      ['handlers.ts', 'user'],
    ]);
    expect(findings.map((finding) => finding.code)).toEqual(['mcp-cycle-cut']);
    const { tools } = toolsOf(host().read(pets), { transport: 'stdio' });
    expect(files[0]?.content).toBe(toolsFile(tools));
    expect(files[1]?.content).toBe(clientFile(tools.map((tool) => tool.name)));
  });

  it('names the server after info, and falls back to api 0.0.0', async () => {
    const runs = await Promise.all([undefined, null, { title: '', version: '' }, { title: 3 }].map(async (info) => host().generate('mcp', { openapi: '3.1.0', info, paths: {} })));
    for (const [, , server] of runs) expect(server?.content).toContain('new Server({ name: "api", version: "0.0.0" }');
  });

  it('declares its options for --help', () => {
    expect(plugin.generators?.mcp?.options).toEqual({
      include: { type: 'string', multiple: true, description: 'only these operation ids, or `tag:<name>`; required past 40 operations' },
      transport: { type: 'string', choices: ['stdio', 'http'], description: 'stdio (default) or Streamable HTTP' },
      budget: { type: 'number', description: 'the most tokens the tool list may take (estimated as characters ÷ 4); over it, no tool is generated' },
    });
  });

  it('starts on stdio by default', async () => {
    const [, , server] = await host().generate('mcp', pets);
    expect(server?.content).toBe(
      `import { Server } from '@modelcontextprotocol/sdk/server/index.js';\nimport { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';\n${SHARED}\nawait createMcpServer().connect(new StdioServerTransport());\n`,
    );
    expect(server?.content).toBe(serverFile('Pets', '1', 'stdio'));
  });

  it('starts a stateless Streamable HTTP server with transport: http', async () => {
    const [, , server] = await host().generate('mcp', pets, { transport: 'http' });
    expect(server?.content).toBe(`import { createServer } from 'node:http';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
${SHARED}
createServer((request, response) => {
  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  response.on('close', () => {
    void transport.close();
    void server.close();
  });
  void server.connect(transport).then(async () => transport.handleRequest(request, response));
}).listen(Number(${'process'}.env.PORT ?? 3000));
`);
  });

  it('writes the tool list and routes as data, without the route on a listed tool', () => {
    const { tools } = toolsOf(host().read(pets), { transport: 'stdio', include: ['deletePet'] });
    const text = toolsFile(tools);
    expect(text.startsWith("import { type Tool } from '@modelcontextprotocol/sdk/types.js';\n\n/** One tool per operation: what `tools/list` answers. */\nexport const tools: Tool[] = [\n")).toBe(true);
    const [listed, routes] = text.split('\n\n/** The HTTP route each tool calls, and whether its result is sent as structured content. */\nexport const routes = ');
    expect(JSON.parse((listed as string).slice((listed as string).indexOf('= [') + 2, -1))).toEqual([
      {
        name: 'delete_pet',
        description: 'DELETE /pets/{petId}',
        inputSchema: { type: 'object', properties: { path: { type: 'object', properties: { petId: { type: 'string' } }, required: ['petId'] } }, required: ['path'], additionalProperties: false },
        annotations: { readOnlyHint: false },
      },
    ]);
    expect(JSON.parse((routes as string).replace(/ as const;\n$/u, ''))).toEqual({ delete_pet: { operationId: 'deletePet', method: 'DELETE', path: '/pets/{petId}', output: false, wrap: false } });
  });

  it('gives every tool a default handler in client.ts, calling its route with fetch', () => {
    expect(clientFile(['a_b'])).toBe(golden('client.golden.txt'));
    expect(clientFile(['x', 'y']).endsWith('  "x": async (input) => call(routes["x"], input),\n  "y": async (input) => call(routes["y"], input),\n};\n')).toBe(true);
  });

  it("leaves the user's handlers.ts spreading the defaults", () => {
    expect(HANDLERS).toBe(golden('handlers.golden.txt'));
  });
});

describe('what the spec puts into generated source', () => {
  it('cannot end a string or a comment early: <, >, U+2028 and U+2029 are written as escapes', () => {
    const description = 'ends </script> here\u2028and\u2029there';
    const tools = toolsFile([{ name: 'a', description, inputSchema: { type: 'object' }, route: { method: 'GET', path: '/a', structured: false } } as never]);
    expect(tools).toContain(String.raw`ends \u003C/script\u003E here\u2028and\u2029there`);
    expect(tools).not.toMatch(/[<>\u2028\u2029]/u);
    expect(serverFile('<x>', '1\u2028', 'stdio')).toContain(String.raw`name: "\u003Cx\u003E", version: "1\u2028"`);
    expect(clientFile(['<a>'])).toContain(String.raw`"\u003Ca\u003E": async (input) => call(routes["\u003Ca\u003E"], input),`);
  });

  it('encodes cookie names as well as their values', () => {
    expect(clientFile([])).toContain('`${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`');
  });
});
