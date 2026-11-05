/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * The drop-in's own surface — the part `compat-oracle` cannot grade from a Mac.
 *
 * `cross-spawn`'s vendored suite scores this target 68 / 68 on macOS, and it is worth being
 * precise about what that number covers: on POSIX `cross-spawn` is a pass-through, so the
 * suite exercises normalisation, cloning and the ENOENT surface, and **never reaches
 * `escape.ts` or the `cmd.exe` branch of `spawn-args.ts` at all**. Measured: replacing
 * `escapeArgument` with `arg => '"' + arg + '"'` — the injection bug in its purest form —
 * leaves the row at 68 / 68.
 *
 * So the Windows branch is tested here, by calling `parse()` with a `win32` runtime, and by
 * `escape.test.ts` for the escaping itself. The compat row proves POSIX parity; these prove
 * the rest.
 */
import childProcess, { type ChildProcess, type SpawnSyncReturns } from 'node:child_process';
// eslint-disable-next-line modernization/prefer-event-target -- the fake stands in for a ChildProcess, which is an EventEmitter
import { EventEmitter } from 'node:events';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { discard } from './__fixtures__/scratch-dir.js';
import crossSpawn, { spawn, sync } from './cross-spawn.js';
import { type Runtime } from './runtime.js';
import { parse } from './spawn-args.js';

let dir: string;
let echo: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'bellpull-xspawn-'));
  echo = join(dir, 'echo-argv.mjs');
  writeFileSync(echo, 'process.stdout.write(JSON.stringify(process.argv.slice(2)));\n');
  chmodSync(echo, 0o755);
});

afterAll(() => discard(dir));

describe('the default export is callable, with the named exports on it', () => {
  it('is a function — `require("cross-spawn")(…)` must keep working', () => {
    expect(typeof crossSpawn).toBe('function');
    // Read off the default, deliberately: the suite's `require('cross-spawn').sync(...)` is
    // exactly this access, so that it resolves is the contract and not an import style.
    expect(typeof (crossSpawn as unknown as { sync: unknown }).sync).toBe('function');
    expect(typeof spawn).toBe('function');
    expect(typeof crossSpawn._parse).toBe('function');
    expect(crossSpawn._enoent).toHaveProperty('hookChildProcess');
  });

  it('spawns and returns a ChildProcess', async () => {
    const child = crossSpawn(process.execPath, [echo, 'a', 'b']);
    const out = await new Promise<string>((resolve) => {
      let text = '';
      child.stdout?.on('data', (c: Buffer) => (text += c.toString()));
      child.on('close', () => resolve(text));
    });
    expect(JSON.parse(out)).toEqual(['a', 'b']);
  });

  it('sync returns a spawnSync result rather than throwing on a non-zero exit', () => {
    const result = sync(process.execPath, ['-e', 'process.exit(7)']);
    expect(result.status).toBe(7);
    expect(result.error).toBeUndefined();
  });

  it('leaves `error` absent on success, as spawnSync does, rather than present and undefined', () => {
    expect('error' in sync(process.execPath, ['-e', ''])).toBe(false);
  });

  it('puts a missing command on result.error, the way spawnSync reports one', () => {
    const result = sync('somecommandthatwillneverexist', ['foo']);
    // POSIX reports it from the kernel; Windows reconstructs it. Either way it is a value.
    expect(result.error).toBeDefined();
    expect((result.error as NodeJS.ErrnoException).code).toBe('ENOENT');
  });
});

describe('normalisation — the cases the suite grades four times each', () => {
  const posix: Runtime = { platform: 'linux', env: {}, cwd: '/w' };

  it('accepts options in the args position', () => {
    const parsed = parse('node', { cwd: '/x' }, undefined, posix);
    expect(parsed.args).toEqual([]);
    expect(parsed.options.cwd).toBe('/x');
  });

  it('accepts an explicit null for args', () => {
    const parsed = parse('node', null, { cwd: '/x' }, posix);
    expect(parsed.args).toEqual([]);
    expect(parsed.options.cwd).toBe('/x');
  });

  it('reads no args at all as none, and keeps the options given after them', () => {
    const parsed = parse('node', undefined, { cwd: '/x' }, posix);
    expect(parsed.args).toEqual([]);
    expect(parsed.options.cwd).toBe('/x');
  });

  it('stringifies non-string arguments', () => {
    expect(parse('node', [1234, true], undefined, posix).args).toEqual(['1234', 'true']);
  });

  it('mutates neither the caller’s args nor their options', () => {
    const args = ['a'];
    const options = {};
    const parsed = parse('node', args, options, posix);
    parsed.args.push('injected');
    parsed.options['cwd'] = '/elsewhere';
    expect(args).toEqual(['a']);
    expect(options).toEqual({});
  });

  it('keeps the caller’s original command and args for the error message', () => {
    const parsed = parse('npm', ['run', 'build'], undefined, posix);
    expect(parsed.original).toEqual({ command: 'npm', args: ['run', 'build'] });
  });
});

/**
 * The branch macOS never runs. `platform` is an argument, so it can be run here.
 */
const win = (over: Partial<Runtime> = {}): Runtime => ({ platform: 'win32', env: { PATHEXT: '.COM;.EXE;.BAT;.CMD', COMSPEC: 'C:\\Windows\\system32\\cmd.exe' }, cwd: '/w', ...over });

describe('the Windows branch, driven from a Mac', () => {
  it('routes an unresolvable command through cmd.exe rather than a shell option', () => {
    const parsed = parse('npm', ['run', 'build'], undefined, win());
    expect(parsed.command).toBe('C:\\Windows\\system32\\cmd.exe');
    expect(parsed.args.slice(0, 3)).toEqual(['/d', '/s', '/c']);
    // The one flag that makes this safe: Node must not re-quote what is already escaped.
    expect(parsed.options.windowsVerbatimArguments).toBe(true);
    // And `shell` is never set — that is the whole distinction.
    expect(parsed.options.shell).toBeUndefined();
  });

  it('escapes every argument on the way into that command line', () => {
    const parsed = parse('npm', ['a & calc'], undefined, win());
    const line = parsed.args[3] as string;
    expect(line).toContain('^&');
    // The raw separator must not appear unescaped anywhere in the line.
    expect(/(?<!\^)&/.test(line)).toBe(false);
  });

  it('normalises a posix path in the command, which would otherwise be an ENOENT', () => {
    expect(parse('foo/bar', [], undefined, win()).args[3]).toContain('foo\\bar');
  });

  it('leaves POSIX entirely alone — the pass-through is the drop-in', () => {
    const parsed = parse('npm', ['a & calc'], undefined, { platform: 'linux', env: {}, cwd: '/w' });
    expect(parsed.command).toBe('npm');
    expect(parsed.args).toEqual(['a & calc']);
    expect(parsed.options.windowsVerbatimArguments).toBeUndefined();
  });

  /*
   * `_parse` is the façade's own, and it reads the platform the way `cross-spawn`'s does: off
   * the ambient `process`, at the call. Swapping the global for the length of one call is what
   * `cross-spawn`'s suite does by reassigning `process.platform`, and it lets the Windows
   * answer be asked for here.
   */
  it('`_parse` reads the ambient process, so a caller passes no runtime', () => {
    const windows = { platform: 'win32', env: { PATH: '', PATHEXT: '.EXE', COMSPEC: 'X:\\cmd.exe' }, cwd: () => 'X:\\nowhere' };
    vi.stubGlobal('process', windows);
    let parsed;
    try {
      parsed = crossSpawn._parse('npm', ['a & calc']);
    } finally {
      vi.unstubAllGlobals();
    }
    expect(parsed.command).toBe('X:\\cmd.exe');
    expect(parsed.args).toEqual(['/d', '/s', '/c', '"npm ^"a^ ^&^ calc^""']);
    // And the same call with the real process back is this machine's answer.
    expect(crossSpawn.parse('npm', ['x'])).toEqual(parse('npm', ['x'], undefined, { platform: process.platform, env: process.env, cwd: process.cwd(), uid: process.getuid?.(), gid: process.getgid?.() }));
  });

  it.each([true, 'pwsh'])('does not touch anything when the caller asked for a shell themselves (shell: %j)', (shell) => {
    const parsed = parse('echo', ['%RANDOM%'], { shell }, win());
    expect(parsed.command).toBe('echo');
    expect(parsed.args).toEqual(['%RANDOM%']);
    expect(parsed.options.windowsVerbatimArguments).toBeUndefined();
  });
});

const fakeWindows = { platform: 'win32', env: { PATH: '', PATHEXT: '.EXE', COMSPEC: 'X:\\cmd.exe' }, cwd: () => 'X:\\nowhere' };

/** What `spawnSync` returns for a child that exited with `status`. */
const exited = (status: number): SpawnSyncReturns<string> => ({ pid: 0, output: [], stdout: '', stderr: '', status, signal: null });

/** `fn`, called with the ambient process saying Windows. */
function onWindows<T>(fn: () => T): T {
  vi.stubGlobal('process', fakeWindows);
  try {
    return fn();
  } finally {
    vi.unstubAllGlobals();
  }
}

/**
 * The façade's own Windows half: `cmd.exe` exiting 1 for a command nothing resolved is put back
 * as the ENOENT Node would have raised. `child_process` is read off its default export at the
 * call — the commander note above — so a spy on that object is what the façade calls, and the
 * ambient `process` is swapped for a Windows one for the length of the call.
 */
describe('the façade on Windows, with the child faked', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sync reports exit 1 with nothing resolved as ENOENT, named for spawnSync and the caller’s command', () => {
    vi.spyOn(childProcess, 'spawnSync').mockReturnValue(exited(1));
    const result = onWindows(() => sync('npm', ['x']));
    expect(result.error).toMatchObject({ code: 'ENOENT', errno: 'ENOENT', syscall: 'spawnSync npm', path: 'npm', spawnargs: ['x'] });
  });

  it('sync leaves any other exit alone, with no `error` on it', () => {
    vi.spyOn(childProcess, 'spawnSync').mockReturnValue(exited(2));
    expect('error' in onWindows(() => sync('npm', ['x']))).toBe(false);
  });

  it('spawn turns the same exit into an `error` event in place of the `exit`', () => {
    const fake = new EventEmitter();
    vi.spyOn(childProcess, 'spawn').mockReturnValue(fake as ChildProcess);
    const child = onWindows(() => spawn('npm', ['x']));
    const seen: unknown[] = [];
    child.on('error', (error) => seen.push(error));
    child.on('exit', (code) => seen.push(code));
    child.emit('exit', 1, null);
    expect(seen).toEqual([expect.objectContaining({ code: 'ENOENT', syscall: 'spawn npm', path: 'npm' })]);
  });
});
