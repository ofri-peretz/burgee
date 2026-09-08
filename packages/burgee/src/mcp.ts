/**
 * `--mcp` — the program served as MCP tools over stdio (N1). Newline-delimited JSON-RPC
 * 2.0 against `node:readline`, three methods, no SDK (N3): `initialize`, `tools/list`,
 * `tools/call`. Tool definitions come from the manifest and nothing else; a tool call is
 * the same run a `--json` caller gets, so both see one envelope (N4).
 *
 * Only a command that declares its `effects` is a tool (N2, N6): an agent gaining
 * shell-equivalent power over a CLI nobody meant to publish is a security posture, not a
 * convenience.
 */
import { createInterface } from 'node:readline';

import { type CommandNode, type Effects, type Manifest } from './manifest.js';
import { inputSchemaOf, type JsonSchema, runnable, typedName } from './schema.js';

export const MCP_PROTOCOL_VERSION = '2025-06-18';

interface Request {
  jsonrpc: '2.0';
  id?: number | string | null;
  method: string;
  params?: Record<string, unknown>;
}

export interface ToolAnnotations {
  readOnlyHint: boolean;
  idempotentHint: boolean;
  destructiveHint: boolean;
}

export interface Tool {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  annotations: ToolAnnotations;
}

/** What a tool call runs: the same execute a `--json` caller reaches, with the streams captured. */
export type Invoke = (argv: string[]) => Promise<{ stdout: string; stderr: string; code: number }>;

const JSON_RPC_INVALID_REQUEST = -32600;
const JSON_RPC_METHOD_NOT_FOUND = -32601;
const JSON_RPC_INVALID_PARAMS = -32602;

/** MCP's hints, from the declared effects. `destructiveHint` is only ever false by declaration. */
export function annotationsOf(effects: Effects): ToolAnnotations {
  return {
    readOnlyHint: effects === 'read_only',
    idempotentHint: effects !== 'non_idempotent',
    destructiveHint: effects === 'non_idempotent',
  };
}

/** `config get` → `config_get`: MCP tool names are `[a-zA-Z0-9_-]`. */
export const toolName = (node: CommandNode, root: string[]): string => typedName(node, root).replaceAll(' ', '_');

function describe(node: CommandNode): string {
  const parts = [node.description ?? node.summary ?? ''];
  for (const e of node.examples ?? []) parts.push(`Example: ${e.command}${e.description === undefined ? '' : ` — ${e.description}`}`);
  return parts.filter((p) => p !== '').join('\n');
}

/** The tool list: every runnable, visible command that declared its effects. */
export function toolsOf(manifest: Manifest): Tool[] {
  return runnable(manifest)
    .filter((c): c is CommandNode & { effects: Effects } => c.effects !== undefined)
    .map((c) => ({ name: toolName(c, manifest.rootPath), description: describe(c), inputSchema: inputSchemaOf(c), annotations: annotationsOf(c.effects) }));
}

function optionArgs(node: CommandNode, args: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const [name, spec] of Object.entries(node.options)) {
    const value = args[name];
    if (value === undefined || value === null) continue;
    if (spec.type === 'boolean') {
      if (value === true) out.push(`--${name}`);
    } else out.push(`--${name}`, String(value));
  }
  return out;
}

function positionalArgs(node: CommandNode, args: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const a of node.arguments ?? []) {
    const value = args[a.name];
    if (value === undefined || value === null) continue;
    out.push(...(Array.isArray(value) ? value.map(String) : [String(value)]));
  }
  return out;
}

/** A tool call's arguments back into argv: the command, its options, `--json`, then positionals in declared order. */
export function argvOf(node: CommandNode, root: string[], args: Record<string, unknown>): string[] {
  const command = typedName(node, root).split(' ').filter((s) => s !== '');
  return [...command, ...optionArgs(node, args), '--json', ...positionalArgs(node, args)];
}

interface Session {
  manifest: Manifest;
  invoke: Invoke;
  serverInfo: { name: string; version: string };
}

async function callTool(session: Session, params: Record<string, unknown> | undefined): Promise<unknown> {
  const { manifest, invoke } = session;
  const root = manifest.rootPath;
  const given = params ?? {};
  const raw = given['name'];
  const name = typeof raw === 'string' ? raw : '';
  const exposed = new Set(toolsOf(manifest).map((t) => t.name));
  const node = exposed.has(name) ? runnable(manifest).find((c) => toolName(c, root) === name) : undefined;
  if (node === undefined) return { error: { code: JSON_RPC_INVALID_PARAMS, message: `unknown tool "${name}"` } };
  const args = (given['arguments'] ?? {}) as Record<string, unknown>;
  const { stdout, stderr, code } = await invoke(argvOf(node, root, args));
  // The envelope is the payload (N4): stdout carries it on success and on a reported failure.
  const text = stdout.trim() !== '' ? stdout.trim() : stderr.trim();
  return { result: { content: [{ type: 'text', text }], isError: code !== 0 } };
}

async function handle(session: Session, request: Request): Promise<unknown> {
  switch (request.method) {
    case 'initialize':
      return { result: { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: session.serverInfo } };
    case 'ping':
      return { result: {} };
    case 'tools/list':
      return { result: { tools: toolsOf(session.manifest) } };
    case 'tools/call':
      return await callTool(session, request.params);
    default:
      return { error: { code: JSON_RPC_METHOD_NOT_FOUND, message: `method not found: ${request.method}` } };
  }
}

export interface ServeOptions {
  input: NodeJS.ReadableStream;
  output: { write: (s: string) => unknown };
  invoke: Invoke;
}

/** A running server: `done` settles when the input closes; `swap` serves a new manifest and says so (W2). */
export interface McpServer {
  done: Promise<void>;
  /**
   * Serve this manifest (and its invoke) from the next request on, and emit
   * `notifications/tools/list_changed` so a connected client re-lists. A call already in
   * flight finishes against the manifest it started on.
   */
  swap: (manifest: Manifest, invoke?: Invoke) => void;
}

/**
 * Start serving; `done` settles when the input closes. Notifications (no `id`) get no
 * reply; a malformed line gets a JSON-RPC error with a null id, as the spec asks.
 */
export function startMcp(manifest: Manifest, opts: ServeOptions): McpServer {
  const session: Session = {
    manifest,
    invoke: opts.invoke,
    serverInfo: { name: manifest.rootPath.join(' ') || 'burgee', version: manifest.version ?? '0.0.0' },
  };
  const reply = (body: Record<string, unknown>): void => void opts.output.write(`${JSON.stringify({ jsonrpc: '2.0', ...body })}\n`);
  const swap = (next: Manifest, invoke?: Invoke): void => {
    session.manifest = next;
    if (invoke !== undefined) session.invoke = invoke;
    reply({ method: 'notifications/tools/list_changed' });
  };
  const done = serve(session, opts.input, reply);
  return { done, swap };
}

/** Serve until the input closes. */
export async function serveMcp(manifest: Manifest, opts: ServeOptions): Promise<void> {
  return await startMcp(manifest, opts).done;
}

async function serve(session: Session, input: NodeJS.ReadableStream, reply: (body: Record<string, unknown>) => void): Promise<void> {
  for await (const line of createInterface({ input, crlfDelay: Infinity })) {
    if (line.trim() === '') continue;
    let request: Request;
    try {
      request = JSON.parse(line) as Request;
    } catch {
      reply({ id: null, error: { code: JSON_RPC_INVALID_REQUEST, message: 'invalid JSON' } });
      continue;
    }
    if (typeof request.method !== 'string') {
      reply({ id: request.id ?? null, error: { code: JSON_RPC_INVALID_REQUEST, message: 'missing method' } });
      continue;
    }
    // A notification carries no id and expects no reply.
    if (request.id === undefined) continue;
    const outcome = (await handle(session, request)) as Record<string, unknown>;
    reply({ id: request.id, ...outcome });
  }
}
