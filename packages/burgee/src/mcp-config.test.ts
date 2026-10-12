/**
 * mcp-current R6 — `--mcp --print-config` prints the `mcpServers` block that starts this program
 * as an MCP server, read from `process.argv` and the owning package.json's `bin`: the bin's name
 * when the program was started as one, and `node <script>` when it was not.
 *
 * Red before it was built: `--print-config` was not read, the run served `--mcp` on a closed
 * stdin, and printed nothing (`Unexpected end of JSON input`).
 */
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { defineCommand, defineProgram, execute } from './execute.js';
import { Manifest } from './manifest.js';
import { clientConfig } from './mcp-config.js';
import { host } from './runtime.js';

const program = defineProgram({ name: 'tool', commands: [defineCommand({ name: 'hi', effects: 'read_only', run: () => 'hi' })] });

const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'burgee-mcp-config-')));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

/** A package directory holding `bin.js`, with this `package.json`. */
function packageWith(name: string, manifest: Record<string, unknown>): string {
  const dir = join(scratch, name);
  mkdirSync(join(dir, 'node_modules', '.bin'), { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest));
  writeFileSync(join(dir, 'bin.js'), '');
  writeFileSync(join(dir, 'other.js'), '');
  return dir;
}

/** What `--mcp --print-config` prints, for a process started as `node <script>`. */
async function printed(entry: string, script: string, argv: string[] = ['--mcp', '--print-config']): Promise<string> {
  const original = process.argv;
  process.argv = [original[0] ?? 'node', script];
  const out: string[] = [];
  try {
    const stdin = new PassThrough();
    stdin.end();
    await execute(program, { argv, entry, stdin, env: {}, stdout: { write: (s: string) => out.push(s) }, stderr: { write: () => true }, exit: () => undefined });
  } finally {
    process.argv = original;
  }
  return out.join('');
}

describe('--mcp --print-config (R6)', () => {
  // POSIX unless a case says otherwise: on Windows a bin is started through `cmd /c`, below.
  beforeEach(() => vi.spyOn(host, 'platform', 'get').mockReturnValue('linux'));
  afterEach(() => vi.restoreAllMocks());

  it('names the bin the program was started as, through the symlink npm installs it behind', async () => {
    const dir = packageWith('named', { name: 'tool-pkg', bin: { 'tool-cli': './bin.js', other: './other.js' } });
    symlinkSync(join(dir, 'bin.js'), join(dir, 'node_modules', '.bin', 'tool-cli'));
    const text = await printed(join(dir, 'bin.js'), join(dir, 'node_modules', '.bin', 'tool-cli'));
    expect(text).toBe(`${JSON.stringify({ mcpServers: { tool: { command: 'tool-cli', args: ['--mcp'] } } }, null, 2)}\n`);
  });

  it('starts the bin through cmd /c on Windows, where npm installs it as a .cmd shim a client cannot start directly', async () => {
    const dir = packageWith('windows', { name: 'tool-pkg', bin: { 'tool-cli': './bin.js' } });
    vi.spyOn(host, 'platform', 'get').mockReturnValue('win32');
    expect(JSON.parse(await printed(join(dir, 'bin.js'), join(dir, 'bin.js')))).toEqual({ mcpServers: { tool: { command: 'cmd', args: ['/c', 'tool-cli', '--mcp'] } } });
  });

  it('reads a bin given as one string as the package’s own name, without its scope', async () => {
    const dir = packageWith('single', { name: '@acme/tool-x', bin: './bin.js' });
    expect(JSON.parse(await printed(join(dir, 'bin.js'), join(dir, 'bin.js')))).toEqual({ mcpServers: { tool: { command: 'tool-x', args: ['--mcp'] } } });
  });

  it('starts it with node and its own path when it was not started as a bin', async () => {
    const dir = packageWith('unlisted', { name: 'tool-pkg', bin: { 'tool-cli': './bin.js' } });
    expect(JSON.parse(await printed(join(dir, 'other.js'), join(dir, 'other.js')))).toEqual({ mcpServers: { tool: { command: 'node', args: [join(dir, 'other.js'), '--mcp'] } } });
  });

  it('starts it with node when the package declares no bin, or a bin that is not built', async () => {
    const none = packageWith('nobin', { name: 'tool-pkg' });
    expect(JSON.parse(await printed(join(none, 'bin.js'), join(none, 'bin.js')))).toEqual({ mcpServers: { tool: { command: 'node', args: [join(none, 'bin.js'), '--mcp'] } } });
    const unbuilt = packageWith('unbuilt', { name: 'tool-pkg', bin: { gone: './dist/gone.js' } });
    expect(JSON.parse(await printed(join(unbuilt, 'bin.js'), join(unbuilt, 'bin.js')))).toEqual({ mcpServers: { tool: { command: 'node', args: [join(unbuilt, 'bin.js'), '--mcp'] } } });
  });

  it('starts it with node when no package.json owns it', async () => {
    writeFileSync(join(scratch, 'loose.js'), '');
    expect(JSON.parse(await printed(join(scratch, 'loose.js'), join(scratch, 'loose.js')))).toEqual({ mcpServers: { tool: { command: 'node', args: [join(scratch, 'loose.js'), '--mcp'] } } });
  });

  it('keys a program with no name “burgee”, as the handshake names it', () => {
    expect(Object.keys((JSON.parse(clientConfig(new Manifest(), undefined)) as { mcpServers: object }).mcpServers)).toEqual(['burgee']);
  });

  it('is read only before `--`, and `--mcp` without it still serves', async () => {
    const dir = packageWith('served', { name: 'tool-pkg' });
    expect(await printed(join(dir, 'bin.js'), join(dir, 'bin.js'), ['--mcp', '--', '--print-config'])).toBe('');
  });
});
