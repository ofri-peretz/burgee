/**
 * `--mcp` — the program served as MCP tools over stdio (N1). Newline-delimited JSON-RPC
 * 2.0 against `node:readline`, three methods, no SDK (N3): `initialize`, `tools/list`,
 * `tools/call`. `initialize` negotiates the revision ({@link SUPPORTED_REVISIONS}). Tool
 * definitions come from the manifest and nothing else; a tool call is the same run a `--json`
 * caller gets, so both see one envelope (N4).
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
import { AsyncLocalStorage } from 'node:async_hooks';
import { Console } from 'node:console';
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';

import { WITHHELD } from './definition.js';
import { type ArgumentSpec, type CommandNode, type Effects, type Manifest, type OutputSchema } from './manifest.js';
import { kebab } from './names.js';
import { builtin, host } from './runtime.js';
import { inputSchemaOf, type JsonSchema, runnable, typedName } from './schema.js';

/**
 * The revisions `initialize` negotiates, oldest first (mcp-current R3). 2025-11-25 changes nothing
 * a tools-only stdio server sends: every field it adds is optional, for features this server does
 * not offer. 2026-07-28 has no `initialize`, so it is a different server, not a third entry here.
 */
export const SUPPORTED_REVISIONS: readonly string[] = ['2025-06-18', '2025-11-25'];

/** The latest revision this server speaks, and the answer to a client asking for one it does not. */
export const MCP_PROTOCOL_VERSION = '2025-11-25';

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
  /** The command's declared `output.schema`, as the shape of `structuredContent` (mcp-current R2). Absent when none is declared. */
  outputSchema?: OutputSchema;
}

/** What one tool call's run printed, and the code it left with. */
export interface Ran {
  stdout: string;
  stderr: string;
  code: number;
}

/** What a tool call runs: the same execute a `--json` caller reaches, with the streams captured. */
export type Invoke = (argv: string[]) => Promise<Ran>;

/** {@link Invoke} for {@link serveMcpSync}, which cannot wait for a run: it returns, or throws. */
export type InvokeSync = (argv: string[]) => Ran;

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
    .map((c) => ({ name: toolName(c, manifest.rootPath), description: describe(c), inputSchema: inputSchemaOf(c), annotations: annotationsOf(c.effects as Effects | undefined), ...outputSchemaOf(c.output?.schema) }));
}

/**
 * mcp-current R2 — `outputSchema` is the declared `output.schema`, wrapped as `{ result }` when it
 * is not an object type, the same way {@link structuredOf} wraps the result. A command that
 * declares none lists none: an absent schema is honest, and one inferred from a sample is a
 * claim nobody made.
 */
function outputSchemaOf(schema: OutputSchema | undefined): { outputSchema?: OutputSchema } {
  if (schema === undefined) return {};
  return { outputSchema: isObjectType(schema) ? schema : { type: 'object', properties: { result: schema }, required: ['result'] } };
}

const isObjectType = (schema: OutputSchema): boolean => schema['type'] === 'object';

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

/**
 * The positionals, in declared order, up to the last one the call gave. A skipped optional one
 * before it takes its `default`: positionals are read by place, and skipping it moved every later
 * value one place left — `{ env, replicas, dry: false }` handed `false` to `ratio`. With no default
 * there is no word to put there, so the call is refused rather than read into the wrong argument.
 */
function positionalArgs(node: CommandNode, args: Record<string, unknown>): string[] {
  const out: string[] = [];
  const skipped: ArgumentSpec[] = [];
  for (const a of node.arguments ?? []) {
    const value = args[a.name];
    if (value === undefined || value === null) {
      skipped.push(a);
      continue;
    }
    for (const s of skipped.splice(0)) {
      if (s.default === undefined) throw new Error(`"${s.name}" has no default and comes before an argument the call gave: pass it too`);
      out.push(s.default);
    }
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
  invoke: Invoke | InvokeSync;
  serverInfo: { name: string; version: string };
  /** Writes one frame: a reply, or a notification such as a call's progress. */
  reply: (body: Record<string, unknown>) => void;
}

/**
 * What a handler reads off the MCP call it runs in (mcp-current R4, R5): the call's own signal,
 * which `notifications/cancelled` aborts, and the sender of `notifications/progress` when the
 * call carried a `progressToken`. `ctx.js` and `flagstaff/progress` look it up through
 * `Symbol.for('burgee.mcp')` rather than importing this chunk, so neither puts the server on
 * the path of a run that never serves `--mcp`.
 */
export interface McpCall {
  signal: AbortSignal;
  progress?: (done: number, total?: number, message?: string) => void;
}

/** A call in flight, with what it printed so far; `settled` once its reply is decided. */
interface Capture extends McpCall {
  take: (chunk: unknown) => void;
  printer: Console;
  settled: boolean;
}

/**
 * The call each write and each handler belongs to. Calls run concurrently now (R4), so a global
 * swap per call could not tell two apart, or put back what the other had taken: the context a
 * call starts in follows its awaits, timers and callbacks, and says whose output a write is.
 */
const calls = new AsyncLocalStorage<Capture>();
Reflect.set(globalThis, Symbol.for('burgee.mcp'), () => calls.getStore());

/**
 * The console methods that print to stdout. `warn`, `error`, `trace` and `assert` go to stderr
 * and stay there; the counters, timers and groups are here because their state lives on the
 * console that prints them.
 */
const STDOUT_CONSOLE = ['log', 'info', 'debug', 'dir', 'dirxml', 'table', 'group', 'groupCollapsed', 'groupEnd', 'count', 'countReset', 'time', 'timeLog', 'timeEnd'] as const;

/** Set while a frame goes out, so a transport that *is* `process.stdout` passes the capture. */
let framing = false;

/** The call a write belongs to: none for a frame, outside a call, or once the call settled. */
function open(): Capture | undefined {
  const call = calls.getStore();
  return framing || call?.settled !== false ? undefined : call;
}

let sessions = 0;
/** Put back by the last server to stop; assigned by the first to start. */
let release: () => void;

/**
 * Hold stdout and the stdout-printing console for as long as a server runs. A write made inside
 * a call that has not settled — `console.log` in a commander action, a `process.stdout.write` —
 * is that call's, and returned as part of its result instead of reaching the stream the frames
 * go out on, where a client reads it as a malformed message. Anything else that is not a frame
 * goes to stderr: a timer or a stream a handler left behind prints after its reply went out, and
 * stdout is still the transport. `framing` passes the frames, including the one that can land
 * mid-call, `swap`'s notification from `burgee dev`. stderr is not touched. Counted, so servers
 * that overlap release in any order, and everything is put back when the last one stops.
 */
function holdStdout(): () => void {
  if (sessions++ === 0) {
    const stdout = host.stdout;
    const write = stdout.write;
    const saved = STDOUT_CONSOLE.map((m) => [m, console[m]] as const);
    stdout.write = function (chunk: unknown, ...rest: unknown[]): boolean {
      const call = open();
      if (call === undefined) return Reflect.apply(framing ? write : host.stderr.write, framing ? stdout : host.stderr, [chunk, ...rest]) as boolean;
      call.take(chunk);
      const done = rest.find((r): r is () => void => typeof r === 'function');
      if (done !== undefined) queueMicrotask(done);
      return true;
    } as typeof stdout.write;
    // A `Console`'s methods are bound to it, the global one's and each call's printer's alike.
    for (const [m, fn] of saved) Reflect.set(console, m, (...args: unknown[]): unknown => Reflect.apply(open()?.printer[m] ?? fn, undefined, args));
    release = () => {
      for (const [m, fn] of saved) Reflect.set(console, m, fn);
      stdout.write = write;
    };
  }
  return unhold;
}

/** Called once per server: `startMcp` hands it to its own `done.finally`. */
function unhold(): void {
  if (--sessions === 0) release();
}

/** How one tool call's run settled, and what it printed meanwhile. */
interface Printed {
  settled: PromiseSettledResult<Ran>;
  printed: string;
}

/**
 * Run one tool call as `call`, and hand back how it settled and what it printed: once it settles
 * for a run that returns a promise, and at once for one that returns or throws, which is the only
 * kind {@link serveMcpSync} hands it.
 */
function printedBy(call: McpCall, run: () => Ran | Promise<Ran>): Printed | Promise<Printed> {
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
  const capture: Capture = { ...call, take, printer: new Console({ stdout: sink, stderr: host.stderr }), settled: false };
  const end = (settled: PromiseSettledResult<Ran>): Printed => {
    capture.settled = true;
    return { settled, printed: chunks.join('') };
  };
  const rejected = (reason: unknown): Printed => end({ status: 'rejected', reason });
  try {
    const value = calls.run(capture, run);
    return value instanceof Promise ? value.then((ran) => end({ status: 'fulfilled', value: ran }), rejected) : end({ status: 'fulfilled', value });
  } catch (reason) {
    return rejected(reason);
  }
}

/** A tool call's reply: at once when the run returns, as under {@link serveMcpSync}; a promise when it returns one. */
function callTool(session: Session, params: Record<string, unknown> | undefined, signal: AbortSignal): unknown {
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
  const call: McpCall = { signal };
  // R5 — progress only for a call that asked for it, none once it is cancelled, and only a value
  // above the last one sent: the protocol requires progress to increase with every notification.
  const token = (given['_meta'] as { progressToken?: unknown } | undefined)?.progressToken;
  let last = -Infinity;
  if (token !== undefined)
    call.progress = (progress, total, message): void => {
      if (signal.aborted || progress <= last) return;
      last = progress;
      session.reply({ method: 'notifications/progress', params: { progressToken: token, progress, total, message } });
    };
  const ran = printedBy(call, () => invoke(argvOf(node, root, args)));
  return ran instanceof Promise ? ran.then((printed) => resultOf(node, printed)) : resultOf(node, ran);
}

/** The `tools/call` result for `node`, from how its run settled and what it printed. */
function resultOf(node: CommandNode, { settled, printed }: Printed): unknown {
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
  return { result: { content, isError, ...structuredOf(text, node.output?.schema) } };
}

/**
 * mcp-current R1 — the envelope's `data` as `structuredContent`, or its `error` on a failure.
 * The protocol requires an object, so anything else is `{ result: data }`. A command that
 * declares `output.schema` is wrapped by that schema's type rather than by the value, so the
 * result always has the shape `outputSchema` advertised (R2). Text that is not an
 * envelope — a commander action that printed prose — has none, which is the protocol's own
 * fallback: the text beside it is unchanged either way.
 */
function structuredOf(text: string, schema?: OutputSchema): { structuredContent?: unknown } {
  try {
    // `null` throws when destructured; arrays, strings and numbers read no `ok`: neither is an envelope.
    const { ok, data, error } = JSON.parse(text) as { ok?: boolean; data?: unknown; error?: unknown };
    // An envelope says `ok`; JSON a handler printed without it is not one, whatever keys it has.
    if (typeof ok !== 'boolean') return {};
    const value = ok ? data : error;
    if (value === undefined) return {};
    const plain = (ok && schema !== undefined) ? isObjectType(schema) : value?.constructor === Object;
    return { structuredContent: plain ? value : { result: value } };
  } catch {
    return {};
  }
}

/** A request's reply: at once, but for a tool call whose run returns a promise. */
function handle(session: Session, request: Request, signal: AbortSignal): unknown {
  switch (request.method) {
    case 'initialize': {
      // The specification's rule: a revision the server supports is answered with itself, anything else with its latest.
      const asked = request.params?.['protocolVersion'] as string;
      return { result: { protocolVersion: SUPPORTED_REVISIONS.includes(asked) ? asked : MCP_PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: session.serverInfo } };
    }
    case 'ping':
      return { result: {} };
    case 'tools/list':
      return { result: { tools: toolsOf(session.manifest) } };
    case 'tools/call':
      return callTool(session, request.params, signal);
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
  const session = sessionOf(manifest, opts.invoke, opts.output);
  const { reply } = session;
  const swap = (next: Manifest, invoke?: Invoke): void => {
    session.manifest = next;
    if (invoke !== undefined) session.invoke = invoke;
    reply({ method: 'notifications/tools/list_changed' });
  };
  const unhold = holdStdout();
  const done = serve(session, opts.input).finally(unhold);
  return { done, swap };
}

/** The session a server answers from, writing each frame to `output`. */
function sessionOf(manifest: Manifest, invoke: Invoke | InvokeSync, output: ServeOptions['output']): Session {
  return {
    manifest,
    invoke,
    serverInfo: { name: manifest.rootPath.join(' ') || 'burgee', version: manifest.version ?? '0.0.0' },
    // One frame per write, whole, so replies that settle together cannot interleave inside a line.
    reply: (body) => {
      framing = true;
      try {
        output.write(`${JSON.stringify({ jsonrpc: '2.0', ...body })}\n`);
      } finally {
        framing = false;
      }
    },
  };
}

/** Serve until the input closes. */
export async function serveMcp(manifest: Manifest, opts: ServeOptions): Promise<void> {
  return await startMcp(manifest, opts).done;
}

/**
 * Read requests and dispatch each without waiting for the one before (mcp-current R4), so a
 * `notifications/cancelled` is read while the call it names still runs. Each call in flight is
 * kept by its id; a cancellation aborts its signal with the reason `cancelled`, and a cancelled
 * request gets no response, as the protocol requires. One for an unknown or finished request
 * finds nothing and is ignored. `done` waits for every call in flight to settle.
 */
async function serve(session: Session, input: NodeJS.ReadableStream): Promise<void> {
  const { reply } = session;
  const running = new Map<unknown, AbortController>();
  const replies: Promise<void>[] = [];
  for await (const line of createInterface({ input, crlfDelay: Infinity })) {
    const request = requestOf(line, reply);
    if (request === undefined) continue;
    if (request.method === 'notifications/cancelled') running.get(request.params?.['requestId'])?.abort('cancelled');
    // A notification carries no id and expects no reply.
    if (request.id === undefined) continue;
    const { id } = request;
    const controller = new AbortController();
    running.set(id, controller);
    replies.push(
      (async () => await handle(session, request, controller.signal))().then((outcome) => {
        running.delete(id);
        if (!controller.signal.aborted) reply({ id, ...(outcome as Record<string, unknown>) });
      }),
    );
  }
  await Promise.all(replies);
}

/** The request on one line. A blank line is none; a malformed one is answered here, and is none. */
function requestOf(line: string, reply: Session['reply']): Request | undefined {
  if (line.trim() === '') return undefined;
  let request: Request;
  try {
    request = JSON.parse(line) as Request;
  } catch {
    reply({ id: null, error: { code: JSON_RPC_INVALID_REQUEST, message: 'invalid JSON' } });
    return undefined;
  }
  if (typeof request.method !== 'string') {
    reply({ id: request.id ?? null, error: { code: JSON_RPC_INVALID_REQUEST, message: 'missing method' } });
    return undefined;
  }
  return request;
}

/**
 * Serve until the input ends, and return only then: `--mcp` on a `.parseSync()` program
 * (A-20261027-yargs-parsesync-mcp-ended-by-exit). Such a program goes on the moment
 * `parseSync()` returns, and one that finds nothing to run calls `process.exit()`, which ended
 * {@link serveMcp} before it read a line. So this one reads and answers synchronously: each
 * request in turn, a tool call run to its end through `invoke` before the next line is read.
 * That is the difference from {@link serveMcp}, and the price: calls do not overlap, so a
 * `notifications/cancelled` arrives after the call it names has answered and finds nothing, and
 * `invoke` cannot wait on an asynchronous handler. Both are `.parseAsync()`'s to offer.
 * Requests come from descriptor 0 and frames go to descriptor 1 unless `output` is given.
 */
export function serveMcpSync(manifest: Manifest, invoke: InvokeSync, output: ServeOptions['output'] = { write: writer(1) }, read = reader(0)): void {
  const session = sessionOf(manifest, invoke, output);
  const signal = new AbortController().signal;
  const unhold = holdStdout();
  try {
    for (const line of linesOf(read)) {
      const request = requestOf(line, session.reply);
      // A notification carries no id and expects no reply.
      if (request?.id !== undefined) session.reply({ id: request.id, ...(handle(session, request, signal) as Record<string, unknown>) });
    }
  } finally {
    unhold();
  }
}

/** The lines `read` fills its buffer with until it reads nothing, decoded as UTF-8 across reads; the last one need not end in a newline. */
export function* linesOf(read: (into: Uint8Array) => number): Generator<string> {
  const decoder = new TextDecoder();
  const chunk = new Uint8Array(READ_BYTES);
  let rest = '';
  for (let n = read(chunk); n > 0; n = read(chunk)) {
    const lines = (rest + decoder.decode(chunk.subarray(0, n), { stream: true })).split('\n');
    rest = lines.pop() as string;
    yield* lines;
  }
  yield rest + decoder.decode();
}

/** How much one synchronous read asks for: a pipe's buffer on Linux. */
const READ_BYTES = 65_536;
/** How long a synchronous server waits before it asks a would-block descriptor again. */
const PAUSE_MS = 5;
/** `Atomics.wait` needs a shared cell to wait on; nothing ever notifies it, so the wait is a pause. */
const CELL_BYTES = 4;

/**
 * `op`, tried again after a short pause for as long as it fails with `EAGAIN`. A descriptor that
 * something in the process opened as a stream is non-blocking, and a synchronous server waits on
 * it rather than failing.
 */
export function blocking<T>(op: () => T): T {
  for (;;) {
    try {
      return op();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EAGAIN') throw error;
      // Allocated here, not at the top: a module-level buffer is a side effect no bundle can drop.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(CELL_BYTES)), 0, 0, PAUSE_MS);
    }
  }
}

/** Reads descriptor `fd` into a buffer, 0 at its end, which Windows reports on a pipe as an `EOF` error. */
export const reader =
  (fd: number, read: (fd: number, into: Uint8Array) => number = builtin('node:fs').readSync) =>
  (into: Uint8Array): number => {
    try {
      return blocking(() => read(fd, into));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EOF') return 0;
      throw error;
    }
  };

/** Writes all of `text` to descriptor `fd` before it returns, however little each write takes. */
export const writer =
  (fd: number, write: (fd: number, bytes: Uint8Array, at: number) => number = builtin('node:fs').writeSync) =>
  (text: string): void => {
    const bytes = new TextEncoder().encode(text);
    for (let at = 0; at < bytes.length; ) at += blocking(() => write(fd, bytes, at));
  };
