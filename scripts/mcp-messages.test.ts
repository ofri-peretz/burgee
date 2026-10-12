/**
 * mcp-current R7 — every message the `--mcp` server writes validates against the vendored
 * schema of the revision it negotiated, walked by the family's one walker (D-123,
 * `flagstaff/src/conforms.ts`).
 *
 * A reply is checked twice: its frame against `JSONRPCResponse` or `JSONRPCError`, and its
 * `result` against the result type of the method it answers (`InitializeResult` for
 * `initialize`, `CallToolResult` for `tools/call` …). The frame alone would not catch much:
 * `Result` admits any key, so a handshake that renamed `protocolVersion` is still a valid
 * `JSONRPCResponse`. A notification is checked against `ServerNotification`.
 *
 * Here and not in `mcp.test.ts`, which the spec names: burgee's `tsconfig.json` roots at `src`,
 * so a test inside the package cannot import flagstaff's walker. `program-schema.test.ts` sits
 * here for the same reason.
 */
import { readFileSync } from 'node:fs';
import { PassThrough, Readable } from 'node:stream';

import { describe, expect, it, vi } from 'vitest';

// eslint-disable-next-line import-next/no-relative-packages -- the source, by path, on purpose: the package-name form resolves to `dist/`, which would check the last build rather than the tree
import { Command } from '../packages/burgee/src/commander.js';
// eslint-disable-next-line import-next/no-relative-packages -- see above
import { defineCommand, defineProgram, execute } from '../packages/burgee/src/index.js';
// eslint-disable-next-line import-next/no-relative-packages -- see above
import { type Manifest } from '../packages/burgee/src/manifest.js';
// eslint-disable-next-line import-next/no-relative-packages -- see above
import { type Invoke, MCP_PROTOCOL_VERSION, startMcp } from '../packages/burgee/src/mcp.js';
// eslint-disable-next-line import-next/no-relative-packages -- see above
import { check, type JsonSchema, type Problem, type Root } from '../packages/flagstaff/src/conforms.js';

const SCHEMAS: Record<string, Root> = {
  '2025-06-18': JSON.parse(readFileSync(new URL('../packages/burgee/src/__fixtures__/mcp/2025-06-18/schema.json', import.meta.url), 'utf8')) as Root,
};

/** The result type each method's reply must carry. A method the server answers and this table lacks fails the suite. */
const RESULT_OF: Record<string, string> = {
  initialize: 'InitializeResult',
  ping: 'EmptyResult',
  'tools/list': 'ListToolsResult',
  'tools/call': 'CallToolResult',
};

type Frame = Record<string, unknown>;

/** What a session wrote, and the method each request id asked for. */
interface Recording {
  frames: Frame[];
  methods: Map<unknown, string>;
}

const ref = (name: string): { $ref: string } => ({ $ref: `#/definitions/${name}` });

/**
 * Every problem in a recording, against one revision's schema; none is a pass.
 *
 * One kind of frame is answered by JSON-RPC 2.0 and not by MCP: the error for a line the server
 * could not read as a request (not JSON, or no `method`). JSON-RPC §5 requires its `id` to be
 * `null`, because there is no id to echo, and 2025-06-18's `RequestId` admits only a string or an
 * integer, so no message the server could send for that line would validate. That one frame is
 * checked against `JSONRPCError` with its `id` taken out, and nothing else is excused.
 */
function problemsOf({ frames, methods }: Recording, revision: string): string[] {
  const root = SCHEMAS[revision] as Root;
  const problems: Problem[] = [];
  for (const [at, frame] of frames.entries()) {
    const where = `frame ${String(at)}`;
    if ('method' in frame) {
      problems.push(check(frame, ref('ServerNotification'), where, root));
    } else if ('error' in frame) {
      const def = root.definitions?.['JSONRPCError'] as JsonSchema;
      const { id, ...unread } = frame;
      problems.push(id === null ? check(unread, { ...def, required: def.required?.filter((k) => k !== 'id') }, where, root) : check(frame, def, where, root));
    } else {
      problems.push(check(frame, ref('JSONRPCResponse'), where, root));
      const method = methods.get(frame['id']) ?? '(no request)';
      const result = RESULT_OF[method];
      problems.push(result === undefined ? `${where}: no result type for ${method}` : check(frame['result'], ref(result), `${where}.result`, root));
    }
  }
  return problems.filter((p): p is string => p !== undefined);
}

/** Read every frame, and the method each request asked for, from the requests sent and the lines written. */
function recordingOf(requests: (object | string)[], written: string): Recording {
  const methods = new Map<unknown, string>();
  for (const r of requests) if (typeof r === 'object' && 'id' in r && 'method' in r) methods.set(r.id, String(r.method));
  return { frames: written.split('\n').filter((l) => l !== '').map((l) => JSON.parse(l) as Frame), methods };
}

/** Drive one server over an in-memory pair; a string is sent as the raw line. */
async function record(manifest: Manifest, requests: (object | string)[], invoke: Invoke, during?: (server: ReturnType<typeof startMcp>) => void): Promise<Recording> {
  const input = new PassThrough();
  const written: string[] = [];
  const server = startMcp(manifest, { input, output: { write: (s) => written.push(s) }, invoke });
  during?.(server);
  for (const r of requests) input.write(`${typeof r === 'string' ? r : JSON.stringify(r)}\n`);
  input.end();
  await server.done;
  return recordingOf(requests, written.join(''));
}

const program = defineProgram({
  name: 'app',
  version: '0.3.0',
  commands: [
    defineCommand({
      name: 'greet',
      description: 'Greet someone',
      effects: 'read_only',
      arguments: [{ name: 'name', required: true }],
      options: { shout: { type: 'boolean' }, times: { type: 'number' }, tone: { type: 'string', choices: ['warm', 'dry'] } },
      examples: [{ command: 'app greet ada --shout', description: 'loudly' }],
      run: ({ positionals }) => `Hello, ${positionals[0] ?? ''}!`,
    }),
    defineCommand({ name: 'config', commands: [defineCommand({ name: 'get', effects: 'read_only', arguments: [{ name: 'key' }], run: ({ positionals }) => ({ key: positionals[0], value: 'ada' }) })] }),
    defineCommand({ name: 'fail', effects: 'idempotent', run: () => { throw new Error('boom'); } }),
    defineCommand({ name: 'loud', effects: 'non_idempotent', run: () => { console.log('printed'); return { changed: true }; } }),
  ],
});

/** The engine's own capture, as `surfaces.ts` builds it for `--mcp`. */
const invoke: Invoke = async (argv) => {
  const out: string[] = [];
  const err: string[] = [];
  let code = 0;
  await execute(program, { argv, env: {}, stdout: { write: (s: string) => out.push(s) }, stderr: { write: (s: string) => err.push(s) }, exit: (c) => { code = c; } });
  return { stdout: out.join(''), stderr: err.join(''), code };
};

const rpc = (id: number, method: string, params?: object): object => ({ jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) });
const init = rpc(1, 'initialize', { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'test', version: '0' } });

/** A session that reaches every reply the server can write. */
const everyReply: (object | string)[] = [
  init,
  { jsonrpc: '2.0', method: 'notifications/initialized' },
  rpc(2, 'ping'),
  rpc(3, 'tools/list'),
  rpc(4, 'tools/call', { name: 'greet', arguments: { name: 'ada', shout: true } }),
  rpc(5, 'tools/call', { name: 'config_get', arguments: { key: 'user' } }),
  rpc(6, 'tools/call', { name: 'fail', arguments: {} }),
  rpc(7, 'tools/call', { name: 'loud', arguments: {} }),
  rpc(8, 'tools/call', { name: 'nope', arguments: {} }),
  rpc(9, 'resources/list'),
  '{not json',
  JSON.stringify({ jsonrpc: '2.0', id: 10 }),
];

describe('every message the --mcp server writes validates (R7)', () => {
  it(`on a native program, against ${MCP_PROTOCOL_VERSION}: every reply, every error, the notification`, async () => {
    const recording = await record(program, everyReply, invoke, (server) => server.swap(program));
    // 11 replies, of which 4 are errors, and the `tools/list_changed` notification.
    expect(recording.frames).toHaveLength(12);
    expect(recording.frames.filter((f) => 'error' in f)).toHaveLength(4);
    expect(recording.frames.filter((f) => f['method'] === 'notifications/tools/list_changed')).toHaveLength(1);
    expect(problemsOf(recording, MCP_PROTOCOL_VERSION)).toEqual([]);
  });

  it('on a commander program served over --mcp, whose tools declare no effects', async () => {
    const commander = new Command('hello');
    commander.command('greet <name>').option('--shout').action((name: string) => console.log(`hello ${name}`));
    const requests = [init, rpc(2, 'tools/list'), rpc(3, 'tools/call', { name: 'greet', arguments: { name: 'ada' } })];
    const lines: string[] = [];
    vi.spyOn(process, 'stdin', 'get').mockReturnValue(Readable.from([`${requests.map((r) => JSON.stringify(r)).join('\n')}\n`]) as unknown as typeof process.stdin);
    const original = process.stdout.write;
    process.stdout.write = ((s: string | Uint8Array) => lines.push(String(s)) > 0) as typeof process.stdout.write;
    try {
      await commander.parseAsync(['--mcp'], { from: 'user' });
    } finally {
      process.stdout.write = original;
      vi.restoreAllMocks();
    }
    const recording = recordingOf(requests, lines.join(''));
    expect(recording.frames).toHaveLength(3);
    expect(problemsOf(recording, MCP_PROTOCOL_VERSION)).toEqual([]);
  });

  /**
   * mcp-current R2 — a tool that lists `outputSchema` returns `structuredContent` of that shape,
   * and the list carrying it still validates: 2025-06-18 requires `type: "object"` at its root,
   * which is why a scalar schema is wrapped as `{ result }`.
   */
  it('on a program whose commands declare output schemas: the list validates, and each structuredContent validates against its tool’s outputSchema', async () => {
    const typed = defineProgram({
      name: 'typed',
      version: '1.0.0',
      commands: [
        defineCommand({ name: 'user', effects: 'read_only', output: { cardinality: 'single', schema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } }, run: () => ({ name: 'ada' }) }),
        defineCommand({ name: 'count', effects: 'read_only', output: { cardinality: 'single', schema: { type: 'integer' } }, run: () => 3 }),
        defineCommand({ name: 'tags', effects: 'read_only', output: { cardinality: 'bounded', schema: { type: 'array', items: { type: 'string' } } }, run: () => ['a', 'b'] }),
      ],
    });
    const run: Invoke = async (argv) => {
      const out: string[] = [];
      await execute(typed, { argv, env: {}, stdout: { write: (s: string) => out.push(s) }, stderr: { write: () => true }, exit: () => undefined });
      return { stdout: out.join(''), stderr: '', code: 0 };
    };
    const names = ['user', 'count', 'tags'];
    const recording = await record(typed, [init, rpc(2, 'tools/list'), ...names.map((name, at) => rpc(3 + at, 'tools/call', { name, arguments: {} }))], run);
    expect(problemsOf(recording, MCP_PROTOCOL_VERSION)).toEqual([]);
    const [, list, ...calls] = recording.frames;
    const tools = (list?.['result'] as { tools: { name: string; outputSchema?: JsonSchema }[] }).tools;
    expect(tools.map((t) => t.outputSchema?.type)).toEqual(['object', 'object', 'object']);
    const problems = calls.map((frame, at) => {
      const { structuredContent } = frame['result'] as { structuredContent: unknown };
      return check(structuredContent, tools.find((t) => t.name === names[at])?.outputSchema as JsonSchema, names[at] as string);
    });
    expect(problems).toEqual([undefined, undefined, undefined]);
    // The walker bites: the scalar unwrapped does not match the schema the list advertised.
    expect(check(3, tools[1]?.outputSchema as JsonSchema, 'count')).toBe('count: expected object, got integer');
  });

  /** mcp-current R5 — the progress a call sends is a `ServerNotification` too, with and without `total` and `message`. */
  it('on a call that asked for progress: every notifications/progress validates', async () => {
    const steps = defineProgram({
      name: 'steps',
      commands: [
        defineCommand({
          name: 'count',
          effects: 'read_only',
          run: ({ progress }) => {
            progress(1, 3);
            progress(2, 3, 'halfway');
            progress(3);
            return 'done';
          },
        }),
      ],
    });
    const run: Invoke = async (argv) => {
      const out: string[] = [];
      await execute(steps, { argv, env: {}, stdout: { write: (s: string) => out.push(s) }, stderr: { write: () => true }, exit: () => undefined });
      return { stdout: out.join(''), stderr: '', code: 0 };
    };
    const recording = await record(steps, [init, rpc(2, 'tools/call', { name: 'count', arguments: {}, _meta: { progressToken: 7 } })], run);
    expect(recording.frames.filter((f) => f['method'] === 'notifications/progress')).toHaveLength(3);
    expect(problemsOf(recording, MCP_PROTOCOL_VERSION)).toEqual([]);
  });

  /** The suite can fail: the vendored schema refuses a handshake that renamed `protocolVersion`. */
  it('fails a mutation that renames protocolVersion in the initialize reply', async () => {
    const recording = await record(program, [init], invoke);
    const [reply] = recording.frames;
    const { protocolVersion, ...rest } = (reply?.['result'] ?? {}) as Record<string, unknown>;
    expect(protocolVersion).toBe(MCP_PROTOCOL_VERSION);
    const mutated = { ...recording, frames: [{ ...reply, result: { ...rest, protocol_version: protocolVersion } }] };
    expect(problemsOf(mutated, MCP_PROTOCOL_VERSION)).toEqual(['frame 0.result.protocolVersion: required']);
  });

  it('fails a reply to a method it has no result type for, and a tool result missing its content', () => {
    const frames: Frame[] = [
      { jsonrpc: '2.0', id: 1, result: {} },
      { jsonrpc: '2.0', id: 2, result: { isError: false } },
      { jsonrpc: '2.0', id: 3, error: { code: -32600, message: 'x' } },
      { jsonrpc: '2.0', id: null, result: {} },
      { jsonrpc: '2.0', method: 'notifications/unheard_of' },
    ];
    const methods = new Map<unknown, string>([
      [1, 'tasks/get'],
      [2, 'tools/call'],
    ]);
    expect(problemsOf({ frames, methods }, MCP_PROTOCOL_VERSION)).toEqual([
      'frame 0: no result type for tasks/get',
      'frame 1.result.content: required',
      'frame 3.id: expected string or integer, got null',
      'frame 3: no result type for (no request)',
      'frame 4: matches no anyOf branch',
    ]);
  });

  it('excuses a null id only on an error frame, and nothing else in it', () => {
    const frames: Frame[] = [
      { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'invalid JSON' } },
      { jsonrpc: '2.0', id: null, error: { code: 'bad', message: 'x' } },
    ];
    expect(problemsOf({ frames, methods: new Map() }, MCP_PROTOCOL_VERSION)).toEqual(['frame 1.error.code: expected integer, got string']);
  });
});
