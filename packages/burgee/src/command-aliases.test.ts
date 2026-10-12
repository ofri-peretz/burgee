/**
 * facade-projection-fidelity R5 — a command alias is a manifest field (`CommandNode.aliases`),
 * never a second command. It dispatches, `--schema` lists it on the command, help prints it the
 * way commander does (`serve|s`), every completion script offers it, and `--mcp` names the tool
 * by the canonical path only, so a tool list does not double.
 *
 * Written before the field existed: on main a native `aliases` was dropped by `helpFields`
 * (not one of `NODE_KEYS`), so `prog s` was an unknown command and no surface carried it.
 */
import { describe, expect, it } from 'vitest';

import { unalias } from './aliases.js';
import { renderCompletion, renderFigSpec } from './completions.js';
import { defineCommand, defineProgram, runCommand } from './index.js';
import { toolsOf } from './mcp.js';

function program(): ReturnType<typeof defineProgram> {
  return defineProgram({
    name: 'web',
    commands: [
      defineCommand({ name: 'serve', aliases: ['s', 'up'], description: 'serve the site', effects: 'read_only', options: { port: { type: 'number', default: 80 } }, run: ({ options }) => `serving on ${String(options.port)}` }),
      defineCommand({
        name: 'remote',
        aliases: ['r'],
        description: 'manage remotes',
        commands: [defineCommand({ name: 'add', aliases: ['a'], description: 'add a remote', effects: 'idempotent', arguments: [{ name: 'url' }], run: ({ positionals }) => ({ added: positionals[0], changed: true }) })],
      }),
    ],
  });
}

describe('R5 — an alias dispatches to its command', () => {
  it('runs serve when s is typed, with its options', async () => {
    const result = await runCommand(program(), ['s', '--port', '8080']);
    expect(result).toEqual({ code: 0, stdout: 'serving on 8080\n', stderr: '' });
  });

  it('resolves an alias at every depth: r a <url> is remote add <url>', async () => {
    const result = await runCommand(program(), ['r', 'a', 'origin', '--json']);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: true, data: { added: 'origin' } });
  });

  it('rewrites only where a subcommand could stand, and nothing after --', () => {
    const manifest = program();
    expect(unalias(manifest, ['r', 'a', 'r'], manifest.rootPath)).toEqual(['remote', 'add', 'r']);
    expect(unalias(manifest, ['--json', 'r', '--', 'a'], manifest.rootPath)).toEqual(['--json', 'remote', '--', 'a']);
  });

  it('a word that is no command and no alias is still an unknown command', async () => {
    const result = await runCommand(program(), ['x']);
    expect(result.code).toBe(2);
  });

  it('help for an alias is the command it names', async () => {
    const byAlias = await runCommand(program(), ['up', '--help']);
    const byName = await runCommand(program(), ['serve', '--help']);
    expect(byAlias.stdout).toBe(byName.stdout);
  });
});

describe('R5 — --schema lists an alias on its command, once', () => {
  it('one entry per command, each with its aliases', async () => {
    const doc = JSON.parse((await runCommand(program(), ['--schema'])).stdout) as { commands: { name: string; aliases?: string[] }[] };
    const names = doc.commands.map((c) => c.name);
    expect(names.filter((n) => n === 'serve')).toHaveLength(1);
    expect(names).not.toContain('s');
    expect(doc.commands.find((c) => c.name === 'serve')?.aliases).toEqual(['s', 'up']);
    expect(doc.commands.find((c) => c.name === 'remote add')?.aliases).toEqual(['a']);
  });

  it('drilling by an alias returns the canonical command', async () => {
    const one = JSON.parse((await runCommand(program(), ['s', '--schema'])).stdout) as { name: string; aliases: string[] };
    expect(one.name).toBe('serve');
    expect(one.aliases).toEqual(['s', 'up']);
  });

  it('a command without aliases carries no aliases key', async () => {
    const plain = defineProgram({ name: 'p', commands: [defineCommand({ name: 'go', effects: 'read_only', run: () => 'went' })] });
    const doc = JSON.parse((await runCommand(plain, ['--schema'])).stdout) as { commands: Record<string, unknown>[] };
    expect(doc.commands[0]).not.toHaveProperty('aliases');
  });
});

describe('R5 — help prints an alias the way commander does', () => {
  it('serve|s|up in the root command list; a listed subcommand carries its own', async () => {
    const help = (await runCommand(program(), ['--help'])).stdout;
    expect(help).toMatch(/serve\|s\|up\s+serve the site/);
    expect(help).toMatch(/remote add\|a <url>\s+add a remote/);
  });

  it('add|a <url> in the group list', async () => {
    const help = (await runCommand(program(), ['remote', '--help'])).stdout;
    expect(help).toContain('add|a <url>');
  });
});

describe('R5 — completions offer an alias, and follow it', () => {
  it('bash offers the alias and reads it as its command', () => {
    const script = renderCompletion(program(), 'bash');
    expect(script).toContain("compgen -W 'serve s up remote r'");
    expect(script).toContain("'r') path='remote' ;;");
    expect(script).toContain("'remote a') path='remote add' ;;");
  });

  it('zsh lists the alias and dispatches it', () => {
    const script = renderCompletion(program(), 'zsh');
    expect(script).toContain("'s[serve the site]'");
    expect(script).toContain('remote|r) _web_remote ;;');
  });

  it('fish completes the alias and treats it as seen', () => {
    const script = renderCompletion(program(), 'fish');
    expect(script).toContain("complete -c web -n '__fish_use_subcommand' -f -a s -d 'serve the site'");
    expect(script).toContain("-n '__fish_seen_subcommand_from remote r; and __fish_seen_subcommand_from add a'");
  });

  it('pwsh offers the alias and maps it to its command', () => {
    const script = renderCompletion(program(), 'pwsh');
    expect(script).toContain("@('s', 'Command', 'serve the site')");
    expect(script).toContain("'r' = 'remote'");
    expect(script).toContain("'remote a' = 'remote add'");
  });

  it('Fig names a subcommand with every spelling', () => {
    const spec = renderFigSpec(program());
    expect(spec.subcommands?.map((s) => s.name)).toEqual([
      ['serve', 's', 'up'],
      ['remote', 'r'],
    ]);
  });

  it('a program without aliases renders the scripts it always did', () => {
    const plain = defineProgram({ name: 'p', commands: [defineCommand({ name: 'go', effects: 'read_only', run: () => 'went' })] });
    expect(renderCompletion(plain, 'pwsh')).not.toContain('$alias');
    expect(renderFigSpec(plain).subcommands?.[0]?.name).toBe('go');
  });

  it('__complete follows an alias to the option completer', async () => {
    const dyn = defineProgram({
      name: 'd',
      commands: [defineCommand({ name: 'checkout', aliases: ['co'], effects: 'read_only', options: { branch: { type: 'string', complete: () => ['main', 'dev'] } }, run: () => 'ok' })],
    });
    expect((await runCommand(dyn, ['__complete', 'co', '--branch', ''])).stdout).toBe('main\ndev\n');
  });
});

describe('R5 — --mcp names the tool by the canonical path only', () => {
  it('one tool per command, however many aliases it has', () => {
    expect(toolsOf(program()).map((t) => t.name)).toEqual(['serve', 'remote_add']);
  });
});
