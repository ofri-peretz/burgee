import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { discard } from './__fixtures__/scratch-dir.js';
import { guardDisk, isClean } from './diskguard.js';

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
