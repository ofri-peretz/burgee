/**
 * The three files `gen mcp` writes (apicontract-agents R4): `tools.ts` and `server.ts`, generated
 * and rewritten on every run, and `handlers.ts`, the user's, written once.
 *
 * The server uses `@modelcontextprotocol/sdk`'s low-level `Server`, which takes JSON Schema tool
 * definitions as they are, so the generated code needs the SDK and nothing else. The SDK is the
 * user's dependency, never apicontract's.
 *
 * The bodies are lines of text, one string literal per line: the generated code reads the
 * environment, and this package's own source may not name the process outside its bin.
 */
import { type Route, type Tool } from './plugin-mcp-tools.js';

const json = (value: unknown): string => JSON.stringify(value, null, 2);

const lines = (...text: readonly string[]): string => `${text.join('\n')}\n`;

/** `tools.ts`: the tool list `tools/list` answers with, and the route each tool calls. */
export const toolsFile = (tools: readonly Tool[]): string => {
  const listed = tools.map(({ route: _route, ...tool }) => tool);
  const routes: Record<string, Route> = Object.fromEntries(tools.map((tool) => [tool.name, tool.route]));
  return lines(
    "import { type Tool } from '@modelcontextprotocol/sdk/types.js';",
    '',
    '/** One tool per operation: what `tools/list` answers. */',
    `export const tools: Tool[] = ${json(listed)};`,
    '',
    '/** The HTTP route each tool calls, and whether its result is sent as structured content. */',
    `export const routes = ${json(routes)} as const;`,
  );
};

const STDIO = ["import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';"];
const HTTP = ["import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';"];
const NODE_HTTP = ["import { createServer } from 'node:http';", ''];

const START_STDIO = ['', 'await createMcpServer().connect(new StdioServerTransport());'];

/** Stateless Streamable HTTP: a server and a transport per request, as the SDK documents it. */
const START_HTTP = [
  '',
  'createServer((request, response) => {',
  '  const server = createMcpServer();',
  '  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });',
  "  response.on('close', () => {",
  '    void transport.close();',
  '    void server.close();',
  '  });',
  '  void server.connect(transport).then(async () => transport.handleRequest(request, response));',
  '}).listen(Number(process.env.PORT ?? 3000));',
];

/** `server.ts`: the MCP server, answering `tools/list` from `tools.ts` and `tools/call` through `handlers.ts`. */
export const serverFile = (name: string, version: string, transport: 'stdio' | 'http'): string =>
  lines(
    ...(transport === 'http' ? NODE_HTTP : []),
    "import { Server } from '@modelcontextprotocol/sdk/server/index.js';",
    ...(transport === 'http' ? HTTP : STDIO),
    "import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';",
    '',
    "import { handlers } from './handlers.js';",
    "import { routes, tools } from './tools.js';",
    '',
    'type Routed = Readonly<Record<string, { readonly output: boolean; readonly wrap: boolean } | undefined>>;',
    '',
    '/** A server that lists the tools and calls the handler a tool names. */',
    'export const createMcpServer = (): Server => {',
    `  const server = new Server({ name: ${JSON.stringify(name)}, version: ${JSON.stringify(version)} }, { capabilities: { tools: {} } });`,
    '  server.setRequestHandler(ListToolsRequestSchema, () => ({ tools }));',
    '  server.setRequestHandler(CallToolRequestSchema, async (request) => {',
    '    const { name } = request.params;',
    '    const route = (routes as Routed)[name];',
    '    const handler = handlers[name];',
    "    if (route === undefined || handler === undefined) return { isError: true, content: [{ type: 'text', text: `no tool is named ${name}` }] };",
    '    try {',
    '      const result = await handler(request.params.arguments ?? {});',
    "      const content = [{ type: 'text' as const, text: JSON.stringify(result) }];",
    '      if (!route.output) return { content };',
    '      return { content, structuredContent: route.wrap ? { result } : (result as Record<string, unknown>) };',
    '    } catch (error) {',
    "      return { isError: true, content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }] };",
    '    }',
    '  });',
    '  return server;',
    '};',
    ...(transport === 'http' ? START_HTTP : START_STDIO),
  );

/**
 * `client.ts`: the default handler for every tool, rewritten on every run so a new operation has
 * one. It calls the API with `fetch`, at `API_BASE_URL`, sending `API_AUTHORIZATION` (when set) as
 * the `Authorization` header.
 */
export const clientFile = (tools: readonly Tool[]): string =>
  lines(
    "import { routes } from './tools.js';",
    '',
    'export interface Input {',
    '  readonly path?: Readonly<Record<string, unknown>>;',
    '  readonly query?: Readonly<Record<string, unknown>>;',
    '  readonly header?: Readonly<Record<string, unknown>>;',
    '  readonly cookie?: Readonly<Record<string, unknown>>;',
    '  readonly body?: unknown;',
    '}',
    '',
    'export type Handler = (input: Input) => Promise<unknown>;',
    '',
    "const base = (): string => (process.env.API_BASE_URL ?? '').replace(/\\/+$/u, '');",
    'const authorization = (): string | undefined => process.env.API_AUTHORIZATION;',
    '',
    '/** Call one route: path parameters into the path, the rest into the query, headers and a JSON body. */',
    'export const call = async (route: { readonly method: string; readonly path: string }, input: Input): Promise<unknown> => {',
    "  if (base() === '') throw new Error('API_BASE_URL is not set. fix: set it to the address of the API, without a trailing slash');",
    "  const path = route.path.replaceAll(/\\{([^}]+)\\}/gu, (_, name: string) => encodeURIComponent(String(input.path?.[name] ?? '')));",
    '  const url = new URL(`${base()}${path}`);',
    '  for (const [name, value] of Object.entries(input.query ?? {})) if (value !== undefined) url.searchParams.set(name, String(value));',
    '  const headers = new Headers();',
    '  for (const [name, value] of Object.entries(input.header ?? {})) if (value !== undefined) headers.set(name, String(value));',
    '  const cookies = Object.entries(input.cookie ?? {}).map(([name, value]) => `${name}=${encodeURIComponent(String(value))}`);',
    "  if (cookies.length > 0) headers.set('cookie', cookies.join('; '));",
    '  const token = authorization();',
    "  if (token !== undefined) headers.set('authorization', token);",
    "  if (input.body !== undefined) headers.set('content-type', 'application/json');",
    '  const response = await fetch(url, { method: route.method, headers, body: input.body === undefined ? undefined : JSON.stringify(input.body) });',
    '  const text = await response.text();',
    '  if (!response.ok) throw new Error(`${route.method} ${path} answered ${String(response.status)}: ${text}`);',
    "  if (text === '') return null;",
    "  return (response.headers.get('content-type') ?? '').includes('json') ? (JSON.parse(text) as unknown) : text;",
    '};',
    '',
    '/** Every tool, calling its route. `handlers.ts` spreads these and replaces the ones it needs to. */',
    'export const defaults: Readonly<Record<string, Handler>> = {',
    ...tools.map((tool) => `  ${JSON.stringify(tool.name)}: async (input) => call(routes[${JSON.stringify(tool.name)}], input),`),
    '};',
  );

/** `handlers.ts`: the user's file, written once. */
export const HANDLERS = lines(
  '/**',
  ' * The handler each tool runs. apicontract wrote this file once and never rewrites it: change it freely.',
  ' * `defaults` (client.ts, regenerated) calls the API for every tool, a new one included; replace an',
  ' * entry to do something else, e.g. `{ ...defaults, delete_pet: async () => { throw new Error("not here") } }`.',
  ' */',
  "import { defaults, type Handler } from './client.js';",
  '',
  'export const handlers: Readonly<Record<string, Handler | undefined>> = { ...defaults };',
);
