/**
 * `--mcp` — the program served as MCP tools over stdio (N1). Newline-delimited JSON-RPC
 * 2.0 against `node:readline`, three methods, no SDK (N3): `initialize`, `tools/list`,
 * `tools/call`. Tool definitions come from the manifest and nothing else; a tool call is
 * the same run a `--json` caller gets, so both see one envelope (N4).
 *
 * A command an author withheld is not a tool (N2, N6): an agent gaining shell-equivalent
 * power over a CLI nobody meant to publish is a security posture, not a convenience. That is
 * a decision somebody wrote down — `effects: 'withheld'` — and `checkCommand` refuses a
 * runnable command that omits `effects` on burgee's own API, so on that API silence is
 * impossible.
 *
 * It is not impossible on the façades, and since 2026-09-21 silence is no longer read as
 * refusal there (G1). See {@link toolsOf}.
 */
import { Console } from 'node:console';
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';

import { WITHHELD } from './definition.js';
import { type CommandNode, type Effects, type Manifest } from './manifest.js';
import { kebab } from './names.js';
import { host } from './runtime.js';
import { inputSchemaOf, type JsonSchema, runnable, typedName } from './schema.js';

export const MCP_PROTOCOL_VERSION = '2025-06-18';

interface Request {
  jsonrpc: '2.0';
  id?: number | string | null;
  method: string;
  params?: Record<string, unknown>;
}

export interface ToolAnnotations {
  readOnlyHint?: boolean;
  idempotentHint?: boolean;
  destructiveHint?: boolean;
  /**
   * `'undeclared'`, and only ever that (G1). It appears on a command whose author said
   * nothing — every commander and yargs command that did not call `.effects()` — and never
   * beside a hint, because a hint is what a declaration produces.
   */
  effects?: 'undeclared';
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

/**
 * MCP's hints, from the declared effects. `destructiveHint` is only ever false by declaration.
 *
 * No declaration returns no hints (G1). That is not a gap: MCP defines a default for each of
 * the three — `readOnlyHint: false`, `destructiveHint: true`, `idempotentHint: false` — so an
 * absent hint already reads as *assume the worst*, in the client's own vocabulary and without
 * burgee inventing a value it has no basis for. `effects: 'undeclared'` is the positive half:
 * this command is not a `read_only` one, and it is not a `withheld` one either — nobody said.
 */
export function annotationsOf(effects?: Effects): ToolAnnotations {
  if (effects === undefined) return { effects: 'undeclared' };
  return {
    readOnlyHint: effects === 'read_only',
    idempotentHint: effects !== 'non_idempotent',
    destructiveHint: effects === 'non_idempotent',
  };
}

/**
 * `config get` → `config_get`: MCP tool names are `[a-zA-Z0-9_-]`, one character or more. A
 * program whose root runs — a single `run(defineCommand(…))`, a commander program with a root
 * `.action()` — has no typed name at all, so its tool is named after the program.
 */
export const toolName = (node: CommandNode, root: string[]): string => (typedName(node, root) || root.join(' ')).replaceAll(' ', '_');

function describe(node: CommandNode): string {
  const parts = [node.description ?? node.summary ?? ''];
  for (const e of node.examples ?? []) parts.push(`Example: ${e.command}${e.description === undefined ? '' : ` — ${e.description}`}`);
  return parts.filter((p) => p !== '').join('\n');
}

/**
 * The tool list: every runnable, visible command an author has not withheld.
 *
 * One word is absent and one is not, and until 2026-09-21 they were the same thing. An
 * author who wrote `'withheld'` thought about it and said no; that is what the word is for
 * and it still means absent. An author who wrote nothing — which on burgee's own API
 * `checkCommand` refuses, and which **every** command built through the commander or yargs
 * façade is, because neither incumbent has a notion of effects and neither can be made to
 * acquire one without breaking the suites that grade the façades — was treated the same way,
 * so a migrated user's whole program was silently not a tool.
 *
 * Reading silence as refusal was conservative and it was also the thing standing between the
 * product and its own pitch. Absent-from-the-list is strictly worse for the caller than
 * present-with-honest-annotations: an agent that cannot see a command cannot decide about it,
 * and cannot ask. So an undeclared command is listed and says so — see {@link annotationsOf}
 * for why it carries no hints rather than a reassuring default.
 */
export function toolsOf(manifest: Manifest): Tool[] {
  return runnable(manifest)
    .filter((c) => c.effects !== WITHHELD)
    .map((c) => ({ name: toolName(c, manifest.rootPath), description: describe(c), inputSchema: inputSchemaOf(c), annotations: annotationsOf(c.effects as Effects | undefined) }));
}

/**
 * Each argument as the flag `inputSchemaOf` advertises for it — `flag: '--dry-run'` for the
 * property `dryRun`. This wrote `--${name}`, the canonical key with dashes in front, which the
 * engine and commander both refuse for every multi-word option.
 *
 * `false` for a boolean the command would otherwise read as `true` — a default, or an
 * environment variable behind it — goes as `--no-<name>`. Any other `false` is left unsaid:
 * a typed negation counts as *given* to a relation (S2), so sending one for every boolean an
 * agent spells out would trip `dependsOn` and `exclusive` on options nobody set.
 */
function optionArgs(node: CommandNode, args: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const [name, spec] of Object.entries(node.options)) {
    const value = args[name];
    if (value === undefined || value === null) continue;
    const flag = `--${kebab(name)}`;
    if (spec.type !== 'boolean') out.push(flag, String(value));
    else if (value === true) out.push(flag);
    else if (value === false && spec.negatable !== false && (spec.default === true || spec.env !== undefined)) out.push(`--no-${kebab(name)}`);
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

/**
 * The console methods that print to stdout. `warn`, `error`, `trace` and `assert` go to stderr
 * and stay there; the counters, timers and groups are here because their state lives on the
 * console that prints them.
 */
const STDOUT_CONSOLE = ['log', 'info', 'debug', 'dir', 'dirxml', 'table', 'group', 'groupCollapsed', 'groupEnd', 'count', 'countReset', 'time', 'timeLog', 'timeEnd'] as const;

/** Set while a frame goes out, so a transport that *is* `process.stdout` passes the capture. */
let framing = false;

/**
 * Run one tool call with its stdout held back: what it prints — `console.log` in a commander
 * action, a `process.stdout.write` — is returned instead of reaching the stream the frames go
 * out on, where a client reads it as a malformed message. stderr is not touched. Everything is
 * put back when the call settles, however it settles.
 *
 * One capture at a time is all there is to handle: `serve` awaits each request before reading
 * the next line, so two calls never overlap. `framing` covers the one write that can land
 * mid-call — `swap`'s notification from `burgee dev`.
 */
let sessions = 0;
let release = (): void => undefined;

/**
 * Hold stdout for as long as a server runs, not only for one call: a timer or a stream a
 * handler left behind prints after its reply went out, and stdout is still the transport.
 * Outside a call, and outside a frame, a write goes to stderr. A call's capture wraps this
 * one and hands its frames through it. Counted, so servers that overlap release in any order.
 */
function holdStdout(): () => void {
  if (sessions++ === 0) {
    const stdout = host.stdout;
    const write = stdout.write;
    stdout.write = function (...args: unknown[]): boolean {
      return Reflect.apply(framing ? write : host.stderr.write, framing ? stdout : host.stderr, args) as boolean;
    } as typeof stdout.write;
    release = () => void (stdout.write = write);
  }
  let held = true;
  return () => {
    if (held && --sessions === 0) release();
    held = false;
  };
}

async function printedBy<T>(run: () => Promise<T>): Promise<{ settled: PromiseSettledResult<T>; printed: string }> {
  const chunks: string[] = [];
  const decoder = new TextDecoder();
  // A string is text already; bytes are UTF-8, which is all a console or a `write` sends.
  const take = (chunk: unknown): void => void chunks.push(typeof chunk === 'string' ? chunk : decoder.decode(chunk as Uint8Array));
  const sink = new Writable({
    decodeStrings: false,
    write(chunk, _encoding, done): void {
      take(chunk);
      done();
    },
  });
  const stdout = host.stdout;
  const write = stdout.write;
  stdout.write = function (chunk: unknown, ...rest: unknown[]): boolean {
    if (framing) return Reflect.apply(write, stdout, [chunk, ...rest]) as boolean;
    take(chunk);
    const done = rest.find((r): r is () => void => typeof r === 'function');
    if (done !== undefined) queueMicrotask(done);
    return true;
  } as typeof stdout.write;
  const printer = new Console({ stdout: sink, stderr: host.stderr });
  const saved = STDOUT_CONSOLE.map((m) => [m, console[m]] as const);
  for (const m of STDOUT_CONSOLE) Reflect.set(console, m, printer[m].bind(printer));
  try {
    return { settled: { status: 'fulfilled', value: await run() }, printed: chunks.join('') };
  } catch (reason) {
    return { settled: { status: 'rejected', reason }, printed: chunks.join('') };
  } finally {
    for (const [m, fn] of saved) Reflect.set(console, m, fn);
    stdout.write = write;
  }
}

async function callTool(session: Session, params: Record<string, unknown> | undefined): Promise<unknown> {
  const { manifest, invoke } = session;
  const root = manifest.rootPath;
  const given = params ?? {};
  const raw = given['name'];
  const name = typeof raw === 'string' ? raw : '';
  // The same predicate `toolsOf` filters by, rather than a `Set` of its output: one rule for
  // what is callable, in one place, and a withheld command is still refused here.
  const node = runnable(manifest).find((c) => c.effects !== WITHHELD && toolName(c, root) === name);
  if (node === undefined) return { error: { code: JSON_RPC_INVALID_PARAMS, message: `unknown tool "${name}"` } };
  const args = (given['arguments'] ?? {}) as Record<string, unknown>;
  const { settled, printed } = await printedBy(async () => await invoke(argvOf(node, root, args)));
  let text: string;
  let isError: boolean;
  if (settled.status === 'fulfilled') {
    const { stdout, stderr, code } = settled.value;
    // The envelope is the payload (N4): stdout carries it on success and on a reported failure.
    text = stdout.trim() !== '' ? stdout.trim() : stderr.trim();
    isError = code !== 0;
  } else {
    // A runner that rejects is this call's failure, not the transport's: the server goes on.
    text = settled.reason instanceof Error ? settled.reason.message : String(settled.reason);
    isError = true;
  }
  // What the handler printed is part of its answer — for a commander action that prints
  // rather than returns, it is the whole answer — so it follows the envelope as text.
  const content = [{ type: 'text', text }];
  if (printed.trim() !== '') content.push({ type: 'text', text: printed.trimEnd() });
  return { result: { content, isError } };
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
  const reply = (body: Record<string, unknown>): void => {
    framing = true;
    try {
      opts.output.write(`${JSON.stringify({ jsonrpc: '2.0', ...body })}\n`);
    } finally {
      framing = false;
    }
  };
  const swap = (next: Manifest, invoke?: Invoke): void => {
    session.manifest = next;
    if (invoke !== undefined) session.invoke = invoke;
    reply({ method: 'notifications/tools/list_changed' });
  };
  const unhold = holdStdout();
  const done = serve(session, opts.input, reply).finally(unhold);
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
