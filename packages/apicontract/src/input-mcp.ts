/**
 * The MCP input format (apicontract-inputs R6): a snapshot of what a Model Context Protocol server
 * lists, read into the model. It imports only `apicontract/core`.
 *
 * A document is a `tools/list` result (`{ tools }`), a `prompts/list` result (`{ prompts }`), a
 * `resources/templates/list` result (`{ resourceTemplates }`), any mix of the three in one object,
 * the JSON-RPC response that carries one (`{ jsonrpc, result }`), or a single tool definition
 * (`{ name, inputSchema }`, the shape servers commit as tool snapshots).
 *
 * - A tool is one operation named by the tool: `inputSchema` is its `tool-call` payload and
 *   `outputSchema`, when declared, its `tool-result` payload.
 * - A prompt is the operation `prompt:<name>`: its `arguments` list becomes a `tool-call` object
 *   schema of strings, synthesised, so it carries a finding.
 * - A resource template is the operation `resource:<uriTemplate>`: the template's variables become
 *   a `tool-call` object schema of strings, synthesised, with a finding.
 *
 * Schemas are handed over as written, `$ref`s intact.
 */
import { type Contract, type ContractFinding, type JsonSchema, type Operation, type Payload } from './core/model.js';

type Dict = Readonly<Record<string, unknown>>;

const isDict = (value: unknown): value is Dict => typeof value === 'object' && value !== null && !Array.isArray(value);

const LISTS = ['tools', 'prompts', 'resourceTemplates'] as const;

/** A document this adapter does not read. The message ends in a `fix:` line. */
export class McpError extends Error {
  constructor(reason: string, fix: string) {
    super(`not an MCP snapshot: ${reason}. fix: ${fix}`);
    this.name = 'McpError';
  }
}

const isTool = (value: Dict): boolean => typeof value.name === 'string' && 'inputSchema' in value;

const hasList = (value: Dict): boolean => LISTS.some((key) => Array.isArray(value[key]));

const isEnvelope = (value: Dict): value is Dict & { result: Dict } => typeof value.jsonrpc === 'string' && isDict(value.result) && hasList(value.result);

/** Whether `document` is an MCP list result, its JSON-RPC response, or one tool (R2). */
export const detect = (document: unknown): boolean => isDict(document) && (hasList(document) || isTool(document) || isEnvelope(document));

/** An object schema of string members, the shape prompt arguments and URI variables have on the wire. */
const strings = (members: readonly { name: string; description?: unknown; required: boolean }[]): JsonSchema => ({
  type: 'object',
  properties: Object.fromEntries(
    members.map(({ name, description }) => [name, typeof description === 'string' ? { type: 'string', description } : { type: 'string' }]),
  ),
  required: members.filter(({ required }) => required).map(({ name }) => name),
});

/** RFC 6570 operators whose variables may be left out of the URI. */
const OPTIONAL_OPERATORS = new Set(['.', '/', ';', '?', '&']);

/** The variables of a URI template; one in a `{x}`, `{+x}` or `{#x}` expression is required. */
const variables = (template: string): { name: string; required: boolean }[] =>
  (template.match(/\{[^}]*\}/g) ?? []).flatMap((braced) => {
    const expression = braced.slice(1, -1);
    const operator = /^[+#./;?&]/.test(expression) ? expression.slice(0, 1) : '';
    return expression
      .slice(operator.length)
      .split(',')
      .map((variable) => ({ name: variable.replace(/(\*|:\d*)$/, ''), required: !OPTIONAL_OPERATORS.has(operator) }));
  });

type Finding = (code: string, pointer: string, message: string, fix: string) => void;

const toolOf = (tool: Dict, name: string, at: string, report: Finding): Operation => {
  const payloads: Payload[] = [];
  if (isDict(tool.inputSchema)) {
    payloads.push({ name: 'arguments', direction: 'tool-call', schema: tool.inputSchema, required: true });
  } else {
    report(
      'input-schema-missing',
      `${at}/inputSchema`,
      `tool \`${name}\` has no object \`inputSchema\`, so its arguments are read as \`{ "type": "object" }\``,
      'declare `inputSchema` as an object schema; a tool without parameters has `{ "type": "object" }`',
    );
    payloads.push({ name: 'arguments', direction: 'tool-call', schema: { type: 'object' }, required: true });
  }
  if (isDict(tool.outputSchema)) {
    payloads.push({ name: 'structuredContent', direction: 'tool-result', schema: tool.outputSchema, required: true });
  } else if (tool.outputSchema !== undefined) {
    report(
      'output-schema-dropped',
      `${at}/outputSchema`,
      `tool \`${name}\` declares an \`outputSchema\` that is not an object schema, so its result is not read`,
      'make `outputSchema` an object schema, or remove it',
    );
  }
  return { id: name, source: at, payloads };
};

const promptOf = (prompt: Dict, name: string, at: string, report: Finding): Operation => {
  const declared = Array.isArray(prompt.arguments) ? prompt.arguments.filter((argument): argument is Dict => isDict(argument) && typeof argument.name === 'string') : [];
  const members = declared.map((argument) => ({ name: argument.name as string, description: argument.description, required: argument.required === true }));
  // A prompt with no arguments has nothing synthesised: its payload is the empty object it declares.
  if (declared.length > 0) {
    report(
      'prompt-arguments-synthesised',
      `${at}/arguments`,
      `prompt \`${name}\` declares arguments, not a schema; its \`tool-call\` payload is an object of strings built from them`,
      'nothing to do: prompt arguments are strings on the wire; describe each in `arguments[].description`',
    );
  }
  return { id: `prompt:${name}`, source: at, payloads: [{ name: 'arguments', direction: 'tool-call', schema: strings(members), required: true }] };
};

const templateOf = (template: Dict, uriTemplate: string, at: string, report: Finding): Operation => {
  report(
    'resource-variables-synthesised',
    `${at}/uriTemplate`,
    `resource template \`${uriTemplate}\` declares a URI template, not a schema; its \`tool-call\` payload is an object of strings built from its variables`,
    'nothing to do: URI template variables are strings',
  );
  return {
    id: `resource:${uriTemplate}`,
    source: at,
    payloads: [{ name: 'variables', direction: 'tool-call', schema: strings(variables(uriTemplate)), required: true }],
  };
};

/** The key each entry of a list is named by, and how it is read. */
const READERS = {
  tools: { key: 'name', of: toolOf },
  prompts: { key: 'name', of: promptOf },
  resourceTemplates: { key: 'uriTemplate', of: templateOf },
} as const;

/** Every named entry of the three lists, in document order; a second entry with a taken id is reported, not read. */
const entriesOf = (body: Dict, base: string, report: Finding): Operation[] => {
  const operations: Operation[] = [];
  const seen = new Set<string>();
  for (const list of LISTS) {
    const entries: unknown[] = Array.isArray(body[list]) ? body[list] : [];
    const { key, of } = READERS[list];
    for (const [index, entry] of entries.entries()) {
      const at = `${base}/${list}/${String(index)}`;
      if (!isDict(entry) || typeof entry[key] !== 'string') {
        report('entry-unnamed', at, `\`${list}[${String(index)}]\` has no \`${key}\`, so it is not read`, `give it a string \`${key}\``);
        continue;
      }
      const operation = of(entry, entry[key], at, report);
      if (seen.has(operation.id)) {
        report('duplicate-name', at, `\`${operation.id}\` is listed twice; the first is read`, 'give each entry a distinct name');
        continue;
      }
      seen.add(operation.id);
      operations.push(operation);
    }
  }
  return operations;
};

/** Read an MCP snapshot into the model. */
export const read = (document: unknown): Contract => {
  if (!detect(document)) {
    throw new McpError(
      'it has no `tools`, `prompts` or `resourceTemplates` list and is not a tool',
      'pass the `result` of `tools/list`, `prompts/list` or `resources/templates/list`, or one tool',
    );
  }
  const root = document as Dict;
  const findings: ContractFinding[] = [];
  const report: Finding = (code, pointer, message, fix) => {
    findings.push({ code, pointer, message, fix });
  };
  if (isTool(root) && !hasList(root)) {
    return { format: 'mcp', document, operations: [toolOf(root, root.name as string, '#', report)], findings };
  }
  const [body, base] = isEnvelope(root) ? [root.result, '#/result'] : [root, '#'];
  if (typeof body.nextCursor === 'string') {
    report(
      'page-incomplete',
      `${base}/nextCursor`,
      'this snapshot is one page of a longer list; entries on later pages are not read',
      'snapshot every page: repeat the request with `cursor` until no `nextCursor` comes back',
    );
  }
  return { format: 'mcp', document, operations: entriesOf(body, base, report), findings };
};

/** The adapter as the plugin host registers it (spec.md R-PL1). */
export const adapter = Object.freeze({
  name: 'mcp',
  description: 'MCP snapshots: `tools/list`, `prompts/list` and `resources/templates/list` results, or one tool',
  detect,
  read,
});
