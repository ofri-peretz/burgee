/**
 * `serveMcpSync`, the server `--mcp` gets on a `.parseSync()` program
 * (A-20261027-yargs-parsesync-mcp-ended-by-exit): it reads descriptor 0 and writes descriptor 1
 * synchronously, and returns only when the input ends, so the program's own `process.exit()`
 * after `parseSync()` cannot end it mid-session. `parse-sync-surfaces.test.ts` runs it in a
 * child process through the built façade; this file holds its edges in-process, with `node:fs`'
 * two synchronous calls swapped so a read can come in pieces, block, or end as Windows ends a pipe.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { defineCommand, defineProgram } from './execute.js';
import { blocking, type InvokeSync, linesOf, reader, serveMcpSync, writer } from './mcp.js';

// The object `builtin('node:fs')` hands back, read by `reader` and `writer` when each is made.
const fs = process.getBuiltinModule('node:fs');
const readSync = vi.fn<(fd: number, into: Uint8Array) => number>();
const writeSync = vi.fn<(fd: number, bytes: Uint8Array, at: number) => number>();

const program = defineProgram({
  name: 'app',
  commands: [defineCommand({ name: 'echo', effects: 'read_only', arguments: [{ name: 'words', variadic: true }], run: () => undefined })],
});

const failure = (code: string): Error => Object.assign(new Error(code), { code });

/** A `readSync` that hands out `pieces` one per call, failing where a piece is an Error, then ends. */
function feed(pieces: (string | Uint8Array | Error)[]): void {
  const queue = [...pieces];
  readSync.mockImplementation((_fd, into) => {
    const next = queue.shift();
    if (next instanceof Error) throw next;
    const bytes = typeof next === 'string' ? new TextEncoder().encode(next) : (next ?? new Uint8Array());
    into.set(bytes);
    return bytes.length;
  });
}

const request = (id: number | undefined, method: string, params?: unknown): string => `${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`;

const ok: InvokeSync = () => ({ stdout: '{}', stderr: '', code: 0 });

/** Serve `pieces` through the swapped descriptors, and hand back the frames written to descriptor 1. */
function session(pieces: (string | Uint8Array | Error)[], invoke: InvokeSync = ok): Record<string, unknown>[] {
  feed(pieces);
  const written: number[] = [];
  writeSync.mockImplementation((fd, bytes, at) => {
    expect(fd).toBe(1);
    // A pipe takes what it has room for: at most five bytes a write, so a frame needs many.
    const taken = bytes.subarray(at, at + 5);
    written.push(...taken);
    return taken.length;
  });
  serveMcpSync(program, invoke);
  return new TextDecoder().decode(new Uint8Array(written)).split('\n').filter((l) => l !== '').map((l) => JSON.parse(l) as Record<string, unknown>);
}

beforeEach(() => {
  readSync.mockReset();
  writeSync.mockReset();
  vi.spyOn(fs, 'readSync').mockImplementation(readSync as unknown as typeof fs.readSync);
  vi.spyOn(fs, 'writeSync').mockImplementation(writeSync as unknown as typeof fs.writeSync);
});
afterEach(() => vi.restoreAllMocks());

describe('serveMcpSync', () => {
  it('reads descriptor 0 in pieces, answers each request in turn on descriptor 1, and returns when the input ends', () => {
    // The id is echoed, so a character split across two reads has to come back whole.
    const init = `${JSON.stringify({ jsonrpc: '2.0', id: 'é1', method: 'initialize', params: { protocolVersion: '2025-06-18' } })}\n`;
    const bytes = new TextEncoder().encode(init);
    const split = new TextEncoder().encode(init.slice(0, init.indexOf('é'))).length + 1; // between the two bytes of `é`
    const replies = session([bytes.subarray(0, split), bytes.subarray(split), '\n   \n{not json\n{"jsonrpc":"2.0","id":9}\n', request(undefined, 'notifications/initialized'), request(2, 'tools/list'), '{"jsonrpc":"2.0","id":3,"method":"ping"}']);
    expect(replies).toEqual([
      { jsonrpc: '2.0', id: 'é1', result: { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'app', version: '0.0.0' } } },
      { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'invalid JSON' } },
      { jsonrpc: '2.0', id: 9, error: { code: -32600, message: 'missing method' } },
      { jsonrpc: '2.0', id: 2, result: { tools: [expect.objectContaining({ name: 'echo' })] } },
      { jsonrpc: '2.0', id: 3, result: {} },
    ]);
    expect(readSync.mock.calls.every(([fd]) => fd === 0)).toBe(true);
  });

  it('runs a tool call to its end before reading on, with what the run printed as part of its answer', () => {
    const order: string[] = [];
    const invoke: InvokeSync = (argv) => {
      order.push(`run ${argv.join(' ')}`);
      console.log('printed by the handler');
      process.stdout.write('and by a write');
      return { stdout: '{"ok":true,"data":{"n":3}}\n', stderr: '', code: 0 };
    };
    feed([request(1, 'tools/call', { name: 'echo', arguments: { words: ['a'] } }), request(2, 'ping')]);
    const next = readSync.getMockImplementation() as (fd: number, into: Uint8Array) => number;
    readSync.mockImplementation((fd, into) => {
      order.push('read');
      return next(fd, into);
    });
    const written: string[] = [];
    serveMcpSync(program, invoke, { write: (s) => written.push(s) });
    expect(order).toEqual(['read', 'run echo --json a', 'read', 'read']);
    expect(JSON.parse(written[0] as string)).toEqual({
      jsonrpc: '2.0',
      id: 1,
      result: { content: [{ type: 'text', text: '{"ok":true,"data":{"n":3}}' }, { type: 'text', text: 'printed by the handler\nand by a write' }], isError: false, structuredContent: { n: 3 } },
    });
  });

  it('answers a run that throws as the call’s failure, and goes on serving', () => {
    const replies = session([request(1, 'tools/call', { name: 'echo' }), request(2, 'ping')], () => {
      throw new Error('.parseSync() must not be used with asynchronous builders, handlers, or middleware');
    });
    expect(replies).toEqual([
      { jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: '.parseSync() must not be used with asynchronous builders, handlers, or middleware' }], isError: true } },
      { jsonrpc: '2.0', id: 2, result: {} },
    ]);
  });

  it('sends nothing for a cancellation, which arrives after the call it names has answered', () => {
    const replies = session([request(1, 'tools/call', { name: 'echo' }), request(undefined, 'notifications/cancelled', { requestId: 1 })]);
    expect(replies.map((r) => r['id'])).toEqual([1]);
  });

  it('holds stdout while it serves, and puts it back when the input ends', () => {
    const write = process.stdout.write;
    let held: unknown;
    session([request(1, 'tools/call', { name: 'echo' })], () => {
      held = process.stdout.write;
      return { stdout: '{}', stderr: '', code: 0 };
    });
    expect(held).not.toBe(write);
    expect(process.stdout.write).toBe(write);
  });

  it('puts stdout back when the input fails', () => {
    const write = process.stdout.write;
    feed([failure('EIO')]);
    expect(() => serveMcpSync(program, () => ({ stdout: '', stderr: '', code: 0 }))).toThrow('EIO');
    expect(process.stdout.write).toBe(write);
  });
});

describe('the synchronous descriptors', () => {
  it('waits on EAGAIN, from a descriptor something made non-blocking, and tries again', () => {
    const wait = vi.spyOn(Atomics, 'wait');
    feed([failure('EAGAIN'), 'ab', failure('EAGAIN')]);
    const read = reader(0);
    const into = new Uint8Array(8);
    expect(read(into)).toBe(2);
    expect(read(into)).toBe(0);
    expect(wait).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledWith(expect.any(Int32Array), 0, 0, 5);
  });

  it('reads Windows’ EOF error on a pipe as the end, and throws any other', () => {
    feed([failure('EOF'), failure('EBADF')]);
    const read = reader(0);
    expect(read(new Uint8Array(1))).toBe(0);
    expect(() => read(new Uint8Array(1))).toThrow('EBADF');
  });

  it('writes every byte, waiting on EAGAIN, and throws any other failure', () => {
    const taken: number[] = [];
    const answers: (number | Error)[] = [failure('EAGAIN'), 1, 2, failure('EPIPE')];
    const write = (_fd: number, bytes: Uint8Array, at: number): number => {
      const next = answers.shift() as number | Error;
      if (next instanceof Error) throw next;
      taken.push(...bytes.subarray(at, at + next));
      return next;
    };
    writer(1, write)('abc');
    expect(new TextDecoder().decode(new Uint8Array(taken))).toBe('abc');
    expect(() => writer(1, write)('d')).toThrow('EPIPE');
  });

  it('writes nothing for empty text', () => {
    writer(1)('');
    expect(writeSync).not.toHaveBeenCalled();
  });

  it('rethrows from blocking anything that is not EAGAIN', () => {
    expect(() => blocking(() => { throw failure('EINVAL'); })).toThrow('EINVAL');
  });

  it('splits on newlines across reads, and yields the last line whether or not one ends it', () => {
    feed(['a\nb', 'c\n']);
    expect([...linesOf(reader(0))]).toEqual(['a', 'bc', '']);
    feed(['x\ny']);
    expect([...linesOf(reader(0))]).toEqual(['x', 'y']);
  });
});

describe('the handshake', () => {
  it('names a program whose root path is two words by both, with a space between', () => {
    const named = defineProgram({ name: 'app', commands: [] });
    named.rootPath = ['acme', 'deploy'];
    feed([request(1, 'initialize')]);
    const written: string[] = [];
    serveMcpSync(named, ok, { write: (s) => written.push(s) });
    expect((JSON.parse(written[0] as string) as { result: { serverInfo: { name: string } } }).result.serverInfo.name).toBe('acme deploy');
  });
});
