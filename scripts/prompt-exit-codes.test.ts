/**
 * burgee P2 / P3, D-120 — a prompt that cannot be asked exits 2, one that was cancelled exits 4,
 * with no dependency edge between the packages: caique's `resolvePrompts` returns its refusal
 * as `{ code: 'USAGE' | 'CANCELLED', message, fix }`, a burgee handler throws it, and burgee
 * reads the code by name. This test is the only place the two meet, which is the point — the
 * contract is the shape, and the shape is proven here with each package's real code.
 */
import { Readable } from 'node:stream';

import { describe, expect, it } from 'vitest';

// eslint-disable-next-line import-next/no-relative-packages -- the source, by path, on purpose: the package-name form resolves to `dist/`, which would check the last build rather than the tree
import { defineCommand, defineProgram, runCommand } from '../packages/burgee/src/index.js';
// eslint-disable-next-line import-next/no-relative-packages -- see above
import { runBurgee } from '../packages/burgee/src/testing.js';
// eslint-disable-next-line import-next/no-relative-packages -- see above
import { resolvePrompts, type PromptableOption } from '../packages/caique/src/binding.js';
// eslint-disable-next-line import-next/no-relative-packages -- see above
import { type Runtime } from '../packages/caique/src/decide.js';
// eslint-disable-next-line import-next/no-relative-packages -- see above
import { promptFor } from '../packages/caique/src/prompt-for.js';

const OPTIONS: Record<string, PromptableOption> = {
  name: { required: true, prompt: { kind: 'text', message: 'Project name?' } },
  target: { required: true, prompt: { kind: 'select', message: 'Target?', choices: [{ value: 'node' }, { value: 'deno' }] } },
};

/** A program whose one command asks through caique, answered from `lines`, on `runtime`. */
function program(runtime: Runtime, lines: string[]): ReturnType<typeof defineProgram> {
  let at = 0;
  const io = { reader: { line: async () => (at < lines.length ? lines[at++] : undefined) }, writer: { write: () => undefined } };
  return defineProgram({
    name: 'init',
    commands: [
      defineCommand({
        name: 'new',
        effects: 'non_idempotent',
        run: async () => {
          const { failure, values } = await resolvePrompts({ options: OPTIONS, values: {}, runtime, io });
          if (failure !== undefined) throw failure;
          return values;
        },
      }),
    ],
  });
}

/** A `tools/call` of the one command, as an MCP client frames it. */
const call = (id: number): string => JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name: 'new', arguments: {} } });

describe('a prompt refusal reaches an exit code by name (P2, P3)', () => {
  it('a question nobody can answer — no TTY — exits 2, naming the flag to pass instead', async () => {
    const r = await runCommand(program({ env: {}, isTTY: { stdin: false } }, []), ['new']);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('--name');
  });

  it('a cancelled question exits 4, never 1, with how to avoid it', async () => {
    const r = await runCommand(program({ env: {}, isTTY: { stdin: true } }, ['demo']), ['new']);
    expect(r.code).toBe(4);
    expect(r.stderr).toContain('cancelled at --target');
    expect(r.stderr).toContain('fix: pass --target to skip the question');
  });

  it('carries the code into the JSON envelope an agent reads', async () => {
    const r = await runCommand(program({ env: {}, isTTY: { stdin: false } }, []), ['new', '--json']);
    // D-140: a failing `--json` run writes its one envelope to stdout.
    expect(JSON.parse(r.stdout)).toMatchObject({ ok: false, error: { code: 2 } });
  });

  /**
   * caller-matrix, `prompts` × `program`: under `--mcp` stdin is the transport, so a question
   * can never be answered there. The call is a tool error whose envelope carries exit 2 and names
   * the flag, and the server answers the call after it — it neither hangs nor reads a frame as
   * an answer. Run red by making `resolvePrompts` return no failure: the call succeeded with no
   * value for `--name`.
   */
  it('under --mcp, a question is a tool error naming the flag, and the server answers the next call', async () => {
    const ping = JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'ping' });
    const r = await runBurgee(program({ env: {}, isTTY: { stdin: false } }, []), { argv: ['--mcp'], stdin: Readable.from([`${call(1)}\n${ping}\n`]) });
    const replies = r.stdout.split('\n').filter((l) => l !== '').map((l) => JSON.parse(l) as { id: number; result: { isError?: boolean; content?: { text: string }[] } });
    expect(replies.map((x) => x.id).sort()).toEqual([1, 2]);
    const refused = replies.find((x) => x.id === 1)?.result;
    expect(refused?.isError).toBe(true);
    const envelope = JSON.parse(refused?.content?.[0]?.text ?? '') as { ok: boolean; error: { code: number; message: string; fix?: string } };
    expect(envelope).toMatchObject({ ok: false, error: { code: 2 } });
    expect(JSON.stringify(envelope.error)).toContain('--name');
  });

  it('a string code outside the contract is not a claim: it stays a runtime failure', async () => {
    const odd = defineProgram({
      name: 'x',
      commands: [
        defineCommand({
          name: 'go',
          effects: 'read_only',
          run: () => {
            throw Object.assign(new Error('no such file'), { code: 'ENOENT' });
          },
        }),
      ],
    });
    expect((await runCommand(odd, ['go'])).code).toBe(1);
  });
});

/**
 * caique R1 — the same contract with nothing written by hand: `promptFor` wraps a burgee command,
 * burgee leaves the missing positional to it (P1), and its refusal or its answer reaches the exit
 * code and the handler. The demo's `greet` is built exactly this way, which is what B1's
 * `non-tty-required` task now runs against.
 */
/** A person whose answers are a list: `undefined` is Ctrl+C or Ctrl+D. */
const lines = (answers: (string | undefined)[]): { reader: { line: () => Promise<string | undefined> }; writer: { write: () => undefined } } => ({
  reader: { line: () => Promise.resolve(answers.shift()) },
  writer: { write: () => undefined },
});

/** The demo's `greet`, built the way the demo builds it, answered by `io`. */
const greet = (io = lines([])): ReturnType<typeof defineProgram> =>
  defineProgram({
    name: 'demo',
    commands: [
      promptFor(
        defineCommand({ name: 'greet', effects: 'read_only', arguments: [{ name: 'name', required: true }], run: ({ positionals }) => `Hello, ${positionals[0] ?? ''}!` }),
        'name',
        { kind: 'text', message: 'Who should I greet?' },
        { io },
      ),
    ],
  });

describe('promptFor on a burgee command (caique R1)', () => {
  /** A terminal on stdin, and nothing in the environment that says CI or an agent. */
  const terminal = { env: {}, stdin: Object.assign(Readable.from([]), { isTTY: true }) };

  it('with no terminal, exits 2 naming the positional as it is typed, and the handler never runs', async () => {
    const r = await runCommand(greet(), ['greet'], { env: {} });
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('error: <name> is required when there is no terminal');
    expect(r.stderr).toContain('fix: pass <name>; it would have been asked as "Who should I greet?"');
    expect(r.stdout).toBe('');
  });

  it('a person at a terminal is asked, and the handler greets the answer', async () => {
    expect(await runCommand(greet(lines(['ada'])), ['greet'], terminal)).toMatchObject({ code: 0, stdout: 'Hello, ada!\n' });
  });

  it('a cancelled question exits 4 with how to skip it', async () => {
    const r = await runCommand(greet(lines([undefined])), ['greet'], terminal);
    expect(r.code).toBe(4);
    expect(r.stderr).toContain('fix: pass <name> to skip the question');
  });

  it('under --json a person at a terminal is still not asked (R6): exit 2 in the envelope', async () => {
    const r = await runCommand(greet(lines(['ada'])), ['greet', '--json'], terminal);
    expect(JSON.parse(r.stdout)).toMatchObject({ ok: false, error: { code: 2, message: '<name> is required under --json' } });
  });

  it('under --mcp, a tool call that leaves it out is a tool error naming it', async () => {
    const greetCall = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'greet', arguments: {} } });
    const r = await runBurgee(greet(lines(['ada'])), { argv: ['--mcp'], stdin: Readable.from([`${greetCall}\n`]), env: {} });
    const reply = JSON.parse(r.stdout.trim()) as { result: { isError?: boolean; content: { text: string }[] } };
    expect(reply.result.isError).toBe(true);
    expect(JSON.parse(reply.result.content[0]?.text ?? '')).toMatchObject({ ok: false, error: { code: 2, message: '<name> is required under --json' } });
  });
});
