/**
 * burgee's additions on yargs syntax (yargs-compat X8, J2/J7/J8): the manifest projected
 * from what a yargs program registered, `--json`, `--schema`, `completion <shell>`,
 * plugins and effects, and the injected seam reporting E1 — each guarded, so a program
 * that asks for none of it runs exactly as on yargs (the oracle's 804 are that proof).
 */
import { describe, expect, it } from 'vitest';

import { ExitCode } from './exit-code.js';
import yargs, { type YargsInstance } from './yargs.js';

type Argv = Record<string, unknown>;

interface Captured {
  stdout: string;
  stderr: string;
  code: number | undefined;
}

/** A program with the seam injected; `run` parses and hands back what it wrote. */
function program(): { y: ReturnType<typeof yargs>; run: (args: string[]) => Promise<Captured> } {
  const out: string[] = [];
  const err: string[] = [];
  let code: number | undefined;
  const y = yargs([])
    .scriptName('demo')
    .version('1.2.3')
    .strict()
    .burgee({ stdout: { write: (s) => out.push(s) }, stderr: { write: (s) => err.push(s) }, exit: (c) => void (code = c) })
    .option('verbose', { type: 'boolean', alias: 'v', describe: 'say more' })
    .option('level', { type: 'number', default: 2, describe: 'how deep' })
    .command(
      'greet <name>',
      'Greet someone',
      (cmd: YargsInstance) => cmd.positional('name', { type: 'string', describe: 'who to greet' }).option('shout', { type: 'boolean', describe: 'uppercase it' }).effects('read_only'),
      (argv: Argv) => ({ greeting: `${argv.shout ? 'HELLO' : 'Hello'}, ${String(argv.name)}` }),
    )
    .command('fail', 'Throw from the handler', {}, () => {
      throw new Error('boom');
    });
  return {
    y,
    run: async (args) => {
      out.length = 0;
      err.length = 0;
      code = undefined;
      await y.parseAsync(args);
      return { stdout: out.join(''), stderr: err.join(''), code };
    },
  };
}

describe('the manifest is projected from what the program registered (J7)', () => {
  it('names the root, its options with their types, and every command with its positionals', () => {
    const { y } = program();
    const m = y.manifest;
    expect(m.rootPath).toEqual(['demo']);
    expect(m.version).toBe('1.2.3');
    const root = m.find(['demo']);
    expect(root?.options).toMatchObject({ verbose: { type: 'boolean', short: 'v', description: 'say more' }, level: { type: 'number', default: 2 } });
    expect(root?.options).not.toHaveProperty('help');
    expect(root?.options).not.toHaveProperty('version');
    const greet = m.find(['demo', 'greet']);
    expect(greet?.description).toBe('Greet someone');
    expect(greet?.arguments).toEqual([{ name: 'name', required: true, variadic: false, description: 'who to greet' }]);
    expect(greet?.options).toMatchObject({ shout: { type: 'boolean', description: 'uppercase it' } });
    expect(greet?.effects).toBe('read_only');
    expect(greet?.run).toBeDefined();
  });

  it('projects a builder given as an object, array options as multiple, and kebab keys as camelCase', () => {
    const y = yargs([]).scriptName('t').command('ls [dir]', 'list', { 'dry-run': { type: 'boolean' }, tag: { type: 'array', choices: ['a', 'b'] } });
    const ls = y.manifest.find(['t', 'ls']);
    expect(ls?.options).toMatchObject({ dryRun: { type: 'boolean' }, tag: { type: 'string', multiple: true, choices: ['a', 'b'] } });
    expect(ls?.arguments).toEqual([{ name: 'dir', required: false, variadic: false }]);
  });

  it('treats the default command as the root handler, not a child', () => {
    const y = yargs([]).scriptName('t').command('$0 <file>', 'process a file', {}, () => undefined);
    const m = y.manifest;
    expect(m.commands.map((c) => c.path.join(' '))).toEqual(['t']);
    expect(m.find(['t'])?.arguments).toEqual([{ name: 'file', required: true, variadic: false }]);
  });
});

describe('--json is the envelope when the program did not declare it (N1)', () => {
  it('wraps the handler return value with provenance', async () => {
    const { run } = program();
    const r = await run(['greet', 'ada', '--shout', '--json']);
    expect(r.code).toBe(ExitCode.OK);
    expect(JSON.parse(r.stdout)).toEqual({ ok: true, data: { greeting: 'HELLO, ada' }, meta: { provenance: { shout: { source: 'flag' }, level: { source: 'default' } } } });
  });

  it('reports a usage failure as the E3 envelope on stdout and USAGE', async () => {
    const { run } = program();
    const r = await run(['greet', '--json']);
    expect(r.code).toBe(ExitCode.USAGE);
    expect(r.stderr).toBe('');
    expect(JSON.parse(r.stdout)).toMatchObject({ ok: false, error: { code: 'usage', message: expect.stringContaining('Not enough non-option arguments') } });
  });

  it('reports a handler that threw as RUNTIME', async () => {
    const { run } = program();
    const r = await run(['fail', '--json']);
    expect(r.code).toBe(ExitCode.RUNTIME);
    expect(JSON.parse(r.stdout)).toMatchObject({ ok: false, error: { code: 'runtime', message: 'boom' } });
  });

  it('leaves --json alone when the program declared it', async () => {
    const seen: unknown[] = [];
    const out: string[] = [];
    await yargs([])
      .burgee({ stdout: { write: (s) => out.push(s) }, exit: () => undefined })
      .option('json', { type: 'boolean' })
      .command('$0', '', {}, (argv: Argv) => {
        seen.push(argv.json);
      })
      .parseAsync(['--json']);
    expect(seen).toEqual([true]);
    expect(out).toEqual([]);
  });
});

describe('the surfaces are served from the manifest (N3, D2)', () => {
  it('--schema prints the program schema and exits OK', async () => {
    const { run } = program();
    const r = await run(['--schema']);
    expect(r.code).toBe(ExitCode.OK);
    const schema = JSON.parse(r.stdout) as { name: string; version: string; commands: { name: string }[] };
    expect(schema.name).toBe('demo');
    expect(schema.version).toBe('1.2.3');
    expect(schema.commands.map((c) => c.name)).toContain('greet');
  });

  it('completion bash prints a script naming the program', async () => {
    const { run } = program();
    const r = await run(['completion', 'bash']);
    expect(r.code).toBe(ExitCode.OK);
    expect(r.stdout).toContain('demo');
    expect(r.stdout).toContain('complete');
  });

  it("keeps yargs' own completion command when the program registered one", async () => {
    const out: string[] = [];
    await yargs([])
      .scriptName('own')
      .burgee({ stdout: { write: (s) => out.push(s) }, exit: () => undefined })
      .completion()
      .parseAsync(['completion']);
    expect(out.join('')).toContain('yargs command completion script');
  });
});

describe('plugins and the seam (J8, T1)', () => {
  it('fires preRun and postRun around the handler', async () => {
    const calls: string[] = [];
    const { y, run } = program();
    y.use({ name: 'trace', hooks: { preRun: { handler: ({ command }) => void calls.push(`pre ${command}`) }, postRun: { handler: ({ command }) => void calls.push(`post ${command}`) } } });
    const r = await run(['greet', 'ada']);
    expect(r.code).toBe(ExitCode.OK);
    expect(calls).toEqual(['pre greet', 'post greet']);
    expect(r.stdout).toBe('greeting: Hello, ada\n');
  });

  it('maps help and version to OK, a validation failure to USAGE, a throwing handler to RUNTIME', async () => {
    const { run } = program();
    expect((await run(['--help'])).code).toBe(ExitCode.OK);
    expect((await run(['--version'])).stdout).toBe('1.2.3\n');
    const usage = await run(['nope']);
    expect(usage.code).toBe(ExitCode.USAGE);
    expect(usage.stderr).toContain('Unknown argument: nope');
    expect((await run(['fail'])).code).toBe(ExitCode.RUNTIME);
  });
});
