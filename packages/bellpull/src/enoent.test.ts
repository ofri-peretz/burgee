/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * The Windows ENOENT reconstruction — `enoent.ts`, driven from any machine.
 *
 * `cross-spawn`'s suite grades this on Windows only, and on POSIX both functions return
 * nothing, so no run on this machine ever reached the half that matters. The platform is an
 * argument and the child is structural (`EmitterLike`: an `emit`), so a `win32` runtime and an
 * `emit` that records what it was handed are enough to ask the question: does `cmd.exe`'s
 * exit 1 for a command it could not find come back as the error Node itself would have raised?
 */
import { describe, expect, it } from 'vitest';

import { type EmitterLike, hookChildProcess, notFoundError, verifyENOENT } from './enoent.js';
import { type Runtime } from './runtime.js';
import { type Parsed } from './spawn-args.js';

const windows: Runtime = { platform: 'win32', env: {}, cwd: 'C:\\work' };
const cygwin: Runtime = { platform: 'linux', env: { OSTYPE: 'cygwin' }, cwd: '/w' };
const linux: Runtime = { platform: 'linux', env: {}, cwd: '/w' };

/** What `parse` produced: a `cmd.exe` line for `npm run build`, resolved to `file` or not. */
const parsed = (file: string | undefined): Parsed => ({
  command: 'C:\\Windows\\system32\\cmd.exe',
  args: ['/d', '/s', '/c', '"npm ^"run^" ^"build^""'],
  options: { windowsVerbatimArguments: true },
  file,
  original: { command: 'npm', args: ['run', 'build'] },
});

describe('notFoundError — the error Node would have raised, rebuilt', () => {
  it('names the command and arguments the caller wrote, never the cmd.exe line', () => {
    const error = notFoundError({ command: 'npm', args: ['run', 'build'] }, 'spawnSync');
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('spawnSync npm ENOENT');
    expect({ ...error }).toEqual({ code: 'ENOENT', errno: 'ENOENT', syscall: 'spawnSync npm', path: 'npm', spawnargs: ['run', 'build'] });
  });
});

describe('verifyENOENT — exit 1 with nothing resolved', () => {
  it('is an ENOENT on Windows, for the syscall that was asked about', () => {
    expect(verifyENOENT(1, parsed(undefined), windows, 'spawn')).toMatchObject({ code: 'ENOENT', syscall: 'spawn npm', path: 'npm' });
  });

  it('is an ENOENT under cygwin and msys too, which announce themselves in OSTYPE', () => {
    expect(verifyENOENT(1, parsed(undefined), cygwin, 'spawnSync')?.syscall).toBe('spawnSync npm');
  });

  it('is a result, not an error, when the command resolved — a program that ran and exited 1', () => {
    expect(verifyENOENT(1, parsed('C:\\tools\\npm.CMD'), windows, 'spawn')).toBeUndefined();
  });

  it('is a result for any exit but 1, resolved or not', () => {
    expect(verifyENOENT(0, parsed(undefined), windows, 'spawn')).toBeUndefined();
    expect(verifyENOENT(2, parsed(undefined), windows, 'spawn')).toBeUndefined();
    expect(verifyENOENT(null, parsed(undefined), windows, 'spawn')).toBeUndefined();
  });

  it('is never an error off Windows, where the kernel raises a real ENOENT', () => {
    expect(verifyENOENT(1, parsed(undefined), linux, 'spawn')).toBeUndefined();
  });
});

/**
 * A child whose `emit` is what every listener the caller registered would hear — so whatever
 * reaches it is what the caller saw, in order.
 */
function child(): EmitterLike & { heard: string[] } {
  const heard: string[] = [];
  return {
    heard,
    emit: (event, ...args) => {
      const [first] = args;
      heard.push(event === 'error' ? `error ${String((first as NodeJS.ErrnoException).code)} ${(first as Error).message}` : `${event} ${args.map(String).join(' ')}`);
      return true;
    },
  };
}

describe('hookChildProcess — the decision in front of every listener', () => {
  it('turns exit 1 with nothing resolved into an error, and the caller’s exit handler never runs', () => {
    const c = child();
    hookChildProcess(c, parsed(undefined), windows);
    expect(c.emit('exit', 1, null)).toBe(true);
    expect(c.heard).toEqual(['error ENOENT spawn npm ENOENT']);
  });

  it('passes a real exit through untouched', () => {
    const c = child();
    hookChildProcess(c, parsed('C:\\tools\\npm.CMD'), windows);
    c.emit('exit', 1, null);
    c.emit('exit', 0, null);
    expect(c.heard).toEqual(['exit 1 null', 'exit 0 null']);
  });

  it('passes every other event through, with its arguments', () => {
    const c = child();
    hookChildProcess(c, parsed(undefined), windows);
    c.emit('close', 1, null);
    c.emit('data', 'a', 'b');
    expect(c.heard).toEqual(['close 1 null', 'data a b']);
  });

  it('installs nothing off Windows, so a POSIX child keeps Node’s own emit', () => {
    const c = child();
    const before = c.emit;
    hookChildProcess(c, parsed(undefined), linux);
    expect(c.emit).toBe(before);
    c.emit('exit', 1, null);
    expect(c.heard).toEqual(['exit 1 null']);
  });
});
