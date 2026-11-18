import { readFileSync } from 'node:fs';

import { parse } from 'seniority/yaml';
import { describe, expect, it } from 'vitest';

import { checkPlugin, createHost, validate } from './host.js';
import { builtinAdapters } from './inputs.js';
import { clientFile, HANDLERS, serverFile, toolsFile } from './plugin-mcp-code.js';
import { toolsOf } from './plugin-mcp-tools.js';
import { plugin } from './plugin-mcp.js';
import { builtins } from './plugins.js';

const pets = parse(readFileSync(new URL('__fixtures__/agents/pets.openapi.yaml', import.meta.url), 'utf8'));

const host = () => {
  const created = createHost();
  created.register({ name: 'apicontract', adapters: builtinAdapters });
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
    expect(files[1]?.content).toBe(clientFile(tools));
  });

  it('names the server after info, and falls back to api 0.0.0', async () => {
    const [, , server] = await host().generate('mcp', { openapi: '3.1.0', paths: {} });
    expect(server?.content).toContain('new Server({ name: "api", version: "0.0.0" }');
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
    const { tools } = toolsOf(host().read(pets), { transport: 'stdio' });
    const text = clientFile(tools);
    expect(text).toContain("const base = (): string => (process.env.API_BASE_URL ?? '').replace(/\\/+$/u, '');");
    expect(text).toContain("if (token !== undefined) headers.set('authorization', token);");
    expect(text).toContain("  const path = route.path.replaceAll(/\\{([^}]+)\\}/gu, (_, name: string) => encodeURIComponent(String(input.path?.[name] ?? '')));");
    expect(text.endsWith(
      [
        'export const defaults: Readonly<Record<string, Handler>> = {',
        '  "list_pets": async (input) => call(routes["list_pets"], input),',
        '  "create_pet": async (input) => call(routes["create_pet"], input),',
        '  "delete_pet": async (input) => call(routes["delete_pet"], input),',
        '  "get_tree": async (input) => call(routes["get_tree"], input),',
        '};\n',
      ].join('\n'),
    )).toBe(true);
  });

  it("leaves the user's handlers.ts spreading the defaults", () => {
    expect(HANDLERS.endsWith("import { defaults, type Handler } from './client.js';\n\nexport const handlers: Readonly<Record<string, Handler | undefined>> = { ...defaults };\n")).toBe(true);
  });
});
