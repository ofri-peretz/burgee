/**
 * P1, caique R1 — the engine's half of a prompt binding. burgee never imports caique; what it
 * does is leave a missing value that declares a `prompt` to the handler's binding (caique's
 * `promptFor`), which asks a person or refuses naming the flag, and hand the handler `ctx.json`,
 * the one fact about the run the binding cannot read off anything else (caique R6).
 *
 * `scripts/prompt-exit-codes.test.ts` runs the binding itself through this engine; here it is the
 * engine alone, with a handler standing in for the binding.
 */
import { Readable } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { defineCommand, defineProgram, runCommand } from './execute.js';
import { ExitCode } from './exit-code.js';
import { type RunContext } from './manifest.js';
import { schemaOf } from './schema.js';
import { runBurgee } from './testing.js';

const PROMPT = { kind: 'text', message: 'Who?' } as const;

/** A program whose one command hands back what its handler was given. */
const app = (command: Partial<Parameters<typeof defineCommand>[0]> = {}): ReturnType<typeof defineProgram> =>
  defineProgram({
    name: 'app',
    commands: [defineCommand({ name: 'greet', effects: 'read_only', run: (ctx: RunContext) => ({ args: ctx.args, options: ctx.options, json: ctx.json }), ...command })],
  });

describe('P1 · a missing value that declares a prompt is the binding’s to ask for or refuse', () => {
  it('a required positional with a prompt reaches the handler unanswered, instead of the engine refusing it', async () => {
    const r = await runCommand(app({ arguments: [{ name: 'who', prompt: PROMPT }] }), ['greet', '--json']);
    expect(r.code).toBe(ExitCode.OK);
    expect(JSON.parse(r.stdout)).toMatchObject({ ok: true, data: { args: {} } });
  });

  it('so does a required option with one', async () => {
    const r = await runCommand(app({ options: { who: { type: 'string', required: true, prompt: PROMPT } } }), ['greet', '--json']);
    expect(r.code).toBe(ExitCode.OK);
  });

  it('without a prompt, the engine still refuses both, naming them', async () => {
    const positional = await runCommand(app({ arguments: [{ name: 'who' }] }), ['greet']);
    expect(positional).toMatchObject({ code: ExitCode.USAGE, stderr: expect.stringContaining('missing required argument "who"') as string });
    const option = await runCommand(app({ options: { who: { type: 'string', required: true } } }), ['greet']);
    expect(option).toMatchObject({ code: ExitCode.USAGE, stderr: expect.stringContaining('missing required option --who') as string });
  });

  it('help and --schema still say it is required: a program reading them must still pass it', async () => {
    const m = app({ arguments: [{ name: 'who', prompt: PROMPT }], options: { greeting: { type: 'string', required: true, prompt: PROMPT } } });
    const help = await runCommand(m, ['greet', '--help']);
    expect(help.stdout).toContain('Usage: greet [options] <who>');
    expect(help.stdout).toMatch(/--greeting <value> +\(required\)/u);
    const [schema] = schemaOf(m).commands;
    expect(schema?.inputSchema.required).toEqual(['who', 'greeting']);
  });
});

describe('caique R6 · ctx.json — the engine’s knowledge that a machine is reading', () => {
  it('is false on a plain run and true under --json', async () => {
    expect((await runCommand(app(), ['greet'])).stdout).toContain('json: false');
    expect(JSON.parse((await runCommand(app(), ['greet', '--json'])).stdout)).toMatchObject({ data: { json: true } });
  });

  it('is true inside an --mcp tool call, which is a --json run', async () => {
    const call = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'greet', arguments: {} } });
    const r = await runBurgee(app(), { argv: ['--mcp'], stdin: Readable.from([`${call}\n`]) });
    const reply = JSON.parse(r.stdout.trim()) as { result: { content: { text: string }[] } };
    expect(JSON.parse(reply.result.content[0]?.text ?? '')).toMatchObject({ ok: true, data: { json: true } });
  });
});
