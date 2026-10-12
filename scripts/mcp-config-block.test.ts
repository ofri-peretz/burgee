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

import { PAGE, printed, SHELL, withBlock, withDemoOnPath } from './mcp-config-block.js';

interface Server {
  command: string;
  args: string[];
}

/** The `json` block between the page's markers, parsed. */
function pastedFrom(page: string): { mcpServers: Record<string, Server> } {
  const block = /mcp-config:start[^\n]*\n\n```json\n([\s\S]*?)```/u.exec(page)?.[1];
  if (block === undefined) throw new Error('no mcp-config block on the page');
  return JSON.parse(block) as { mcpServers: Record<string, Server> };
}

/** Start `server` as a client would, send `requests`, and read one reply per request. On Windows, through the shell npm's `.cmd` shim needs. */
async function session(server: Server, env: NodeJS.ProcessEnv, requests: object[]): Promise<Record<string, unknown>[]> {
  const child = SHELL ? spawn([server.command, ...server.args].join(' '), { env, shell: true, stdio: ['pipe', 'pipe', 'inherit'] }) : spawn(server.command, server.args, { env, stdio: ['pipe', 'pipe', 'inherit'] });
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

  it('is what the demo prints for --mcp --print-config, byte for byte', async () => {
    expect(withBlock(page, await printed())).toBe(page);
  });

  it('starts the server it names, as pasted, and completes initialize, tools/list and a tools/call', async () => {
    const [[name, server]] = Object.entries(pastedFrom(page).mcpServers) as [[string, Server]];
    const requests = [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } } },
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'greet', arguments: { name: 'ada' } } },
    ];
    const [init, list, called] = await withDemoOnPath(async (env) => await session(server, env, requests));
    expect(init?.['result']).toMatchObject({ serverInfo: { name } });
    expect((list?.['result'] as { tools: { name: string }[] }).tools.map((t) => t.name)).toContain('greet');
    expect(called?.['result']).toMatchObject({ isError: false, content: [{ type: 'text', text: expect.stringContaining('Hello, ada!') }] });
  });

  it('refuses a page without its markers, so the block cannot quietly stop being generated', () => {
    expect(() => withBlock('# no markers here\n', '{}\n')).toThrow(/no mcp-config:start/u);
  });
});
