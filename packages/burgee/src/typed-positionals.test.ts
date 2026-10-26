/**
 * typed-positionals R1–R3 — a positional is declared with a `type` and `choices` the way an
 * option is, the handler reads it typed as `ctx.args.<name>`, and a value that fails either is
 * the usage error an option's value gets, exit 2, with a `fix` when one value is exact.
 *
 * Red first, against main at 1dcf064a: `type: 'integer'` is TS2322 (`ArgumentSpec.type` was
 * `'file'`), `choices` on a native argument is TS2353 (`Command.arguments` left it out), there is
 * no `ctx.args`, and `x` for an integer ran the handler and exited 0 with `positionals: ['x']`.
 */
import { PassThrough } from 'node:stream';

import { describe, expect, expectTypeOf, it } from 'vitest';

import { renderCompletion } from './completions.js';
import { defineCommand, defineProgram, execute, ExitCode } from './index.js';
import { Manifest } from './manifest.js';
import { argvOf } from './mcp.js';
import { schemaOf } from './schema-entry.js';
import { runBurgee } from './testing.js';

const deploy = defineCommand({
  name: 'deploy',
  arguments: [
    { name: 'env', choices: ['staging', 'prod'] },
    { name: 'replicas', type: 'integer' },
    { name: 'ratio', type: 'number', required: false, default: '0.5' },
    { name: 'dry', type: 'boolean', required: false },
  ],
  effects: 'read_only',
  run: ({ args, positionals }) => {
    expectTypeOf(args.env).toEqualTypeOf<'staging' | 'prod'>();
    expectTypeOf(args.replicas).toEqualTypeOf<number>();
    expectTypeOf(args.ratio).toEqualTypeOf<number>();
    expectTypeOf(args.dry).toEqualTypeOf<boolean | undefined>();
    return { args, positionals };
  },
});

const tag = defineCommand({
  name: 'tag',
  arguments: [
    { name: 'name', description: 'untyped, as every 1.x positional is' },
    { name: 'ports', type: 'number', variadic: true },
  ],
  effects: 'read_only',
  run: ({ args }) => {
    expectTypeOf(args.name).toEqualTypeOf<string>();
    expectTypeOf(args.ports).toEqualTypeOf<number[]>();
    return args;
  },
});

const program = defineProgram({ name: 'app', commands: [deploy, tag] });

const ok = async (argv: string[]): Promise<unknown> => {
  const r = await runBurgee(program, { argv: [...argv, '--json'] });
  expect(r.code, r.stdout).toBe(ExitCode.OK);
  return (r.json as { data: unknown }).data;
};

const refused = async (argv: string[]): Promise<{ message: string; hint?: string; fix?: string; kind: string }> => {
  const r = await runBurgee(program, { argv: [...argv, '--json'] });
  expect(r.code, r.stdout).toBe(ExitCode.USAGE);
  return (r.json as { error: { message: string; hint?: string; fix?: string; kind: string } }).error;
};

/** A fix line's words, as a shell splits them; these carry no quote inside a word. */
const words = (line: string): string[] => [...line.matchAll(/'([^']*)'|(\S+)/gu)].map((m) => (m[1] ?? m[2]) as string);

/** A one-command program declaring `arguments` as a caller TypeScript does not check would. */
const declaring = (args: unknown): Parameters<typeof runBurgee>[0] =>
  defineProgram({ name: 'app', commands: [defineCommand({ name: 'n', effects: 'read_only', arguments: args as [], run: () => 'ran' })] });

/** A command's `inputSchema` properties, as `--schema` publishes them. */
const inputOf = (name: string): Record<string, unknown> => schemaOf(program).commands.find((c) => c.name === name)?.inputSchema.properties ?? {};

/** One `tools/call` of `deploy`, as a client sends it. */
const callDeploy = (id: number, args: Record<string, unknown>): object => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name: 'deploy', arguments: args } });

describe('R1 — the declaration', () => {
  it('takes type and choices on a native argument', async () => {
    expect((await runBurgee(declaring([{ name: 'count', type: 'integer' }]), { argv: ['n', '2'] })).stdout).toBe('ran\n');
    // @ts-expect-error -- `choices` is a string type's alone, as on an option
    defineCommand({ name: 'n', effects: 'read_only', arguments: [{ name: 'count', type: 'number', choices: ['1'] }], run: () => 0 });
    // @ts-expect-error -- not a type
    defineCommand({ name: 'n', effects: 'read_only', arguments: [{ name: 'count', type: 'int' }], run: () => 0 });
  });

  it('refuses choices on a non-string type, and a type it does not know, before reading a word', async () => {
    const choices = await runBurgee(declaring([{ name: 'count', type: 'number', choices: ['1'] }]), { argv: ['n', '1'] });
    expect([choices.code, choices.stdout]).toEqual([ExitCode.RUNTIME, '']);
    expect(choices.stderr).toContain('burgee: argument "count" of "app n" declares choices but is not a string');
    const unknown = await runBurgee(declaring([{ name: 'count', type: 'int' }]), { argv: ['n', '1'] });
    expect([unknown.code, unknown.stdout]).toEqual([ExitCode.RUNTIME, '']);
    expect(unknown.stderr).toContain('burgee: argument "count" of "app n" has unknown type "int"');
  });

  it('refuses the same for a plugin command', async () => {
    const program = defineProgram({ name: 'app', commands: [] });
    program.use({ name: 'p', contract: 1, commands: [{ path: ['app', 'x'], options: {}, effects: 'read_only', arguments: [{ name: 'a', type: 'int' as 'integer' }], run: () => 0 }] });
    expect((await runBurgee(program, { argv: ['x', '1'] })).stderr).toContain('burgee: argument "a" of "app x" has unknown type "int"');
  });
});

describe('R2 — ctx.args, typed and by name', () => {
  it('coerces each declared type, and keeps ctx.positionals as typed', async () => {
    expect(await ok(['deploy', 'prod', '3', '0.25', 'true'])).toEqual({ args: { env: 'prod', replicas: 3, ratio: 0.25, dry: true }, positionals: ['prod', '3', '0.25', 'true'] });
    expect(await ok(['deploy', 'staging', '2', '1', 'false'])).toMatchObject({ args: { dry: false } });
  });

  it('gives an absent optional argument its default, coerced, and leaves the rest undefined', async () => {
    expect(await ok(['deploy', 'prod', '3'])).toEqual({ args: { env: 'prod', replicas: 3, ratio: 0.5 }, positionals: ['prod', '3'] });
  });

  it('hands a variadic argument over as an array, each item coerced, and an untyped one as the string typed', async () => {
    expect(await ok(['tag', 'v1', '80', '443'])).toEqual({ name: 'v1', ports: [80, 443] });
    expect(await ok(['tag', 'v1'])).toEqual({ name: 'v1', ports: [] });
  });

  it('carries args on a command with no typed argument too', async () => {
    const plain = defineProgram({ name: 'app', commands: [defineCommand({ name: 'greet', arguments: [{ name: 'who' }, { name: 'how', required: false, default: 'warmly' }], effects: 'read_only', run: ({ args }) => args })] });
    expect((await runBurgee(plain, { argv: ['greet', 'ada', '--json'] })).json).toMatchObject({ ok: true, data: { who: 'ada', how: 'warmly' } });
    const none = defineProgram({ name: 'app', commands: [defineCommand({ name: 'ping', effects: 'read_only', run: ({ args }) => ({ keys: Object.keys(args) }) })] });
    expect(((await runBurgee(none, { argv: ['ping', '--json'] })).json as { data: unknown }).data).toEqual({ keys: [] });
  });
});

describe('S4 rides the same chunk: `-` is standard input for a file argument only before `--`', () => {
  const files = defineProgram({ name: 'app', commands: [defineCommand({ name: 'cat', arguments: [{ name: 'files', type: 'file', variadic: true }], effects: 'read_only', run: ({ args, stdin, passthrough }) => ({ args, stdin: stdin !== undefined, passthrough }) })] });

  it('hands over stdin for a `-` among the file arguments, and not for one after `--`', async () => {
    expect(((await runBurgee(files, { argv: ['cat', 'a', '-', '--json'] })).json as { data: unknown }).data).toEqual({ args: { files: ['a', '-'] }, stdin: true, passthrough: [] });
    expect(((await runBurgee(files, { argv: ['cat', 'a', '--json', '--', '-'] })).json as { data: unknown }).data).toEqual({ args: { files: ['a'] }, stdin: false, passthrough: ['-'] });
  });
});

describe('R3 — a value that fails its type or choices is a usage error', () => {
  it('refuses a word that is not an integer, and runs nothing', async () => {
    expect(await refused(['deploy', 'prod', 'x'])).toMatchObject({ kind: 'usage', message: 'argument "replicas" expects an integer, got "x"' });
  });

  it('refuses a fraction for an integer, with the rounded line as the fix', async () => {
    expect(await refused(['deploy', 'prod', '2.6'])).toMatchObject({ message: 'argument "replicas" expects an integer, got "2.6"', fix: 'app deploy prod 3 --json' });
  });

  it('refuses a word that is not a number, never NaN, and a boolean that is not true or false', async () => {
    expect(await refused(['deploy', 'prod', '1', 'Infinity'])).toMatchObject({ message: 'argument "ratio" expects a number, got "Infinity"' });
    expect(await refused(['deploy', 'prod', '1', '1', 'yes'])).toMatchObject({ message: 'argument "dry" expects true or false, got "yes"' });
    expect(await refused(['tag', 'v1', '80', 'http'])).toMatchObject({ message: 'argument "ports" expects a number, got "http"' });
    // Blank is not 0, which is what `Number(' ')` says.
    expect(await refused(['tag', 'v1', ' '])).toMatchObject({ message: 'argument "ports" expects a number, got " "' });
  });

  it('refuses a value outside its choices, with the closest choice as the fix, and that fix runs', async () => {
    const error = await refused(['deploy', 'stagin', '2']);
    expect(error).toEqual({ kind: 'usage', code: ExitCode.USAGE, message: 'argument "env" must be one of staging, prod, got "stagin"', hint: 'did you mean staging?', fix: 'app deploy staging 2 --json' });
    const again = await runBurgee(program, { argv: words(error.fix as string).slice(1) });
    expect(again.code).toBe(ExitCode.OK);
  });

  it('replaces the word of a variadic argument where it was typed', async () => {
    const sum = defineProgram({ name: 'app', commands: [defineCommand({ name: 'sum', arguments: [{ name: 'ns', type: 'integer', variadic: true }], effects: 'read_only', run: ({ args }) => args.ns.reduce((a, b) => a + b, 0) })] });
    const r = await runBurgee(sum, { argv: ['sum', '1', '2.6', '4', '--json'] });
    expect((r.json as { error: { fix?: string } }).error.fix).toBe('app sum 1 3 4 --json');
  });

  it('replaces the word where it was typed, whatever options come before it', async () => {
    const r = await runBurgee(program, { argv: ['deploy', '--json', 'stagin', '2'] });
    expect((r.json as { error: { fix?: string } }).error.fix).toBe('app deploy --json staging 2');
  });

  it('offers no fix when no choice is close: never a guess', async () => {
    const error = await refused(['deploy', 'qa', '2']);
    expect(error.message).toBe('argument "env" must be one of staging, prod, got "qa"');
    expect(error.hint).toBeUndefined();
    expect(error.fix).toBeUndefined();
  });

  it('offers no fix when the lazy flags took words out of the line, since positions would no longer agree', async () => {
    const r = await runBurgee(program, { argv: ['deploy', '--quiet', 'stagin', '2', '--json'] });
    expect(r.code).toBe(ExitCode.USAGE);
    expect((r.json as { error: { fix?: string } }).error.fix).toBeUndefined();
  });

  it('prints the refusal for a person too, on stderr', async () => {
    const r = await runBurgee(program, { argv: ['deploy', 'prod', '2.6'] });
    expect(r.code).toBe(ExitCode.USAGE);
    expect(r.stderr).toContain('error: argument "replicas" expects an integer, got "2.6"\n');
    expect(r.stderr).toContain('fix: app deploy prod 3\n');
  });
});

/**
 * R4, its `--schema` and `--mcp` half for `choices` — what an agent reads is what the engine
 * enforces: a native argument's `choices` are the `enum` on its `inputSchema` property, which is
 * `--mcp`'s tool list, through the path the façade already took (`withChoices`, #1091). Red
 * first: a native argument could not declare `choices` at all. Not built: the argument's `type`
 * on that property (it stays `string`, which the engine coerces from) and completions offering a
 * positional's choices — R4's remaining half, measured against the façades' claim ratchets.
 */
describe('R4 — the projections carry the choices', () => {
  it('publishes a native argument\'s choices as enum, and its requiredness', () => {
    const { properties, required } = schemaOf(program).commands.find((c) => c.name === 'deploy')?.inputSchema ?? { properties: {}, required: [] };
    expect(properties).toMatchObject({ env: { type: 'string', enum: ['staging', 'prod'] } });
    expect(required).toEqual(['env', 'replicas']);
  });

  // R4's remaining half, red on main at 676279ab: every argument was published `type: 'string'`
  // (an `integer` one too), and a number's default as the string it is declared in.
  it('publishes each argument under its JSON type, and its default as that type', () => {
    expect(inputOf('deploy')).toEqual({
      env: { type: 'string', enum: ['staging', 'prod'] },
      replicas: { type: 'integer' },
      ratio: { type: 'number', default: 0.5 },
      dry: { type: 'boolean' },
    });
    expect(inputOf('tag')).toEqual({ name: { type: 'string', description: 'untyped, as every 1.x positional is' }, ports: { type: 'array', items: { type: 'number' } } });
    // A file is a path, so a string; a boolean's default is the word the engine reads as true.
    const more = defineProgram({
      name: 'app',
      commands: [
        defineCommand({
          name: 'm',
          effects: 'read_only',
          arguments: [{ name: 'file', type: 'file' }, { name: 'n', type: 'integer', required: false, default: '7' }, { name: 'on', type: 'boolean', required: false, default: 'true' }, { name: 'off', type: 'boolean', required: false, default: 'false' }],
          run: () => 'ran',
        }),
      ],
    });
    expect(schemaOf(more).commands[0]?.inputSchema.properties).toEqual({ file: { type: 'string' }, n: { type: 'integer', default: 7 }, on: { type: 'boolean', default: true }, off: { type: 'boolean', default: false } });
  });

  it('lists the typed property in --mcp tools/list, which is what a client validates a call against', async () => {
    const input = new PassThrough();
    const out: string[] = [];
    const running = execute(program, { argv: ['--mcp'], env: {}, stdin: input, stdout: { write: (s: string) => out.push(s) }, stderr: { write: () => true }, exit: () => undefined });
    for (const message of [{ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } }, { jsonrpc: '2.0', id: 2, method: 'tools/list' }]) input.write(`${JSON.stringify(message)}\n`);
    input.end();
    await running;
    const listed = out.join('').split('\n').filter((l) => l !== '').map((l) => JSON.parse(l) as { id: number; result: { tools?: { name: string; inputSchema: { properties: object } }[] } }).find((m) => m.id === 2);
    expect(listed?.result.tools?.find((t) => t.name === 'deploy')?.inputSchema.properties).toMatchObject({ replicas: { type: 'integer' }, ratio: { type: 'number', default: 0.5 }, dry: { type: 'boolean' } });
  });

  it('runs an --mcp call that sends the typed values, and refuses one outside the enum', async () => {
    const input = new PassThrough();
    const out: string[] = [];
    const running = execute(program, { argv: ['--mcp'], env: {}, stdin: input, stdout: { write: (s: string) => out.push(s) }, stderr: { write: () => true }, exit: () => undefined });
    for (const message of [{ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } }, callDeploy(2, { env: 'prod', replicas: 3, dry: false }), callDeploy(3, { env: 'qa', replicas: 3 })]) input.write(`${JSON.stringify(message)}\n`);
    input.end();
    await running;
    const replies = new Map(out.join('').split('\n').filter((l) => l !== '').map((l) => JSON.parse(l) as { id: number; result: { isError?: boolean } }).map((m) => [m.id, m.result]));
    const text = (id: number): string => (replies.get(id) as { content: { text: string }[] } | undefined)?.content[0]?.text ?? '';
    expect(replies.get(2)?.isError, text(2)).toBe(false);
    expect(JSON.parse(text(2))).toMatchObject({ ok: true, data: { args: { env: 'prod', replicas: 3, ratio: 0.5, dry: false } } });
    expect(replies.get(3)?.isError).toBe(true);
    expect(JSON.parse(text(3))).toMatchObject({ ok: false, error: { message: 'argument "env" must be one of staging, prod, got "qa"' } });
  });
});

/**
 * R4, its completions half — a positional's `choices` are offered in its slot. The real shells run
 * in `completions-shells.test.ts` › "typed-positionals R4"; these hold what each script says where
 * a shell is not installed (the mutation lane has no zsh, fish or pwsh), and the program's side
 * for a command that sends its slots to it. Red on main at 676279ab: no script carried a choice
 * of a positional, and `__complete` offered nothing for a slot without a completer.
 */
describe('R4 — completions offer a positional its choices', () => {
  const choosy = defineProgram({
    name: 'choosy',
    commands: [
      defineCommand({
        name: 'deploy',
        arguments: [{ name: 'env', choices: ['staging', 'prod'] }, { name: 'note' }, { name: 'tiers', variadic: true, required: false, choices: ['free', 'pro'] }],
        options: { region: { type: 'string', short: 'r' }, force: { type: 'boolean' } },
        effects: 'withheld',
        run: () => 'ran',
      }),
      defineCommand({ name: 'plain', arguments: [{ name: 'what' }], effects: 'withheld', run: () => 'ran' }),
    ],
  });
  // A program that is one command: its slots start at 0, under no subcommand condition, and it has no valued flag.
  const solo = new Manifest();
  solo.rootPath = ['solo'];
  solo.add({ path: ['solo'], options: {}, arguments: [{ name: 'mode', choices: ['a', "it's"] }], effects: 'read_only', run: () => 'ran' });
  // A command with a completer sends every slot to the program, which offers a listed one its choices.
  const mixed = defineProgram({ name: 'mx', commands: [defineCommand({ name: 'cp', arguments: [{ name: 'from', complete: () => ['a.txt', 'b.txt'] }, { name: 'mode', choices: ['fast', 'safe'] }], effects: 'withheld', run: () => 'ran' })] });

  it('bash: counts the words before the cursor, skipping a valued flag and its value, and lists the slot', () => {
    const script = renderCompletion(choosy, 'bash');
    expect(script).toContain(`    local listed='' n=0 j
    for ((j = 1; j < cword; j++)); do
      case "\${words[j]}" in
        -r|--region) j=$((j + 1)); [[ "\${words[j]:-}" == = ]] && j=$((j + 1)) ;;
        -*) ;;
        *) n=$((n + 1)) ;;
      esac
    done
    ((n == 1)) && listed='staging prod'
    ((n >= 3)) && listed='free pro'
    COMPREPLY=($(compgen -W ''" $listed" -- "$cur"))
`);
    // Once: `plain` lists nothing, so it counts nothing.
    expect(script.match(/local listed=/gu)).toHaveLength(1);
    expect(renderCompletion(solo, 'bash')).toContain(`      case "\${words[j]}" in
        -*) ;;
        *) n=$((n + 1)) ;;
      esac
    done
    ((n == 0)) && listed='a it'\\''s'
`);
    expect(renderCompletion(mixed, 'bash')).not.toContain('listed');
  });

  it('zsh: a listed positional is its slot\'s action, beside a completer\'s and `_files`', () => {
    expect(renderCompletion(choosy, 'zsh')).toContain(`'1: :(staging prod)' '2: :_files' '*: :(free pro)'\n}`);
    expect(renderCompletion(choosy, 'zsh')).toMatch(/_choosy_plain\(\) \{\n {2}_arguments -s .* '\*: :_files'\n\}/u);
    expect(renderCompletion(solo, 'zsh')).toContain(`'1: :(a it'\\''s)'\n}`);
    expect(renderCompletion(mixed, 'zsh')).toContain(`"$PREFIX" 2>/dev/null)"}}' '2: :(fast safe)'\n}`);
  });

  it('fish: one slot function, and a line per listed positional under its command and its slot', () => {
    const script = renderCompletion(choosy, 'fish');
    expect(script).toContain(`function _choosy_slot
  set -l w (commandline -opc); set -e w[1]
  set -l n 0; set -l skip 0
  for t in $w
    if test $skip = 1; set skip 0; continue; end
    if contains -- $t $argv; set skip 1; continue; end
    string match -q -- '-*' $t; or set n (math $n + 1)
  end
  if test $skip = 1; echo -1; else; echo $n; end
end
`);
    expect(script).toContain(`complete -c choosy -n '__fish_seen_subcommand_from deploy; and test (_choosy_slot -r --region) -eq 1' -f -a 'staging prod'\n`);
    expect(script).toContain(`complete -c choosy -n '__fish_seen_subcommand_from deploy; and test (_choosy_slot -r --region) -ge 3' -f -a 'free pro'\n`);
    expect(script.match(/_choosy_slot/gu)).toHaveLength(3);
    expect(renderCompletion(solo, 'fish')).toContain(`complete -c solo -n 'test (_solo_slot) -eq 0' -f -a 'a it'\\''s'\n`);
    expect(renderCompletion(mixed, 'fish')).not.toContain('_slot');
  });

  it('PowerShell: the slots, the valued flags and the variadic slot on the entry, and one block that reads them', () => {
    const script = renderCompletion(choosy, 'pwsh');
    expect(script).toContain("; Slots = @{ 1 = @('staging', 'prod'); 3 = @('free', 'pro') }; Valued = @('-r', '--region'); Rest = 3 }\n");
    expect(script).toContain(`  if ($entry.Slots -and $wordToComplete -notlike '-*') {
    $n = 0; $skip = $false
    foreach ($w in $words) { if ($skip) { $skip = $false } elseif ($entry.Valued -ccontains $w) { $skip = $true } elseif ($w -notlike '-*') { $n++ } }
    if ($null -ne $entry.Rest -and $n -gt $entry.Rest) { $n = $entry.Rest }
    if (-not $skip -and $entry.Slots.ContainsKey($n)) {
      $entry.Slots[$n] | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
      return
    }
  }
`);
    expect(script.match(/; Slots = /gu)).toHaveLength(1);
    expect(renderCompletion(solo, 'pwsh')).toContain("; Slots = @{ 0 = @('a', 'it''s') }; Valued = @() }\n");
    expect(renderCompletion(mixed, 'pwsh')).not.toContain('Slots');
  });

  it('every shell still never runs the program for a listed positional', () => {
    for (const shell of ['bash', 'zsh', 'fish', 'pwsh'] as const) expect(renderCompletion(choosy, shell)).toContain('never runs choosy on TAB');
  });

  it('the program offers a slot with choices and no completer its choices, filtered by the partial', async () => {
    const complete = async (...words: string[]): Promise<string> => (await runBurgee(mixed, { argv: ['__complete', ...words] })).stdout;
    expect(await complete('cp', '')).toBe('a.txt\nb.txt\n');
    expect(await complete('cp', 'a.txt', '')).toBe('fast\nsafe\n');
    expect(await complete('cp', 'a.txt', 's')).toBe('safe\n');
    expect(await complete('cp', 'a.txt', 'fast', '')).toBe('');
  });
});

/**
 * Found by the case above: `--mcp` built argv by skipping every argument the call left out, so a
 * skipped optional positional moved each later value one place left, and `dry: false` arrived as
 * `ratio`. Red first: `{ env, replicas, dry: false }` was refused as `argument "ratio" expects a
 * number, got "false"`; on untyped positionals the same call ran with the value in the wrong one.
 */
describe('an --mcp call reads positionals by place', () => {
  const node = { path: ['app', 'pick'], options: {}, arguments: [{ name: 'a' }, { name: 'b', required: false, default: 'B' }, { name: 'c', required: false }, { name: 'd', required: false }] };

  it('fills a skipped optional argument with its default, and stops after the last one given', () => {
    expect(argvOf(node, ['app'], { a: 'x', c: 'y' })).toEqual(['pick', '--json', 'x', 'B', 'y']);
    expect(argvOf(node, ['app'], { a: 'x' })).toEqual(['pick', '--json', 'x']);
    // `null` is a value left out, as JSON writes one.
    expect(argvOf(node, ['app'], { a: 'x', b: null, c: 'y', d: null })).toEqual(['pick', '--json', 'x', 'B', 'y']);
  });

  it('refuses a call that skips one with no default before one it gives, rather than shifting it', () => {
    expect(() => argvOf(node, ['app'], { a: 'x', d: 'z' })).toThrow('"c" has no default and comes before an argument the call gave: pass it too');
  });
});
