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
    defineCommand({ name: 'wide', effects: 'read_only', arguments: [{ name: 'what', required: false }], options: many, run: () => Promise.reject(new Error('down')) }),
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
    expect((await run('fail', '--cod', '0')).stderr).toBe('error: unknown option --cod\nhint: did you mean --code?\nfix: tool fail --code 0\n');
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
        '  fail                     fail on purpose',
        '  shapes [file] <rest...>',
        '  bare                     short',
        '  wide [what]',
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

/**
 * B1's CI transcripts (`b1-transcripts` of the bench runs at #847, #853, #855 and #856): the
 * refusals that cost burgee a turn each. A list naming `config` but not `config get <key>`; `get`
 * corrected to `greet` while `config get` existed; `--json` and `--format json` typed before the
 * command and answered with `unknown command "--json"`. Each case below is one of those.
 */
const small = defineProgram({
  name: 'demo',
  commands: [
    defineCommand({ name: 'greet', description: 'Greet someone', effects: 'read_only', arguments: [{ name: 'name', required: true }], run: () => 'hi' }),
    defineCommand({
      name: 'config',
      description: 'Read configuration',
      commands: [defineCommand({ name: 'get', description: 'Print one value', effects: 'read_only', arguments: [{ name: 'key', required: true }], run: ({ positionals }) => positionals[0] })],
    }),
    defineCommand({
      name: 'secrets',
      hidden: true,
      commands: [defineCommand({ name: 'rotate', effects: 'idempotent', run: () => ({ changed: false }) })],
    }),
    defineCommand({ name: 'fail', description: 'Fail on purpose', effects: 'read_only', run: () => 'no' }),
  ],
});
const demo = async (...argv: string[]): ReturnType<typeof runCommand> => await runCommand(small, argv);

describe('a refusal carries the line to run', () => {
  it('lists every command that runs, with what it takes, when they fit — and nothing under a hidden group', async () => {
    expect((await demo('user.name')).stderr).toBe(
      [
        'error: unknown command "user.name"',
        'hint: run --schema for every command and option as JSON, in one call',
        'usage: demo <command>',
        'commands:',
        '  greet <name>      Greet someone',
        '  config get <key>  Print one value',
        '  fail              Fail on purpose',
        '',
      ].join('\n'),
    );
    expect((await demo('config', '--nope')).stderr).toContain('usage: demo config <command>\ncommands:\n  get <key>  Print one value\n');
  });

  it('reads a word that names exactly one deeper command as that command, ahead of a sibling a few edits away', async () => {
    // `get` is two edits from `greet`; it is the whole name of `config get`.
    expect(await demo('get', 'user.name')).toEqual({ code: ExitCode.USAGE, stdout: '', stderr: 'error: unknown command "get"\nhint: did you mean config get?\nfix: demo config get user.name\n' });
  });

  it('guesses nothing when two deeper commands share the word', async () => {
    const twice = defineProgram({
      name: 'two',
      commands: ['a', 'b'].map((name) => defineCommand({ name, commands: [defineCommand({ name: 'get', effects: 'read_only', run: () => name })] })),
    });
    const r = await runCommand(twice, ['get']);
    expect(r.stderr).not.toContain('fix:');
    expect(r.stderr).toContain('  a get\n  b get\n');
  });

  it('carries a request for JSON into the fix in burgee’s own spelling, before any --', async () => {
    expect((await demo('get', 'k', '--format', 'json')).stderr).toBe('error: unknown command "get"\nhint: did you mean config get?\nfix: demo config get k --json\n');
    expect(JSON.parse((await demo('get', 'k', '--json', '--', 'x')).stdout)).toMatchObject({ error: { fix: 'demo config get k --json -- x' } });
    // After `--` the words are the handler's, and nothing there is read as a request.
    expect((await demo('get', 'k', '--', '--format', 'json')).stderr).toContain('fix: demo config get k -- --format json\n');
  });

  it('answers --json before the command with the command that takes it, on stdout as an envelope', async () => {
    expect(await demo('--json', 'config', 'get', 'user.name')).toEqual({
      code: ExitCode.USAGE,
      stdout: `${JSON.stringify({ ok: false, error: { code: 2, message: '--json goes after the command', fix: 'demo config get user.name --json' } })}\n`,
      stderr: '',
    });
    expect(JSON.parse((await demo('--json=value', 'config', 'get', 'k')).stdout)).toMatchObject({ error: { fix: 'demo config get k --json=value' } });
  });

  it('answers --format json or --output=json before the command as the unknown option it is, with --json as the fix', async () => {
    const said = 'error: unknown option --format\nhint: did you mean --json?\nfix: demo config get user.name --json\n';
    expect((await demo('--format', 'json', 'config', 'get', 'user.name')).stderr).toBe(said);
    expect((await demo('--output=json', 'config', 'get', 'user.name')).stderr).toContain('fix: demo config get user.name --json\n');
    // When what follows names no command that runs, the word that does not is the refusal.
    expect((await demo('--format', 'json', 'user.name')).stderr).toContain('error: unknown command "user.name"\n');
    expect((await demo('--json')).stdout).toContain(String.raw`"message":"unknown command \"--json\""`);
  });

  it('lists what the group takes when --json precedes a group and no command', async () => {
    expect((await demo('config', '--json')).stdout).toContain('"commands":[{"name":"get <key>","description":"Print one value"}]');
  });
});

describe('help says what each command takes', () => {
  it('lists a command with its arguments, the way commander does', async () => {
    expect((await demo('config', '--help')).stdout).toContain('Commands:\n  get <key>  Print one value\n');
    expect((await demo('--help')).stdout).toContain('  greet <name>      Greet someone\n');
  });
});

/**
 * B1's CI transcripts at ba8a89c (`b1-transcripts` of bench run 37850963207), after both demos
 * were installed as `demo`: three screens that still cost burgee a turn each. The root `--help`
 * said `config`, so 5 of 5 discover runs spent a turn on `demo config --help`; `demo config
 * user.name --format json` named no fix; and `fix: --json` was a flag, not a line to run.
 */
describe('the line to run is on the first screen, and whole', () => {
  it('lists root help by the commands that run, each by its full path with what it takes, when they fit', async () => {
    const commands = 'Commands:\n  greet <name>      Greet someone\n  config get <key>  Print one value\n  fail              Fail on purpose\n\n';
    expect((await demo('--help')).stdout).toContain(commands);
    // A bare invocation prints the same screen, as the usage error it is.
    expect((await demo()).stderr).toContain(commands);
    // A hidden group's commands stay hidden.
    expect((await demo('--help')).stdout).not.toMatch(/secrets|rotate/);
  });

  it('keeps group rows when the commands that run do not fit', async () => {
    const leaves = Array.from({ length: 9 }, (_, i) => defineCommand({ name: `k${String(i)}`, effects: 'read_only', run: () => i }));
    const big = defineProgram({ name: 'big', commands: [defineCommand({ name: 'keys', description: 'Nine of them', commands: leaves })] });
    const help = (await runCommand(big, ['--help'])).stdout;
    expect(help).toMatch(/Commands:\n {2}keys +Nine of them\n\n/);
    expect(help).not.toContain('keys k0');
  });

  it('reads a refused word as the argument of the one command below that takes one, and carries --json into the fix', async () => {
    expect(await demo('config', 'user.name', '--format', 'json')).toEqual({
      code: ExitCode.USAGE,
      stdout: '',
      stderr: 'error: unknown command "user.name"\nhint: did you mean get user.name?\nfix: demo config get user.name --json\n',
    });
  });

  const kv = defineProgram({
    name: 'kv',
    commands: [
      defineCommand({
        name: 'config',
        commands: [
          defineCommand({ name: 'get', effects: 'read_only', arguments: [{ name: 'key', required: true }], run: () => 'v' }),
          defineCommand({ name: 'set', effects: 'idempotent', arguments: [{ name: 'key', required: true }, { name: 'value', required: true }], run: () => ({ changed: false }) }),
          defineCommand({ name: 'list', effects: 'read_only', run: () => [] }),
        ],
      }),
      defineCommand({ name: 'log', effects: 'read_only', arguments: [{ name: 'lines', variadic: true }], run: () => '' }),
      defineCommand({ name: 'cat', effects: 'read_only', arguments: [{ name: 'file', required: false }], run: () => '' }),
    ],
  });

  it('picks the one command whose arguments the words fit, and guesses nothing when two fit or none does', async () => {
    expect((await runCommand(kv, ['config', 'user.name'])).stderr).toContain('fix: kv config get user.name\n');
    expect(JSON.parse((await runCommand(kv, ['config', 'user.name', 'ada', '--json'])).stdout)).toMatchObject({ error: { fix: 'kv config set user.name ada --json' } });
    // The words counted are the ones before the first flag; the flag is carried as typed.
    expect((await runCommand(kv, ['config', 'user.name', 'ada', '--quiet'])).stderr).toContain('fix: kv config set user.name ada --quiet\n');
    // Three words fit neither `get <key>` nor `set <key> <value>`.
    expect((await runCommand(kv, ['config', 'a', 'b', 'c'])).stderr).not.toContain('fix:');
    // At the root one word fits `config get <key>`, `log <lines...>` and `cat [file]`; two fit
    // `config set <key> <value>` and `log <lines...>`. Neither is one command.
    expect((await runCommand(kv, ['user.name'])).stderr).not.toContain('fix:');
    expect((await runCommand(kv, ['a', 'b'])).stderr).not.toContain('fix:');
    // Four fit only the variadic one.
    expect((await runCommand(kv, ['a', 'b', 'c', 'd'])).stderr).toContain('fix: kv log a b c d\n');
  });

  it('reads no flag as an argument', async () => {
    const flag = await demo('config', '--verbose');
    expect(flag.stderr).toContain('error: unknown command "--verbose"\n');
    expect(flag.stderr).not.toContain('fix:');
  });

  it('names the whole corrected line as the fix for an unknown option, quoted where a shell needs it', async () => {
    expect((await demo('config', 'get', 'user.name', '--format', 'json')).stderr).toBe('error: unknown option --format\nhint: did you mean --json?\nfix: demo config get user.name --json\n');
    expect((await run('fail', '--cod=0')).stderr).toContain('fix: tool fail --code=0\n');
    expect((await run('fail', '--output=json', "it's")).stderr).toContain(`fix: tool fail --json 'it'\\''s'\n`);
  });
});
