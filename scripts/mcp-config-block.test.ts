/**
 * mcp-current R6 — the client configuration on `/docs/agent-surfaces` works when pasted: it is
 * the demo's own `--mcp --print-config`, and the server it names starts and completes
 * `initialize`, `tools/list` and a `tools/call`.
 *
 * Red before it was built: the page's block named `mytool` through `npx`, which starts nothing,
 * and no test ran it.
 */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

import { describe, expect, it } from 'vitest';

import { blockOf, onWindows, PAGE, printed, SHELL, withBlock, withDemoOnPath } from './mcp-config-block.js';

interface Server {
  command: string;
  args: string[];
}

/** The block this platform prints: the page's on POSIX, its `cmd /c` form on Windows. */
const pasted = (page: string): string => (SHELL ? onWindows(blockOf(page)) : blockOf(page));

/** Start `server` as a client does, `command` directly with no shell; send `requests`, and read one reply per request. */
async function session(server: Server, env: NodeJS.ProcessEnv, requests: object[]): Promise<Record<string, unknown>[]> {
  const child = spawn(server.command, server.args, { env, stdio: ['pipe', 'pipe', 'inherit'] });
  const replies: Record<string, unknown>[] = [];
  const lines = createInterface({ input: child.stdout });
  for (const r of requests) child.stdin.write(`${JSON.stringify(r)}\n`);
  for await (const line of lines) {
    replies.push(JSON.parse(line) as Record<string, unknown>);
    if (replies.length === requests.length) break;
  }
  child.stdin.end();
  await new Promise((resolve) => child.once('close', resolve));
  return replies;
}

describe('the client configuration on /docs/agent-surfaces (R6)', () => {
  const page = readFileSync(PAGE, 'utf8');

  it('is what the demo prints for --mcp --print-config, byte for byte (in its cmd /c form on Windows)', async () => {
    expect(await printed()).toBe(pasted(page));
    expect(withBlock(page, blockOf(page))).toBe(page);
  });

  it('starts the server it names, as pasted, and completes initialize, tools/list and a tools/call', async () => {
    const [[name, server]] = Object.entries((JSON.parse(pasted(page)) as { mcpServers: Record<string, Server> }).mcpServers) as [[string, Server]];
    const requests = [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } } },
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'greet', arguments: { name: 'ada' } } },
    ];
    const [init, list, called] = await withDemoOnPath(async (env) => await session(server, env, requests));
    expect(init?.['result']).toMatchObject({ serverInfo: { name } });
    expect((list?.['result'] as { tools: { name: string }[] }).tools.map((t) => t.name)).toContain('greet');
    expect(called?.['result']).toMatchObject({ isError: false, content: [{ type: 'text', text: expect.stringContaining('Hello, ada!') }] });
    // A server that answers fewer lines than it was sent fails here, not at the runner's timeout.
  }, 15_000);

  it('turns the bin into cmd /c for Windows, and leaves node <script> as it is', () => {
    const bin = `${JSON.stringify({ mcpServers: { demo: { command: 'demo-burgee', args: ['--mcp'] } } }, null, 2)}\n`;
    expect(JSON.parse(onWindows(bin))).toEqual({ mcpServers: { demo: { command: 'cmd', args: ['/c', 'demo-burgee', '--mcp'] } } });
    const script = `${JSON.stringify({ mcpServers: { demo: { command: 'node', args: ['/x/bin.js', '--mcp'] } } }, null, 2)}\n`;
    expect(onWindows(script)).toBe(script);
    expect(() => blockOf('no block')).toThrow(/no mcp-config block/u);
  });

  it('refuses a page without its markers, so the block cannot quietly stop being generated', () => {
    expect(() => withBlock('# no markers here\n', '{}\n')).toThrow(/no mcp-config:start/u);
  });
});
