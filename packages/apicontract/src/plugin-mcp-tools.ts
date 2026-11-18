/**
 * `gen mcp`'s model (apicontract-agents R4, R6): which operations become tools, what each tool is
 * named, and its schemas and annotations. No code is written here; `plugin-mcp-code.ts` prints it.
 *
 * - **Selection.** Every operation with an HTTP route, or the ones `include` names (an id, or
 *   `tag:<name>`). Past {@link MAX_TOOLS} without `include` no tool is generated and a finding names
 *   the cap and the option: a long tool list degrades the agent that reads it.
 * - **Names.** The id in snake_case, at most 64 characters (MCP's limit); a cut or colliding name
 *   carries a stable hash of the id.
 * - **Schemas.** Resolved by `explain` (R2), cycles marked. `inputSchema` groups the parameters by
 *   where they go (`path`, `query`, `header`, `cookie`) beside the JSON `body`; `outputSchema` is the
 *   first 2xx JSON response, wrapped under `result` when it is not an object, since MCP requires one.
 */
import { fitted, unique } from './command-explain-name.js';
import { describe, type Explanation, tagsOf } from './command-explain-operation.js';
import { type Contract, type ContractFinding } from './core/model.js';
import { UsageError } from './run-config.js';

/** Above this many tools an agent picks worse (intent constraint 3). */
export const MAX_TOOLS = 40;
/** MCP's limit on a tool name. */
export const MAX_NAME = 64;

const LOCATIONS = ['path', 'query', 'header', 'cookie'] as const;
const READ_ONLY = new Set(['GET', 'HEAD', 'OPTIONS']);

export interface Route {
  readonly operationId: string;
  readonly method: string;
  readonly path: string;
  /** Whether the tool declares an `outputSchema`, so the server sends `structuredContent`. */
  readonly output: boolean;
  /** Whether the response is wrapped as `{ result }` to make the structured content an object. */
  readonly wrap: boolean;
}

export interface Tool {
  readonly name: string;
  readonly title?: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  readonly outputSchema?: Record<string, unknown>;
  readonly annotations: { readonly readOnlyHint: boolean };
  readonly route: Route;
}

/** `listPets` → `list_pets`, `HTTPServer2Go` → `http_server2_go`; anything not a letter or digit is one `_`. */
export const snake = (id: string): string =>
  id
    .replaceAll(/([a-z\d])([A-Z])/gu, '$1_$2')
    .replaceAll(/([A-Z]+)([A-Z][a-z])/gu, '$1_$2')
    .replaceAll(/[^A-Za-z\d]+/gu, '_')
    .replaceAll(/^_+|_+$/gu, '')
    .toLowerCase() || 'operation';

/** A tool name for each id: snake_case, at most 64 characters, cut or colliding names carrying a stable hash. */
export const toolNames = (ids: readonly string[]): Map<string, string> => unique(ids, (id) => fitted(snake(id), id, MAX_NAME), MAX_NAME);

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const object = (properties: Record<string, unknown>, required: readonly string[]): Record<string, unknown> => ({
  type: 'object',
  properties,
  ...(required.length === 0 ? {} : { required }),
});

/** The tool's input: one object per parameter location, and the JSON body. */
const inputOf = (explanation: Explanation): Record<string, unknown> => {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const location of LOCATIONS) {
    const params = explanation.payloads.filter((payload) => payload.name.startsWith(`param:${location}:`));
    if (params.length === 0) continue;
    const names = params.map((payload) => payload.name.slice(`param:${location}:`.length));
    const needed = names.filter((_, at) => params[at]?.required === true);
    properties[location] = object(Object.fromEntries(names.map((name, at) => [name, params[at]?.schema])), needed);
    if (needed.length > 0) required.push(location);
  }
  const bodies = explanation.payloads.filter((payload) => payload.name.startsWith('body:') && !payload.name.endsWith(':item'));
  const body = bodies.find((payload) => payload.name.includes('json')) ?? bodies[0];
  if (body !== undefined) {
    properties.body = body.schema;
    if (body.required) required.push('body');
  }
  return { ...object(properties, required), additionalProperties: false };
};

/** The first 2xx JSON response's schema, as MCP takes it: an object, or wrapped under `result`. */
const outputOf = (explanation: Explanation): { schema?: Record<string, unknown>; wrap: boolean } => {
  const success = explanation.payloads
    .filter((payload) => /^response:2\d\d:[^:]*json[^:]*$/u.test(payload.name))
    .toSorted((a, b) => a.name.localeCompare(b.name))[0];
  if (success === undefined) return { wrap: false };
  if (isObject(success.schema) && success.schema.type === 'object') return { schema: success.schema, wrap: false };
  return { schema: object({ result: success.schema }, ['result']), wrap: true };
};

const toolOf = (explanation: Explanation, name: string): Tool => {
  const method = explanation.method as string;
  const route = explanation.path as string;
  const output = outputOf(explanation);
  const prose = [explanation.summary, explanation.description].filter((text) => text !== undefined);
  return {
    name,
    ...(explanation.summary === undefined ? {} : { title: explanation.summary }),
    description: prose.length === 0 ? `${method} ${route}` : prose.join('\n\n'),
    inputSchema: inputOf(explanation),
    ...(output.schema === undefined ? {} : { outputSchema: output.schema }),
    annotations: { readOnlyHint: READ_ONLY.has(method) },
    route: { operationId: explanation.id, method, path: route, output: output.schema !== undefined, wrap: output.wrap },
  };
};

export interface McpOptions {
  readonly include?: readonly string[];
  readonly transport: 'stdio' | 'http';
}

/** The options, checked: a wrong one is refused with its fix rather than ignored. */
export const optionsOf = (options: Readonly<Record<string, unknown>>): McpOptions => {
  const { include, transport = 'stdio' } = options;
  if (transport !== 'stdio' && transport !== 'http') throw new UsageError(`mcp: transport is "${String(transport)}". fix: set \`transport\` to "stdio" or "http"`);
  if (include === undefined) return { transport };
  if (!Array.isArray(include) || !include.every((entry) => typeof entry === 'string' && entry !== '')) {
    throw new UsageError('mcp: `include` is not a list of operation ids. fix: set `include` to ids or `tag:<name>` entries, e.g. ["listPets", "tag:admin"]');
  }
  return { include: include as string[], transport };
};

const finding = (code: string, pointer: string, message: string, fix: string): ContractFinding => ({ code, pointer, message, fix });

/** The tools `gen mcp` writes, and what it reports about the ones it did not. */
export const toolsOf = (contract: Contract, options: McpOptions): { tools: Tool[]; findings: ContractFinding[] } => {
  const findings: ContractFinding[] = [];
  const { include } = options;
  const chosen = contract.operations.filter((operation) => {
    if (include === undefined) return true;
    const tags = tagsOf(contract, operation);
    return include.some((entry) => (entry.startsWith('tag:') ? tags.includes(entry.slice('tag:'.length)) : entry === operation.id));
  });
  for (const entry of include ?? []) {
    const matched = contract.operations.some((operation) => (entry.startsWith('tag:') ? tagsOf(contract, operation).includes(entry.slice('tag:'.length)) : entry === operation.id));
    if (!matched) findings.push(finding('mcp-include-unmatched', '#', `\`include\` names "${entry}", which matches no operation`, 'use an operation id from `apicontract explain --list`, or `tag:<name>` with a tag the spec declares'));
  }
  const explained = chosen.map((operation) => describe(contract, operation));
  const routed = explained.filter((explanation) => {
    if (explanation.method !== undefined) return true;
    findings.push(finding('mcp-not-http', explanation.source, `"${explanation.id}" has no HTTP route, so it is not a tool`, 'leave it out of `include`; a webhook is called by the API, not by an agent'));
    return false;
  });
  if (include === undefined && routed.length > MAX_TOOLS) {
    findings.push(
      finding(
        'mcp-too-many-tools',
        '#/paths',
        `the spec has ${String(routed.length)} operations and no tool was generated: past ${String(MAX_TOOLS)} tools an agent picks worse`,
        'set the `include` option of the mcp target to the operation ids or `tag:<name>` entries the agent needs',
      ),
    );
    return { tools: [], findings };
  }
  const names = toolNames(routed.map((explanation) => explanation.id));
  for (const explanation of routed) {
    if (explanation.cycles !== undefined) {
      findings.push(
        finding('mcp-cycle-cut', explanation.source, `"${explanation.id}" has a recursive schema; the tool's schema accepts anything where it repeats (${explanation.cycles.join(', ')})`, 'accept the looser schema, or validate the recursion in the handler'),
      );
    }
  }
  return { tools: routed.map((explanation) => toolOf(explanation, names.get(explanation.id) as string)), findings };
};
