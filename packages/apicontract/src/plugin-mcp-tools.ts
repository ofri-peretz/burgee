/**
 * `gen mcp`'s model (apicontract-agents R4, R6): which operations become tools, what each tool is
 * named, and its schemas and annotations. No code is written here; `plugin-mcp-code.ts` prints it.
 *
 * - **Selection.** Every operation with an HTTP route, or the ones `include` names (an id, or
 *   `tag:<name>`). Past {@link MAX_TOOLS} without `include` no tool is generated and a finding names
 *   the cap and the option: a long tool list degrades the agent that reads it. An operation tagged
 *   one of {@link HIDDEN_TAGS} is left out unless `include` names it, by id or by that tag
 *   (contractdiff-compat-depth R6).
 * - **Budget.** With `budget` (tokens), the tool list's size is estimated as its JSON's characters
 *   ÷ {@link CHARS_PER_TOKEN} and reported against it; over budget no tool is generated and the
 *   finding names the largest tools, so the fix is to narrow `include`, not to guess.
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

/** Tags an agent has no use for: their operations are tools only when `include` names them. */
export const HIDDEN_TAGS: readonly string[] = ['internal', 'health'];
/** The size estimate's ratio: a rough, stated estimate, not a tokenizer. */
export const CHARS_PER_TOKEN = 4;
/** How many of the largest tools an over-budget finding names. */
const LARGEST = 3;

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
    .replaceAll(/([A-Z])([A-Z][a-z])/gu, '$1_$2')
    .replaceAll(/[^A-Za-z\d]+/gu, '_')
    .replaceAll(/^_|_$/gu, '')
    .toLowerCase() || 'operation';

/** A tool name for each id: snake_case, at most 64 characters, cut or colliding names carrying a stable hash. */
export const toolNames = (ids: readonly string[]): Map<string, string> => unique(ids, (id) => fitted(snake(id), id, MAX_NAME), MAX_NAME);

/** A value's own members, read as a record: `{}` for null and undefined, so a missing member reads as `undefined`. */
const membersOf = (value: unknown): Record<string, unknown> => Object(value) as Record<string, unknown>;

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
    const prefix = `param:${location}:`;
    const params = explanation.payloads.filter((payload) => payload.name.startsWith(prefix)).map((payload) => ({ ...payload, name: payload.name.slice(prefix.length) }));
    if (params.length === 0) continue;
    const needed = params.filter((param) => param.required).map((param) => param.name);
    properties[location] = object(Object.fromEntries(params.map((param) => [param.name, param.schema])), needed);
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
  // The reader lists responses in the document's key order, which puts integer keys ascending: the first is the lowest.
  const success = explanation.payloads.find((payload) => /response:2\d\d:[^:]*json[^:]*$/u.test(payload.name));
  if (success === undefined) return { wrap: false };
  if (membersOf(success.schema).type === 'object') return { schema: success.schema as Record<string, unknown>, wrap: false };
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
  /** The most tokens the tool list may take, estimated as characters ÷ {@link CHARS_PER_TOKEN}. */
  readonly budget?: number;
}

/** What `tools/list` answers for a tool: everything but the route, which only the server reads. */
const listed = ({ route: _route, ...tool }: Tool): Omit<Tool, 'route'> => tool;

/** A tool list's estimated size in tokens. */
export const tokensOf = (tools: readonly Tool[]): number => Math.ceil(JSON.stringify(tools.map(listed)).length / CHARS_PER_TOKEN);

/** The options, checked: a wrong one is refused with its fix rather than ignored. */
export const optionsOf = (options: Readonly<Record<string, unknown>>): McpOptions => {
  const { include, transport = 'stdio', budget } = options;
  if (transport !== 'stdio' && transport !== 'http') throw new UsageError(`mcp: transport is "${String(transport)}". fix: set \`transport\` to "stdio" or "http"`);
  if (budget !== undefined && !(Number.isSafeInteger(budget) && (budget as number) > 0)) {
    throw new UsageError(`mcp: budget is ${JSON.stringify(budget)}. fix: set \`budget\` to a whole number of tokens above 0, e.g. 4000`);
  }
  const sized = budget === undefined ? {} : { budget: budget as number };
  if (include === undefined) return { transport, ...sized };
  if (!Array.isArray(include) || !include.every((entry) => typeof entry === 'string' && entry !== '')) {
    throw new UsageError('mcp: `include` is not a list of operation ids. fix: set `include` to ids or `tag:<name>` entries, e.g. ["listPets", "tag:admin"]');
  }
  return { include: include as string[], transport, ...sized };
};

const finding = (code: string, pointer: string, message: string, fix: string): ContractFinding => ({ code, pointer, message, fix });

/** The tools `gen mcp` writes, and what it reports about the ones it did not. */
export const toolsOf = (contract: Contract, options: McpOptions): { tools: Tool[]; findings: ContractFinding[] } => {
  const findings: ContractFinding[] = [];
  const { include } = options;
  const hidden: string[] = [];
  const hiddenBy = new Set<string>();
  const chosen = contract.operations.filter((operation) => {
    const tags = tagsOf(contract, operation);
    const named = (entry: string): boolean => (entry.startsWith('tag:') ? tags.includes(entry.slice('tag:'.length)) : entry === operation.id);
    const hiding = tags.filter((tag) => HIDDEN_TAGS.includes(tag));
    const unhidden = include?.some((entry) => entry === operation.id || hiding.some((tag) => entry === `tag:${tag}`)) === true;
    if (hiding.length > 0 && !unhidden) {
      if (include === undefined || include.some(named)) {
        hidden.push(operation.id);
        for (const tag of hiding) hiddenBy.add(tag);
      }
      return false;
    }
    return include === undefined || include.some(named);
  });
  // The tags that hid something, in the order HIDDEN_TAGS lists them: the ones `include` can name.
  const tagsHiding = HIDDEN_TAGS.filter((tag) => hiddenBy.has(tag));
  if (hidden.length > 0) {
    findings.push(
      finding(
        'mcp-hidden',
        '#/paths',
        `left out ${String(hidden.length)} operation(s) tagged ${tagsHiding.join(' or ')}: ${hidden.join(', ')}`,
        `name one in \`include\` (its id, or ${tagsHiding.map((tag) => `\`tag:${tag}\``).join(' or ')}) if an agent should call it`,
      ),
    );
  }
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
  const tools = routed.map((explanation) => toolOf(explanation, names.get(explanation.id) as string));
  return options.budget === undefined ? { tools, findings } : withinBudget(tools, findings, options.budget);
};

/** The tools if their list fits `budget`, else none and a finding naming the largest; either way, the size. */
const withinBudget = (tools: Tool[], findings: ContractFinding[], budget: number): { tools: Tool[]; findings: ContractFinding[] } => {
  const size = tokensOf(tools);
  const estimate = `about ${String(size)} of ${String(budget)} tokens (estimate: characters ÷ ${String(CHARS_PER_TOKEN)})`;
  if (size <= budget) return { tools, findings: [...findings, finding('mcp-budget', '#', `${String(tools.length)} tool(s), ${estimate}`, 'nothing to do')] };
  const largest = [...tools]
    .sort((a, b) => tokensOf([b]) - tokensOf([a]) || a.name.localeCompare(b.name, 'en'))
    .slice(0, LARGEST)
    .map((tool) => `${tool.name} (${String(tokensOf([tool]))})`);
  return {
    tools: [],
    findings: [
      ...findings,
      finding(
        'mcp-over-budget',
        '#',
        `no tool was generated: ${String(tools.length)} tool(s) take ${estimate}; the largest are ${largest.join(', ')}`,
        'narrow `include` to the operation ids or `tag:<name>` entries the agent needs, or raise `budget`',
      ),
    ],
  };
};
