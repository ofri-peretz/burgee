/**
 * parse-refusals R1–R3 — a native command refuses input it would otherwise drop.
 *
 * Before this, `demo greet ada extra` ran with `extra` gone and exit 0, and `--level info --level
 * debug` ran with `level: 'debug'` and `info` gone, also exit 0. A silent drop is the worst outcome
 * for an agent: the call reports success with the wrong input, so nothing triggers a retry. Each
 * case below was run red against the unfixed tree first.
 */
import { describe, expect, it } from 'vitest';

import { runCommand } from './execute.js';
import { defineCommand, defineProgram, ExitCode } from './index.js';
import { type Plugin } from './plugin.js';

const seen: unknown[] = [];

const demo = defineProgram({
  name: 'demo',
  commands: [
    defineCommand({
      name: 'greet',
      effects: 'read_only',
      arguments: [{ name: 'who' }],
      options: { level: { type: 'string', short: 'l' }, tag: { type: 'string', multiple: true }, loud: { type: 'boolean', short: 'v' } },
      run: ({ positionals, options }) => void seen.push({ positionals, options }),
    }),
    defineCommand({ name: 'copy', effects: 'read_only', arguments: [{ name: 'from' }, { name: 'to', variadic: true }], run: ({ positionals }) => void seen.push(positionals) }),
    defineCommand({ name: 'maybe', effects: 'read_only', arguments: [{ name: 'what', required: false }], run: ({ positionals }) => void seen.push(positionals) }),
    defineCommand({ name: 'none', effects: 'read_only', run: ({ positionals }) => void seen.push(positionals) }),
    defineCommand({ name: 'exec', effects: 'non_idempotent', arguments: [{ name: 'tool' }], allowExcess: true, options: { level: { type: 'string' } }, run: ({ positionals }) => void seen.push(positionals) }),
  ],
});

async function run(...argv: string[]): Promise<{ code: number; stderr: string; seen: unknown }> {
  seen.length = 0;
  const r = await runCommand(demo, argv);
  return { code: r.code, stderr: r.stderr, seen: seen[0] };
}

describe('R1 — more positionals than a command declares is a usage error', () => {
  it('names the surplus word and runs nothing', async () => {
    const r = await run('greet', 'ada', 'extra');
    expect(r.code).toBe(ExitCode.USAGE);
    expect(r.stderr).toContain('error: too many arguments: expected 1, got 2 ("extra")');
    expect(r.seen).toBeUndefined();
  });

  it('quotes every surplus word, and counts a command that declares none', async () => {
    expect((await run('greet', 'ada', 'b', 'c d')).stderr).toContain('too many arguments: expected 1, got 3 ("b", "c d")');
    expect((await run('none', 'x')).stderr).toContain('too many arguments: expected 0, got 1 ("x")');
    expect((await run('maybe', 'a', 'b')).code).toBe(ExitCode.USAGE);
  });

  it('leaves a variadic last argument the rest, an optional one its absence, and `--` its tail', async () => {
    expect(await run('copy', 'a', 'b', 'c')).toMatchObject({ code: ExitCode.OK, seen: ['a', 'b', 'c'] });
    expect(await run('maybe')).toMatchObject({ code: ExitCode.OK, seen: [] });
    expect(await run('greet', 'ada', '--', 'x', 'y')).toMatchObject({ code: ExitCode.OK });
  });

  it('still names a missing argument first', async () => {
    expect((await run('greet')).stderr).toContain('missing required argument "who"');
  });
});

describe('R2 — `allowExcess: true` keeps the surplus for the handler', () => {
  it('hands every word to ctx.positionals, as before', async () => {
    expect(await run('exec', 'git', 'status', 'now')).toMatchObject({ code: ExitCode.OK, seen: ['git', 'status', 'now'] });
  });
});

describe('R3 — a single-value option given twice with different values is a usage error', () => {
  it('names both values and runs nothing', async () => {
    const r = await run('greet', 'ada', '--level', 'info', '--level', 'debug');
    expect(r.code).toBe(ExitCode.USAGE);
    expect(r.stderr).toContain('error: --level was given twice: "info" and "debug"');
    expect(r.seen).toBeUndefined();
  });

  it('reads every spelling of the flag: short, inline, and the two mixed', async () => {
    expect((await run('greet', 'ada', '-l', 'info', '--level=debug')).stderr).toContain('--level was given twice: "info" and "debug"');
    expect((await run('greet', 'ada', '--level=a', '-l', 'a', '--level', 'b')).stderr).toContain('--level was given twice: "a" and "b"');
  });

  it('accepts the same value twice, a `multiple` option, and a boolean repeated', async () => {
    expect(await run('greet', 'ada', '--level', 'info', '--level', 'info')).toMatchObject({ code: ExitCode.OK, seen: { options: { level: 'info' } } });
    expect(await run('greet', 'ada', '--tag', 'a', '--tag', 'b')).toMatchObject({ code: ExitCode.OK, seen: { options: { tag: ['a', 'b'] } } });
    expect(await run('greet', 'ada', '--loud', '--loud')).toMatchObject({ code: ExitCode.OK });
  });

  it('applies to a command that allows excess positionals too', async () => {
    expect((await run('exec', 'git', '--level', 'a', '--level', 'b')).code).toBe(ExitCode.USAGE);
  });

  it('never sets a flag against the environment: precedence decides that, as now', async () => {
    seen.length = 0;
    const r = await runCommand(defineProgram({ name: 'demo', commands: [defineCommand({ name: 'go', effects: 'read_only', options: { level: { type: 'string', env: 'DEMO_LEVEL' } }, run: ({ options }) => void seen.push(options) })] }), ['go', '--level', 'debug'], { env: { DEMO_LEVEL: 'info' } });
    expect(r.code).toBe(ExitCode.OK);
    expect(seen[0]).toMatchObject({ level: 'debug' });
  });
});

describe('both refusals are catalog lines a locale pack translates (localised-human-surfaces R1)', () => {
  it('prints the pack’s words for each, and the envelope stays English', async () => {
    const translated = defineProgram({ name: 'demo', commands: [defineCommand({ name: 'greet', effects: 'read_only', arguments: [{ name: 'who' }], options: { level: { type: 'string' } }, run: () => 'hi' })] });
    translated.use({
      name: 'pack',
      contract: 1,
      locales: { de: { 'usage.tooManyArguments': 'zu viele Argumente: erwartet {expected}, erhalten {given} ({words})', 'usage.givenTwice': '--{option} wurde zweimal angegeben: "{first}" und "{last}"' } },
    } as Plugin);
    const env = { BURGEE_LOCALE: 'de' };
    expect((await runCommand(translated, ['greet', 'ada', 'extra'], { env })).stderr).toContain('zu viele Argumente: erwartet 1, erhalten 2 ("extra")');
    expect((await runCommand(translated, ['greet', 'ada', '--level', 'a', '--level', 'b'], { env })).stderr).toContain('--level wurde zweimal angegeben: "a" und "b"');
    expect(JSON.parse((await runCommand(translated, ['greet', 'ada', 'extra', '--json'], { env })).stdout)).toMatchObject({ error: { message: 'too many arguments: expected 1, got 2 ("extra")' } });
  });
});
