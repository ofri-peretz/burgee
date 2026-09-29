/**
 * The MCP server's edges, which mcp.test.ts's well-formed sessions never reach: malformed and
 * blank lines, a `tools/call` missing its parts, a runner that rejects with something other
 * than an Error, bytes printed mid-call, a notification that goes out *during* a call over the
 * process's own stdout, and two servers holding stdout at once.
 */
import { PassThrough } from 'node:stream';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { defineCommand, defineProgram } from './execute.js';
import { Manifest } from './manifest.js';
import { type Invoke, startMcp, toolsOf } from './mcp.js';

afterEach(() => vi.restoreAllMocks());

const program = defineProgram({
  name: 'app',
  commands: [
    defineCommand({ name: 'echo', effects: 'read_only', arguments: [{ name: 'words', variadic: true }], examples: [{ command: 'app echo a b' }], run: () => undefined }),
  ],
});

const ok: Invoke = async () => ({ stdout: '{"ok":true}\n', stderr: '', code: 0 });
const saysOnlyOnStderr: Invoke = async () => ({ stdout: '  \n', stderr: 'error: it broke\n', code: 1 });
const rejectsWithAMap: Invoke = () => Promise.reject(new Map([['why', 'no']]));

/** Send each line, close the input, and hand back every frame the server wrote. */
async function frames(lines: string[], opts: { manifest?: Manifest; invoke?: Invoke } = {}): Promise<Record<string, unknown>[]> {
  const input = new PassThrough();
  const written: string[] = [];
  const server = startMcp(opts.manifest ?? program, { input, output: { write: (s) => written.push(s) }, invoke: opts.invoke ?? ok });
  for (const line of lines) input.write(`${line}\n`);
  input.end();
  await server.done;
  return written.join('').split('\n').filter((l) => l !== '').map((l) => JSON.parse(l) as Record<string, unknown>);
}

const call = (id: number, params?: unknown): string => JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', ...(params === undefined ? {} : { params }) });

describe('the transport', () => {
  it('skips a blank line, answers a line that is not JSON with a null id, and goes on serving', async () => {
    const replies = await frames(['', '   ', '{not json', JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'ping' })]);
    expect(replies).toEqual([
      { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'invalid JSON' } },
      { jsonrpc: '2.0', id: 7, result: {} },
    ]);
  });

  it('names a program with no root path “burgee” in the handshake', async () => {
    const m = new Manifest();
    const [reply] = await frames([JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' })], { manifest: m });
    expect((reply?.['result'] as { serverInfo: unknown }).serverInfo).toEqual({ name: 'burgee', version: '0.0.0' });
  });
});

describe('tools/call with parts missing', () => {
  it('reads no params, and a name that is not a string, as an unknown tool named ""', async () => {
    const replies = await frames([call(1), call(2, { name: 42 })]);
    expect(replies.map((r) => r['error'])).toEqual([
      { code: -32602, message: 'unknown tool ""' },
      { code: -32602, message: 'unknown tool ""' },
    ]);
  });

  it('calls with no arguments at all, and spreads a variadic argument one word each', async () => {
    const seen: string[][] = [];
    const invoke: Invoke = async (argv) => (seen.push(argv), { stdout: '{}', stderr: '', code: 0 });
    await frames([call(1, { name: 'echo' }), call(2, { name: 'echo', arguments: { words: ['a', 2, true] } })], { invoke });
    expect(seen).toEqual([
      ['echo', '--json'],
      ['echo', '--json', 'a', '2', 'true'],
    ]);
  });
});

describe('what a tool result says', () => {
  it('falls back to stderr when the run printed nothing on stdout', async () => {
    const [reply] = await frames([call(1, { name: 'echo' })], { invoke: saysOnlyOnStderr });
    expect(reply?.['result']).toEqual({ content: [{ type: 'text', text: 'error: it broke' }], isError: true });
  });

  it('carries a rejection that is not an Error as its own text', async () => {
    const [reply] = await frames([call(1, { name: 'echo' })], { invoke: rejectsWithAMap });
    expect(reply?.['result']).toEqual({ content: [{ type: 'text', text: '[object Map]' }], isError: true });
  });

  it('decodes bytes a handler writes to stdout, and calls the write’s callback', async () => {
    let called = false;
    const invoke: Invoke = async () => {
      process.stdout.write(new TextEncoder().encode('bytes: é'), () => void (called = true));
      return { stdout: '{}', stderr: '', code: 0 };
    };
    const [reply] = await frames([call(1, { name: 'echo' })], { invoke });
    expect(reply?.['result']).toEqual({ content: [{ type: 'text', text: '{}' }, { type: 'text', text: 'bytes: é' }], isError: false });
    await Promise.resolve();
    expect(called).toBe(true);
  });

  it('describes a tool by its examples, one without a description included', () => {
    expect(toolsOf(program)[0]?.description).toBe('Example: app echo a b');
  });
});

describe('a notification during a call, when the transport is process.stdout', () => {
  it('reaches the stream, and not the call’s captured output', async () => {
    const real = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const input = new PassThrough();
    let server: ReturnType<typeof startMcp> | undefined;
    const invoke: Invoke = async () => {
      // `burgee dev` swapping mid-call: its frame is written while the call holds stdout.
      server?.swap(program);
      return { stdout: '{"ok":true}', stderr: '', code: 0 };
    };
    server = startMcp(program, { input, output: process.stdout, invoke });
    input.end(`${call(1, { name: 'echo' })}\n`);
    await server.done;
    const lines = real.mock.calls.map((c) => String(c[0]));
    expect(lines).toEqual([`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/tools/list_changed' })}\n`, `${JSON.stringify({ jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: '{"ok":true}' }], isError: false } })}\n`]);
  });

  it('keeps the invoke it had when a swap names none', async () => {
    const seen: string[] = [];
    const first: Invoke = async () => (seen.push('first'), { stdout: '{}', stderr: '', code: 0 });
    const input = new PassThrough();
    const written: string[] = [];
    const server = startMcp(program, { input, output: { write: (s) => written.push(s) }, invoke: first });
    server.swap(program);
    input.end(`${call(1, { name: 'echo' })}\n`);
    await server.done;
    expect(seen).toEqual(['first']);
    expect(JSON.parse(written[0] ?? '')).toEqual({ jsonrpc: '2.0', method: 'notifications/tools/list_changed' });
  });
});

describe('two servers at once share one hold on stdout', () => {
  it('keeps stdout held until the last one stops, in either order', async () => {
    const real = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const toStderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const a = new PassThrough();
    const b = new PassThrough();
    const first = startMcp(program, { input: a, output: { write: () => true }, invoke: ok });
    const second = startMcp(program, { input: b, output: { write: () => true }, invoke: ok });
    a.end();
    await first.done;
    // The first to stop must not release the second's hold: a stray write still goes to stderr.
    process.stdout.write('stray');
    expect(toStderr).toHaveBeenCalledWith('stray');
    expect(real).not.toHaveBeenCalled();
    b.end();
    await second.done;
    process.stdout.write('after');
    expect(real).toHaveBeenCalledWith('after');
  });
});
