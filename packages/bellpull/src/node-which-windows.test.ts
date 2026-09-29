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
});

describe('a command with a slash of either kind is checked as given', () => {
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
