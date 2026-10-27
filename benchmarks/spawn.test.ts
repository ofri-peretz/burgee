/**
 * `spawn.ts` — the benchmarks' one door to a subprocess, through `bellpull/cross-spawn`.
 *
 * The same cases as `packages/compat-oracle/src/spawn.test.ts`, against this workspace's copy:
 * every case spawns a real child, and each `execFile` case pins a field an axis reads off the
 * result or the thrown error at the value `execFileSync` gives it. The npm case runs on every
 * cell of `compat.yml`, Windows included, with no shell.
 */
import { writeSync } from 'node:fs';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { type ExecError, execFile, spawn, spawnSync } from './spawn.js';

/** A child that prints `out` and `err` and exits `code`. */
const child = (code: number, err = 'err'): string[] => ['-e', `process.stdout.write('out'); process.stderr.write(${JSON.stringify(err)}); process.exit(${String(code)})`];

/** What `execFile` threw, or a failure when it threw nothing. */
function thrown(run: () => unknown): ExecError {
  try {
    run();
  } catch (error) {
    return error as ExecError;
  }
  throw new Error('expected a throw');
}

// The echo goes to file descriptor 2 (`STDERR_FD`); recorded here, not written.
vi.mock('node:fs', async (importOriginal) => ({ ...(await importOriginal<typeof import('node:fs')>()), writeSync: vi.fn() }));

afterEach(() => {
  vi.mocked(writeSync).mockClear();
});

describe('spawnSync, through bellpull', () => {
  it('returns the result of a child that failed, and does not throw', () => {
    const r = spawnSync(process.execPath, child(3), { encoding: 'utf8' });
    expect(r).toMatchObject({ status: 3, stdout: 'out', stderr: 'err' });
    expect(r.error).toBeUndefined();
  });

  it('hands back bytes when no encoding was asked for', () => {
    const r = spawnSync(process.execPath, child(0));
    expect(Buffer.isBuffer(r.stdout)).toBe(true);
    expect(r.stdout.toString()).toBe('out');
  });
});

describe('spawn, through bellpull', () => {
  it('returns the child process, which exits with its own code', async () => {
    const proc = spawn(process.execPath, child(4), { stdio: 'ignore' });
    const code = await new Promise<number | null>((done) => proc.on('close', done));
    expect(code).toBe(4);
  });
});

describe('execFile, as execFileSync behaves', () => {
  it('returns stdout', () => {
    expect(execFile(process.execPath, child(0), { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })).toBe('out');
  });

  it('returns bytes with no options at all', () => {
    const out = execFile(process.execPath, child(0, ''));
    expect(Buffer.isBuffer(out)).toBe(true);
    expect(out.toString()).toBe('out');
  });

  it('throws on a non-zero exit, with the command, stderr and the whole result on the error', () => {
    const args = child(3);
    const error = thrown(() => execFile(process.execPath, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
    expect(error.message).toBe(`Command failed: ${[process.execPath, ...args].join(' ')}\nerr`);
    expect(error).toMatchObject({ status: 3, stdout: 'out', stderr: 'err', signal: null, output: [null, 'out', 'err'] });
    expect(error.pid).toBeGreaterThan(0);
    expect(error, 'only a failure to start carries `error`').not.toHaveProperty('error');
  });

  it('names only the command when the child printed nothing to stderr', () => {
    const args = child(5, '');
    const error = thrown(() => execFile(process.execPath, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
    expect(error.message).toBe(`Command failed: ${[process.execPath, ...args].join(' ')}`);
    expect(error.status).toBe(5);
  });

  it('names only the command when stderr was not captured', () => {
    const args = child(6);
    const error = thrown(() => execFile(process.execPath, args, { stdio: 'ignore' }));
    expect(error.message).toBe(`Command failed: ${[process.execPath, ...args].join(' ')}`);
    expect(error).toMatchObject({ status: 6, stderr: null });
  });

  it('echoes the child’s stderr to ours when the caller left stdio alone, as execFileSync does', () => {
    expect(execFile(process.execPath, child(0), { encoding: 'utf8' })).toBe('out');
    expect(vi.mocked(writeSync)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(writeSync)).toHaveBeenCalledWith(2, Buffer.from('err'));
  });

  it('echoes nothing when there was nothing on stderr', () => {
    execFile(process.execPath, child(0, ''), { encoding: 'utf8' });
    expect(vi.mocked(writeSync)).not.toHaveBeenCalled();
  });

  it('echoes nothing when the caller chose stdio', () => {
    execFile(process.execPath, child(0), { encoding: 'utf8', stdio: 'pipe' });
    expect(vi.mocked(writeSync)).not.toHaveBeenCalled();
  });

  it('throws the spawn’s own error when nothing could start, with the result on it', () => {
    const error = thrown(() => execFile('benchmarks-no-such-program', ['x'], { encoding: 'utf8', stdio: 'pipe' }));
    expect(error).toMatchObject({ code: 'ENOENT' });
    expect(error.message).not.toMatch(/^Command failed/);
    expect(error).toHaveProperty('status');
    expect(error).toHaveProperty('error', error);
  });

  it('runs npm by name with no shell on every platform (#1180)', () => {
    expect(execFile('npm', ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()).toMatch(/^\d+\.\d+\.\d+/);
  });
});
