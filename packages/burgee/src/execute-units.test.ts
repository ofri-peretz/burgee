/**
 * The engine's own wiring (`execute.ts`) at the edges a whole program rarely reaches: a
 * `config` that is not one, `--config` on a program that reads none, a boolean that cannot be
 * negated, the keys a handler's options carry, and the name a hook is told.
 */
import { describe, expect, it } from 'vitest';

import { defineCommand, defineProgram, runCommand } from './execute.js';
import { definePlugin } from './plugin.js';

/** `demo go` with `options`, answering with the options it was handed. */
const echo = (options: Record<string, unknown>, extra: Record<string, unknown> = {}): ReturnType<typeof defineProgram> =>
  defineProgram({ name: 'demo', ...extra, commands: [defineCommand({ name: 'go', effects: 'read_only', options, run: ({ options: given }: { options: Record<string, unknown> }) => given } as never)] });

/** The options `demo go` was handed for `argv`. */
const optionsOf = async (program: ReturnType<typeof defineProgram>, argv: string[]): Promise<Record<string, unknown>> =>
  (JSON.parse((await runCommand(program, ['go', ...argv, '--json'])).stdout) as { data: Record<string, unknown> }).data;

describe('defineProgram', () => {
  it('reads config: false and config: null as no config', async () => {
    const runs = await Promise.all([false, null].map(async (config) => runCommand(echo({}, { config }), ['config', 'explain'])));
    expect(runs.map((r) => r.code)).toEqual([2, 2]);
  });
});

describe('the parse', () => {
  it('declares --config only for a program that reads config', async () => {
    expect((await runCommand(echo({}), ['go', '--config', 'x'])).code).toBe(2);
    expect((await runCommand(echo({}, { config: true }), ['go', '--no-config'])).code).toBe(0);
  });

  it('declares --no-<name> for a boolean unless it says it cannot be negated', async () => {
    expect(await optionsOf(echo({ verbose: { type: 'boolean' } }), ['--no-verbose'])).toEqual({ verbose: false });
    expect((await runCommand(echo({ verbose: { type: 'boolean', negatable: false } }), ['go', '--no-verbose'])).code).toBe(2);
  });

  it('hands a handler its options by their own names and nothing else', async () => {
    const program = echo({ verbose: { type: 'boolean' }, noCache: { type: 'boolean' } });
    expect(await optionsOf(program, ['--verbose', '--no-cache'])).toEqual({ verbose: true, noCache: true });
    expect(await optionsOf(program, ['--no-verbose'])).toEqual({ verbose: false });
  });
});

/** `demo go`, returning `value`. */
const returning = (value: unknown): ReturnType<typeof defineProgram> => defineProgram({ name: 'demo', commands: [defineCommand({ name: 'go', effects: 'read_only', run: () => value })] });

describe('a handler that returns nothing', () => {
  it('prints an empty line for undefined or null', async () => {
    const runs = await Promise.all([undefined, null].map(async (value) => runCommand(returning(value), ['go'])));
    expect(runs.map((r) => r.stdout)).toEqual(['\n', '\n']);
  });
});

/** `demo remote add`, with a plugin logging the name each preRun hook is told. */
const nested = (log: string[]): ReturnType<typeof defineProgram> => {
  const program = defineProgram({
    name: 'demo',
    commands: [defineCommand({ name: 'remote', commands: [defineCommand({ name: 'add', effects: 'idempotent', run: () => ({ done: true }) })] })],
  });
  program.use(definePlugin({ name: 'log', hooks: { preRun: { handler: ({ command }) => void log.push(command) } } }));
  return program;
};

describe('the name a command goes by', () => {
  it('is its path below the root, spaced, for a hook and for the N7 refusal', async () => {
    const log: string[] = [];
    const { stderr } = await runCommand(nested(log), ['remote', 'add']);
    expect(log).toEqual(['remote add']);
    expect(stderr).toContain('"remote add" is idempotent and must report changed');
  });
});

describe('the options a handler is handed after a negation', () => {
  it('carries the negated boolean by its own name, and no key for the --no- spelling or a value option', async () => {
    const given = await optionsOf(echo({ cache: { type: 'boolean', default: true }, label: { type: 'string' } }), ['--no-cache', '--label', 'x']);
    expect(given).toMatchObject({ cache: false, label: 'x' });
    expect(Object.keys(given)).not.toContain('noCache');
    expect(Object.keys(given)).not.toContain('');
  });
});

describe('the shutdown hook', () => {
  it('is told no command when none resolved', async () => {
    const calls: string[] = [];
    const program = echo({});
    program.use(definePlugin({ name: 'log', hooks: { shutdown: { handler: ({ command }) => void calls.push(`[${command}]`) } } }));
    await runCommand(program, ['nope']);
    expect(calls).toEqual(['[]']);
  });
});
