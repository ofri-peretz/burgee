/**
 * cli-mcp — N1–N6 over a fake stdio pair: a full handshake, a tool list generated from the
 * manifest (and asserted against a generation done here too, so a manifest field without
 * an MCP mapping fails), opt-in exposure proven by absence, and tool results identical to
 * the --json envelope.
 */
import { PassThrough } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { annotationsOf, defineCommand, defineProgram, execute, inputSchemaOf, MCP_PROTOCOL_VERSION, serveMcp, toolsOf } from './index.js';
import { runBurgee } from './testing.js';

const program = defineProgram({
  name: 'app',
  version: '0.3.0',
  commands: [
    defineCommand({
      name: 'greet',
      description: 'Greet someone',
      effects: 'read_only',
      arguments: [{ name: 'name', required: true }],
      options: { shout: { type: 'boolean' }, greeting: { type: 'string', default: 'Hello' } },
      examples: [{ command: 'app greet ada --shout', description: 'loudly' }],
      run: ({ options, positionals }) => {
        const line = `${String(options['greeting'])}, ${positionals[0] ?? ''}!`;
        return options['shout'] === true ? line.toUpperCase() : line;
      },
    }),
    defineCommand({ name: 'config', commands: [defineCommand({ name: 'get', effects: 'read_only', arguments: [{ name: 'key' }], run: ({ positionals }) => ({ key: positionals[0], value: 'ada' }) })] }),
    defineCommand({ name: 'fail', effects: 'idempotent', run: () => { throw new Error('boom'); } }),
    // No effects declared: never a tool (N2).
    defineCommand({ name: 'wipe', description: 'Delete everything', run: () => 'gone' }),
  ],
});

/** Drive the server over an in-memory stdio pair; returns replies by id. */
async function session(requests: object[]): Promise<Map<number | string | null, Record<string, unknown>>> {
  const input = new PassThrough();
  const written: string[] = [];
  // Capture through execute, as the engine's own --mcp does; the harness would add a human note.
  const invoke = async (argv: string[]): Promise<{ stdout: string; stderr: string; code: number }> => {
    const out: string[] = [];
    const err: string[] = [];
    let code = 0;
    await execute(program, { argv, env: {}, stdout: { write: (s: string) => out.push(s) }, stderr: { write: (s: string) => err.push(s) }, exit: (c) => { code = c; } });
    return { stdout: out.join(''), stderr: err.join(''), code };
  };
  const done = serveMcp(program, { input, output: { write: (s: string) => written.push(s) }, invoke });
  for (const r of requests) input.write(`${JSON.stringify(r)}\n`);
  input.end();
  await done;
  const replies = new Map<number | string | null, Record<string, unknown>>();
  for (const line of written.join('').split('\n').filter((l) => l !== '')) {
    const msg = JSON.parse(line) as { id: number | string | null };
    replies.set(msg.id, msg as unknown as Record<string, unknown>);
  }
  return replies;
}

const init = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'test', version: '0' } } };

describe('--mcp', () => {
  it('completes the handshake and names the program (N1)', async () => {
    const replies = await session([init, { jsonrpc: '2.0', method: 'notifications/initialized' }, { jsonrpc: '2.0', id: 2, method: 'ping' }]);
    expect(replies.get(1)?.['result']).toMatchObject({ protocolVersion: MCP_PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: { name: 'app', version: '0.3.0' } });
    expect(replies.get(2)?.['result']).toEqual({});
    expect(replies.size).toBe(2); // the notification got no reply
  });

  it('lists exactly the commands that declared effects, generated from the manifest (N1, N2, N6)', async () => {
    const replies = await session([init, { jsonrpc: '2.0', id: 2, method: 'tools/list' }]);
    const tools = (replies.get(2)?.['result'] as { tools: { name: string }[] }).tools;
    const expected = program.commands
      .filter((c) => c.run !== undefined && c.effects !== undefined)
      .map((c) => ({ name: c.path.slice(1).join('_'), inputSchema: inputSchemaOf(c), annotations: annotationsOf(c.effects ?? 'read_only') }));
    expect(tools.map((t) => t.name)).toEqual(['greet', 'config_get', 'fail']);
    expect(tools).toMatchObject(expected);
    // proven red: an implementation that exposes everything lists the undeclared command
    expect(tools.some((t) => t.name === 'wipe')).toBe(false);
    expect(toolsOf(program).find((t) => t.name === 'greet')?.description).toBe('Greet someone\nExample: app greet ada --shout — loudly');
  });

  it('maps effects to the hints an agent reads, never defaulting destructive to silence (N6)', () => {
    expect(annotationsOf('read_only')).toEqual({ readOnlyHint: true, idempotentHint: true, destructiveHint: false });
    expect(annotationsOf('idempotent')).toEqual({ readOnlyHint: false, idempotentHint: true, destructiveHint: false });
    expect(annotationsOf('non_idempotent')).toEqual({ readOnlyHint: false, idempotentHint: false, destructiveHint: true });
  });

  it('returns the --json envelope as the tool result, byte for byte (N4)', async () => {
    const direct = await runBurgee(program, { argv: ['greet', 'ada', '--shout', '--json'], env: {} });
    const replies = await session([init, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'greet', arguments: { name: 'ada', shout: true } } }]);
    const result = replies.get(3)?.['result'] as { content: { type: string; text: string }[]; isError: boolean };
    expect(result.isError).toBe(false);
    expect(result.content[0]?.text).toBe(direct.stdout.trim());
    expect(JSON.parse(result.content[0]?.text ?? '')).toEqual({ ok: true, data: 'HELLO, ADA!' });
  });

  it('reports a failing command as an error result carrying the same E3 envelope (N4, N5)', async () => {
    const replies = await session([init, { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'fail', arguments: {} } }]);
    const result = replies.get(4)?.['result'] as { content: { text: string }[]; isError: boolean };
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0]?.text ?? '')).toMatchObject({ ok: false, error: { code: 1, message: 'boom' } });
  });

  it('refuses an unknown or undeclared tool and an unknown method with JSON-RPC errors', async () => {
    const replies = await session([init, { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'wipe', arguments: {} } }, { jsonrpc: '2.0', id: 6, method: 'resources/list' }, 'not json' as unknown as object]);
    expect(replies.get(5)?.['error']).toMatchObject({ code: -32602 });
    expect(replies.get(6)?.['error']).toMatchObject({ code: -32601 });
    expect(replies.get(null)?.['error']).toMatchObject({ code: -32600 });
  });

  it('is served by the engine on --mcp, over the injected stdin (N1)', async () => {
    const input = new PassThrough();
    const out: string[] = [];
    let code = -1;
    const run = execute(program, { argv: ['--mcp'], env: {}, stdin: input, stdout: { write: (s: string) => out.push(s) }, stderr: { write: () => true }, exit: (c) => { code = c; } });
    input.write(`${JSON.stringify(init)}\n`);
    input.end();
    await run;
    expect(code).toBe(0);
    expect(JSON.parse(out.join('').trim())).toMatchObject({ id: 1, result: { serverInfo: { name: 'app' } } });
  });
});
