import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { discard } from './__fixtures__/scratch-dir.js';
import { guardDisk, isClean, MAX_SNAPSHOT_BYTES } from './diskguard.js';

let root: string;
const write = (rel: string, text: string): void => {
  mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  writeFileSync(path.join(root, rel), text);
};
const read = (rel: string): string => readFileSync(path.join(root, rel), 'utf8');

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'oxmutate-diskguard-'));
  // A package as compat-oracle is laid out: a manifest, sources, and scratch its suite keeps under it.
  write('package.json', '{ "name": "compat-oracle" }\n');
  write('src/vendor.ts', 'export const staging = (live: string) => `${live}.vendoring`;\n');
  write('.gitignore', '.grade-*\n');
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'init'], { cwd: root, env: { ...process.env, GIT_DIR: undefined, GIT_WORK_TREE: undefined } });
});
afterEach(() => discard(root));

describe('guardDisk: a write outside the sandbox is found after the unit, and put back', () => {
  it('finds the #1453 shape (a manifest overwritten, a test/ directory copied in) and puts the package back as it was', async () => {
    const guard = await guardDisk(root);
    expect(guard).toBeDefined();
    write('package.json', '{ "name": "@vendored/fakehost-suite" }\n');
    write('test/a.test.js', 'require("../shim.mjs");\n');
    const change = (await guard?.check());
    expect(change).toEqual({ changed: ['package.json'], added: ['test'], removed: [] });
    expect(change && guard?.restore(change)).toBe(true);
    expect(read('package.json')).toBe('{ "name": "compat-oracle" }\n');
    expect(existsSync(path.join(root, 'test'))).toBe(false);
    expect((await guard?.check())).toSatisfy(isClean);
  });

  it('puts back a tracked file a mutant deleted', async () => {
    const guard = await guardDisk(root);
    rmSync(path.join(root, 'src/vendor.ts'));
    const change = (await guard?.check());
    expect(change?.removed).toEqual(['src/vendor.ts']);
    expect(change && guard?.restore(change)).toBe(true);
    expect(read('src/vendor.ts')).toContain('.vendoring');
  });

  it('leaves the scratch the suite keeps where git ignores it alone, and reads it as clean', async () => {
    const guard = await guardDisk(root);
    write('.grade-x1/fake/package.json', '{}\n');
    expect((await guard?.check())).toSatisfy(isClean);
    expect(existsSync(path.join(root, '.grade-x1'))).toBe(true);
  });

  it('reads an untouched project as clean', async () => {
    expect(await (await guardDisk(root))?.check()).toSatisfy(isClean);
  });

  it('is off outside a git work tree: nothing says what is tracked', async () => {
    const bare = mkdtempSync(path.join(tmpdir(), 'oxmutate-diskguard-nogit-'));
    try {
      expect(await guardDisk(bare)).toBeUndefined();
    } finally {
      discard(bare);
    }
  });
});

describe('guardDisk: each way a project can change is found, and each way back is checked', () => {
  /** Commit what is on disk now, so the guard tracks it. */
  const commit = (): void => {
    execFileSync('git', ['add', '-A'], { cwd: root });
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'more'], { cwd: root });
  };

  it('finds a write that keeps the size, by its mtime', async () => {
    const guard = await guardDisk(root);
    write('package.json', '{ "name": "compat-0racle" }\n');
    utimesSync(path.join(root, 'package.json'), new Date(), new Date(Date.now() + 5000));
    expect((await guard?.check())?.changed).toEqual(['package.json']);
  });

  it('finds a write that keeps the mtime, by its size', async () => {
    const guard = await guardDisk(root);
    const { atime, mtime } = statSync(path.join(root, 'package.json'));
    write('package.json', '{ "name": "compat-oracle", "x": 1 }\n');
    utimesSync(path.join(root, 'package.json'), atime, mtime);
    expect((await guard?.check())?.changed).toEqual(['package.json']);
  });

  it('puts back a whole tracked directory a mutant removed', async () => {
    const guard = await guardDisk(root);
    rmSync(path.join(root, 'src'), { recursive: true });
    const change = await guard?.check();
    expect(change?.removed).toEqual(['src/vendor.ts']);
    expect(change && guard?.restore(change)).toBe(true);
    expect(read('src/vendor.ts')).toContain('.vendoring');
  });

  it('keeps copies up to its limit to the byte, and only reports past it', async () => {
    const total = ['package.json', 'src/vendor.ts', '.gitignore'].reduce((sum, f) => sum + statSync(path.join(root, f)).size, 0);
    const at = await guardDisk(root, total);
    const over = await guardDisk(root, total - 1);
    write('package.json', '{}\n');
    const change = await at?.check();
    expect(change && over?.restore(change)).toBe(false);
    expect(change && at?.restore(change)).toBe(true);
    expect(read('package.json')).toBe('{ "name": "compat-oracle" }\n');
  });

  it('cannot put back a path it never tracked, and says so', async () => {
    const guard = await guardDisk(root);
    expect(guard?.restore({ changed: ['never.txt'], added: [], removed: [] })).toBe(false);
  });

  it('removes an added entry that is already gone without failing', async () => {
    const guard = await guardDisk(root);
    expect(guard?.restore({ changed: [], added: ['gone'], removed: [] })).toBe(true);
  });

  it('skips a tracked file already deleted from the working tree, and a tracked link to a directory', async () => {
    write('old.txt', 'x\n');
    symlinkSync('src', path.join(root, 'linked'));
    commit();
    rmSync(path.join(root, 'old.txt'));
    const guard = await guardDisk(root);
    expect(await guard?.check()).toSatisfy(isClean);
  });

  it('is off for a root that does not exist', async () => {
    expect(await guardDisk(path.join(root, 'nowhere'))).toBeUndefined();
  });

  it('keeps 64 MiB of copies by default', () => {
    expect(MAX_SNAPSHOT_BYTES).toBe(64 * 1024 * 1024);
  });
});

describe('isClean: a change of any kind is not clean, whatever else it holds', () => {
  it.each([
    [{ changed: ['a'], added: [], removed: [] }],
    [{ changed: [], added: ['a'], removed: [] }],
    [{ changed: [], added: [], removed: ['a'] }],
    [{ changed: ['a'], added: [], removed: ['b'] }],
    [{ changed: ['a'], added: ['b'], removed: [] }],
  ])('reads %j as a change', (c) => {
    expect(isClean(c)).toBe(false);
  });
  it('reads nothing changed as clean', () => {
    expect(isClean({ changed: [], added: [], removed: [] })).toBe(true);
  });
});
