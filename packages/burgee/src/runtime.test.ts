/**
 * The seam over `process` (Y9). What the file promises is that every read is **live**: the
 * incumbents' suites swap `process.argv`, `process.exit` and `process.env` per test, and a
 * seam that captured them at import would hand such a test the value from before its swap.
 * So each case swaps the thing underneath and asserts the seam answers with the new one —
 * a getter that returned a captured value, or the wrong member, fails here.
 */
import { PassThrough } from 'node:stream';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { host, processRuntime } from './runtime.js';

afterEach(() => vi.restoreAllMocks());

/** `process.exit`, spied and made to return. */
const noExit = (() => undefined) as never;
const listener = (): void => undefined;

/** Replace one property of `process` for the duration of `fn`, and put it back. */
function swapped<K extends keyof NodeJS.Process>(key: K, value: unknown, fn: () => void): void {
  const own = Object.getOwnPropertyDescriptor(process, key);
  Object.defineProperty(process, key, { value, configurable: true, writable: true });
  try {
    fn();
  } finally {
    if (own === undefined) Reflect.deleteProperty(process, key);
    else Object.defineProperty(process, key, own);
  }
}

describe('host reads process at the moment of the read', () => {
  it('platform, execPath, execArgv', () => {
    swapped('platform', 'plan9', () => expect(host.platform).toBe('plan9'));
    swapped('execPath', '/opt/node', () => expect(host.execPath).toBe('/opt/node'));
    swapped('execArgv', ['--inspect'], () => expect(host.execArgv).toEqual(['--inspect']));
  });

  // The façades ask it for `electron`, and until 2026-09-30 only they reached it: on the
  // ubuntu coverage run none of them did, so the getter was the one uncovered function in
  // burgee (functions 99.85%). The seam's own suite asserts it, like every other read.
  it('versions', () => {
    swapped('versions', { node: '24.0.0', electron: '37.0.0' }, () => expect(host.versions['electron']).toBe('37.0.0'));
  });

  it('defaultApp is true only when Electron set it to true', () => {
    expect(host.defaultApp).toBe(false);
    swapped('defaultApp' as keyof NodeJS.Process, true, () => expect(host.defaultApp).toBe(true));
    swapped('defaultApp' as keyof NodeJS.Process, 'yes', () => expect(host.defaultApp).toBe(false));
  });

  it('exitCode reads what was set and sets what it is given', () => {
    const before = process.exitCode;
    try {
      host.exitCode = 3;
      expect(process.exitCode).toBe(3);
      process.exitCode = 5;
      expect(host.exitCode).toBe(5);
    } finally {
      process.exitCode = before;
    }
  });

  it('columns is the stdout’s width, and undefined where there is no process at all', () => {
    const stdout = Object.assign(new PassThrough(), { columns: 132 });
    swapped('stdout', stdout, () => expect(host.columns).toBe(132));
    // A bundle with no `process` global: the upstream guard, so a read is the 80-column
    // fallback's `undefined` and not a ReferenceError.
    const real = globalThis.process;
    let seen: number | undefined = 0;
    Reflect.set(globalThis, 'process', undefined);
    try {
      seen = host.columns;
    } finally {
      Reflect.set(globalThis, 'process', real);
    }
    expect(seen).toBeUndefined();
  });

  it('exit, emitWarning, nextTick and on hand their arguments to process', () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation(noExit);
    host.exit(4);
    expect(exit).toHaveBeenCalledWith(4);

    const warn = vi.spyOn(process, 'emitWarning').mockImplementation(() => undefined);
    host.emitWarning('careful', 'DeprecationWarning');
    expect(warn).toHaveBeenCalledWith('careful', 'DeprecationWarning');

    const tick = vi.spyOn(process, 'nextTick').mockImplementation(() => undefined);
    host.nextTick(listener, 1, 2);
    expect(tick).toHaveBeenCalledWith(listener, 1, 2);

    const on = vi.spyOn(process, 'on').mockImplementation(() => process);
    host.on('beforeExit', listener);
    expect(on).toHaveBeenCalledWith('beforeExit', listener);
  });
});

describe('processRuntime is the real Runtime, read live', () => {
  it('argv drops node and the script; env and cwd are the process’s own', () => {
    const argv = process.argv;
    try {
      process.argv = ['node', 'script.js', 'deploy', '--json'];
      expect(processRuntime.argv).toEqual(['deploy', '--json']);
    } finally {
      process.argv = argv;
    }
    expect(processRuntime.env).toBe(process.env);
    vi.spyOn(process, 'cwd').mockReturnValue('/somewhere/else');
    expect(processRuntime.cwd).toBe('/somewhere/else');
  });

  it('the three streams are whichever are installed now, and isTTY asks each of them', () => {
    const stdin = Object.assign(new PassThrough(), { isTTY: true });
    const stdout = Object.assign(new PassThrough(), { isTTY: false });
    const stderr = Object.assign(new PassThrough(), { isTTY: true });
    swapped('stdin', stdin, () =>
      swapped('stdout', stdout, () =>
        swapped('stderr', stderr, () => {
          expect(processRuntime.stdin).toBe(stdin);
          expect(processRuntime.stdout).toBe(stdout);
          expect(processRuntime.stderr).toBe(stderr);
          expect(processRuntime.isTTY).toEqual({ stdin: true, stdout: false, stderr: true });
        }),
      ),
    );
  });

  it('exit leaves through process.exit with the code', () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation(noExit);
    processRuntime.exit(2);
    expect(exit).toHaveBeenCalledWith(2);
  });
});
