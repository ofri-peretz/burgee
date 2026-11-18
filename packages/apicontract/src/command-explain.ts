/**
 * `apicontract explain <operation>` (apicontract-agents R1): one operation fully resolved, every
 * `$ref` inlined and every cycle cut with a marker, as Markdown or `--json`, under `--max-bytes`.
 * `--list` prints the operation ids, one per line.
 *
 * The spec is `--input`, or the config's `input` (with its overlays) when there is a config. The
 * command declares `--max-bytes` itself: burgee's global of that name keeps a non-list result
 * whole, and an explanation is cut inside, deepest schema first, so it never goes over.
 */
import { resolve } from 'node:path';

import { defineCommand } from 'burgee';

import { capped, describe, type Explanation } from './command-explain-operation.js';
import { toMarkdown } from './command-explain-text.js';
import { createHost } from './host.js';
import { builtinAdapters } from './inputs.js';
import { ConfigError, loadConfig, UsageError } from './run-config.js';
import { readDocument, readInput } from './run-input.js';

export interface ExplainOptions {
  /** What `--input` is relative to, and where a config is looked for. */
  readonly cwd: string;
  readonly input?: string | undefined;
  readonly operation?: string | undefined;
  readonly list?: boolean | undefined;
  readonly maxBytes?: number | undefined;
}

/** How many ids a refusal names before `--list` takes over. */
const SHOWN = 10;

/** The key burgee's text surface reads a result's own text from (`burgee/src/render.ts`). */
const TEXT = Symbol.for('burgee.text');

/** The parsed spec: `--input`, else the config's input with its overlays. */
const documentOf = async (cwd: string, input: string | undefined): Promise<unknown> => {
  if (input !== undefined) return readDocument(resolve(cwd, input), '--input');
  const config = await loadConfig(cwd);
  if (config?.input === undefined) {
    throw new ConfigError(resolve(cwd, 'apicontract.config.json'), ['no spec was named. fix: pass --input <file>, or add `"input"` to apicontract.config.json']);
  }
  return readInput({ root: config.root, file: config.file, input: config.input, overlays: config.overlays });
};

/** A result whose text surface is `text` and whose `--json` is `data`. */
const withText = <T extends object>(data: T, text: string): T => Object.defineProperty(data, TEXT, { value: () => text, enumerable: false });

export const explain = async (options: ExplainOptions): Promise<Explanation | string[]> => {
  const { maxBytes } = options;
  if (maxBytes !== undefined && (!Number.isInteger(maxBytes) || maxBytes < 1)) {
    throw new UsageError(`--max-bytes takes a whole number of bytes above 0, not ${String(maxBytes)}. fix: pass a number such as --max-bytes 4096`);
  }
  const host = createHost();
  host.register({ name: 'apicontract', adapters: builtinAdapters });
  const contract = host.read(await documentOf(options.cwd, options.input));
  const ids = contract.operations.map((operation) => operation.id);
  if (options.list === true) return ids;
  if (options.operation === undefined) throw new UsageError('name the operation to explain. fix: run `apicontract explain --list` for the ids, then `apicontract explain <id>`');
  const operation = contract.operations.find((candidate) => candidate.id === options.operation);
  if (operation === undefined) {
    const shown = ids.slice(0, SHOWN).join(', ');
    throw new UsageError(`no operation is named "${options.operation}". fix: pass one of: ${shown}${ids.length > SHOWN ? ', …' : ''} (\`--list\` prints them all)`);
  }
  const explanation = capped(describe(contract, operation), maxBytes);
  return withText({ ...explanation }, toMarkdown(explanation));
};

/** The folder the user ran the command in; the process itself is named only by the bin (process-reference lock). */
// Stryker disable next-line StringLiteral: equivalent, `resolve('', name)` and `resolve('.', name)` are both the working directory
const HERE = '.';

export const command = defineCommand({
  name: 'explain',
  description: 'One operation, message or tool, fully resolved and size-capped for an agent',
  effects: 'read_only',
  arguments: [{ name: 'operation', required: false, description: 'the operation id; `--list` prints them' }],
  options: {
    input: { type: 'string', description: 'the spec, JSON or YAML (default: `input` in apicontract.config.json)', placeholder: 'file' },
    list: { type: 'boolean', description: 'print the operation ids, one per line' },
    maxBytes: { type: 'number', description: 'cut the deepest schemas first until the JSON fits; the cuts are listed under `truncated`', placeholder: 'n' },
  },
  run: async ({ args, options }) => explain({ cwd: HERE, input: options.input, operation: args.operation, list: options.list, maxBytes: options.maxBytes }),
});
