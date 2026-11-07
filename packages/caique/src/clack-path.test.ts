/**
 * `entriesUnder` — what the `path` prompt lists — over an in-memory tree, under both path
 * flavours, so the Windows behaviour is held on every platform and not only on a Windows
 * runner. `join` writes `\` under `win32` whatever separator was typed; an entry has to be
 * compared with the typed text in that same separator, or a Windows user who types `/`
 * (or closes a directory with `\`) is offered nothing and the prompt can never be answered.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, posix, win32 } from 'node:path';

import { describe, expect, it } from 'vitest';

import { scratchDirs } from './__fixtures__/scratch-dir.js';
import { entriesUnder, type PathHost } from './clack-path.js';

const scratch = scratchDirs();

/** A host over `tree`: each key is a directory, each listed name that is not itself a key is a file. */
function hostOf(flavour: typeof posix, tree: Record<string, string[]>): PathHost {
  const directories = new Map(Object.entries(tree).map(([at, names]) => [flavour.normalize(at), names]));
  const files = new Set([...directories].flatMap(([at, names]) => names.map((name) => flavour.join(at, name))).filter((at) => !directories.has(at)));
  const keyOf = (at: string): string => {
    const normal = flavour.normalize(at);
    return flavour.dirname(normal) === normal ? normal : normal.replace(/[/\\]$/u, '');
  };
  const exists = (at: string): boolean => directories.has(keyOf(at)) || files.has(keyOf(at));
  return {
    dirname: flavour.dirname,
    join: flavour.join,
    normalize: flavour.normalize,
    sep: flavour.sep,
    exists,
    isDirectory: (at) => {
      if (!exists(at)) throw new Error(`ENOENT: ${at}`);
      return directories.has(keyOf(at));
    },
    readdir: (at) => {
      const names = directories.get(keyOf(at));
      if (names === undefined) throw new Error(`ENOTDIR: ${at}`);
      return names;
    },
  };
}

const valuesOf = (typed: string, directoriesOnly: boolean, host: PathHost): string[] => entriesUnder(typed, directoriesOnly, host).map((option) => option.value);

describe('entriesUnder, on Windows', () => {
  const host = hostOf(win32, {
    'C:\\': ['work'],
    'C:\\work': ['src', 'srcmap.txt', 'test'],
    'C:\\work\\src': ['clack.ts', 'lib'],
    'C:\\work\\src\\lib': [],
    'C:\\work\\test': [],
  });

  it('lists the entries that start with a path typed with backslashes', () => {
    expect(valuesOf('C:\\work\\sr', false, host)).toEqual(['C:\\work\\src', 'C:\\work\\srcmap.txt']);
  });

  it('lists the same entries for a path typed with forward slashes, written with backslashes', () => {
    expect(valuesOf('C:/work/sr', false, host)).toEqual(['C:\\work\\src', 'C:\\work\\srcmap.txt']);
  });

  it('lists the contents of a directory closed with either separator', () => {
    expect(valuesOf('C:\\work\\src\\', false, host)).toEqual(['C:\\work\\src\\clack.ts', 'C:\\work\\src\\lib']);
    expect(valuesOf('C:/work/src/', false, host)).toEqual(['C:\\work\\src\\clack.ts', 'C:\\work\\src\\lib']);
  });

  it('lists only the directories inside a directory closed with a backslash, when asked for directories', () => {
    expect(valuesOf('C:\\work\\src\\', true, host)).toEqual(['C:\\work\\src\\lib']);
    expect(valuesOf('C:\\work\\', true, host)).toEqual(['C:\\work\\src', 'C:\\work\\test']);
  });

  it('lists what is under a drive root', () => {
    expect(valuesOf('C:\\', false, host)).toEqual(['C:\\work']);
    expect(valuesOf('C:/', false, host)).toEqual(['C:\\work']);
  });
});

describe('entriesUnder, on POSIX', () => {
  const host = hostOf(posix, {
    '/': ['work'],
    '/work': ['src', 'srcmap.txt', 'test'],
    '/work/src': ['clack.ts', 'lib'],
    '/work/src/lib': [],
    '/work/test': [],
  });

  it('lists the entries that start with what was typed', () => {
    expect(valuesOf('/work/sr', false, host)).toEqual(['/work/src', '/work/srcmap.txt']);
  });

  it('lists the contents of a directory closed with a slash, or only its directories when asked', () => {
    expect(valuesOf('/work/src/', false, host)).toEqual(['/work/src/clack.ts', '/work/src/lib']);
    expect(valuesOf('/work/src/', true, host)).toEqual(['/work/src/lib']);
    expect(valuesOf('/', false, host)).toEqual(['/work']);
  });

  it('lists a directory typed without its closing slash as itself, from its parent, when asked for directories', () => {
    expect(valuesOf('/work/src', true, host)).toEqual(['/work/src']);
  });

  it('lists nothing for nothing typed, or for a path that cannot be read', () => {
    expect(valuesOf('', false, host)).toEqual([]);
    expect(valuesOf('/nowhere/at/all', false, host)).toEqual([]);
  });
});

describe('entriesUnder, past a closing slash that names no directory', () => {
  const host = hostOf(posix, { '/': ['work'], '/work': ['sb', 'src', 'srcmap.txt'] });

  it('reads the closed text as a prefix in its parent, without the slash', () => {
    expect(valuesOf('/work/sr/', false, host)).toEqual(['/work/src', '/work/srcmap.txt']);
    expect(valuesOf('/work/srcmap.txt/', false, host)).toEqual(['/work/srcmap.txt']);
  });

  it('keeps every character of a prefix that is not closed', () => {
    expect(valuesOf('/work/sr', false, host)).toEqual(['/work/src', '/work/srcmap.txt']);
  });

  it('types nothing into a root, which has nothing to drop', () => {
    const odd = hostOf(posix, { '/': ['a', 'b'] });
    expect(valuesOf('/', false, odd)).toEqual(['/a', '/b']);
  });

  it('lists nothing for nothing typed, even where the working directory has entries that would match', () => {
    const dotted = hostOf(posix, { '.': ['.hidden'] });
    expect(valuesOf('', false, dotted)).toEqual([]);
  });
});

describe('entriesUnder, on the real filesystem', () => {
  it('lists only the directories under a directory when asked for directories', () => {
    const root = scratch('caique-path-');
    mkdirSync(join(root, 'dir'));
    writeFileSync(join(root, 'file.txt'), '');
    expect(entriesUnder(`${root}/`, true).map((option) => option.value)).toEqual([join(root, 'dir')]);
    expect(entriesUnder(`${root}/`, false).map((option) => option.value)).toEqual([join(root, 'dir'), join(root, 'file.txt')]);
  });
});
