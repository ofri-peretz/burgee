/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * The Windows spawn path with something to resolve — from any machine.
 *
 * `cross-spawn.test.ts` drives `parse()` with a `win32` runtime, and every command it asks
 * about resolves to nothing, so every case takes the same road: no file, straight to `cmd.exe`.
 * The roads that start from a *resolved* file — a `.cmd` shim that needs its arguments escaped
 * twice, an `.exe` that must not get a shell, a shebang script that gets its interpreter put in
 * front — were reached by nothing on this machine, because resolution stats the file and there
 * is no `Q:\bellpull\tools\npm.CMD` here to stat.
 *
 * The runtime was already an argument; this file makes the filesystem one too. `node:fs` is
 * replaced by the real module with a few paths laid over it: `statSync`, and the three calls
 * `readShebang` makes, answer from {@link vfs} for a path in it and from the disk for anything
 * else. So resolution walks a Windows `PATH` of Windows paths, finds the files this file says
 * are there, and everything downstream of the stat is the shipped code, unmodified.
 *
 * `Q:` rather than `C:`: on a Windows runner a path that misses the table goes to the real
 * disk, and a drive nobody has is a miss there too.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it, vi } from 'vitest';

import { isExecutable } from './executable.js';
import { run } from './run.js';
import { type Runtime } from './runtime.js';
import { parse } from './spawn-args.js';
import { NotFoundError } from './which.js';

/** A file or directory the virtual layer answers for. Mode and ownership matter off Windows only. */
interface Entry {
  kind: 'file' | 'dir';
  mode?: number;
  uid?: number;
  gid?: number;
  content?: string;
}

const vfs = vi.hoisted(() => new Map<string, Entry>());

vi.mock('node:fs', async (actual) => {
  const real = await actual<typeof import('node:fs')>();
  const open = new Map<number, string>();
  let next = 1_000_000;
  return {
    ...real,
    statSync: ((path: string, options?: never) => {
      const entry = vfs.get(String(path));
      if (entry === undefined) return real.statSync(path, options);
      return { isFile: () => entry.kind === 'file', isDirectory: () => entry.kind === 'dir', mode: entry.mode ?? 0o644, uid: entry.uid ?? 0, gid: entry.gid ?? 0 };
    }) as typeof real.statSync,
    openSync: ((path: string, ...rest: unknown[]) => {
      const entry = vfs.get(String(path));
      if (entry === undefined) return (real.openSync as (...args: unknown[]) => number)(path, ...rest);
      next += 1;
      open.set(next, entry.content ?? '');
      return next;
    }) as typeof real.openSync,
    // `readShebang`'s own call shape — offset, length and position, positionally.
    readSync: ((fd: number, buffer: Buffer, ...at: [number, number, number]) => {
      const content = open.get(fd);
      if (content === undefined) return real.readSync(fd, buffer, ...at);
      const [offset, length, position] = at;
      return Buffer.from(content).copy(buffer, offset, position, position + length);
    }) as typeof real.readSync,
    closeSync: ((fd: number) => {
      if (!open.delete(fd)) real.closeSync(fd);
    }) as typeof real.closeSync,
  };
});

const TOOLS = 'Q:\\bellpull\\tools';
const BIN = 'Q:\\bellpull\\project\\node_modules\\.bin';
const COMSPEC = 'C:\\Windows\\system32\\cmd.exe';

vfs.set(`${TOOLS}\\npm.CMD`, { kind: 'file' });
vfs.set(`${TOOLS}\\git.EXE`, { kind: 'file' });
vfs.set(`${TOOLS}\\node.EXE`, { kind: 'file' });
vfs.set(`${BIN}\\eslint.CMD`, { kind: 'file' });
// Extensionless, so `PATHEXT` passes it over and only the second attempt finds it.
vfs.set(`${TOOLS}\\serve`, { kind: 'file', content: '#!/usr/bin/env node\nrequire("./server");\n' });
// Its interpreter is nowhere on this `PATH`.
vfs.set(`${TOOLS}\\legacy`, { kind: 'file', content: '#!/bin/sh\necho legacy\n' });
// A trailing space after the interpreter, which an editor leaves and nobody sees.
vfs.set(`${TOOLS}\\spaced`, { kind: 'file', content: '#!/usr/local/bin/node \nrequire("./server");\n' });

/** A Windows runtime with {@link TOOLS} and {@link BIN} on `PATH`. */
const win = (env: Record<string, string | undefined> = {}): Runtime => ({
  platform: 'win32',
  env: { PATH: `${BIN};${TOOLS}`, PATHEXT: '.EXE;.CMD', COMSPEC, ...env },
  cwd: 'Q:\\bellpull\\work',
});

describe('isExecutable on Windows: the extension decides', () => {
  const runtime = win();
  vfs.set('Q:\\v\\tool.cmd', { kind: 'file' });
  vfs.set('Q:\\v\\folder.EXE', { kind: 'dir' });

  it('is executable when the extension is in PATHEXT, compared without case', () => {
    expect(isExecutable('Q:\\v\\tool.cmd', runtime, ['.EXE', '.CMD'])).toBe(true);
  });

  it('is not when the extension is not listed', () => {
    expect(isExecutable('Q:\\v\\tool.cmd', runtime, ['.EXE', '.COM'])).toBe(false);
  });

  it('is, for any file at all, when PATHEXT lists nothing — there is nothing to hold it to', () => {
    expect(isExecutable('Q:\\v\\tool.cmd', runtime, [])).toBe(true);
  });

  it('takes an empty entry to mean the name as written', () => {
    expect(isExecutable('Q:\\v\\tool.cmd', runtime, ['.EXE', ''])).toBe(true);
  });

  it('is never a directory, whatever it is called', () => {
    expect(isExecutable('Q:\\v\\folder.EXE', runtime, ['.EXE'])).toBe(false);
  });

  it('is never a file that is not there', () => {
    expect(isExecutable('Q:\\v\\absent.EXE', runtime, ['.EXE'])).toBe(false);
  });
});

/** A virtual file with this mode and ownership, at a path that names them. */
function at(mode: number, uid: number, gid: number, kind: Entry['kind'] = 'file'): string {
  const path = `/virtual/${kind}-${mode.toString(8)}-${String(uid)}-${String(gid)}`;
  vfs.set(path, { kind, mode, uid, gid });
  return path;
}

/**
 * `isexe`'s POSIX rule, bit by bit. Real files cannot carry these cases on every runner — a
 * file owned by somebody else, or root's view of it, needs a second user — so the stat is the
 * virtual layer's, and the caller is whoever the runtime says.
 */
describe('isExecutable off Windows: the mode decides, read against this caller', () => {
  const me: Runtime = { platform: 'linux', env: {}, cwd: '/', uid: 501, gid: 20 };
  const root: Runtime = { ...me, uid: 0, gid: 0 };
  const nobody: Runtime = { platform: 'linux', env: {}, cwd: '/' };

  it('anybody may run a file with the other bit set', () => {
    expect(isExecutable(at(0o755, 0, 0), me, [])).toBe(true);
  });

  it('the group bit counts for the group that owns the file, and only for it', () => {
    expect(isExecutable(at(0o750, 0, 20), me, [])).toBe(true);
    expect(isExecutable(at(0o750, 0, 30), me, [])).toBe(false);
  });

  it('the group that owns the file gets nothing without the group bit', () => {
    expect(isExecutable(at(0o704, 0, 20), me, [])).toBe(false);
  });

  it('the owner gets nothing without the owner bit', () => {
    expect(isExecutable(at(0o070, 501, 30), me, [])).toBe(false);
  });

  it('the owner bit counts for the owner, and only for the owner', () => {
    expect(isExecutable(at(0o700, 501, 0), me, [])).toBe(true);
    expect(isExecutable(at(0o700, 502, 0), me, [])).toBe(false);
  });

  it('a caller whose uid and gid are unknown is held to the other bit alone', () => {
    expect(isExecutable(at(0o770, 501, 20), nobody, [])).toBe(false);
  });

  it('root runs anything with an owner or group bit, which is why its PATH answer differs', () => {
    expect(isExecutable(at(0o100, 501, 20), root, [])).toBe(true);
    expect(isExecutable(at(0o010, 501, 20), root, [])).toBe(true);
  });

  it('root does not run a file with no execute bit at all', () => {
    expect(isExecutable(at(0o644, 501, 20), root, [])).toBe(false);
  });

  it('a directory is not executable, whatever its mode', () => {
    expect(isExecutable(at(0o777, 501, 20, 'dir'), me, [])).toBe(false);
  });
});

describe('parse on Windows, when the command resolves', () => {
  it('a .cmd found on PATH goes through cmd.exe, each argument escaped once', () => {
    const parsed = parse('npm', ['run', 'a&b'], undefined, win());
    expect(parsed.file).toBe(`${TOOLS}\\npm.CMD`);
    expect(parsed.command).toBe(COMSPEC);
    // The line names the command as the caller wrote it — `run.ts` says why, at length.
    expect(parsed.args).toEqual(['/d', '/s', '/c', '"npm ^"run^" ^"a^&b^""']);
    expect(parsed.options.windowsVerbatimArguments).toBe(true);
  });

  it('a node_modules/.bin shim is escaped twice, because it hands its arguments to cmd.exe again', () => {
    const parsed = parse('eslint', ['a&b'], undefined, win());
    expect(parsed.file).toBe(`${BIN}\\eslint.CMD`);
    expect(parsed.args[3]).toBe('"eslint ^^^"a^^^&b^^^""');
  });

  it('an .exe is spawned as itself, with no shell and nothing escaped — the process tree is graded', () => {
    const parsed = parse('git', ['log', 'a&b'], undefined, win());
    expect(parsed.file).toBe(`${TOOLS}\\git.EXE`);
    expect(parsed.command).toBe('git');
    expect(parsed.args).toEqual(['log', 'a&b']);
    expect(parsed.options.windowsVerbatimArguments).toBeUndefined();
  });

  it('`forceShell` sends even an .exe through cmd.exe — cross-spawn’s own test hook', () => {
    const parsed = parse('git', ['log'], { forceShell: true }, win());
    expect(parsed.command).toBe(COMSPEC);
    expect(parsed.args).toEqual(['/d', '/s', '/c', '"git ^"log^""']);
  });

  it('a shebang script runs under its interpreter, which is resolved in turn', () => {
    const parsed = parse('serve', ['--port', '8080'], undefined, win());
    expect(parsed.command).toBe('node');
    expect(parsed.args).toEqual([`${TOOLS}\\serve`, '--port', '8080']);
    // The interpreter resolved to an .exe, so this is a direct spawn and not a cmd.exe line.
    expect(parsed.file).toBe(`${TOOLS}\\node.EXE`);
    expect(parsed.options.windowsVerbatimArguments).toBeUndefined();
  });

  it('a trailing space on the #! line does not become part of the interpreter’s name', () => {
    // It did: `node ` resolved nowhere, so a script that runs everywhere else went to cmd.exe
    // as `node^ `, a command that does not exist.
    const parsed = parse('spaced', [], undefined, win());
    expect(parsed.command).toBe('node');
    expect(parsed.file).toBe(`${TOOLS}\\node.EXE`);
  });

  it('a shebang whose interpreter is nowhere goes to cmd.exe, which will say so itself', () => {
    const parsed = parse('legacy', [], undefined, win());
    expect(parsed.file).toBeUndefined();
    expect(parsed.command).toBe(COMSPEC);
    expect(parsed.args[3]).toBe(`"sh ^"${TOOLS}\\legacy^""`);
  });

  it('resolves against the spawn’s own env when it has one, since that is the PATH the child gets', () => {
    const bare = win({ PATH: '' });
    expect(parse('npm', [], { env: { PATH: TOOLS, PATHEXT: '.CMD' } }, bare).file).toBe(`${TOOLS}\\npm.CMD`);
    expect(parse('npm', [], undefined, bare).file).toBeUndefined();
  });

  it('takes `comspec` before `COMSPEC`, and `cmd.exe` when neither is set', () => {
    expect(parse('npm', [], undefined, win({ comspec: 'D:\\lower\\cmd.exe' })).command).toBe('D:\\lower\\cmd.exe');
    expect(parse('npm', [], undefined, win({ COMSPEC: undefined })).command).toBe('cmd.exe');
  });
});

/**
 * `run()` on a Windows runtime, with a real child. `COMSPEC` is this `node`, so the `cmd.exe`
 * line is handed to a program that exists on every runner: node reads `/d` as a script path
 * and exits 1, which is all either case needs.
 */
describe('run on Windows: what ran, and what bellpull says ran', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'bellpull-windows-'));
  afterAll(() => rmSync(cwd, { recursive: true, force: true }));

  /** The real environment, so a child on a real Windows runner still has `SystemRoot`. */
  const inherited: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(process.env)) if (!['PATH', 'COMSPEC', 'PATHEXT'].includes(key.toUpperCase())) inherited[key] = value;
  const runtime = (env: Record<string, string | undefined> = {}): Runtime => ({ ...win({ ...inherited, COMSPEC: process.execPath, ...env }), cwd });

  it('spawns cmd.exe for a .cmd, and still reports the file it resolved as the executable', async () => {
    const result = await run('npm', ['--version'], { runtime: runtime() });
    // The program that ran is COMSPEC — here node, failing on `/d` — and not `npm.CMD`,
    // which would have been an ENOENT from this machine's kernel.
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Cannot find module');
    expect(result.executable).toEqual({ path: `${TOOLS}\\npm.CMD`, from: TOOLS });
    expect(result.command).toBe('npm');
  }, 60_000);

  it('turns cmd.exe’s exit 1 into NotFoundError when the child’s PATH cannot find what bellpull’s did', async () => {
    // `runtime` finds npm; the `env` the child is given does not. `parse` resolves against the
    // child's, so nothing is resolved there, and `cmd.exe` exiting 1 is a missing command.
    await expect(run('npm', [], { runtime: runtime(), env: { ...inherited, PATH: '' } })).rejects.toThrow(NotFoundError);
  }, 60_000);
});
