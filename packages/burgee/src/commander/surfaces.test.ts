/**
 * `completion <shell>` and `--mcp` on the commander façade, served from `surfaces.js`
 * (commander-front-end-diet R2). The routing in `command.ts` is a static check, and the rest loads
 * on the run that asks for it. A `completion` whose shell is unknown falls through as it did
 * before: to `--schema`, then to the program.
 */
import { Readable } from 'node:stream';

import { describe, expect, it, vi } from 'vitest';

import { Command } from '../commander.js';

function program(): Command {
  const p = new Command('tool');
  p.command('info').description('show info').action(() => undefined);
  return p;
}

async function run(args: string[]): Promise<{ out: string; code: number | undefined }> {
  const out: string[] = [];
  let code: number | undefined;
  await program().parseAsync(args, { from: 'user', stdout: { write: (s) => out.push(s) }, stderr: { write: () => undefined }, exit: (c) => void (code = c) });
  return { out: out.join(''), code };
}

describe('commander façade: completion, loaded on demand', () => {
  it('prints a bash script', async () => {
    const { out } = await run(['completion', 'bash']);
    expect(out).toContain('complete');
    expect(out).toContain('tool');
  });

  it('prints a Fig spec as JSON', async () => {
    const { out } = await run(['completion', 'fig']);
    expect(JSON.parse(out)).toMatchObject({ name: 'tool' });
  });

  it('falls through to --schema when the shell is unknown', async () => {
    const { out } = await run(['completion', 'nope', '--schema']);
    expect(out).toContain('"info"');
  });

  it('falls through to the program when no shell is named', async () => {
    const { code } = await run(['completion']);
    expect(code).toBe(2);
  });

  it('falls through to the program when the shell is unknown and nothing else matches', async () => {
    const { code } = await run(['completion', 'nope']);
    expect(code).toBe(2);
  });
});

describe('commander façade: --mcp, loaded on demand', () => {
  it("carries a tool call's stderr into the result", async () => {
    const p = new Command('tool');
    p.command('need').argument('<x>').action(() => undefined);
    const input = Readable.from(['{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"need","arguments":{}}}\n']);
    vi.spyOn(process, 'stdin', 'get').mockReturnValue(input as unknown as typeof process.stdin);
    const replies: string[] = [];
    p.configureOutput({ writeOut: (s) => void replies.push(s) });
    try {
      await p.parseAsync(['--mcp'], { from: 'user' });
    } finally {
      vi.restoreAllMocks();
    }
    const reply = JSON.parse(replies.join('').trim()) as { result: { isError?: boolean; content: { text: string }[] } };
    expect(reply.result.isError).toBe(true);
    expect(reply.result.content.map((c) => c.text).join('')).toContain("missing required argument 'x'");
  });
});
