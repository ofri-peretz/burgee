/**
 * Which spawn an executable subcommand gets (commander-front-end-diet R1).
 *
 * commander's own `child_process.spawn` on every path commander 15 takes, synchronously, so
 * `runningCommand` is set by the time `parse()` returns, as commander's suite expects. On
 * Windows, an executable that is not launched through node (a `.cmd`, a `.bat`, a non-node
 * shebang) is the case commander cannot run. Only that case loads `bellpull/cross-spawn`, and
 * it spawns once the import settles. That is what keeps bellpull off the start-up path of every
 * program that never takes this branch.
 */
import childProcess from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Command } from '../commander.js';

const crossSpawn = vi.hoisted(() => vi.fn());
vi.mock('bellpull/cross-spawn', () => ({ default: { spawn: crossSpawn }, spawn: crossSpawn }));

/** A child that never closes, and reads as killed so no signal listener lands on this process. */
const child = (): childProcess.ChildProcess => Object.assign(new EventEmitter(), { killed: true, exitCode: null }) as unknown as childProcess.ChildProcess;

const platform = Object.getOwnPropertyDescriptor(process, 'platform') as PropertyDescriptor;
const on = (value: string): void => void Object.defineProperty(process, 'platform', { ...platform, value });

let dir: string;
let spawn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'burgee-spawn-'));
  spawn = vi.spyOn(childProcess, 'spawn').mockImplementation(child);
  crossSpawn.mockReset().mockImplementation(child);
});

afterEach(() => {
  Object.defineProperty(process, 'platform', platform);
  vi.restoreAllMocks();
});

function program(file: string): Command {
  const p = new Command('tool').exitOverride().executableDir(dir);
  p.command('sub', 'a subcommand', { executableFile: file });
  return p;
}

describe('commander façade: the subcommand spawn', () => {
  it('spawns a Windows .cmd through bellpull, after the import settles', async () => {
    on('win32');
    writeFileSync(join(dir, 'tool-sub.cmd'), '@echo off\r\n');
    const p = program('tool-sub.cmd');
    p.parse(['sub', 'a'], { from: 'user' });
    expect(p.runningCommand).toBeUndefined();
    await vi.waitFor(() => expect(crossSpawn).toHaveBeenCalledTimes(1));
    expect(crossSpawn).toHaveBeenCalledWith(join(dir, 'tool-sub.cmd'), ['a'], { stdio: 'inherit' });
    expect(p.runningCommand).toBe(crossSpawn.mock.results[0]?.value);
    expect(spawn).not.toHaveBeenCalled();
  });

  it('refuses a missing Windows executable before loading anything', () => {
    on('win32');
    expect(() => program('tool-gone.cmd').parse(['sub'], { from: 'user' })).toThrow(/does not exist/);
    expect(crossSpawn).not.toHaveBeenCalled();
  });

  it('spawns a Windows .js through node, synchronously, as commander does', () => {
    on('win32');
    writeFileSync(join(dir, 'tool-sub.js'), '');
    const p = program('tool-sub.js');
    p.parse(['sub'], { from: 'user' });
    // Behind the runner's own `execArgv`, which the spawn carries forward as commander does.
    expect(spawn).toHaveBeenCalledWith(process.execPath, [...process.execArgv, join(dir, 'tool-sub.js')], { stdio: 'inherit' });
    expect(p.runningCommand).toBe(spawn.mock.results[0]?.value);
    expect(crossSpawn).not.toHaveBeenCalled();
  });

  it('spawns a POSIX executable directly, synchronously, as commander does', () => {
    on('linux');
    writeFileSync(join(dir, 'tool-sub'), '#!/bin/sh\n');
    const p = program('tool-sub');
    p.parse(['sub', 'b'], { from: 'user' });
    expect(spawn).toHaveBeenCalledWith(join(dir, 'tool-sub'), ['b'], { stdio: 'inherit' });
    expect(p.runningCommand).toBe(spawn.mock.results[0]?.value);
    expect(crossSpawn).not.toHaveBeenCalled();
  });
});
