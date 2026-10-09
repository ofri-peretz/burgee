/**
 * The engine's paths no other suite walked: what `execute` prints for a result that is not
 * an object, the two required-input refusals, a deprecated command's one warning, a lazy
 * command declared through `defineProgram`, `sharedOptions`, and every default `run()` takes
 * from the process when a caller injects nothing.
 *
 * Each case names the line it holds. They were written against the source and then each one
 * was run against a copy with that line broken, and went red.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { defineCommand, defineProgram, resolveCommand, run, runCommand, sharedOptions } from './execute.js';
import { ExitCode } from './exit-code.js';
import { lazyRun, Manifest } from './manifest.js';
import { schemaOf } from './schema.js';

const read = { effects: 'read_only' } as const;
/** `process.exit`, spied and made to return, so a run that owns the process leaves the suite running. */
const noExit = (() => undefined) as never;
const rootless = (): Manifest => {
  const m = new Manifest();
  m.rootPath = ['app'];
  m.add({ path: ['app', 'only'], options: {}, effects: 'read_only', run: () => 'ran' });
  return m;
};
const program = (...commands: Parameters<typeof defineProgram>[0]['commands']): Manifest => defineProgram({ name: 'app', commands });

describe('the text surface renders what a handler returns (render)', () => {
  it('prints nothing but the newline for a null result', async () => {
    const r = await runCommand(program(defineCommand({ name: 'none', ...read, run: () => null })), ['none']);
    expect(r).toEqual({ code: ExitCode.OK, stdout: '\n', stderr: '' });
  });
  it('prints an array one element per line, a nested element as compact JSON', async () => {
    const r = await runCommand(program(defineCommand({ name: 'list', ...read, run: () => ['a', { b: 1 }, null] })), ['list']);
    expect(r.stdout).toBe('a\n{"b":1}\n\n');
  });
  it('prints a number or a boolean as itself', async () => {
    const r = await runCommand(program(defineCommand({ name: 'count', ...read, run: () => 42 })), ['count']);
    expect(r.stdout).toBe('42\n');
    const t = await runCommand(program(defineCommand({ name: 'yes', ...read, run: () => true })), ['yes']);
    expect(t.stdout).toBe('true\n');
  });
});

describe('required input is refused before the handler runs', () => {
  const handler = vi.fn(() => 'ran');
  const need = defineCommand({ name: 'need', ...read, options: { token: { type: 'string', required: true } }, arguments: [{ name: 'target', required: true }], run: handler });
  afterEach(() => handler.mockClear());

  it('names a missing required option, and how to pass it (resolveValues)', async () => {
    const r = await runCommand(program(need), ['need', 'here']);
    expect(r).toEqual({ code: ExitCode.USAGE, stdout: '', stderr: 'error: missing required option --token\nhint: pass --token <value>\nusage: app need [options] <target>\noptions:\n  --token <value>  (required)\n' });
    expect(handler).not.toHaveBeenCalled();
  });
  it('does not refuse it when --explain asked where the value would come from', async () => {
    const r = await runCommand(program(need), ['need', 'here', '--explain', 'token']);
    expect(r.code).toBe(ExitCode.OK);
    expect(r.stdout).toMatch(/^token is unset/);
    expect(handler).not.toHaveBeenCalled();
  });
  it('names a missing required argument, and prints what the command takes rather than pointing at --help (requirePositionals)', async () => {
    const r = await runCommand(program(need), ['need', '--token', 't']);
    expect(r).toEqual({ code: ExitCode.USAGE, stdout: '', stderr: 'error: missing required argument "target"\nusage: app need [options] <target>\noptions:\n  --token <value>  (required)\n' });
    expect(handler).not.toHaveBeenCalled();
  });
  it('runs once both are there', async () => {
    const r = await runCommand(program(need), ['need', 'here', '--token', 't']);
    expect(r).toEqual({ code: ExitCode.OK, stdout: 'ran\n', stderr: '' });
  });
});

describe('a deprecated command warns once per process and still runs (M5)', () => {
  it('names the replacement, from a command declared through defineProgram', async () => {
    const p = program(defineCommand({ name: 'old-name', ...read, deprecated: 'new-name', run: () => 'ok' }));
    const first = await runCommand(p, ['old-name']);
    expect(first).toEqual({ code: ExitCode.OK, stdout: 'ok\n', stderr: "warning: 'old-name' is deprecated, use 'new-name'\n" });
    const second = await runCommand(p, ['old-name']);
    expect(second).toEqual({ code: ExitCode.OK, stdout: 'ok\n', stderr: '' });
  });
  it('names the command itself when it is the whole program, and names no replacement for a bare true', async () => {
    const err: string[] = [];
    const out: string[] = [];
    await run({ name: 'solo-deprecated', ...read, deprecated: true, run: () => 'still here' }, { argv: [], stdout: { write: (s) => out.push(s) }, stderr: { write: (s) => err.push(s) }, exit: () => undefined });
    expect(err.join('')).toBe("warning: 'solo-deprecated' is deprecated\n");
    expect(out.join('')).toBe('still here\n');
  });
});

describe('a lazy command imports its module on first dispatch (M2)', () => {
  it('runs the module’s `run` export, declared through defineProgram, and imports it once', async () => {
    const load = vi.fn(async () => ({ run: ({ positionals }: { positionals: string[] }) => `lazy ${positionals.join(' ')}` }));
    const p = program(defineCommand({ name: 'later', ...read, arguments: [{ name: 'word', required: false }], load }));
    expect(p.find(['app', 'later'])?.load).toBe(load);
    expect(load).not.toHaveBeenCalled();
    expect((await runCommand(p, ['later', 'one'])).stdout).toBe('lazy one\n');
    expect((await runCommand(p, ['later', 'two'])).stdout).toBe('lazy two\n');
    expect(load).toHaveBeenCalledTimes(1);
  });
  it('falls back to the default export', async () => {
    const handler = lazyRun(async () => ({ default: () => 'from default' }));
    await expect(Promise.resolve(handler({} as never))).resolves.toBe('from default');
  });
  it('refuses a module that exports neither, in words that say what to export', async () => {
    const handler = lazyRun(async () => ({}));
    await expect(Promise.resolve(handler({} as never))).rejects.toThrow('burgee: a lazy command module must export its handler as run or as the default export');
  });
});

describe('sharedOptions tags every copy with the set it came from (M4)', () => {
  it('copies each spec, adds sharedFrom, and the schema publishes it', () => {
    const verbose = { type: 'boolean', description: 'say more' } as const;
    const shared = sharedOptions('output', { verbose });
    expect(shared).toEqual({ verbose: { type: 'boolean', description: 'say more', sharedFrom: 'output' } });
    expect(verbose).not.toHaveProperty('sharedFrom');
    const schema = schemaOf(program(defineCommand({ name: 'a', ...read, options: shared, run: () => undefined })));
    expect(schema.commands[0]?.inputSchema.properties['verbose']).toMatchObject({ sharedFrom: 'output' });
  });
});

describe('run() takes a manifest, or a single command with no handler', () => {
  it('executes a Manifest as-is', async () => {
    const out: string[] = [];
    await run(program(defineCommand({ name: 'hi', ...read, run: () => 'hello' })), { argv: ['hi'], stdout: { write: (s) => out.push(s) }, exit: () => undefined });
    expect(out.join('')).toBe('hello\n');
  });
  it('prints the help of a single command that declares no run, and exits USAGE', async () => {
    const out: string[] = [];
    const err: string[] = [];
    let code = -1;
    await run({ name: 'bare', description: 'Nothing to run' }, { argv: [], stdout: { write: (s) => out.push(s) }, stderr: { write: (s) => err.push(s) }, exit: (c) => void (code = c) });
    expect(code).toBe(ExitCode.USAGE);
    expect(err.join('')).toMatch(/Nothing to run/);
    expect(out.join('')).toBe('');
  });
});

describe('a manifest with no root node', () => {
  it('resolves an unknown command to null (resolveCommand)', () => {
    expect(resolveCommand(rootless(), ['nope'])).toBeNull();
    expect(resolveCommand(rootless(), ['only'])?.path).toEqual(['app', 'only']);
  });
  it('still reports an unknown command as a usage error', async () => {
    const r = await runCommand(rootless(), ['nope']);
    expect(r).toEqual({ code: ExitCode.USAGE, stdout: '', stderr: 'error: unknown command "nope"\nhint: run --schema for every command and option as JSON, in one call; --explain <option> says where a value came from\nusage: app <command>\ncommands:\n  only\n' });
  });
});

describe('every default run() takes from the process (ioOf, execute)', () => {
  const argv = process.argv;
  afterEach(() => {
    process.argv = argv;
    vi.restoreAllMocks();
  });

  it('reads argv after node and the script, writes to process.stdout, and leaves through process.exit', async () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const exit = vi.spyOn(process, 'exit').mockImplementation(noExit);
    process.argv = ['node', '/nowhere/entry.js', 'hi', 'there'];
    await run(program(defineCommand({ name: 'hi', ...read, arguments: [{ name: 'who' }], run: ({ positionals }) => `hi ${positionals[0] ?? ''}` })));
    expect(write).toHaveBeenCalledWith('hi there\n');
    expect(exit).toHaveBeenCalledWith(ExitCode.OK);
  });
  it('writes a failure to process.stderr', async () => {
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    vi.spyOn(process, 'exit').mockImplementation(noExit);
    await run(program(defineCommand({ name: 'boom', ...read, run: () => undefined })), { argv: ['nope'] });
    expect(write).toHaveBeenCalledWith('error: unknown command "nope"\nhint: run --schema for every command and option as JSON, in one call; --explain <option> says where a value came from\nusage: app <command>\ncommands:\n  boom\n');
  });
  it('slices an injected argv only when it is told it came from node', async () => {
    const m = program(defineCommand({ name: 'hi', ...read, run: () => 'from node' }));
    const out: string[] = [];
    const { execute } = await import('./execute.js');
    await execute(m, { argv: ['node', 'script', 'hi'], from: 'node', stdout: { write: (s) => out.push(s) }, exit: () => undefined });
    expect(out.join('')).toBe('from node\n');
  });
  it('finds the version beside the working directory when there is neither an entry nor a script', async () => {
    // `dirname(cwd)`: the working directory stands where the entry file would, so its own
    // directory is the one searched — the same shape `process.argv[1]` has.
    const dir = mkdtempSync(join(tmpdir(), 'burgee-cwd-'));
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'cwd-owned', version: '9.8.7' }));
    vi.spyOn(process, 'cwd').mockReturnValue(join(dir, 'entry.js'));
    process.argv = ['node'];
    const out: string[] = [];
    try {
      await run(defineProgram({ name: 'app', commands: [] }), { argv: ['--version'], stdout: { write: (s) => out.push(s) }, exit: () => undefined });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    expect(out.join('')).toBe('9.8.7\n');
  });
});
