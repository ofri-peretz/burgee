/**
 * `seniority/dotenv/cli` — dotenv 18.0.5's `dotenv run`, driven with a process and a spawn of
 * the test's own so every branch is reachable without signalling the test runner. dotenv's
 * suite runs the real thing end to end (`test-cli.js`, `test-cli-signals.js`); the oracle grades
 * that, and this file holds each decision the port makes.
 */
import cp, { type ChildProcess } from 'node:child_process';
// eslint-disable-next-line modernization/prefer-event-target -- the fake stands in for a `ChildProcess` and a `process`, which are both EventEmitters; `dotenv run` calls their `on` and `removeListener`.
import { EventEmitter } from 'node:events';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os, { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HELP, parseRunArgs, run } from './dotenv-cli.js';
import { type CliProcess } from './runtime.js';

const dir = mkdtempSync(join(tmpdir(), 'seniority-dotenv-cli-'));
writeFileSync(join(dir, 'a.env'), 'A=from-a\nSHARED=a\n');
writeFileSync(join(dir, 'b.env'), 'B=from-b\nSHARED=b\n');

/** A process the test owns: listeners kept so a signal can be raised, every exit and kill recorded. */
function fakeProcess(over: Partial<CliProcess> = {}): CliProcess & { emit: (signal: string) => void; listeners: Map<string, Set<() => void>> } {
  const listeners = new Map<string, Set<() => void>>();
  return {
    env: {},
    cwd: () => dir,
    platform: 'linux',
    pid: 4242,
    stdin: {},
    exit: vi.fn(),
    kill: vi.fn(),
    on: vi.fn((event: string, listener: () => void) => {
      const set = listeners.get(event) ?? new Set();
      set.add(listener);
      listeners.set(event, set);
    }),
    removeListener: vi.fn((event: string, listener: () => void) => listeners.get(event)?.delete(listener)),
    emit: (signal: string) => {
      for (const listener of listeners.get(signal) ?? []) listener();
    },
    listeners,
    ...over,
  };
}

/** A child that has started and not finished. */
function fakeChild(over: Partial<{ pid: number | undefined; exitCode: number | null; signalCode: string | null }> = {}): ChildProcess {
  return Object.assign(new EventEmitter(), { pid: 777, exitCode: null, signalCode: null, ...over }) as unknown as ChildProcess;
}

const printed = (method: 'log' | 'error'): string[] => (console[method] as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) => String(c[0]));

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('parseRunArgs', () => {
  it.each([
    [['node', 'x'], { paths: [], pathSet: false, command: ['node', 'x'] }],
    [['--', 'node', '-q'], { paths: [], pathSet: false, command: ['node', '-q'] }],
    [['-q', '--debug', '--override', '--fast', 'node'], { paths: [], pathSet: false, quiet: true, debug: true, override: true, fast: true, command: ['node'] }],
    [['--quiet', 'node', '--debug'], { paths: [], pathSet: false, quiet: true, command: ['node', '--debug'] }],
    [['-f', 'a.env,b.env', 'node'], { paths: ['a.env', 'b.env'], pathSet: true, command: ['node'] }],
    [['--file=a.env', '-f=b.env', '--file', ' , c.env, , d.env, ', 'node'], { paths: ['a.env', 'b.env', 'c.env', 'd.env'], pathSet: true, command: ['node'] }],
    [[], { paths: [], pathSet: false, command: [] }],
    [['--'], { paths: [], pathSet: false, command: [] }],
    [['--help', 'node'], { help: true }],
    [['-q', '-h'], { help: true }],
    [['--unknown', 'node'], { error: 'unknown option: --unknown' }],
    [['-f'], { error: '-f requires a path' }],
    [['--file', '--'], { error: '--file requires a path' }],
    [['--file='], { error: '--file requires a path' }],
    [['-f='], { error: '-f requires a path' }],
    [['-f', ', ,'], { error: '-f requires a path' }],
    [['--file', '  '], { error: '--file requires a path' }],
  ] as const)('%j', (args, expected) => {
    expect(parseRunArgs(args)).toEqual(expected);
  });
});

describe('what it prints before starting anything', () => {
  it.each([['--help'], ['-h']])('%s prints the help and succeeds', (flag) => {
    const proc = fakeProcess();
    run([flag], proc);
    expect(printed('log')).toEqual([HELP]);
    expect(proc.exitCode).toBeUndefined();
  });

  it('prints the help and succeeds for `run --help`', () => {
    const proc = fakeProcess();
    run(['run', '-q', '--help', 'node'], proc);
    expect(printed('log')).toEqual([HELP]);
    expect(proc.exitCode).toBeUndefined();
  });

  it.each([[[]], [['other']], [['run']], [['run', '--']], [['run', '--quiet']]])('fails with the help for %j', (argv) => {
    const proc = fakeProcess();
    const spawn = vi.fn();
    run(argv, proc, { spawn });
    expect(printed('log')).toEqual([HELP]);
    expect(printed('error')).toEqual([]);
    expect(proc.exitCode).toBe(1);
    expect(spawn).not.toHaveBeenCalled();
  });

  it('names the bad flag, then prints the help, and fails', () => {
    const proc = fakeProcess();
    run(['run', '--unknown', 'node'], proc);
    expect(printed('error')).toEqual(['dotenv: unknown option: --unknown']);
    expect(printed('log')).toEqual([HELP]);
    expect(proc.exitCode).toBe(1);
  });

  it('begins with dotenv’s own usage line', () => {
    expect(HELP.split('\n')[0]).toBe('Usage: dotenv run [--help] [-q|--quiet] [--debug] [--override] [--fast] [-f|--file <paths>] [--] <command> [args...]');
  });

  it('uses the process it runs in when handed none', () => {
    run(['--help']);
    expect(printed('log')).toEqual([HELP]);
  });
});

describe('loading the files', () => {
  it('loads every file in order into the environment, the first winning, and starts the command', () => {
    const proc = fakeProcess({ env: { HELD: 'yes' } });
    const spawn = vi.fn(() => fakeChild());
    run(['run', '-f', 'a.env,b.env', '--', 'node', '-e', 'x'], proc, { spawn });
    expect(proc.env).toEqual({ HELD: 'yes', A: 'from-a', B: 'from-b', SHARED: 'a' });
    expect(printed('error')).toEqual(['◇ injected env (3) from a.env, b.env']);
    expect(spawn).toHaveBeenCalledWith('node', ['-e', 'x'], { stdio: 'inherit', detached: true });
  });

  it('lets the later file win under --override, and replaces what the environment held', () => {
    const proc = fakeProcess({ env: { SHARED: 'held' } });
    run(['run', '-q', '--override', '-f', 'a.env', '-f', 'b.env', 'node'], proc, { spawn: () => fakeChild() });
    expect(proc.env['SHARED']).toBe('b');
    expect(printed('error')).toEqual([]);
  });

  it('takes DOTENV_* defaults from the environment, and the flags over them', () => {
    const quiet = fakeProcess({ env: { DOTENV_PATH: 'b.env', DOTENV_QUIET: 'true', DOTENV_OVERRIDE: '1', SHARED: 'held' } });
    run(['run', 'node'], quiet, { spawn: () => fakeChild() });
    expect(quiet.env['SHARED']).toBe('b');
    expect(printed('error')).toEqual([]);

    const loud = fakeProcess({ env: { DOTENV_CONFIG_PATH: 'missing.env', DOTENV_QUIET: 'true' } });
    run(['run', '-f', 'a.env', 'node'], loud, { spawn: () => fakeChild() });
    expect(loud.env['A']).toBe('from-a');
  });

  it('reads with the encoding and parser the environment names', () => {
    writeFileSync(join(dir, 'latin.env'), Buffer.from('L=café\n', 'latin1'));
    const proc = fakeProcess({ env: { DOTENV_ENCODING: 'latin1', DOTENV_FAST: 'true', DOTENV_DEBUG: 'false' } });
    run(['run', '-q', '-f', 'latin.env', 'node'], proc, { spawn: () => fakeChild() });
    expect(proc.env['L']).toBe('café');
  });

  it('expands a leading ~ to the home directory', () => {
    vi.spyOn(os, 'homedir').mockReturnValue(dir);
    const proc = fakeProcess();
    run(['run', '-q', '-f', '~/a.env', 'node'], proc, { spawn: () => fakeChild() });
    expect(proc.env['A']).toBe('from-a');
  });

  it('is content with no default .env, and says it injected nothing from nowhere', () => {
    const proc = fakeProcess({ cwd: () => tmpdir() });
    const spawn = vi.fn(() => fakeChild());
    run(['run', 'node'], proc, { spawn });
    expect(printed('error')).toEqual(['◇ injected env (0)']);
    expect(spawn).toHaveBeenCalled();
  });

  it('refuses to start when a named file is missing, and says why under --debug', () => {
    const proc = fakeProcess();
    const spawn = vi.fn();
    run(['run', '--debug', '-f', 'missing.env', 'node'], proc, { spawn });
    expect(printed('log')[0]).toMatch(/^┆ failed to load missing\.env ENOENT/);
    expect(printed('error')[0]).toMatch(/^dotenv: ENOENT/);
    expect(proc.exitCode).toBe(1);
    expect(spawn).not.toHaveBeenCalled();
  });

  it('refuses to start when the default .env exists but cannot be read', () => {
    // A directory named `.env`: unreadable as a file with EISDIR on every platform. (A cwd under
    // a file gave ENOTDIR on POSIX and ENOENT on Windows, where a missing default is fine.)
    const cwd = join(dir, 'unreadable');
    mkdirSync(join(cwd, '.env'), { recursive: true });
    const proc = fakeProcess({ cwd: () => cwd });
    const spawn = vi.fn();
    run(['run', 'node'], proc, { spawn });
    expect(printed('error')[0]).toMatch(/^dotenv: EISDIR/);
    expect(proc.exitCode).toBe(1);
    expect(spawn).not.toHaveBeenCalled();
  });
});

describe('the child', () => {
  it('runs in its own process group unless interactive, and never on Windows', () => {
    for (const [over, detached] of [
      [{}, true],
      [{ stdin: { isTTY: true } }, false],
      [{ platform: 'win32' }, false],
    ] as const) {
      const spawn = vi.fn(() => fakeChild());
      run(['run', '-q', '-f', 'a.env', 'node'], fakeProcess(over), { spawn });
      expect(spawn).toHaveBeenCalledWith('node', [], { stdio: 'inherit', detached });
    }
  });

  it('leaves with the child’s exit code and stops listening for signals', () => {
    const proc = fakeProcess();
    const child = fakeChild();
    run(['run', '-q', '-f', 'a.env', 'node'], proc, { spawn: () => child });
    expect([...proc.listeners.keys()]).toEqual(['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGQUIT']);
    child.emit('exit', 42, null);
    expect(proc.exit).toHaveBeenCalledWith(42);
    expect([...proc.listeners.values()].every((set) => set.size === 0)).toBe(true);
  });

  it('re-raises the child’s signal on itself, keeping the loop alive until it lands', () => {
    const keepAlive = vi.spyOn(globalThis, 'setInterval').mockReturnValue(0 as unknown as NodeJS.Timeout);
    const proc = fakeProcess();
    const child = fakeChild();
    run(['run', '-q', '-f', 'a.env', 'node'], proc, { spawn: () => child });
    child.emit('exit', null, 'SIGTERM');
    expect(keepAlive).toHaveBeenCalledWith(expect.any(Function), 1000);
    expect((keepAlive.mock.calls[0]?.[0] as () => unknown)()).toBeUndefined();
    expect(proc.kill).toHaveBeenCalledWith(4242, 'SIGTERM');
    expect(proc.exit).not.toHaveBeenCalled();
  });

  it('reports a child that could not start, and fails', () => {
    const proc = fakeProcess();
    const child = fakeChild();
    run(['run', '-q', '-f', 'a.env', 'nope'], proc, { spawn: () => child });
    child.emit('error', new Error('spawn nope ENOENT'));
    expect(printed('error')).toEqual(['dotenv: spawn nope ENOENT']);
    expect(proc.exitCode).toBe(1);
    expect([...proc.listeners.values()].every((set) => set.size === 0)).toBe(true);
  });

  it('starts a real command through `spawnCommand` when no spawn is handed in, and leaves with its code', async () => {
    const proc = fakeProcess({ env: { ...process.env } });
    const exited = new Promise<void>((done) => {
      proc.exit = vi.fn(() => done()) as unknown as CliProcess['exit'];
    });
    run(['run', '-q', '-f', 'a.env', '--', process.execPath, '-e', 'process.exit(3)'], proc);
    await exited;
    expect(proc.exit).toHaveBeenCalledWith(3);
  });
});

/** `dotenv run` started on a fake child, with a `spawnSync` spy for Windows' `taskkill`. */
function started(over: Partial<CliProcess> = {}, child = fakeChild()): { proc: ReturnType<typeof fakeProcess>; child: ChildProcess; spawnSync: ReturnType<typeof vi.fn> } {
  const proc = fakeProcess(over);
  const spawnSync = vi.fn();
  run(['run', '-q', '-f', 'a.env', 'node'], proc, { spawn: () => child, spawnSync });
  return { proc, child, spawnSync };
}

describe('signal forwarding', () => {
  it.each(['SIGTERM', 'SIGHUP', 'SIGQUIT', 'SIGINT'])('forwards %s to the child’s whole group', (signal) => {
    const { proc } = started();
    proc.emit(signal);
    expect(proc.kill).toHaveBeenCalledWith(-777, signal);
  });

  it('forwards to the child alone when it shares the terminal’s group', () => {
    const { proc } = started({ stdin: { isTTY: true } });
    proc.emit('SIGTERM');
    expect(proc.kill).toHaveBeenCalledWith(777, 'SIGTERM');
  });

  it('escalates repeated interrupts: SIGINT, then SIGTERM, then SIGKILL', () => {
    const { proc } = started();
    proc.emit('SIGINT');
    proc.emit('SIGINT');
    proc.emit('SIGINT');
    proc.emit('SIGINT');
    expect(vi.mocked(proc.kill).mock.calls).toEqual([
      [-777, 'SIGINT'],
      [-777, 'SIGTERM'],
      [-777, 'SIGKILL'],
      [-777, 'SIGKILL'],
    ]);
  });

  it('does not forward the first Ctrl-C of an interactive run, which the terminal already delivered', () => {
    const { proc } = started({ stdin: { isTTY: true } });
    proc.emit('SIGINT');
    expect(proc.kill).not.toHaveBeenCalled();
    proc.emit('SIGINT');
    expect(proc.kill).toHaveBeenCalledWith(777, 'SIGTERM');
  });

  it('takes the tree down with taskkill on Windows, even for an interactive first Ctrl-C', () => {
    const { proc, spawnSync } = started({ platform: 'win32', stdin: { isTTY: true } });
    proc.emit('SIGINT');
    expect(spawnSync).toHaveBeenCalledWith('taskkill', ['/pid', '777', '/T', '/F'], { stdio: 'ignore' });
    expect(proc.kill).not.toHaveBeenCalled();
  });

  it('uses child_process.spawnSync for taskkill when none is handed in', () => {
    const spawnSync = vi.spyOn(cp, 'spawnSync').mockReturnValue({} as ReturnType<typeof cp.spawnSync>);
    const proc = fakeProcess({ platform: 'win32' });
    run(['run', '-q', '-f', 'a.env', 'node'], proc, { spawn: () => fakeChild() });
    proc.emit('SIGTERM');
    expect(spawnSync).toHaveBeenCalledWith('taskkill', ['/pid', '777', '/T', '/F'], { stdio: 'ignore' });
  });

  it.each([
    ['has no pid', { pid: undefined }],
    ['has exited', { exitCode: 0 }],
    ['was signalled', { signalCode: 'SIGTERM' }],
  ] as const)('sends nothing to a child that %s', (_, over) => {
    const { proc, spawnSync } = started({}, fakeChild(over));
    proc.emit('SIGTERM');
    expect(proc.kill).not.toHaveBeenCalled();
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it('ignores a child that is already gone, and rethrows anything else', () => {
    const gone = started();
    vi.mocked(gone.proc.kill).mockImplementation(() => {
      throw Object.assign(new Error('gone'), { code: 'ESRCH' });
    });
    expect(() => gone.proc.emit('SIGTERM')).not.toThrow();

    const denied = started();
    vi.mocked(denied.proc.kill).mockImplementation(() => {
      throw Object.assign(new Error('denied'), { code: 'EPERM' });
    });
    expect(() => denied.proc.emit('SIGTERM')).toThrow('denied');
  });
});
