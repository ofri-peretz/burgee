/**
 * The engine's own surfaces (`surfaces.ts`) at their edges: which children help-as-data lists,
 * when root help names AGENTS.md, which words the unknown-command refusal reads, and when the
 * synthesised `schema`, `config explain`, `completion`, `--skill` and `--mcp` stand aside.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { scratchDirs } from './__fixtures__/scratch-dir.js';
import { defineCommand, defineProgram, run, runCommand } from './execute.js';
import { helpFor, type SurfaceIo } from './surfaces.js';

const scratch = scratchDirs();

/** A group two deep: `remote` holds `branch`, which holds `add` and `list`; `tag` holds `make`. */
const nested = (): ReturnType<typeof defineProgram> =>
  defineProgram({
    name: 'demo',
    commands: [
      defineCommand({
        name: 'remote',
        commands: [
          defineCommand({
            name: 'branch',
            commands: [
              defineCommand({
                name: 'add',
                effects: 'idempotent',
                run: () => 'added',
              }),
              defineCommand({
                name: 'list',
                effects: 'read_only',
                run: () => 'listed',
              }),
            ],
          }),
        ],
      }),
      defineCommand({
        name: 'tag',
        commands: [
          defineCommand({
            name: 'make',
            effects: 'idempotent',
            run: () => 'made',
          }),
        ],
      }),
    ],
  });

/** What `--help --json` lists as children. */
const childrenOf = async (argv: string[]): Promise<unknown> => (JSON.parse((await runCommand(nested(), [...argv, '--help', '--json'])).stdout) as { commands?: unknown }).commands;

describe('help as data', () => {
  it('lists a level’s own children, by name, and no key at all for a command with none', async () => {
    expect(await childrenOf([])).toHaveLength(2);
    expect(await childrenOf(['remote'])).toHaveLength(1);
    expect(await childrenOf(['remote', 'branch'])).toHaveLength(2);
    expect(await childrenOf(['tag', 'make'])).toBeUndefined();
  });
});

/** An io for `helpFor`, collecting nothing: help comes back as the return value. */
function ioWith(over: Partial<SurfaceIo>): SurfaceIo {
  return {
    out: { write: () => true },
    env: {},
    cwd: '/',
    width: 80,
    stdin: Readable.from([]),
    pkg: undefined,
    ...over,
  };
}

/** `demo go`. */
const oneCommand = (): ReturnType<typeof defineProgram> =>
  defineProgram({
    name: 'demo',
    commands: [defineCommand({ name: 'go', effects: 'read_only', run: () => 'went' })],
  });

/** Root help for `demo go`, from a package at `pkg`. */
const rootHelp = async (pkg: SurfaceIo['pkg']): Promise<string> => {
  const manifest = oneCommand();
  return helpFor(manifest, manifest.find(manifest.rootPath) ?? { path: [], options: {} }, ioWith({ pkg }), { json: false });
};

describe('the AGENTS.md line in root help', () => {
  it('names the file only when it sits beside a bin the package declares', async () => {
    const dir = scratch('burgee-agents-line-');
    mkdirSync(join(dir, 'bin'));
    writeFileSync(join(dir, 'bin', 'AGENTS.md'), '# demo\n');
    const pkg = (bin: unknown): SurfaceIo['pkg'] => ({
      path: join(dir, 'package.json'),
      data: { bin },
    });
    expect(await rootHelp(pkg('./bin/demo.js'))).toContain('AGENTS.md beside this program says how to drive it.');
    expect(await rootHelp(pkg({ demo: './bin/demo.js', other: 1 }))).toContain('AGENTS.md beside this program');
    const without = await Promise.all([undefined, pkg(undefined), pkg(null), { path: join(dir, 'package.json'), data: {} }, pkg({ demo: 1 })].map(rootHelp));
    for (const help of without) expect(help).not.toContain('AGENTS.md');
  });
});

/** `demo go` and `demo stop`. */
const two = (): ReturnType<typeof defineProgram> =>
  defineProgram({
    name: 'demo',
    commands: [
      defineCommand({ name: 'go', effects: 'read_only', run: () => 'went' }),
      defineCommand({
        name: 'stop',
        effects: 'read_only',
        run: () => 'stopped',
      }),
    ],
  });

describe('help’s inputs', () => {
  it('gives the synthesised completion no global options', async () => {
    const { stdout, code } = await runCommand(two(), ['completion', '--help']);
    expect(code).toBe(0);
    expect(stdout).toContain('\n\nGlobal options:\n  --json   machine-readable output\n  --help   show this help\n\nExamples:');
    expect((await runCommand(two(), ['go', '--help'])).stdout).toContain('--quiet');
  });

  it('colours help for a terminal and not for anything else', async () => {
    const manifest = two();
    const node = manifest.find(['demo', 'go']) as NonNullable<ReturnType<typeof manifest.find>>;
    expect(
      await helpFor(
        manifest,
        node,
        ioWith({
          env: { TERM: 'xterm-256color' },
          out: { write: () => true, isTTY: true },
        }),
        { json: false },
      ),
    ).toContain('\u001B[');
    expect(
      await helpFor(
        manifest,
        node,
        ioWith({
          env: { TERM: 'xterm-256color' },
          out: { write: () => true, isTTY: false },
        }),
        { json: false },
      ),
    ).not.toContain('\u001B[');
  });
});

/** `demo plain` beside `demo <name>`, which declares `extra` and nothing else localised. */
const withOne = (name: string, extra: Record<string, unknown>): ReturnType<typeof defineProgram> =>
  defineProgram({
    name: 'demo',
    commands: [
      defineCommand({ name: 'plain', effects: 'read_only', run: () => 'x' }),
      defineCommand({
        name,
        effects: 'read_only',
        run: () => 'x',
        ...extra,
      } as never),
    ],
  });

describe('help in the run’s locale', () => {
  const env = { LANG: 'de_DE.UTF-8' };

  it('reads a localised option alone among plain ones', async () => {
    const program = withOne('opt', {
      options: {
        a: { type: 'boolean', description: 'stays' },
        b: {
          type: 'boolean',
          description: { en: 'change nothing', de: 'nichts ändern' },
        },
      },
    });
    expect((await runCommand(program, ['opt', '--help'], { env })).stdout).toContain('nichts ändern');
  });

  it('reads a localised example alone among plain ones', async () => {
    const program = withOne('ex', {
      examples: [
        { command: 'demo ex', description: 'plain example' },
        {
          command: 'demo ex --x',
          description: { en: 'look first', de: 'erst schauen' },
        },
      ],
    });
    expect((await runCommand(program, ['ex', '--help'], { env })).stdout).toContain('erst schauen');
  });

  it('loads a pack from any one plugin, and translates only help’s own words', async () => {
    const program = defineProgram({
      name: 'demo',
      commands: [
        defineCommand({
          name: 'go',
          description: 'unknown option --x',
          effects: 'read_only',
          run: () => 'x',
        }),
      ],
    });
    program.use({ name: 'plain', contract: 1 } as never);
    program.use({
      name: 'pack',
      contract: 1,
      locales: {
        de: {
          'help.globalOptions': 'Globale Optionen:',
          'usage.unknownOption': 'unbekannte Option {option}',
        },
      },
    } as never);
    const help = (await runCommand(program, ['go', '--help'], { env })).stdout;
    expect(help).toContain('Globale Optionen:');
    expect(help).toContain('unknown option --x');
  });
});

/** The replies `--mcp` gives to `requests`, one JSON-RPC message per line. */
async function mcp(
  program: ReturnType<typeof defineProgram>,
  requests: unknown[],
  env: Record<string, string> = {},
): Promise<{ id: number; result: { content: { text: string }[]; isError: boolean } }[]> {
  const stdin = Readable.from([`${requests.map((r) => JSON.stringify(r)).join('\n')}\n`]);
  const { stdout } = await runCommand(program, ['--mcp'], { stdin, env });
  return stdout
    .split('\n')
    .filter((l) => l !== '')
    .map(
      (l) =>
        JSON.parse(l) as {
          id: number;
          result: { content: { text: string }[]; isError: boolean };
        },
    )
    .toSorted((a, b) => a.id - b.id);
}
const call = (id: number, name: string, args: Record<string, unknown> = {}): unknown => ({
  jsonrpc: '2.0',
  id,
  method: 'tools/call',
  params: { name, arguments: args },
});

/** `fine`, `broken` (throws) and `quiet` (returns nothing). */
const tools = (): ReturnType<typeof defineProgram> =>
  defineProgram({
    name: 'demo',
    commands: [
      defineCommand({
        name: 'fine',
        effects: 'read_only',
        run: () => 'all good',
      }),
      defineCommand({
        name: 'broken',
        effects: 'read_only',
        run: () => {
          throw new Error('it broke');
        },
      }),
      defineCommand({
        name: 'quiet',
        effects: 'read_only',
        run: () => undefined,
      }),
    ],
  });

describe('--mcp runs each tool call as a run of its own', () => {
  it('reports the run’s own exit code, and what it printed', async () => {
    const [fine, broken, quiet] = await mcp(tools(), [call(1, 'fine'), call(2, 'broken'), call(3, 'quiet')]);
    expect(fine?.result.isError).toBe(false);
    expect(fine?.result.content[0]?.text).toContain('all good');
    expect(broken?.result.isError).toBe(true);
    expect(broken?.result.content[0]?.text).toContain('it broke');
    expect(quiet?.result).toMatchObject({ isError: false });
  });
});

/** `demo greet`, `demo config get <key>` and `demo deploy`; `remote` with a default `show <name>` beside `add`. */
const tool = (): ReturnType<typeof defineProgram> =>
  defineProgram({
    name: 'demo',
    commands: [
      defineCommand({
        name: 'greet',
        effects: 'read_only',
        options: { formats: { type: 'string' } },
        run: () => 'hello',
      }),
      defineCommand({
        name: 'config',
        commands: [
          defineCommand({
            name: 'get',
            effects: 'read_only',
            arguments: [{ name: 'key' }],
            run: ({ positionals }) => `got ${String(positionals[0])}`,
          }),
        ],
      }),
      defineCommand({
        name: 'deploy',
        effects: 'idempotent',
        run: () => ({ changed: true }),
      }),
      defineCommand({
        name: 'remote',
        commands: [
          defineCommand({
            name: 'show',
            default: true,
            effects: 'read_only',
            arguments: [{ name: 'name' }],
            run: ({ positionals }) => `showing ${String(positionals[0])}`,
          }),
          defineCommand({
            name: 'add',
            effects: 'idempotent',
            run: () => ({ changed: true }),
          }),
        ],
      }),
    ],
  });

/** The refusal's JSON error for `argv`. */
const refusal = async (program: ReturnType<typeof defineProgram>, argv: string[]): Promise<Record<string, unknown>> =>
  (
    JSON.parse((await runCommand(program, [...argv, '--json'])).stdout) as {
      error: Record<string, unknown>;
    }
  ).error;

describe('the unknown-command refusal', () => {
  it('reads a near child’s name at any depth before handing a word to the default', async () => {
    expect(await runCommand(tool(), ['remote', 'ad'])).toMatchObject({
      code: 2,
    });
    expect((await runCommand(tool(), ['remote', 'origin'])).stdout).toBe('showing origin\n');
  });

  it('runs the command after --format text, in either spelling', async () => {
    expect((await runCommand(tool(), ['--format=text', 'greet'])).stdout).toBe('hello\n');
    expect((await runCommand(tool(), ['--format', 'text', 'greet'])).stdout).toBe('hello\n');
    expect((await runCommand(tool(), ['--format', 'text', 'nope'])).code).toBe(2);
  });

  it('names --json when a command owns an option near the spelling typed', async () => {
    const { stderr, code } = await runCommand(tool(), ['--format', 'json', 'greet']);
    expect(code).toBe(2);
    expect(stderr).toContain('unknown option --format');
    expect(stderr).toContain('did you mean --json?');
    expect(stderr).toContain('demo greet --json');
  });

  it('takes a name deeper down as that command, not as an argument of it', async () => {
    expect(await refusal(tool(), ['get'])).toMatchObject({
      hint: 'did you mean config get?',
    });
    const one = defineProgram({
      name: 'demo',
      commands: [
        defineCommand({
          name: 'config',
          commands: [
            defineCommand({
              name: 'get',
              effects: 'read_only',
              arguments: [{ name: 'key' }],
              run: () => 'x',
            }),
          ],
        }),
      ],
    });
    expect(await refusal(one, ['get'])).toMatchObject({
      hint: 'did you mean config get?',
    });
  });

  it('keeps a request for JSON after -- where it was, and spells --format=json as --json', async () => {
    expect((await runCommand(tool(), ['gret', '--', '--json'])).stderr).toContain('demo greet -- --json');
    expect((await runCommand(tool(), ['--format=json', 'gret'])).stderr).toContain('demo greet --json\n');
    // A `--json` typed first is still read when a `--` comes later, and stays before it.
    expect(JSON.parse((await runCommand(tool(), ['--json', 'greet', '--', 'x'])).stdout)).toMatchObject({ ok: true, data: 'hello' });
  });
});

/** `demo job` holding `commands`. */
const group = (commands: ReturnType<typeof defineCommand>[]): ReturnType<typeof defineProgram> =>
  defineProgram({
    name: 'demo',
    commands: [defineCommand({ name: 'job', commands })],
  });

describe('the command the words are arguments of', () => {
  const get = defineCommand({
    name: 'get',
    effects: 'read_only',
    arguments: [{ name: 'key' }],
    run: () => 'x',
  });
  const exec = defineCommand({
    name: 'exec',
    effects: 'read_only',
    arguments: [{ name: 'script' }, { name: 'args', variadic: true }],
    run: () => 'x',
  });

  it('is the only one that takes arguments, however many words there are', async () => {
    expect((await refusal(group([get]), ['job', 'a', 'b', 'c'])).fix).toBe('demo job get a b c --json');
  });

  it('is the one whose last argument takes the rest, among several', async () => {
    expect((await refusal(group([get, exec]), ['job', 'a', 'b', 'c'])).fix).toBe('demo job exec a b c --json');
  });
});

/** What a one-command program prints for `schema`, its command taking `args`. */
const single = async (args: { name: string }[]): Promise<string> => {
  const out: string[] = [];
  const command = defineCommand({
    name: 'echo',
    effects: 'read_only',
    arguments: args,
    run: ({ positionals }) => `ran ${positionals.join(' ')}`,
  });
  await run(command, {
    argv: ['schema'],
    env: {},
    stdout: { write: (s) => out.push(s) },
    stderr: { write: () => true },
    exit: () => undefined,
  });
  return out.join('');
};

describe('the synthesised commands stand aside', () => {
  it('serves schema unless the root takes words', async () => {
    expect(JSON.parse(await single([]))).toHaveProperty('arguments', []);
    expect(await single([{ name: 'word' }])).toBe('ran schema\n');
    const bare = defineCommand({ name: 'echo', effects: 'read_only', run: () => 'ran' });
    const out: string[] = [];
    await run(bare, { argv: ['schema'], env: {}, stdout: { write: (t) => out.push(t) }, stderr: { write: () => true }, exit: () => undefined });
    expect(JSON.parse(out.join(''))).toHaveProperty('arguments', []);
    expect(JSON.parse((await runCommand(tool(), ['schema'])).stdout)).toHaveProperty('commands');
  });

  it('answers config explain only as those two words, and only for a program that reads config', async () => {
    const reads = defineProgram({
      name: 'demo',
      config: true,
      commands: [defineCommand({ name: 'go', effects: 'read_only', run: () => 'x' })],
    });
    expect((await runCommand(reads, ['config', 'nope'])).code).toBe(2);
    expect((await runCommand(reads, ['nope', 'explain'])).code).toBe(2);
    expect(JSON.parse((await runCommand(reads, ['nope', 'explain', '--schema'])).stdout)).toHaveProperty('commands');
    expect(JSON.parse((await runCommand(reads, ['config', 'nope', '--schema'])).stdout)).toHaveProperty('commands');
    expect((await runCommand(tool(), ['config', 'explain'])).code).toBe(2);
  });

  it('leaves completion to a program that declares its own', async () => {
    const own = defineProgram({
      name: 'demo',
      commands: [
        defineCommand({
          name: 'completion',
          effects: 'read_only',
          run: () => 'mine',
        }),
      ],
    });
    expect((await runCommand(own, ['completion'])).stdout).toBe('mine\n');
  });

  it('prints the Fig spec alone, indented by two', async () => {
    const { stdout, code } = await runCommand(tool(), ['completion', 'fig']);
    expect(code).toBe(0);
    expect(stdout.startsWith('{\n  "')).toBe(true);
    expect(JSON.parse(stdout)).toHaveProperty('name', 'demo');
  });

  it('prints the MCP client configuration and serves nothing', async () => {
    const { stdout, code } = await runCommand(tool(), ['--mcp', '--print-config'], { stdin: Readable.from([`${JSON.stringify(call(1, 'greet'))}\n`]) });
    expect(code).toBe(0);
    expect(stdout).not.toContain('jsonrpc');
  });

  it('reads globals typed before a word that names nothing', async () => {
    expect((await runCommand(tool(), ['--quiet', 'nope'])).code).toBe(2);
  });
});
