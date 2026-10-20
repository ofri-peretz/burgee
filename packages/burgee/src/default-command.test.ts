/**
 * default-command R1–R4 — a native program marks one command `default: true`, and `tool` with no
 * command, or with only that command's options, runs it (D-20261012-default-command-shape).
 *
 * Written before the key existed: on main `default` was not one of `NODE_KEYS`, so it never
 * reached the manifest, `demo` alone printed root help and left 2, and no surface said which
 * command was the default.
 */
import { describe, expect, it } from 'vitest';

import { completionTree, renderFigSpec } from './completions.js';
import { defineCommand, defineProgram, runCommand } from './index.js';
import { toolsOf } from './mcp.js';

function program(serveArguments = true): ReturnType<typeof defineProgram> {
  return defineProgram({
    name: 'demo',
    examples: [{ command: 'demo build', description: 'build the site' }],
    commands: [
      defineCommand({
        name: 'serve',
        default: true,
        description: 'serve the site',
        effects: 'read_only',
        options: { port: { type: 'number', default: 80, description: 'the port' } },
        ...(serveArguments ? { arguments: [{ name: 'dir', required: false }] } : {}),
        examples: [{ command: 'demo --port 8080', description: 'serve on 8080' }, { command: 'demo public' }],
        run: ({ options, positionals }) => `serving ${positionals[0] ?? '.'} on ${String(options.port)}`,
      }),
      defineCommand({ name: 'build', description: 'build the site', effects: 'idempotent', run: () => ({ changed: true }) }),
      defineCommand({
        name: 'remote',
        description: 'manage remotes',
        commands: [
          defineCommand({ name: 'add', effects: 'idempotent', arguments: [{ name: 'url' }], run: () => ({ changed: true }) }),
          defineCommand({ name: 'list', default: true, effects: 'read_only', options: { verbose: { type: 'boolean' } }, run: ({ options }) => (options.verbose === true ? 'origin (fetch)' : 'origin') }),
        ],
      }),
    ],
  });
}

const plain = (): ReturnType<typeof defineProgram> =>
  defineProgram({ name: 'demo', commands: [defineCommand({ name: 'serve', effects: 'read_only', run: () => 'serving' }), defineCommand({ name: 'build', effects: 'read_only', run: () => 'built' })] });

describe('R1 — declared once per level, and checked', () => {
  it('reaches the manifest on the command that declares it, and only there', () => {
    const manifest = program();
    expect(manifest.find(['demo', 'serve'])?.default).toBe(true);
    expect(manifest.find(['demo', 'remote', 'list'])?.default).toBe(true);
    expect(manifest.find(['demo', 'build'])).not.toHaveProperty('default');
  });

  it('refuses two defaults at one level, naming both and what to do', () => {
    expect(() =>
      defineProgram({
        name: 'demo',
        commands: [defineCommand({ name: 'a', default: true, effects: 'read_only', run: () => 'a' }), defineCommand({ name: 'b', default: true, effects: 'read_only', run: () => 'b' })],
      }),
    ).toThrow('burgee: commands a and b of "demo" are both default; keep default: true on one');
  });

  it('refuses two defaults below the root too, naming the group', () => {
    expect(() =>
      defineProgram({
        name: 'demo',
        commands: [
          defineCommand({
            name: 'remote',
            commands: [defineCommand({ name: 'add', default: true, effects: 'read_only', run: () => 'a' }), defineCommand({ name: 'list', default: true, effects: 'read_only', run: () => 'l' })],
          }),
        ],
      }),
    ).toThrow('burgee: commands add and list of "demo remote" are both default; keep default: true on one');
  });

  it('accepts one default at each level, and a default: false beside a default', () => {
    expect(() => program()).not.toThrow();
    expect(() =>
      defineProgram({
        name: 'demo',
        commands: [defineCommand({ name: 'a', default: true, effects: 'read_only', run: () => 'a' }), defineCommand({ name: 'b', default: false, effects: 'read_only', run: () => 'b' })],
      }),
    ).not.toThrow();
  });
});

describe('R2 — argv that names no command runs the default', () => {
  it('runs it with nothing typed', async () => {
    expect(await runCommand(program(), [])).toEqual({ code: 0, stdout: 'serving . on 80\n', stderr: '' });
  });

  it('runs it with only its options', async () => {
    expect(await runCommand(program(), ['--port', '8080'])).toEqual({ code: 0, stdout: 'serving . on 8080\n', stderr: '' });
  });

  it('hands it a word as its positional when it declares one and the word is near no command', async () => {
    expect(await runCommand(program(), ['public', '--port', '1'])).toEqual({ code: 0, stdout: 'serving public on 1\n', stderr: '' });
  });

  it('still refuses a word near a command name, with its did you mean', async () => {
    const result = await runCommand(program(), ['buid']);
    expect(result.code).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('unknown command "buid"');
    expect(result.stderr).toContain('did you mean build?');
  });

  it('still refuses a word near the default itself', async () => {
    const result = await runCommand(program(), ['serv']);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('did you mean serve?');
  });

  it('refuses a word when the default declares no positional, as before', async () => {
    const result = await runCommand(program(false), ['public']);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('unknown command "public"');
  });

  it('a named command still runs itself', async () => {
    const result = await runCommand(program(), ['build', '--json']);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: true, data: { changed: true } });
  });

  it('gives the default the envelope and the globals typed for it', async () => {
    const json = await runCommand(program(), ['--json']);
    expect(JSON.parse(json.stdout)).toMatchObject({ ok: true, data: 'serving . on 80' });
    expect(await runCommand(program(), ['--quiet'])).toEqual({ code: 0, stdout: 'serving . on 80\n', stderr: '' });
  });

  it('refuses an option the default does not declare as the default does', async () => {
    const result = await runCommand(program(), ['--nope']);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('--nope');
  });

  it('leaves with the code the default leaves with', async () => {
    const exits = defineProgram({ name: 'demo', commands: [defineCommand({ name: 'check', default: true, effects: 'read_only', run: ({ exit }) => exit(3) })] });
    expect((await runCommand(exits, [])).code).toBe(3);
  });

  it('runs a group’s default with the words after the group', async () => {
    expect(await runCommand(program(), ['remote'])).toEqual({ code: 0, stdout: 'origin\n', stderr: '' });
    expect(await runCommand(program(), ['remote', '--verbose'])).toEqual({ code: 0, stdout: 'origin (fetch)\n', stderr: '' });
  });

  it('follows a default that is a group into the group’s own default, and stops at one with none', async () => {
    const chained = defineProgram({
      name: 'demo',
      commands: [defineCommand({ name: 'remote', default: true, commands: [defineCommand({ name: 'list', default: true, effects: 'read_only', run: () => 'origin' })] })],
    });
    expect(await runCommand(chained, [])).toEqual({ code: 0, stdout: 'origin\n', stderr: '' });
    const group = defineProgram({ name: 'demo', commands: [defineCommand({ name: 'remote', default: true, commands: [defineCommand({ name: 'add', effects: 'read_only', run: () => 'added' })] })] });
    const result = await runCommand(group, []);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('Usage: remote <command> [options]');
  });

  it('does not take a word as the positional when it is exactly a command deeper down', async () => {
    const result = await runCommand(program(), ['add']);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('did you mean remote add?');
  });

  it('a program with no default keeps root help and exit 2', async () => {
    const result = await runCommand(plain(), []);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('Usage: demo <command> [options]');
  });
});

describe('R3 — root help names the default and shows what it takes (yargs #1331)', () => {
  it('is the root’s help, not the default’s, and marks the default', async () => {
    const help = await runCommand(program(), ['--help']);
    expect(help.code).toBe(0);
    expect(help.stdout).toContain('Usage: demo [command] [options]');
    expect(help.stdout).toMatch(/^ {2}serve \[dir\] +serve the site \(default\)$/mu);
    expect(help.stdout).toMatch(/^ {2}build +build the site$/mu);
  });

  it('lists the default’s options and arguments, since they are typed at the root', async () => {
    const help = (await runCommand(program(), ['--help'])).stdout;
    expect(help).toMatch(/^Options:\n {2}--port <n> +the port \(default: 80\)$/mu);
    expect(help).toMatch(/^Arguments:\n {2}\[dir\]$/mu);
    expect(help).toMatch(/^ {2}--explain <option> +where/mu);
  });

  it('prints the root’s examples, then the default’s', async () => {
    const help = (await runCommand(program(), ['--help'])).stdout;
    expect(help).toContain('Examples:\n  $ demo build\n    build the site\n  $ demo --port 8080\n    serve on 8080\n  $ demo public\n');
  });

  it('prints each example once when the root declares none of its own', async () => {
    const bare = defineProgram({ name: 'demo', commands: [defineCommand({ name: 'serve', default: true, effects: 'read_only', examples: [{ command: 'demo' }, { command: 'demo -x' }], run: () => '' })] });
    const help = (await runCommand(bare, ['--help'])).stdout;
    expect(help).toContain('Examples:\n  $ demo\n  $ demo -x\n');
    expect(help.match(/\$ demo\n/gu)).toHaveLength(1);
  });

  it('a group with a default says so too, and the default’s own help is its own', async () => {
    const group = (await runCommand(program(), ['remote', '--help'])).stdout;
    expect(group).toContain('Usage: remote [command] [options]');
    expect(group).toMatch(/^ {2}list +\(default\)$/mu);
    const own = (await runCommand(program(), ['serve', '--help'])).stdout;
    expect(own).toContain('Usage: serve [options] [dir]');
    expect(own).not.toContain('(default)');
  });

  it('marks only the default of the level it lists: root help does not call remote list the default', async () => {
    const help = (await runCommand(program(), ['--help'])).stdout;
    expect(help).toMatch(/^ {2}remote list$/mu);
  });

  it('a program with no default keeps <command> and marks nothing', async () => {
    const help = (await runCommand(plain(), ['--help'])).stdout;
    expect(help).toContain('Usage: demo <command> [options]');
    expect(help).not.toContain('(default)');
    expect(help).not.toMatch(/^ {2}--explain <option>/mu);
  });
});

describe('R4 — the projections say which command is the default', () => {
  it('--schema carries default: true on that command and nowhere else', async () => {
    const doc = JSON.parse((await runCommand(program(), ['--schema'])).stdout) as { commands: { name: string; default?: boolean }[] };
    const byName = Object.fromEntries(doc.commands.map((c) => [c.name, c]));
    expect(byName['serve']?.default).toBe(true);
    expect(byName['remote list']?.default).toBe(true);
    expect(byName['build']).not.toHaveProperty('default');
  });

  it('root completions offer the default’s options, and a group’s offer its default’s', () => {
    const { root } = completionTree(program());
    expect(Object.keys(root.options)).toContain('port');
    expect(Object.keys(root.children.find((c) => c.path.join(' ') === 'remote')?.options ?? {})).toContain('verbose');
    expect(Object.keys(completionTree(plain()).root.options)).not.toContain('port');
    expect((renderFigSpec(program()).options ?? []).map((o) => o.name)).toContainEqual(expect.arrayContaining(['--port']));
  });

  it('--mcp is unchanged: the default is the tool it already was', () => {
    const names = toolsOf(program()).map((t) => t.name);
    expect(names).toContain('serve');
    expect(names).toContain('remote_list');
    expect(names.filter((n) => n === 'serve')).toHaveLength(1);
  });
});
