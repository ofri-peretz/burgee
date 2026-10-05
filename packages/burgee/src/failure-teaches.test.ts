/**
 * D-20260930 — a failure teaches the recovery, and help names the agent surfaces.
 *
 * Read from B1's transcripts (#775): burgee's `fail` printed `error: boom` and nothing else, so
 * an agent asked to make it exit 0 settled for `fail || true` in 12 runs of 12 and never learned
 * that `--code` existed. An unknown command said "run --help" instead of naming the commands
 * there are, and `--explain` was listed by no help at all. Each block below is one of those.
 */
import { describe, expect, it } from 'vitest';

import { runCommand } from './execute.js';
import { AuthError, defineCommand, defineProgram, ExitCode, UsageError } from './index.js';

const many = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`opt${String(i)}`, { type: 'boolean' as const, description: `option ${String(i)}` }]));

const program = defineProgram({
  name: 'tool',
  description: 'a tool',
  commands: [
    defineCommand({
      name: 'fail',
      description: 'fail on purpose',
      effects: 'idempotent',
      options: { code: { type: 'string', description: 'exit with this code instead' } },
      run: ({ options, exit }) => {
        if (options.code !== undefined) exit(Number(options.code));
        throw new Error('boom');
      },
    }),
    defineCommand({
      name: 'shapes',
      effects: 'read_only',
      arguments: [{ name: 'file', required: false }, { name: 'rest', variadic: true }],
      options: {
        level: { type: 'number', short: 'l', description: 'how loud', default: 1, env: 'TOOL_LEVEL' },
        mode: { type: 'string', choices: ['a', 'b'], placeholder: 'm', required: true },
        secret: { type: 'string', hidden: true },
      },
      run: () => {
        throw new Error('nope');
      },
    }),
    defineCommand({ name: 'bare', summary: 'short', description: 'long words', effects: 'read_only', run: () => Promise.reject(new Error('down')) }),
    defineCommand({ name: 'wide', effects: 'read_only', options: many, run: () => Promise.reject(new Error('down')) }),
    defineCommand({ name: 'login', effects: 'read_only', run: () => Promise.reject(new AuthError('no token', 'log in')) }),
    defineCommand({ name: 'fixed', effects: 'read_only', options: { yes: { type: 'boolean' } }, run: () => Promise.reject(Object.assign(new UsageError('confirm it', 'pass --yes'), { fix: 'tool fixed --yes' })) }),
    defineCommand({
      name: 'carries',
      effects: 'read_only',
      run: () => Promise.reject(Object.assign(new UsageError('its own'), { usage: { command: 'tool carries <thing>' } })),
    }),
    defineCommand({ name: 'odd', effects: 'read_only', run: () => Promise.reject(Object.assign(new UsageError('a stray usage field'), { usage: { tokens: 3 } })) }),
    defineCommand({ name: 'hush', effects: 'read_only', hidden: true, run: () => 'hidden' }),
    defineCommand({
      name: 'config',
      description: 'read configuration',
      commands: [
        defineCommand({ name: 'get', description: 'print one value', effects: 'read_only', run: () => 'v' }),
        defineCommand({ name: 'set', description: 'store one value', effects: 'idempotent', run: () => ({ changed: false }) }),
      ],
    }),
  ],
});

const run = async (...argv: string[]): ReturnType<typeof runCommand> => await runCommand(program, argv);

describe('a failure with nothing to run next says what the command takes', () => {
  it('prints the usage line and the options after a runtime failure, and still exits 1', async () => {
    expect(await run('fail')).toEqual({
      code: ExitCode.RUNTIME,
      stdout: '',
      stderr: 'error: boom\nusage: tool fail [options]\noptions:\n  --code <value>  exit with this code instead\n',
    });
  });

  it('carries the same thing as error.usage under --json, on stdout', async () => {
    const r = await run('fail', '--json');
    expect(r.code).toBe(ExitCode.RUNTIME);
    expect(r.stderr).toBe('');
    expect(JSON.parse(r.stdout)).toEqual({
      ok: false,
      error: { code: 1, message: 'boom', usage: { command: 'tool fail [options]', options: [{ name: '--code <value>', description: 'exit with this code instead' }] } },
    });
  });

  it('writes every annotation a caller needs to pass the option, and leaves a hidden one out', async () => {
    const r = await run('shapes', '--mode', 'a');
    expect(r.stderr).toBe(
      [
        'error: nope',
        'usage: tool shapes [options] [file] <rest...>',
        'options:',
        '  -l, --level <n>  how loud (default: 1) [env: TOOL_LEVEL]',
        '  --mode <m>       (required) (one of: a, b)',
        '',
      ].join('\n'),
    );
  });

  it('is only the usage line for a command with no options', async () => {
    expect((await run('bare')).stderr).toBe('error: down\nusage: tool bare\n');
  });

  it('is bounded: eight rows, then the command that lists the rest', async () => {
    const r = await run('wide');
    expect(r.stderr.split('\n').filter((l) => l.startsWith('  --'))).toHaveLength(8);
    expect(r.stderr).toContain('  … the rest: tool wide --help\n');
    const json = JSON.parse((await run('wide', '--json')).stdout) as { error: { usage: { options: unknown[]; more: string } } };
    expect(json.error.usage.options).toHaveLength(8);
    expect(json.error.usage.more).toBe('tool wide --help');
  });

  it('says nothing more when the error already names the fix', async () => {
    expect((await run('fixed')).stderr).toBe('error: confirm it\nhint: pass --yes\nfix: tool fixed --yes\n');
    // A near-miss flag is a fix too.
    expect((await run('fail', '--cod', '0')).stderr).toBe('error: unknown option --cod\nhint: did you mean --code?\nfix: --code\n');
  });

  it('leaves an AUTH failure as it was: the remedy is a credential, not an option', async () => {
    expect(await run('login')).toEqual({ code: ExitCode.AUTH, stdout: '', stderr: 'error: no token\nhint: log in\n' });
  });

  it('prints nothing for ctx.exit, which is an exit and not a failure', async () => {
    expect(await run('fail', '--code', '1')).toEqual({ code: ExitCode.RUNTIME, stdout: '', stderr: '' });
  });

  it('renders a usage the error carries itself, and ignores a field that only shares the name', async () => {
    expect((await run('carries')).stderr).toBe('error: its own\nusage: tool carries <thing>\n');
    expect((await run('odd')).stderr).toBe('error: a stray usage field\nusage: tool odd\n');
  });
});

describe('an unknown command names what exists, and the nearest one', () => {
  it('lists the commands and points at --schema when nothing is near', async () => {
    expect(await run('user.name')).toEqual({
      code: ExitCode.USAGE,
      stdout: '',
      stderr: [
        'error: unknown command "user.name"',
        'hint: run --schema for every command and option as JSON, in one call',
        'usage: tool <command>',
        'commands:',
        '  fail     fail on purpose',
        '  shapes',
        '  bare     short',
        '  wide',
        '  login',
        '  fixed',
        '  carries',
        '  odd',
        '  … the rest: tool --help',
        '',
      ].join('\n'),
    });
  });

  it('carries them as error.usage.commands under --json', async () => {
    const r = await run('nothing', '--json');
    const body = JSON.parse(r.stdout) as { error: { code: number; usage: { command: string; commands: { name: string }[]; more: string } } };
    expect(body.error.code).toBe(ExitCode.USAGE);
    expect(body.error.usage.command).toBe('tool <command>');
    expect(body.error.usage.commands.map((c) => c.name)).not.toContain('hush');
    expect(body.error.usage.more).toBe('tool --help');
  });

  it('gives the caller’s own line back, corrected, as the fix — quoted where a shell needs it', async () => {
    expect(await run('confg', 'get', "it's here", '--json')).toEqual({
      code: ExitCode.USAGE,
      stdout: `${JSON.stringify({ ok: false, error: { code: 2, message: 'unknown command "confg"', hint: 'did you mean config?', fix: "tool config get 'it'\\''s here' --json" } })}\n`,
      stderr: '',
    });
  });

  it('corrects a word under a group, against that group’s commands', async () => {
    expect((await run('config', 'gte', 'user.name')).stderr).toBe('error: unknown command "gte"\nhint: did you mean get?\nfix: tool config get user.name\n');
  });

  it('guesses nothing on a tie, and lists the group instead', async () => {
    expect((await run('config', 'xet')).stderr).toBe(
      ['error: unknown command "xet"', 'hint: did you mean one of get, set?', 'usage: tool config <command>', 'commands:', '  get  print one value', '  set  store one value', ''].join('\n'),
    );
  });
});

describe('help names the agent surfaces', () => {
  it('ends the root help with one line for agents: --schema and what it gives, --json and --explain', async () => {
    const help = (await run('--help')).stdout;
    expect(help).toContain('For agents: --schema prints every command, option, default and env var as JSON, in one call.');
    expect(help).toContain('--explain <option> says where a value came from.');
  });

  it('lists --explain among the global options of a command that runs, and not of a group', async () => {
    expect((await run('fail', '--help')).stdout).toContain("  --explain <option>  where an option's value came from\n");
    expect((await run('config', '--help')).stdout).not.toContain('--explain');
    expect((await run('fail', '--help')).stdout).not.toContain('For agents');
  });
});
