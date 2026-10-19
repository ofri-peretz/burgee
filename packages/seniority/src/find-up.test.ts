/**
 * R8 — `seniority/find-up`: find-up 8's surface, which find-up's own suite grades in
 * `compat-oracle` (`graded-override-targets` R2). These cases hold the branches that suite does
 * not reach from this process, so a line added here without a test still fails coverage.
 */
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { scratchDirs } from './__fixtures__/scratch-dir.js';
import { findDown, findDownSync, findUp, findUpMultiple, findUpMultipleSync, findUpStop, findUpSync } from './find-up.js';

const scratch = scratchDirs();

const root = scratch('seniority-findup-');
const at = (...parts: string[]): string => join(root, ...parts);
mkdirSync(at('a', 'b', 'c'), { recursive: true });
mkdirSync(at('a', 'deep', 'deeper'), { recursive: true });
writeFileSync(at('package.json'), '{}');
writeFileSync(at('a', 'package.json'), '{}');
writeFileSync(at('a', 'other.json'), '{}');
writeFileSync(at('a', 'deep', 'deeper', 'leaf.txt'), '');
symlinkSync(at('a', 'package.json'), at('a', 'b', 'link.json'));

afterEach(() => {
  vi.doUnmock('./runtime.js');
  vi.resetModules();
});

/** A fresh copy of the module over a runtime whose working directory is `cwd`. */
async function overCwd(cwd: string | undefined): Promise<typeof import('./find-up.js')> {
  vi.resetModules();
  vi.doMock('./runtime.js', () => ({ ambientCwd: () => cwd }));
  return import('./find-up.js');
}

describe('seniority/find-up walks up as find-up 8 does', () => {
  it('finds the nearest file walking up', () => {
    expect(findUpSync('package.json', { cwd: at('a', 'b') })).toBe(at('a', 'package.json'));
  });

  it('returns undefined rather than throwing when there is nothing to find', () => {
    expect(findUpSync('nothing.json', { cwd: at('a', 'b') })).toBeUndefined();
  });

  it('collects one match per directory, nearest first, the first name given winning', () => {
    expect(findUpMultipleSync(['package.json', 'other.json'], { cwd: at('a', 'b'), stopAt: root })).toEqual([at('a', 'package.json'), at('package.json')]);
    expect(findUpMultipleSync(['other.json', 'package.json'], { cwd: at('a', 'b'), stopAt: root })).toEqual([at('a', 'other.json'), at('package.json')]);
  });

  it('stops where it is told to, and at the limit', () => {
    expect(findUpSync('package.json', { cwd: at('a', 'b'), stopAt: at('a', 'b') })).toBeUndefined();
    expect(findUpMultipleSync('package.json', { cwd: at('a', 'b'), limit: 1 })).toEqual([at('a', 'package.json')]);
  });

  it('takes a URL for cwd and stopAt', () => {
    expect(findUpSync('package.json', { cwd: pathToFileURL(at('a', 'b')), stopAt: pathToFileURL(at('a')) })).toBe(at('a', 'package.json'));
  });

  it("matches a file unless type says otherwise, and refuses a type locate-path doesn't know", async () => {
    expect(findUpSync('b', { cwd: at('a', 'b', 'c') })).toBeUndefined();
    expect(findUpSync('b', { cwd: at('a', 'b', 'c'), type: 'directory' })).toBe(at('a', 'b'));
    expect(findUpSync('b', { cwd: at('a', 'b', 'c'), type: 'both' })).toBe(at('a', 'b'));
    expect(() => findUpSync('b', { cwd: at('a'), type: 'socket' as 'file' })).toThrow('Invalid type specified: socket');
    await expect(findUp('b', { cwd: at('a'), type: 'socket' as 'file' })).rejects.toThrow('Invalid type specified: socket');
  });

  it('follows a symbolic link unless allowSymlinks is false', async () => {
    expect(findUpSync('link.json', { cwd: at('a', 'b') })).toBe(at('a', 'b', 'link.json'));
    expect(findUpSync('link.json', { cwd: at('a', 'b'), allowSymlinks: false, stopAt: at('a', 'b') })).toBeUndefined();
    await expect(findUp('link.json', { cwd: at('a', 'b'), allowSymlinks: false, stopAt: at('a', 'b') })).resolves.toBeUndefined();
  });

  it('treats a path it cannot stat as absent', () => {
    // A name with a NUL byte makes `statSync` throw rather than report a missing entry.
    expect(findUpSync('bad\0name', { cwd: at('a'), stopAt: at('a') })).toBeUndefined();
  });

  it('defaults cwd to the process working directory, through the runtime seam', async () => {
    const fresh = await overCwd(at('a', 'b'));
    expect(fresh.findUpSync('package.json')).toBe(at('a', 'package.json'));
  });

  it('on a runtime with no process, resolves against whatever the platform calls the working directory', async () => {
    const fresh = await overCwd(undefined);
    expect(fresh.findUpSync('package.json', { stopAt: fileURLToPath(new URL('..', import.meta.url)) })).toBe(fileURLToPath(new URL('../package.json', import.meta.url)));
  });

  it('ends at the filesystem root when stopAt is not an ancestor', async () => {
    expect(findUpMultipleSync('package.json', { cwd: at('a'), stopAt: at('a', 'b') })).toContain(at('package.json'));
    await expect(findUpMultiple('package.json', { cwd: at('a'), stopAt: at('a', 'b') })).resolves.toContain(at('package.json'));
  });

  it('answers the same through the async spellings a migrating caller awaits', async () => {
    await expect(findUp('package.json', { cwd: at('a', 'b') })).resolves.toBe(at('a', 'package.json'));
    await expect(findUpMultiple('package.json', { cwd: at('a', 'b'), stopAt: root })).resolves.toEqual([at('a', 'package.json'), at('package.json')]);
  });
});

describe('a matcher function in place of a name', () => {
  it('checks the path it returns, and ends the walk on findUpStop', async () => {
    expect(findUpSync((directory) => (directory === at('a') ? 'package.json' : undefined), { cwd: at('a', 'b') })).toBe(at('a', 'package.json'));
    expect(findUpSync(() => findUpStop, { cwd: at('a', 'b') })).toBeUndefined();
    await expect(findUp(async (directory) => (directory === at('a') ? 'package.json' : undefined), { cwd: at('a', 'b') })).resolves.toBe(at('a', 'package.json'));
    await expect(findUp(() => findUpStop, { cwd: at('a', 'b') })).resolves.toBeUndefined();
  });

  it('counts an empty answer and a path that is not there as no match', async () => {
    expect(findUpMultipleSync(() => '', { cwd: at('a', 'b'), type: 'directory', stopAt: at('a') })).toEqual([]);
    await expect(findUpMultiple(() => 'missing.json', { cwd: at('a', 'b'), stopAt: at('a') })).resolves.toEqual([]);
  });
});

describe('findDown looks the other way', () => {
  it('finds the nearest level first, or each branch to the bottom with strategy depth', async () => {
    expect(findDownSync('leaf.txt', { cwd: at('a'), depth: 2 })).toBe(at('a', 'deep', 'deeper', 'leaf.txt'));
    expect(findDownSync('leaf.txt', { cwd: at('a'), depth: 2, strategy: 'depth' })).toBe(at('a', 'deep', 'deeper', 'leaf.txt'));
    await expect(findDown('leaf.txt', { cwd: at('a'), depth: 2 })).resolves.toBe(at('a', 'deep', 'deeper', 'leaf.txt'));
    await expect(findDown('leaf.txt', { cwd: at('a'), depth: 2, strategy: 'depth' })).resolves.toBe(at('a', 'deep', 'deeper', 'leaf.txt'));
  });

  it('looks one level down by default, and no further than depth', async () => {
    expect(findDownSync('package.json', { cwd: root })).toBe(at('package.json'));
    expect(findDownSync('leaf.txt', { cwd: at('a') })).toBeUndefined();
    expect(findDownSync('leaf.txt', { cwd: at('a'), strategy: 'depth' })).toBeUndefined();
    await expect(findDown('leaf.txt', { cwd: at('a') })).resolves.toBeUndefined();
    await expect(findDown('leaf.txt', { cwd: at('a'), strategy: 'depth' })).resolves.toBeUndefined();
  });

  it('reads a directory it cannot open as empty', async () => {
    expect(findDownSync('x', { cwd: at('nowhere'), depth: 3 })).toBeUndefined();
    expect(findDownSync('x', { cwd: at('nowhere'), depth: 3, strategy: 'depth' })).toBeUndefined();
    await expect(findDown('x', { cwd: at('nowhere'), depth: 3 })).resolves.toBeUndefined();
    await expect(findDown('x', { cwd: at('nowhere'), depth: 3, strategy: 'depth' })).resolves.toBeUndefined();
  });

  it('defaults cwd as findUp does, and takes type and allowSymlinks', async () => {
    const fresh = await overCwd(at('a'));
    expect(fresh.findDownSync('deeper', { depth: 1, type: 'directory', allowSymlinks: false })).toBe(at('a', 'deep', 'deeper'));
  });
});
