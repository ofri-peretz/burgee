/**
 * cli-mcp N4 on the demo: the same command over MCP and over --json is one payload, and
 * the tool list is the demo's manifest — generated here too, so a command the demo adds
 * without declaring its effects is caught, not silently exposed.
 */
import { PassThrough } from 'node:stream';

import { execute, inputSchemaOf, MCP_PROTOCOL_VERSION, serveMcp, toolsOf } from 'burgee';
import { runBurgee } from 'burgee/testing';
import { program } from 'demo-cli-burgee';
import { describe, expect, it } from 'vitest';

/** The engine's own way of running a tool call: execute with the streams captured. */
async function invoke(argv: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  const out: string[] = [];
  const err: string[] = [];
  let code = 0;
  await execute(program, { argv, env: {}, stdout: { write: (s: string) => out.push(s) }, stderr: { write: (s: string) => err.push(s) }, exit: (c) => { code = c; } });
  return { stdout: out.join(''), stderr: err.join(''), code };
}

async function overMcp(requests: object[]): Promise<Record<string, unknown>[]> {
  const input = new PassThrough();
  const written: string[] = [];
  const done = serveMcp(program, { input, output: { write: (s: string) => written.push(s) }, invoke });
  for (const r of requests) input.write(`${JSON.stringify(r)}\n`);
  input.end();
  await done;
  return written.join('').split('\n').filter((l) => l !== '').map((l) => JSON.parse(l) as Record<string, unknown>);
}

const init = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'conformance', version: '0' } } };
const text = (reply: Record<string, unknown> | undefined): string => (reply?.['result'] as { content: { text: string }[] }).content[0]?.text ?? '';

describe('demo · MCP', () => {
  it('lists every demo command that declared its effects, with the schema the manifest carries', async () => {
    const [, list] = await overMcp([init, { jsonrpc: '2.0', id: 2, method: 'tools/list' }]);
    const tools = (list?.['result'] as { tools: { name: string; inputSchema: unknown }[] }).tools;
    const expected = program.commands.filter((c) => c.run !== undefined && c.effects !== undefined).map((c) => ({ name: c.path.slice(1).join('_'), inputSchema: inputSchemaOf(c) }));
    expect(tools).toMatchObject(expected);
    expect(tools.map((t) => t.name)).toEqual(['greet', 'config_get', 'fail']);
    expect(toolsOf(program).length).toBe(3);
  });

  it('returns over MCP exactly what --json prints (N4)', async () => {
    const direct = await runBurgee(program, { argv: ['config', 'get', 'user.name', '--json'] });
    const [, call] = await overMcp([init, { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'config_get', arguments: { key: 'user.name' } } }]);
    expect(text(call)).toBe(direct.stdout.trim());
    expect(JSON.parse(text(call))).toMatchObject({ ok: true, data: 'ada' });
  });

  it('carries a failure as the same E3 envelope with isError (N4, N5)', async () => {
    const [, call] = await overMcp([init, { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'fail', arguments: {} } }]);
    expect((call?.['result'] as { isError: boolean }).isError).toBe(true);
    expect(JSON.parse(text(call))).toMatchObject({ ok: false, error: { code: 1, message: 'boom' } });
  });
});
