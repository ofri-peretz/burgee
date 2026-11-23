/**
 * The built-in `mcp` target (apicontract-agents R4, R6): an MCP server from a contract, one tool
 * per operation. `tools.ts`, `client.ts` and `server.ts` are generated; `handlers.ts` is the
 * user's, written once, and starts as "call the API for every tool".
 *
 * Options: `include` (operation ids or `tag:<name>`), `transport` (`stdio`, the default, or
 * `http` for Streamable HTTP), `budget` (the most tokens the tool list may take). The generated
 * code imports `@modelcontextprotocol/sdk`, which the user installs; contractdiff does not depend on it.
 */
import { type ContractFinding } from './core/model.js';
import { type GeneratedFile, type Generator, type GeneratorResult, type Plugin } from './host.js';
import { clientFile, HANDLERS, serverFile, toolsFile } from './plugin-mcp-code.js';
import { optionsOf, toolsOf } from './plugin-mcp-tools.js';

/** A value's own members, read as a record: `{}` for null and undefined, so a missing member reads as `undefined`. */
const membersOf = (value: unknown): Record<string, unknown> => Object(value) as Record<string, unknown>;

const text = (value: unknown, fallback: string): string => (typeof value === 'string' && value !== '' ? value : fallback);

/** The server's name and version: the document's `info`, else `api` and `0.0.0`. */
const identity = (document: unknown): { name: string; version: string } => {
  const info = membersOf(membersOf(document).info);
  return { name: text(info.title, 'api'), version: text(info.version, '0.0.0') };
};

export const run: Generator['run'] = (contract, options): GeneratorResult => {
  const checked = optionsOf(options);
  const { tools, findings } = toolsOf(contract, checked);
  const { name, version } = identity(contract.document);
  const files: GeneratedFile[] = [
    { path: 'tools.ts', owner: 'generated', content: toolsFile(tools) },
    { path: 'client.ts', owner: 'generated', content: clientFile(tools.map((tool) => tool.name)) },
    { path: 'server.ts', owner: 'generated', content: serverFile(name, version, checked.transport) },
    { path: 'handlers.ts', owner: 'user', content: HANDLERS },
  ];
  return { files, findings: findings satisfies ContractFinding[] };
};

/** The sample: one read-only operation with a query parameter and an object response. */
const document = {
  openapi: '3.1.0',
  info: { title: 'Pets', version: '1.0.0' },
  paths: {
    '/pets/{petId}': {
      get: {
        operationId: 'getPet',
        summary: 'One pet',
        parameters: [{ name: 'petId', in: 'path', schema: { type: 'string' } }],
        responses: { '200': { content: { 'application/json': { schema: { type: 'object', properties: { id: { type: 'string' } } } } } } },
      },
    },
  },
};

/** What `tools.ts` holds for the sample: written out, so the sample is a projection a reader can check. */
const SAMPLE_TOOLS = `import { type Tool } from '@modelcontextprotocol/sdk/types.js';

/** One tool per operation: what \`tools/list\` answers. */
export const tools: Tool[] = [
  {
    "name": "get_pet",
    "title": "One pet",
    "description": "One pet",
    "inputSchema": {
      "type": "object",
      "properties": {
        "path": {
          "type": "object",
          "properties": {
            "petId": {
              "type": "string"
            }
          },
          "required": [
            "petId"
          ]
        }
      },
      "required": [
        "path"
      ],
      "additionalProperties": false
    },
    "outputSchema": {
      "type": "object",
      "properties": {
        "id": {
          "type": "string"
        }
      }
    },
    "annotations": {
      "readOnlyHint": true
    }
  }
];

/** The HTTP route each tool calls, and whether its result is sent as structured content. */
export const routes = {
  "get_pet": {
    "operationId": "getPet",
    "method": "GET",
    "path": "/pets/{petId}",
    "output": true,
    "wrap": false
  }
} as const;
`;

const mcp: Generator = {
  description: 'An MCP server with one tool per operation: schemas, read-only hints, and handlers that call the API',
  inputs: ['openapi', 'swagger2'],
  options: {
    include: { type: 'string', multiple: true, description: 'only these operation ids, or `tag:<name>`; required past 40 operations' },
    transport: { type: 'string', choices: ['stdio', 'http'], description: 'stdio (default) or Streamable HTTP' },
    budget: { type: 'number', description: 'the most tokens the tool list may take (estimated as characters ÷ 4); over it, no tool is generated' },
  },
  sample: {
    document,
    files: [
      { path: 'tools.ts', owner: 'generated', content: SAMPLE_TOOLS },
      // The other three are templates around the tool names; their text is pinned by plugin-mcp.test.ts.
      { path: 'client.ts', owner: 'generated', content: clientFile(['get_pet']) },
      { path: 'server.ts', owner: 'generated', content: serverFile('Pets', '1.0.0', 'stdio') },
      { path: 'handlers.ts', owner: 'user', content: HANDLERS },
    ],
  },
  run,
};

export const plugin: Plugin = { name: 'mcp', generators: { mcp } };
