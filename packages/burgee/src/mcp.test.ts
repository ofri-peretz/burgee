/**
 * cli-mcp — N1–N6 over a fake stdio pair: a full handshake, a tool list generated from the
 * manifest (and asserted against a generation done here too, so a manifest field without
 * an MCP mapping fails), opt-in exposure proven by absence, and tool results identical to
 * the --json envelope.
 */
import { PassThrough, Readable } from 'node:stream';

import { describe, expect, it, vi } from 'vitest';

import { Command } from './commander.js';
import { renderCompletion, renderFigSpec } from './completions.js';
import { defineCommand, defineProgram, execute, run } from './index.js';
import { annotationsOf, MCP_PROTOCOL_VERSION, serveMcp, toolsOf } from './mcp-entry.js';
import { inputSchemaOf, Manifest, schemaOf } from './schema-entry.js';
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
    // Withheld: served to a person, never a tool (N2, N6). It carried no `effects` at all
    // until 2026-09-17, which said the same thing to `toolsOf` and nothing at all to a
    // reader — the two spellings this fixture now distinguishes.
    defineCommand({ name: 'wipe', description: 'Delete everything', effects: 'withheld', run: () => 'gone' }),
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

  /**
   * Every command in this fixture is native, so `defineCommand` has already refused any that
   * omitted `effects` — the filter's two halves are indistinguishable here, which is why this
   * test stayed green when G1 dropped one of them. What a program that *can* be silent looks
   * like is `facade-surface.test.ts`.
   */
  it('lists exactly the commands the author did not withhold, generated from the manifest (N1, N2, N6)', async () => {
    const replies = await session([init, { jsonrpc: '2.0', id: 2, method: 'tools/list' }]);
    const tools = (replies.get(2)?.['result'] as { tools: { name: string }[] }).tools;
    const expected = program.commands
      .filter((c) => c.run !== undefined && c.effects !== 'withheld')
      .map((c) => ({ name: c.path.slice(1).join('_'), inputSchema: inputSchemaOf(c), annotations: annotationsOf((c.effects ?? 'read_only') as Exclude<typeof c.effects, 'withheld' | undefined>) }));
    expect(tools.map((t) => t.name)).toEqual(['greet', 'config_get', 'fail']);
    expect(tools).toMatchObject(expected);
    // proven red: an implementation that exposes everything lists the withheld command
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
    expect(JSON.parse(result.content[0]?.text ?? '')).toMatchObject({ ok: true, data: 'HELLO, ADA!' });
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

/**
 * N6 — declining has to be something an author *says*.
 *
 * The filter in `toolsOf` is right and stays: an agent gaining shell-equivalent power over a
 * CLI nobody meant to publish is a security posture, not a convenience. What was wrong is
 * that it had two inputs and one spelling. *I thought about this command and agents should
 * not have it* and *I forgot* both arrived as `effects: undefined`, so the tool an author
 * built for an agent was silently not there, and the only evidence was a shorter
 * `tools/list` than they expected. `.sdlc/intents/burgee/spec.md` recorded it as **the
 * quieter of the two failures**, which is the reason it sat.
 *
 * So `effects` has no default. A command that runs declares one of the three answers about
 * the world, or `'withheld'`, which is not an answer about the world at all: it says the
 * command is not offered to agents. There is no state left in which forgetting is possible,
 * which is why the filter did not have to become less strict to make the failure loud.
 *
 * Every case below was run against the unfixed tree: the first two passed nothing and threw
 * nothing, and `'withheld'` was an unknown string that `toolsOf` served as a tool with
 * `destructiveHint: false`, which is the worst of the three outcomes it can produce.
 */
describe('a runnable command declares its effects, or declines out loud (N6)', () => {
  it('refuses a command that runs and says nothing', () => {
    expect(() => defineCommand({ name: 'wipe', description: 'Delete everything', run: () => 'gone' })).toThrow(
      /burgee: command "wipe" is runnable and declares no effects/,
    );
  });

  it('names the four answers in the refusal, so the fix is in the message', () => {
    let message = '(nothing was thrown)';
    try {
      defineCommand({ name: 'wipe', run: () => 'gone' });
    } catch (error) {
      message = (error as Error).message;
    }
    for (const answer of ['read_only', 'idempotent', 'non_idempotent', 'withheld']) expect(message).toContain(answer);
  });

  it('refuses a spelling that is not one of the four, rather than treating it as a decline', () => {
    expect(() => defineCommand({ name: 'wipe', effects: 'none' as 'read_only', run: () => 'gone' })).toThrow(/is not an effects/);
  });

  it('asks nothing of a command that only holds subcommands — a group does not run', () => {
    expect(() => defineCommand({ name: 'config', commands: [defineCommand({ name: 'get', effects: 'read_only', run: () => 'x' })] })).not.toThrow();
  });

  it('asks it of a lazy command too, whose module has not loaded and whose effects are already knowable', () => {
    expect(() => defineCommand({ name: 'later', load: async () => ({ run: () => 'x' }) })).toThrow(/declares no effects/);
  });

  /**
   * The three projections, on one withheld command, saying three different and correct
   * things. `--schema` publishes the word, because an agent reading the program as data is
   * better served by *this exists and is not for you* than by a gap it cannot distinguish
   * from a command that does not exist. `tools/list` omits it, which is the filter
   * unchanged. Fig and the shell completions carry it exactly as before: withholding is
   * about agents, and a person typing at a terminal is not one — nothing in
   * `completions.ts` reads `effects`, and nothing here makes it start.
   */
  describe('and the projections each say the right thing about it', () => {
    const withheld = defineProgram({
      name: 'app',
      commands: [
        defineCommand({ name: 'wipe', description: 'Delete everything', effects: 'withheld', run: () => 'gone' }),
        defineCommand({ name: 'status', description: 'Show status', effects: 'read_only', run: () => 'fine' }),
      ],
    });

    it('--schema publishes it, and says it is withheld', () => {
      const wipe = schemaOf(withheld).commands.find((c) => c.name === 'wipe');
      expect(wipe, '--schema dropped a command the program serves').toBeDefined();
      expect(wipe?.effects).toBe('withheld');
    });

    it('tools/list omits it — the filter is unchanged', () => {
      expect(toolsOf(withheld).map((t) => t.name)).toEqual(['status']);
    });

    it('the Fig spec and the shell completions still offer it, because a person is not an agent', () => {
      expect(renderFigSpec(withheld).subcommands?.map((s) => s.name)).toContain('wipe');
      expect(renderCompletion(withheld, 'bash')).toContain('wipe');
    });
  });

  /**
   * A plugin's command is read by exactly the code a first-party one is read by, so it meets
   * this refusal too — under the family's code, because a plugin author debugging against any
   * layer has already learned that vocabulary (R8).
   */
  it('refuses it in a plugin command as well, under the family code', () => {
    const manifest = new Manifest();
    let thrown: { code?: string; message?: string } = {};
    try {
      manifest.use({ name: 'acme', contract: 1, commands: [{ path: ['audit'], options: {}, run: () => 0 }] } as unknown as Parameters<Manifest['use']>[0]);
    } catch (error) {
      thrown = error as { code?: string; message?: string };
    }
    expect(thrown.code).toBe('E_PLUGIN_SCHEMA');
    expect(thrown.message).toMatch(/declares no effects/);
  });
});

/** One `tools/call` through the engine's own `--mcp`; the tool result's text and error flag. */
async function call(manifest: Manifest, name: string, args: Record<string, unknown>): Promise<{ text: string; isError: boolean; printed: string }> {
  const input = new PassThrough();
  const out: string[] = [];
  const running = execute(manifest, { argv: ['--mcp'], env: {}, stdin: input, stdout: { write: (s: string) => out.push(s) }, stderr: { write: () => true }, exit: () => undefined });
  input.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })}\n`);
  input.end();
  await running;
  const reply = JSON.parse(out.join('').trim()) as { result: { content: { text: string }[]; isError: boolean } };
  const [envelope, ...printed] = reply.result.content;
  return { text: envelope?.text ?? '', isError: reply.result.isError, printed: printed.map((c) => c.text).join('\n') };
}

/**
 * The arguments an agent sends are the names `tools/list` advertised, and each one has to reach
 * the handler. `argvOf` wrote `--${name}` from the canonical key, so `dryRun` became
 * `--dryRun` — which the engine refuses, because the command line is kebab-case (S5) — and a
 * boolean sent as `false` was dropped, so an option that defaults on could not be turned off.
 */
describe('tools/call — multi-word options and negations', () => {
  const tidy = defineProgram({
    name: 'tidy',
    commands: [
      defineCommand({
        name: 'run',
        effects: 'read_only',
        options: { dryRun: { type: 'boolean' }, maxLines: { type: 'string' }, color: { type: 'boolean', default: true } },
        run: ({ options }) => ({ dryRun: options.dryRun, maxLines: options.maxLines, color: options.color }),
      }),
    ],
  });

  it('sends a camelCase property as the kebab-case flag the schema names', async () => {
    const r = await call(tidy, 'run', { dryRun: true, maxLines: '3' });
    expect(r.isError, r.text).toBe(false);
    expect(JSON.parse(r.text)).toMatchObject({ ok: true, data: { dryRun: true, maxLines: '3' } });
  });

  it('turns a boolean that defaults on off, when the agent says false', async () => {
    const r = await call(tidy, 'run', { color: false });
    expect(JSON.parse(r.text)).toMatchObject({ ok: true, data: { color: false } });
  });

  it('says nothing for a false it does not need to, so a relation is not tripped by it', async () => {
    const r = await call(tidy, 'run', { dryRun: false });
    expect(JSON.parse(r.text)).toMatchObject({ ok: true, data: { color: true } });
    expect((JSON.parse(r.text) as { data: { dryRun?: boolean } }).data.dryRun).not.toBe(true);
  });
});

/**
 * The README's one-file CLI, served over `--mcp`. `run(defineCommand(…))` built its manifest
 * from the name, the description and the options alone, so the `effects` that `defineCommand`
 * had just insisted on never reached `tools/list` — the tool said `effects: 'undeclared'` — and
 * the tool was named `""`, the command's path with the program's own name taken off, which
 * for a single command is everything. MCP tool names are one character or more.
 */
describe('a single-command program over --mcp', () => {
  it('is one tool, named after the program, carrying the effects it declared', async () => {
    const input = new PassThrough();
    const out: string[] = [];
    const greet = defineCommand({
      name: 'greet',
      options: { name: { type: 'string', required: true } },
      effects: 'read_only',
      run: ({ options }) => ({ greeting: `hello, ${options.name ?? ''}` }),
    });
    const running = run(greet, { argv: ['--mcp'], env: {}, stdin: input, stdout: { write: (s: string) => out.push(s) }, stderr: { write: () => true }, exit: () => undefined });
    input.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })}\n`);
    input.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'greet', arguments: { name: 'ada' } } })}\n`);
    input.end();
    await running;
    const [list, called] = out.join('').trim().split('\n').map((l) => JSON.parse(l) as { result: Record<string, unknown> });
    expect(list?.result['tools']).toMatchObject([{ name: 'greet', annotations: { readOnlyHint: true, idempotentHint: true, destructiveHint: false } }]);
    expect(called?.result).toMatchObject({ isError: false });
  });
});

/**
 * A handler that prints. The JSON-RPC frames go out on stdout, so anything else a tool call
 * writes there — `console.log` in a commander action, the common case in a migrated program,
 * or `process.stdout.write` — landed between two frames and the client read `hello` as a
 * malformed message. Before this, the stream a real `--mcp` program sent was:
 *
 *     {"jsonrpc":"2.0","id":1,"result":{…"serverInfo":{"name":"hello"…}}}
 *     hello
 *     {"jsonrpc":"2.0","id":2,"result":{"content":[{"type":"text","text":"{\"ok\":true,\"data\":null,…}"}],"isError":false}}
 *
 * — a parse error, and a tool result that says nothing, because what the action had to say it
 * printed. Now the frames are the only thing on the stream and the printed text is the result.
 *
 * Proved red against the unfixed tree (the text never reached the result, and the raw write
 * reached the stream), and the restore tests against the capture with its `finally` taken out.
 */
/**
 * `--mcp` on a `burgee/commander` program with the transport on the real `process.stdout`,
 * as a spawned server's is: every line the client would read, and the tool results by id.
 */
async function serveCommander(program: Command, calls: object[]): Promise<{ lines: string[]; results: Map<number, { content: { text: string }[]; isError: boolean }>; stderr: string }> {
  const lines: string[] = [];
  const errs: string[] = [];
  const input = Readable.from([`${calls.map((c) => JSON.stringify(c)).join('\n')}\n`]);
  vi.spyOn(process, 'stdin', 'get').mockReturnValue(input as unknown as typeof process.stdin);
  const originalOut = process.stdout.write;
  const originalErr = process.stderr.write;
  process.stdout.write = ((s: string | Uint8Array) => lines.push(String(s)) > 0) as typeof process.stdout.write;
  process.stderr.write = ((s: string | Uint8Array) => errs.push(String(s)) > 0) as typeof process.stderr.write;
  try {
    await program.parseAsync(['--mcp'], { from: 'user' });
  } finally {
    process.stdout.write = originalOut;
    process.stderr.write = originalErr;
    vi.restoreAllMocks();
  }
  const stream = lines.join('').split('\n').filter((l) => l !== '');
  const results = new Map<number, { content: { text: string }[]; isError: boolean }>();
  for (const line of stream) {
    const frame = JSON.parse(line) as { id: number; result: { content: { text: string }[]; isError: boolean } };
    results.set(frame.id, frame.result);
  }
  return { lines: stream, results, stderr: errs.join('') };
}

const callOf = (id: number, name: string): object => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: {} } });
const textOf = (result: { content: { text: string }[] } | undefined): string => (result?.content ?? []).map((c) => c.text).join('\n');

/** Everything a tool call's capture replaces, to prove it was put back. */
const snapshot = (): unknown[] => [process.stdout.write, console.log, console.info, console.debug, console.dir, console.table];

describe('a tool call that prints', () => {
  it('returns what a commander action console.logs as the tool result', async () => {
    const program = new Command('hello');
    program.command('greet').action(() => {
      console.log('hello');
    });
    const { results } = await serveCommander(program, [callOf(1, 'greet')]);
    expect(results.get(1)?.isError).toBe(false);
    expect(results.get(1)?.content).toContainEqual({ type: 'text', text: 'hello' });
  });

  it('keeps a direct process.stdout.write off the stream, and leaves stderr on stderr', async () => {
    const program = new Command('raw');
    program.command('dump').action(() => {
      process.stdout.write('raw line\n');
      process.stderr.write('a warning\n');
    });
    // `serveCommander` parses every line as a frame, so a stray write fails it here.
    const { lines, results, stderr } = await serveCommander(program, [callOf(1, 'dump')]);
    expect(lines).toHaveLength(1);
    expect(textOf(results.get(1))).toContain('raw line');
    expect(textOf(results.get(1))).not.toContain('a warning');
    expect(stderr).toContain('a warning');
  });

  /**
   * The transport answers one request at a time — `serve` awaits each before it reads the
   * next line — so two calls cannot overlap. Pipelined anyway, with the first one printing
   * only after it has yielded: each result carries its own output and nothing of the other's.
   */
  it('keeps two pipelined calls from reading each other’s output', async () => {
    const program = new Command('two');
    program.command('slow').action(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      console.log('from slow');
    });
    program.command('fast').action(() => {
      console.log('from fast');
    });
    const { results } = await serveCommander(program, [callOf(1, 'slow'), callOf(2, 'fast')]);
    expect(textOf(results.get(1))).toContain('from slow');
    expect(textOf(results.get(1))).not.toContain('from fast');
    expect(textOf(results.get(2))).toContain('from fast');
    expect(textOf(results.get(2))).not.toContain('from slow');
  });

  describe('puts stdout and the console back after the call', () => {
    it('when the handler throws after printing', async () => {
      const before = snapshot();
      const loud = defineProgram({
        name: 'loud',
        commands: [defineCommand({ name: 'boom', effects: 'read_only', run: () => { console.log('about to fail'); throw new Error('boom'); } })],
      });
      const r = await call(loud, 'boom', {});
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.text)).toMatchObject({ ok: false, error: { message: 'boom' } });
      expect(r.printed).toBe('about to fail');
      expect(snapshot()).toEqual(before);
    });

    it('when the invoke itself rejects, and the server answers the next request', async () => {
      const before = snapshot();
      const input = new PassThrough();
      const written: string[] = [];
      let calls = 0;
      const invoke = async (): Promise<{ stdout: string; stderr: string; code: number }> => {
        calls += 1;
        console.log('printed first');
        if (calls === 1) throw new Error('the runner fell over');
        return { stdout: '{"ok":true}', stderr: '', code: 0 };
      };
      const done = serveMcp(program, { input, output: { write: (s: string) => written.push(s) }, invoke });
      input.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'greet', arguments: { name: 'ada' } } })}\n`);
      input.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'greet', arguments: { name: 'ada' } } })}\n`);
      input.end();
      await done;
      expect(snapshot()).toEqual(before);
      const [first, second] = written.join('').trim().split('\n').map((l) => JSON.parse(l) as { id: number; result: { content: { text: string }[]; isError: boolean } });
      expect(first?.result.isError).toBe(true);
      expect(textOf(first?.result)).toContain('the runner fell over');
      expect(textOf(first?.result)).toContain('printed first');
      expect(second).toMatchObject({ id: 2, result: { isError: false } });
    });
  });
});
