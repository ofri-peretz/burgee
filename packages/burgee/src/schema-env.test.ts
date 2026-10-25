/**
 * commander-env V2 — an option's environment variable is part of the machine contract.
 *
 * An agent that reads `--schema` or an MCP client that reads `tools/list` decides how to pass a
 * value from what is published. An option that also reads `DEPLOY_REGION` and does not say so
 * is a value that can arrive from nowhere the caller can see. `--schema` published the name on
 * the option (it hands the declaration through), and nothing asserted it; the `inputSchema`
 * property — the one an MCP client reads — did not carry it at all.
 */
import { PassThrough } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { defineCommand, defineProgram, execute } from './index.js';
import { MCP_PROTOCOL_VERSION, serveMcp } from './mcp-entry.js';

const program = defineProgram({
  name: 'app',
  commands: [
    defineCommand({
      name: 'deploy',
      effects: 'idempotent',
      options: { region: { type: 'string', env: 'DEPLOY_REGION', default: 'us-1' }, verbose: { type: 'boolean' } },
      run: ({ options }) => ({ region: options['region'] }),
    }),
  ],
});

async function invoke(argv: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  const out: string[] = [];
  const err: string[] = [];
  let code = 0;
  await execute(program, { argv, env: {}, stdout: { write: (s: string) => out.push(s) }, stderr: { write: (s: string) => err.push(s) }, exit: (c) => { code = c; } });
  return { stdout: out.join(''), stderr: err.join(''), code };
}

type Property = Record<string, unknown>;
interface Command {
  name: string;
  options: Record<string, Property>;
  inputSchema: { properties: Record<string, Property> };
}

describe('an option’s env name is in the machine contract (commander-env V2)', () => {
  it('is on the option and on its inputSchema property in --schema, and absent where none was declared', async () => {
    const { stdout, code } = await invoke(['--schema']);
    expect(code).toBe(0);
    const deploy = (JSON.parse(stdout) as { commands: Command[] }).commands.find((c) => c.name === 'deploy')!;
    expect(deploy.options['region']?.['env']).toBe('DEPLOY_REGION');
    expect(deploy.inputSchema.properties['region']?.['env']).toBe('DEPLOY_REGION');
    expect(deploy.inputSchema.properties['verbose']).not.toHaveProperty('env');
  });

  it('is on the tool’s inputSchema property under --mcp', async () => {
    const input = new PassThrough();
    const written: string[] = [];
    const done = serveMcp(program, { input, output: { write: (s: string) => written.push(s) }, invoke });
    const init = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'test', version: '0' } } };
    for (const r of [init, { jsonrpc: '2.0', id: 2, method: 'tools/list' }]) input.write(`${JSON.stringify(r)}\n`);
    input.end();
    await done;
    const list = written
      .join('')
      .split('\n')
      .filter((l) => l !== '')
      .map((l) => JSON.parse(l) as { id: number; result?: { tools: { name: string; inputSchema: { properties: Record<string, Property> } }[] } })
      .find((m) => m.id === 2);
    const tool = list?.result?.tools.find((t) => t.name === 'deploy');
    expect(tool?.inputSchema.properties['region']?.['env']).toBe('DEPLOY_REGION');
    expect(tool?.inputSchema.properties['verbose']).not.toHaveProperty('env');
  });
});
