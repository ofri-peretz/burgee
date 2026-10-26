/**
 * caller-matrix — the `program` cells of spinner, table and box: a command served over `--mcp`
 * that draws a flagstaff component, the way a handler draws one, to the process's own stdout.
 *
 * Under `--mcp` the process's stdout is the transport: every line a client reads there is a
 * JSON-RPC message, and one stray byte from a spinner is a malformed frame. So the program
 * caller's contract for a component is three things, asserted for each:
 *
 *   1. every line on the transport parses as a JSON-RPC message, and nothing else is there;
 *   2. the tool result leads with the command's envelope, and its `structuredContent` is the
 *      command's data — what the component drew does not leak into the data;
 *   3. what the component drew is its static projection, as text after the envelope: no escape
 *      sequence, no carriage return, and the information itself (the spinner's final line, the
 *      table's `header: value` pairs, the box's title and text) rather than a stripped drawing.
 *
 * The component is hoisted with the runtime the handler's context hands it (`ctx.runtime`) and
 * `process.stdout` / `process.stderr`, which is what a handler has. burgee's server holds the
 * process's stdout for the length of a call (`holdStdout` in `mcp.ts`), and flagstaff's loop
 * picks the projection from the policy; this is the only place the two meet.
 *
 * Run red first, two ways, each in a scratch edit of the source: with the server's hold on
 * stdout taken out (`holdStdout` passing every write through), the drawing lands on the
 * transport and case 1 fails for all three; with the loop forced to the terminal projection,
 * the drawing carries escapes and case 3 fails for all three.
 */
import process from 'node:process';
import { Readable } from 'node:stream';

import { describe, expect, it } from 'vitest';

// eslint-disable-next-line import-next/no-relative-packages -- the source, by path, on purpose: the package-name form resolves to `dist/`, which would check the last build rather than the tree
import { defineCommand, defineProgram, execute, type RunContext } from '../packages/burgee/src/index.js';
// eslint-disable-next-line import-next/no-relative-packages -- see above
import { boxComponent } from '../packages/flagstaff/src/box.js';
// eslint-disable-next-line import-next/no-relative-packages -- see above
import { hoist, manualClock } from '../packages/flagstaff/src/loop.js';
// eslint-disable-next-line import-next/no-relative-packages -- see above
import { type Component } from '../packages/flagstaff/src/plugin.js';
// eslint-disable-next-line import-next/no-relative-packages -- see above
import { spinner } from '../packages/flagstaff/src/spinner.js';
// eslint-disable-next-line import-next/no-relative-packages -- see above
import { tableComponent } from '../packages/flagstaff/src/table.js';

/** One component, the states a handler walks it through, and what its static projection must say. */
interface Case<S> {
  name: 'spinner' | 'table' | 'box';
  component: () => Component<S>;
  states: [S, ...S[]];
  says: string[];
}

const spin: Case<{ text: string; status?: 'running' | 'ok' }> = {
  name: 'spinner',
  component: () => spinner(),
  states: [{ text: 'copying' }, { text: 'copying 2 of 3' }, { text: 'copied 3 files', status: 'ok' }],
  says: ['copied 3 files'],
};
const grid: Case<{ head: string[]; rows: string[][] }> = {
  name: 'table',
  component: () => tableComponent(),
  states: [{ head: ['file', 'size'], rows: [['a.txt', '1 kB']] }],
  says: ['file: a.txt, size: 1 kB'],
};
const panel: Case<{ title: string; text: string }> = {
  name: 'box',
  component: () => boxComponent({ borderStyle: 'round' }),
  states: [{ title: 'done', text: '3 files copied' }],
  says: ['done: 3 files copied'],
};
const CASES = [spin, grid, panel] as Case<unknown>[];

/** A program whose one command hoists `c` to the process's streams, walks its states, and returns data. */
function drawing<S>(c: Case<S>): ReturnType<typeof defineProgram> {
  return defineProgram({
    name: 'draw',
    commands: [
      defineCommand({
        name: 'go',
        effects: 'read_only',
        run: (ctx: RunContext) => {
          const [first, ...rest] = c.states;
          const flag = hoist(c.component(), { ...ctx.runtime, stdout: process.stdout, stderr: process.stderr, clock: manualClock() }, first);
          for (const state of rest) flag.update(state);
          flag.lower();
          return { drew: c.name };
        },
      }),
    ],
  });
}

/**
 * Serve `program` over `--mcp` with the process's own stdout as the transport, as a real server
 * has it: what reached `process.stdout` is recorded and handed back. stderr and the exit are
 * injected, so nothing else of the process is touched, and stdout's `write` is put back after.
 */
async function served(program: ReturnType<typeof defineProgram>, session: string[]): Promise<string> {
  const stdout = process.stdout;
  const write = stdout.write;
  const wrote: string[] = [];
  stdout.write = ((chunk: unknown, ...rest: unknown[]): boolean => {
    wrote.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk as Uint8Array));
    const done = rest.find((r): r is () => void => typeof r === 'function');
    if (done !== undefined) queueMicrotask(done);
    return true;
  }) as typeof stdout.write;
  try {
    await execute(program, {
      argv: ['--mcp'],
      env: {},
      stdin: Readable.from([`${session.join('\n')}\n`]),
      stderr: { write: () => true },
      exit: () => undefined as never,
    });
  } finally {
    stdout.write = write;
  }
  return wrote.join('');
}

const rpc = (id: number, method: string, params: Record<string, unknown> = {}): string => JSON.stringify({ jsonrpc: '2.0', id, method, params });

interface Reply {
  jsonrpc: string;
  id: number;
  result: { isError: boolean; content: { type: string; text: string }[]; structuredContent?: unknown };
}

describe('a component drawn inside an --mcp tool call (caller-matrix, the program caller)', () => {
  it.each(CASES)('$name: the transport carries only JSON-RPC, the envelope leads, and the drawing follows as its static projection', async (c) => {
    const session = [rpc(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } }), rpc(2, 'tools/call', { name: 'go', arguments: {} })];
    const transport = await served(drawing(c), session);

    // 1. Nothing on the transport but messages.
    const lines = transport.split('\n').filter((l) => l !== '');
    const frames = lines.map((l) => {
      try {
        return JSON.parse(l) as Reply;
      } catch {
        return l;
      }
    });
    expect(frames.filter((f) => typeof f === 'string')).toEqual([]);
    expect(frames.every((f) => typeof f !== 'string' && f.jsonrpc === '2.0')).toBe(true);

    // 2. The envelope leads, and the data is the command's alone.
    const reply = (frames as Reply[]).find((f) => f.id === 2);
    expect(reply?.result.isError).toBe(false);
    const [envelope, drawn, ...more] = reply?.result.content ?? [];
    expect(JSON.parse(envelope?.text ?? '')).toMatchObject({ ok: true, data: { drew: c.name } });
    expect(reply?.result.structuredContent).toEqual({ drew: c.name });
    expect(more).toEqual([]);

    // 3. The drawing is the static projection: text, and the information.
    expect(drawn?.text).not.toMatch(/[\r\u001B]/);
    for (const line of c.says) expect(drawn?.text).toContain(line);
  });
});
