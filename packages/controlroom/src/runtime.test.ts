/**
 * The one file that names the process, read back: each helper is the live process member it
 * claims to be, and `onceBeforeExit` registers once and takes itself back.
 */
import process from 'node:process';

import { describe, expect, it, vi } from 'vitest';

import { isProcessStdin, onceBeforeExit, processCwd, processEnv, processStreams } from './runtime.js';

describe('runtime — the process, narrowed', () => {
  it('hands out the live streams, environment and working directory', () => {
    expect(processStreams()).toEqual({ stdout: process.stdout, stdin: process.stdin, stderr: process.stderr });
    expect(isProcessStdin(process.stdin)).toBe(true);
    expect(isProcessStdin(process.stdout)).toBe(false);
    expect(processEnv()).toBe(process.env);
    expect(processCwd()).toBe(process.cwd());
  });

  it('onceBeforeExit registers one beforeExit listener, and the function it returns removes it', () => {
    const handler = vi.fn();
    const before = process.listenerCount('beforeExit');
    const take = onceBeforeExit(handler);
    expect(process.listenerCount('beforeExit')).toBe(before + 1);
    take();
    expect(process.listenerCount('beforeExit')).toBe(before);
    expect(handler).not.toHaveBeenCalled();
  });
});
