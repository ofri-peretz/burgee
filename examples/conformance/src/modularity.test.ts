/**
 * cli-modularity M1–M6 on the 30-command demo. The lock (M2): `--help` and `--schema`
 * import zero handler modules, and running one lazy command imports exactly one — proven
 * red first against a manifest that loaded every handler at registration. Then groups
 * in help and schema (M1), plugin attribution (M3), shared options with `sharedFrom` (M4),
 * the deprecation warning once (M5), and `resolveCommand` / `runCommand` public (M6).
 */
import { resolveCommand, runCommand } from 'burgee';
import { loads, program, reset } from 'demo-cli-large';
import { beforeEach, describe, expect, it } from 'vitest';

interface Schema {
  commands: { name: string; group?: string; lazy?: true; plugin?: string; deprecated?: boolean | string; inputSchema: { properties: Record<string, { sharedFrom?: string }> } }[];
}

beforeEach(() => reset());

describe('M2 · the manifest is complete before any handler module loads', () => {
  it('serves --help and --schema without importing a single lazy handler', async () => {
    const help = await runCommand(program, ['--help']);
    expect(help.code).toBe(0);
    expect(help.stdout).toContain('inspect');
    const schema = await runCommand(program, ['--schema']);
    expect(schema.code).toBe(0);
    expect((JSON.parse(schema.stdout) as Schema).commands.map((c) => c.name)).toContain('purge');
    expect(loads()).toEqual([]);
  });

  it('imports exactly one module to run one lazy command, and none again on the second run', async () => {
    const first = await runCommand(program, ['sync', 'db', '--json']);
    expect(first.code).toBe(0);
    expect(JSON.parse(first.stdout)).toMatchObject({ ok: true, data: { command: 'sync', target: 'db' } });
    expect(loads()).toEqual(['sync']);
    await runCommand(program, ['sync', 'db']);
    expect(loads()).toEqual(['sync']);
  });

  it('marks lazy commands in the schema, so a reader knows the schema was complete without them', async () => {
    const { stdout } = await runCommand(program, ['--schema']);
    const lazy = (JSON.parse(stdout) as Schema).commands.filter((c) => c.lazy === true).map((c) => c.name);
    expect(lazy).toEqual(['inspect', 'sync', 'purge']);
  });
});

describe('M1 · groups, M3 · attribution, M4 · shared options', () => {
  it('lists the thirty commands under their five headings in help', async () => {
    const { stdout } = await runCommand(program, ['--help']);
    for (const heading of ['Repository:', 'Packages:', 'Environments:', 'Reports:', 'Maintenance:']) expect(stdout).toContain(heading);
    expect(stdout.indexOf('Repository:')).toBeLessThan(stdout.indexOf('Maintenance:'));
  });

  it('attributes the plugin commands and carries every group in the schema', async () => {
    const { stdout } = await runCommand(program, ['--schema']);
    const commands = (JSON.parse(stdout) as Schema).commands;
    expect(commands.filter((c) => c.plugin === 'audit').map((c) => c.name)).toEqual(['audit', 'audit-fix']);
    expect(commands.find((c) => c.name === 'inspect')?.group).toBe('Reports:');
    expect(commands).toHaveLength(33);
  });

  it('copies shared options per command and says where each came from', async () => {
    const { stdout } = await runCommand(program, ['--schema']);
    const inspect = (JSON.parse(stdout) as Schema).commands.find((c) => c.name === 'inspect');
    expect(inspect?.inputSchema.properties['verbose']?.sharedFrom).toBe('common');
    expect(inspect?.inputSchema.properties['dryRun']?.sharedFrom).toBe('common');
    const repo = (JSON.parse(stdout) as Schema).commands.find((c) => c.name === 'repo-1');
    expect(repo?.inputSchema.properties['verbose']?.sharedFrom).toBe('common');
    expect(repo?.inputSchema.properties['limit']?.sharedFrom).toBeUndefined();
    const run = await runCommand(program, ['repo-1', '--verbose', '--json']);
    expect(JSON.parse(run.stdout)).toMatchObject({ ok: true, data: { command: 'repo-1', verbose: true, limit: 10 } });
  });
});

describe('M5 · deprecation, M6 · resolveCommand and runCommand', () => {
  it('runs a deprecated command, warns once on stderr naming the replacement, exit OK', async () => {
    const first = await runCommand(program, ['clean']);
    expect(first.code).toBe(0);
    expect(first.stderr).toBe("warning: 'clean' is deprecated, use 'purge'\n");
    const second = await runCommand(program, ['clean']);
    expect(second.stderr).toBe('');
    const { stdout } = await runCommand(program, ['--schema']);
    expect((JSON.parse(stdout) as Schema).commands.find((c) => c.name === 'clean')?.deprecated).toBe('purge');
    const help = await runCommand(program, ['--help']);
    expect(help.stdout).toContain('(deprecated: use purge)');
  });

  it('resolves argv to a command node, or null for none', () => {
    expect(resolveCommand(program, ['sync', 'db', '--verbose'])?.path).toEqual(['large', 'sync']);
    expect(resolveCommand(program, ['audit-fix'])?.plugin).toBe('audit');
    expect(resolveCommand(program, ['--help'])?.path).toEqual(['large']);
    expect(resolveCommand(program, ['nope'])?.run).toBeUndefined();
  });

  it('runCommand reports the E1 code and both streams', async () => {
    const usage = await runCommand(program, ['purge']);
    expect(usage.code).toBe(2);
    expect(usage.stderr).toContain('target');
    expect(loads()).toEqual([]);
  });
});
