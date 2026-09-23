/**
 * What a migrated user gets without writing one line of burgee syntax — intent
 * `facade-gets-more`, requirements G1–G5.
 *
 * Compatibility is the floor and it is measured elsewhere: `npm run compat -- commander`
 * and `npm run compat -- yargs`, 1360 / 1360 and 804 / 804. This file measures the part
 * above the floor, on a program written entirely in the incumbent's own syntax —
 * `new Command()`, `.command()`, `.option()`, `.action()`, `parseAsync` — and nothing else.
 *
 * ## The mutations each test was proved red against
 *
 * Every assertion below was run against the unfixed tree first, and against the specific
 * wrong implementation named beside it. The two that matter most:
 *
 * 1. **`toolsOf` filtered `c.effects !== undefined`.** Every commander and yargs command is
 *    `undefined` there — neither incumbent has a notion of effects, and neither can be made
 *    to acquire one without breaking the suites that grade the façades — so `tools/list`
 *    returned `{"tools":[]}` for every migrated program. The headline pitch was false for
 *    exactly the audience it targets. `lists a command that declared nothing` is red on it.
 *
 * 2. **`--mcp` served `output: { write: (s) => root._outputConfiguration.writeOut(s) }`.**
 *    That reads the writer *at reply time*, and the first `tools/call` replaces
 *    `_outputConfiguration` on every command in the tree so the invoked run's output can be
 *    captured — by design, `_prepareBurgee` does it. So every reply from the first tool call
 *    onwards went into that call's discarded buffer: no reply on stdout, process exits 0,
 *    the client waits forever. It fired on a program that had done everything right, because
 *    a program with no declarations had no tool to call in the first place.
 *    `answers a second tool call` is red on it — and note it is the *second* call, since the
 *    first one's reply is written after the writer has already been stolen.
 *
 * The rest, each with its mutation:
 *
 * - `annotationsOf(undefined)` returning `{ readOnlyHint: false, idempotentHint: false,
 *   destructiveHint: true }` — the "conservative default" that looks right. Red on
 *   `says undeclared and offers no hint at all`: a guess dressed as a declaration is
 *   indistinguishable from an author's word, and MCP's *own* defaults for absent hints are
 *   already exactly that conservative reading.
 * - `annotationsOf(undefined)` returning `{ effects: 'undeclared', readOnlyHint: false }` —
 *   same test, same reason, on the sneakier half-way version.
 * - the filter loosened all the way to `() => true`, so `withheld` becomes a tool. Red on
 *   `keeps a withheld command absent` and on `refuses a withheld command by name`.
 * - `_takeJson` left where it was, splicing `--json` out of the unknown list after
 *   `parseOptions` ran. Red on `takes --json at the root of a command group` (the guard was
 *   `this._actionHandler`, which a group root fails) and on `does not swallow the operand
 *   after --json` (by then commander has already moved `dest` to unknown and eaten it).
 * - `_declares` walking `_getCommandAndAncestors()` instead of the tree. Red on
 *   `leaves a --json the program declared alone`: at the root the subcommand has not been
 *   resolved, so the ancestor chain is empty and the root eats the subcommand's own flag.
 * - `error()` writing the envelope *and* falling through to the prose. Red on
 *   `writes nothing to stderr`.
 * - `_reportJson` without the `reported` latch. Red on `reports one failure once`.
 * - `fix` taken from the suggestion line unconditionally. Red on `offers no fix when the
 *   suggestion is a menu`, where two candidates are equally close and neither is *the* fix.
 */
import { Readable } from 'node:stream';

import { describe, expect, it, vi } from 'vitest';

import { Command } from './commander.js';
import { toolsOf } from './mcp.js';
import yargs, { type Argv } from './yargs.js';

/** A program in plain commander syntax. Nothing here is burgee's. */
function commanderProgram(): Command {
  const program = new Command();
  program.name('demo').version('1.2.3').description('a plain commander program');
  program
    .command('greet')
    .description('greet someone')
    .argument('<who>', 'who to greet')
    .option('--loud', 'shout it')
    .action((who: string, opts: { loud?: boolean }) => ({ greeting: opts.loud === true ? `HELLO ${who}` : `hello ${who}` }));
  program.command('sum').argument('<a>').argument('<b>').action((a: string, b: string) => ({ sum: Number(a) + Number(b) }));
  return program;
}

/** Run one argv and collect what the program wrote and the code it settled on. */
async function run(program: Command, argv: string[]): Promise<{ out: string; err: string; code: number }> {
  const out: string[] = [];
  const err: string[] = [];
  let code = 0;
  await program.parseAsync(argv, { from: 'user', stdout: { write: (s) => out.push(s) }, stderr: { write: (s) => err.push(s) }, exit: (c) => void (code = c) });
  return { out: out.join(''), err: err.join(''), code };
}

/** Drive `--mcp` over a fake stdin; `host.stdin` is a getter on `process.stdin`. */
async function serve(lines: string[], program: Command = commanderProgram()): Promise<string[]> {
  const input = Readable.from([`${lines.join('\n')}\n`]);
  vi.spyOn(process, 'stdin', 'get').mockReturnValue(input as unknown as typeof process.stdin);
  const replies: string[] = [];
  program.configureOutput({ writeOut: (s) => void replies.push(s) });
  await program.parseAsync(['--mcp'], { from: 'user' });
  vi.restoreAllMocks();
  return replies.join('').trim().split('\n').filter((l) => l !== '');
}

describe('G1/G2 — a façade command is a tool, and says what it did not declare', () => {
  it('lists a command that declared nothing', () => {
    const tools = toolsOf(commanderProgram().manifest);
    expect(tools.map((t) => t.name)).toEqual(['greet', 'sum']);
  });

  it('says undeclared and offers no hint at all', () => {
    const greet = toolsOf(commanderProgram().manifest).find((t) => t.name === 'greet');
    // The whole annotation: `effects`, and nothing else. An absent hint is MCP's own
    // "assume the worst"; a present one would be burgee's guess wearing the author's voice.
    expect(greet?.annotations).toEqual({ effects: 'undeclared' });
  });

  it('carries the hints, and no undeclared marker, when the author did declare', () => {
    const program = commanderProgram();
    program.commands[0]?.effects('read_only');
    const greet = toolsOf(program.manifest).find((t) => t.name === 'greet');
    expect(greet?.annotations).toEqual({ readOnlyHint: true, idempotentHint: true, destructiveHint: false });
  });

  it('keeps a withheld command absent — the one word that still means no', () => {
    const program = commanderProgram();
    program.command('wipe').effects('withheld').action(() => 'gone');
    expect(toolsOf(program.manifest).map((t) => t.name)).toEqual(['greet', 'sum']);
  });

  it('does the same for a program in plain yargs syntax', () => {
    const y = yargs([])
      .scriptName('ydemo')
      .command('greet <who>', 'greet someone', (b: Argv) => b, () => undefined)
      .command('wipe', 'delete everything', (b: Argv) => b.effects('withheld'), () => undefined);
    const tools = toolsOf(y.manifest);
    expect(tools.map((t) => t.name)).toEqual(['greet']);
    expect(tools[0]?.annotations).toEqual({ effects: 'undeclared' });
  });
});

describe('G3 — the MCP transport survives a tool call', () => {
  it('answers a second tool call — the reply writer is held, not looked up', async () => {
    const replies = await serve([
      '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"greet","arguments":{"who":"a"}}}',
      '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"greet","arguments":{"who":"b"}}}',
    ]);
    const ids = replies.map((l) => (JSON.parse(l) as { id: number }).id);
    expect(ids).toEqual([1, 2]);
  });

  it('hands back the same envelope a --json caller gets', async () => {
    const [reply] = await serve(['{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"greet","arguments":{"who":"Ofri","loud":true}}}']);
    const body = JSON.parse(reply ?? '{}') as { result: { content: { text: string }[]; isError: boolean } };
    expect(body.result.isError).toBe(false);
    expect(JSON.parse(body.result.content[0]?.text ?? '{}')).toMatchObject({ ok: true, data: { greeting: 'HELLO Ofri' } });
  });

  it('refuses a withheld command by name', async () => {
    const program = commanderProgram();
    program.command('wipe').effects('withheld').action(() => 'gone');
    const [reply] = await serve(['{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"wipe","arguments":{}}}'], program);
    const body = JSON.parse(reply ?? '{}') as { error: { message: string } };
    expect(body.error.message).toBe('unknown tool "wipe"');
  });
});

describe('G4 — `--json` is a flag wherever a flag may be written', () => {
  it('takes --json at the root of a command group', async () => {
    const { out, code } = await run(commanderProgram(), ['--json', 'greet', 'Ofri']);
    expect(JSON.parse(out) as unknown).toMatchObject({ ok: true, data: { greeting: 'hello Ofri' } });
    expect(code).toBe(0);
  });

  it('takes it after the command too, which always worked', async () => {
    const { out } = await run(commanderProgram(), ['greet', 'Ofri', '--json']);
    expect(JSON.parse(out) as unknown).toMatchObject({ ok: true, data: { greeting: 'hello Ofri' } });
  });

  it('does not swallow the operand after --json', async () => {
    const { out, code } = await run(commanderProgram(), ['greet', '--json', 'Ofri']);
    expect(JSON.parse(out) as unknown).toMatchObject({ ok: true, data: { greeting: 'hello Ofri' } });
    expect(code).toBe(0);
  });

  it('is pass-through after the terminator', async () => {
    const program = new Command();
    let seen: string[] = [];
    program.name('demo').argument('[rest...]').action((rest: string[]) => void (seen = rest));
    const { out } = await run(program, ['--', '--json']);
    expect(seen).toEqual(['--json']);
    expect(out).toBe('');
  });

  it('leaves a --json the program declared alone', async () => {
    const program = new Command();
    program.name('demo');
    let seen: unknown;
    program
      .command('greet')
      .option('-j, --json', 'format output as json')
      .action((opts: { json?: boolean }) => void (seen = opts.json));
    const { out } = await run(program, ['greet', '--json']);
    // The program's own option won, so it is `true` on `opts` and no envelope was written.
    expect(seen).toBe(true);
    expect(out).toBe('');
  });
});

describe('G5 — a failure under `--json` is the envelope', () => {
  it('reports a missing argument as data, not prose', async () => {
    const { out, err } = await run(commanderProgram(), ['greet', '--json']);
    expect(JSON.parse(out) as unknown).toEqual({ ok: false, error: { code: 'commander.missingArgument', message: "missing required argument 'who'" } });
    expect(err).toBe('');
  });

  it('writes nothing to stderr', async () => {
    const { err } = await run(commanderProgram(), ['--json', 'nope']);
    expect(err).toBe('');
  });

  it('carries fix — the flag to run, beside the sentence to read (E3)', async () => {
    const { out } = await run(commanderProgram(), ['greet', 'Ofri', '--lod', '--json']);
    expect(JSON.parse(out) as unknown).toEqual({ ok: false, error: { code: 'commander.unknownOption', message: "unknown option '--lod'", fix: '--loud' } });
  });

  it('offers no fix when the suggestion is a menu', async () => {
    const program = new Command();
    program.name('demo');
    program.command('greet').option('--fooa').option('--foob').action(() => undefined);
    const { out } = await run(program, ['greet', '--fooc', '--json']);
    const body = JSON.parse(out) as { error: Record<string, unknown> };
    expect(body.error['message']).toBe("unknown option '--fooc'");
    expect(body.error).not.toHaveProperty('fix');
  });

  it('reports one failure once', async () => {
    const { out } = await run(commanderProgram(), ['greet', '--json']);
    expect(out.trim().split('\n')).toHaveLength(1);
  });

  it('leaves a failure without --json exactly as commander wrote it', async () => {
    const { out, err } = await run(commanderProgram(), ['greet']);
    expect(out).toBe('');
    expect(err).toBe("error: missing required argument 'who'\n");
  });
});
