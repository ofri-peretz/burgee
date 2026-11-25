/**
 * `--mcp` at the edges its own suite does not walk (`mcp.ts`): every console method a handler
 * can print with, a write with a callback, whitespace-only output, a null result, an option
 * passed as null, a positional, an unknown method, and a stream read a byte at a time.
 */
import { Readable } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { defineCommand, defineProgram, runCommand } from './execute.js';
import { linesOf } from './mcp.js';
import { host } from './runtime.js';

interface Reply {
  id: number;
  result?: { content: { text: string }[]; isError: boolean; structuredContent?: unknown };
  error?: { message: string };
}

/** The replies `--mcp` gives to `requests`, in id order. */
async function serve(program: ReturnType<typeof defineProgram>, requests: unknown[]): Promise<Reply[]> {
  const stdin = Readable.from([`${requests.map((r) => JSON.stringify(r)).join('\n')}\n`]);
  const { stdout } = await runCommand(program, ['--mcp'], { stdin });
  return stdout
    .split('\n')
    .filter((l) => l !== '')
    .map((l) => JSON.parse(l) as Reply)
    .toSorted((a, b) => a.id - b.id);
}
const call = (id: number, name: string, args: Record<string, unknown> = {}): unknown => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });

/** Every stdout-printing console method, in an order whose output says which were held. */
function printsEverything(): string {
  console.info('info');
  console.debug('debug');
  console.dir('dir');
  console.dirxml('dirxml');
  console.table(['cell']);
  console.group('group');
  console.log('inner');
  console.groupEnd();
  console.log('outer');
  console.groupCollapsed('collapsed');
  console.groupEnd();
  console.count('n');
  console.countReset('n');
  console.count('n');
  console.time('t');
  console.timeLog('t');
  console.timeEnd('t');
  return 'done';
}

const program = (): ReturnType<typeof defineProgram> =>
  defineProgram({
    name: 'demo',
    commands: [
      defineCommand({ name: 'loud', effects: 'read_only', run: printsEverything }),
      defineCommand({ name: 'blank', effects: 'read_only', run: () => void console.log('   ') }),
      defineCommand({ name: 'nothing', effects: 'read_only', run: () => null }),
      defineCommand({
        name: 'written',
        effects: 'read_only',
        run: async () => {
          const returned = await new Promise<boolean>((resolve) => {
            const value = host.stdout.write('chunk', 'utf8', () => resolve(value));
          });
          return { returned };
        },
      }),
      defineCommand({ name: 'opt', effects: 'read_only', options: { level: { type: 'string' } }, run: ({ options }) => ({ level: options.level ?? 'none' }) }),
      defineCommand({ name: 'pos', effects: 'read_only', arguments: [{ name: 'who' }], run: ({ positionals }) => `hi ${String(positionals[0])}` }),
      defineCommand({ name: 'plain', description: 'just this', effects: 'read_only', run: () => 'x' }),
    ],
  });

describe('a tool call’s printed output', () => {
  it('holds every console method that prints to stdout', async () => {
    const [reply] = await serve(program(), [call(1, 'loud')]);
    const printed = reply?.result?.content[1]?.text ?? '';
    for (const text of ['info', 'debug', "'dir'", 'dirxml', 'cell', 'group', '  inner', '\nouter', 'collapsed']) expect(printed).toContain(text);
    expect(printed.match(/n: 1/gu)).toHaveLength(2);
    expect(printed.match(/t: /gu)).toHaveLength(2);
  });

  it('calls a write’s callback, and says the write went through', async () => {
    const [reply] = await serve(program(), [call(1, 'written')]);
    expect(JSON.parse(reply?.result?.content[0]?.text ?? '{}')).toMatchObject({ data: { returned: true } });
  });

  it('adds nothing for output that is only whitespace', async () => {
    const [reply] = await serve(program(), [call(1, 'blank')]);
    expect(reply?.result?.content).toHaveLength(1);
  });
});

describe('a tool call’s arguments and result', () => {
  it('reads an option given as null as one not given, and passes a positional', async () => {
    const [opt, pos] = await serve(program(), [call(1, 'opt', { level: null }), call(2, 'pos', { who: 'ada' })]);
    expect(opt?.result?.structuredContent).toEqual({ level: 'none' });
    expect(pos?.result?.content[0]?.text).toContain('hi ada');
  });

  it('wraps a null result', async () => {
    const [reply] = await serve(program(), [call(1, 'nothing')]);
    expect(reply?.result?.structuredContent).toEqual({ result: null });
  });
});

describe('the session', () => {
  it('names a method it does not know', async () => {
    const [reply] = await serve(program(), [{ jsonrpc: '2.0', id: 1, method: 'nope/nothing' }]);
    expect(reply?.error?.message).toBe('method not found: nope/nothing');
  });

  it('describes a tool by its description alone when it has no examples', async () => {
    const [reply] = await serve(program(), [{ jsonrpc: '2.0', id: 1, method: 'tools/list' }]);
    const tools = (reply as unknown as { result: { tools: { name: string; description: string }[] } }).result.tools;
    expect(tools.find((t) => t.name === 'plain')?.description).toBe('just this');
  });
});

describe('linesOf', () => {
  it('reads a stream handed over one byte at a time', () => {
    const bytes = new TextEncoder().encode('ab\ncd');
    let at = 0;
    const lines = [
      ...linesOf((into) => {
        if (at >= bytes.length) return 0;
        into[0] = bytes[at] as number;
        at += 1;
        return 1;
      }),
    ];
    expect(lines).toEqual(['ab', 'cd']);
  });
});
