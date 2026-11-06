/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * `bellpull/node-which` on a Windows host — from any host.
 *
 * node-which reads its world from three places, and on a Mac all three say POSIX: `node:path`
 * (the separator that decides what counts as a slash, the delimiter, `join`), `process` (the
 * platform, `PATH`, `PATHEXT`, the working directory), and the disk. The drop-in's Windows half
 * — the working directory searched first, `PATHEXT` tried in both cases, `.\cmd` keeping its
 * `.\` — is graded by node-which's own suite only on a Windows runner, so here each of the three
 * is replaced with Windows' answer:
 *
 *  - `node:path` is `path.win32`, which is what `node:path` *is* on Windows;
 *  - `process` is the real one with a Windows `platform`, `env` and `cwd()` laid over it, for
 *    the length of the import (which fixes the platform executability is judged by, as `isexe`
 *    does at load) and of each call;
 *  - `statSync` answers from a table for the paths in it, and from the disk otherwise.
 *
 * Nothing in `node-which.ts` is replaced. `Q:` is a drive no runner has, so on a real Windows
 * runner a path that misses the table misses the disk too.
 */
import { describe, expect, it, vi } from 'vitest';

const files = vi.hoisted(() => new Set<string>());

vi.mock('node:path', async (actual) => {
  const real = await actual<typeof import('node:path')>();
  return { ...real.win32, default: real.win32 };
});

vi.mock('node:fs', async (actual) => {
  const real = await actual<typeof import('node:fs')>();
  return {
    ...real,
    statSync: ((path: string, options?: never) =>
      files.has(String(path)) ? { isFile: () => true, isDirectory: () => false, mode: 0o644, uid: 0, gid: 0 } : real.statSync(path, options)) as typeof real.statSync,
  };
});

const CWD = 'Q:\\work';
const A = 'Q:\\a';
const B = 'Q:\\b';

/** The real `process`, saying what a Windows one would. */
function windowsProcess(env: Record<string, string | undefined>): NodeJS.Process {
  return Object.create(process, {
    platform: { value: 'win32' },
    env: { value: env },
    cwd: { value: () => CWD },
  }) as NodeJS.Process;
}

/** Run `fn` with `globalThis.process` replaced, and put the real one back whatever happens. */
async function on<T>(env: Record<string, string | undefined>, fn: () => T | Promise<T>): Promise<T> {
  vi.stubGlobal('process', windowsProcess(env));
  try {
    return await fn();
  } finally {
    vi.unstubAllGlobals();
  }
}

const { default: which } = await on({ PATH: '', PATHEXT: '' }, () => import('./node-which.js'));

for (const file of [
  `${A}\\fmt.COM`,
  `${B}\\tool`,
  `${B}\\tool.EXE`,
  `${B}\\readme.txt`,
  'nopath.EXE',
  `${A}\\plain`,
  'Q:\\c"x"\\q2.EXE',
  '"y"\\d\\q3.EXE',
]) files.add(file);
for (const file of [`${B}\\npm.CMD`, `${A}\\git.EXE`, `${B}\\git.EXE`, `${CWD}\\local.BAT`, `${B}\\whoami.cmd`, '.\\here.EXE', 'sub\\there.EXE', `Q:\\quoted dir\\q.EXE`]) files.add(file);

const env = (over: Record<string, string | undefined> = {}): Record<string, string | undefined> => ({ PATH: `${A};${B}`, PATHEXT: '.EXE;.CMD;.BAT', ...over });

describe('the search, Windows’ way', () => {
  it('walks PATH on `;`, trying each PATHEXT extension', async () => {
    expect(await on(env(), () => which.sync('npm'))).toBe(`${B}\\npm.CMD`);
  });

  it('searches the working directory before PATH, whatever PATH says', async () => {
    expect(await on(env(), () => which.sync('local'))).toBe(`${CWD}\\local.BAT`);
  });

  it('answers the promise form the same way', async () => {
    expect(await on(env(), () => which('npm'))).toBe(`${B}\\npm.CMD`);
  });

  it('returns every hit with `all`, in PATH order', async () => {
    expect(await on(env(), () => which.sync('git', { all: true }))).toEqual([`${A}\\git.EXE`, `${B}\\git.EXE`]);
  });

  it('tries a command that already has a dot as written, first', async () => {
    expect(await on(env(), () => which.sync('whoami.cmd'))).toBe(`${B}\\whoami.cmd`);
  });

  it('unquotes a quoted PATH entry', async () => {
    expect(await on(env({ PATH: '"Q:\\quoted dir"' }), () => which.sync('q'))).toBe('Q:\\quoted dir\\q.EXE');
  });

  it('takes an entry quoted at only one end as written', async () => {
    expect(await on(env({ PATH: 'Q:\\c"x"' }), () => which.sync('q2'))).toBe('Q:\\c"x"\\q2.EXE');
    expect(await on(env({ PATH: '"y"\\d' }), () => which.sync('q3'))).toBe('"y"\\d\\q3.EXE');
  });

  it('reads an unset PATH as one empty entry, which joins to the name as written', async () => {
    expect(await on({ PATHEXT: '.EXE' }, () => which.sync('nopath'))).toBe('nopath.EXE');
  });

  it('does not try the bare name of a command with no dot before PATHEXT says to', async () => {
    // `.EXE;;.CMD` lists the bare name second: `tool` and `tool.EXE` are both there, and
    // `.EXE` comes first.
    expect(await on(env({ PATHEXT: '.EXE;;.CMD' }), () => which.sync('tool'))).toBe(`${B}\\tool.EXE`);
  });

  it('judges a file by PATHEXT, so a name with a dot is not executable for having one', async () => {
    expect(await on(env({ PATHEXT: '.EXE' }), () => which.sync('readme.txt', { nothrow: true }))).toBeNull();
  });
});

describe('a command with a slash of either kind is checked as given', () => {
  it('normalises a `.\\` inside a path, and keeps no prefix for one that does not start with it', async () => {
    expect(await on(env(), () => which.sync('sub\\.\\there'))).toBe('sub\\there.EXE');
  });

  it('keeps a leading `.\\`, as node-which does', async () => {
    expect(await on(env(), () => which.sync('.\\here'))).toBe('.\\here.EXE');
  });

  it('takes a backslash as a slash here, where POSIX would read it as part of a name', async () => {
    expect(await on(env(), () => which.sync('sub\\there'))).toBe('sub\\there.EXE');
  });

  it('never searches PATH for it', async () => {
    expect(await on(env(), () => which.sync('sub\\npm', { nothrow: true }))).toBeNull();
  });
});

describe('where the extensions come from', () => {
  it('prefers the `pathExt` option to PATHEXT', async () => {
    expect(await on(env({ PATHEXT: '.EXE' }), () => which.sync('npm', { pathExt: '.CMD' }))).toBe(`${B}\\npm.CMD`);
    expect(await on(env({ PATHEXT: '.EXE' }), () => which.sync('npm', { nothrow: true }))).toBeNull();
  });

  it('falls back to .EXE and .COM too, not only the two npm ships', async () => {
    expect(await on(env({ PATHEXT: undefined }), () => which.sync('git'))).toBe(`${A}\\git.EXE`);
    expect(await on(env({ PATHEXT: undefined }), () => which.sync('fmt'))).toBe(`${A}\\fmt.COM`);
  });

  it.each([
    ['PATHEXT is unset', { PATHEXT: undefined }],
    ['PATHEXT is empty', { PATHEXT: '' }],
  ])('uses .EXE, .CMD, .BAT and .COM when %s', async (_why, over) => {
    expect(await on(env(over), () => which.sync('npm'))).toBe(`${B}\\npm.CMD`);
  });

  it('does not put the bare name first twice when PATHEXT already starts with an empty entry', async () => {
    // `;.CMD` lists the bare name already — twice, once per case — and a third empty entry in
    // front would make `all` report the file once more.
    expect(await on(env({ PATHEXT: ';.CMD' }), () => which.sync('whoami.cmd', { all: true }))).toEqual([`${B}\\whoami.cmd`, `${B}\\whoami.cmd`]);
  });

  it('splits on the `delimiter` option instead, both the path and the extensions', async () => {
    expect(await on(env(), () => which.sync('npm', { path: `${A}|${B}`, pathExt: '.EXE|.CMD', delimiter: '|' }))).toBe(`${B}\\npm.CMD`);
  });
});

describe('nothing found', () => {
  it('searches only the working directory when there is no PATH at all', async () => {
    expect(await on({}, () => which.sync('local'))).toBe(`${CWD}\\local.BAT`);
    expect(await on({}, () => which.sync('npm', { nothrow: true }))).toBeNull();
  });

  it('throws ENOENT, even when `all` was asked for', async () => {
    await expect(on(env(), () => which.sync('absent', { all: true }))).rejects.toMatchObject({ code: 'ENOENT', message: 'not found: absent' });
  });

  it('returns null with `nothrow`, even when `all` was asked for', async () => {
    expect(await on(env(), () => which.sync('absent', { all: true, nothrow: true }))).toBeNull();
  });
});

describe('judged by the platform it loaded on', () => {
  // "Off Windows" is the real process's platform, so on a Windows host there is nothing to test.
  it.skipIf(process.platform === 'win32')('takes any file as executable when called off Windows after loading on it, as isexe does', () => {
    // The real process says POSIX, so the search is POSIX's: no PATHEXT, no extensions — and
    // the judge is the Windows one chosen at load, with no list to judge against.
    expect(which.sync('plain', { path: A })).toBe(`${A}\\plain`);
  });
});
