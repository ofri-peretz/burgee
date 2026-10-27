import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { globToRegExp, matchFiles } from './files.js';

describe('mutate globs', () => {
  it('match nested files, braces and negations as Stryker reads them', () => {
    expect(globToRegExp('src/**/*.ts').test('src/a/b/c.ts')).toBe(true);
    expect(globToRegExp('src/**/*.ts').test('src/c.ts')).toBe(true);
    expect(globToRegExp('src/**/*.{test,spec}.*').test('src/x/a.spec.ts')).toBe(true);
    expect(globToRegExp('src/*.ts').test('src/a/b.ts')).toBe(false);
  });
  it('**/ is whole directories: it does not swallow part of a name', () => {
    expect(globToRegExp('src/**/x.ts').test('src/ax.ts')).toBe(false);
  });
  it('a trailing ** matches everything below', () => {
    expect(globToRegExp('src/**').test('src/a/b.ts')).toBe(true);
    expect(globToRegExp('src/**').source).toBe('^src\\/.*$');
  });
  it('? is one character, never a slash', () => {
    expect(globToRegExp('a?.ts').test('ab.ts')).toBe(true);
    expect(globToRegExp('a?.ts').test('abc.ts')).toBe(false);
    expect(globToRegExp('a?/x').test('a//x')).toBe(false);
  });
  it('braces are alternatives, taken literally', () => {
    expect(globToRegExp('src/*.{ts,js}').test('src/a.ts')).toBe(true);
    expect(globToRegExp('src/*.{ts,js}').test('src/a.js')).toBe(true);
    expect(globToRegExp('src/*.{ts,js}').test('src/a.mjs')).toBe(false);
  });
  it('regular expression characters stand for themselves', () => {
    expect(globToRegExp('a.ts').test('a.ts')).toBe(true);
    expect(globToRegExp('a.ts').test('axts')).toBe(false);
    expect(globToRegExp('(a)+$.ts').test('(a)+$.ts')).toBe(true);
  });
});

describe('matchFiles', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'oxmutate-files-'));
  afterAll(() => rmSync(root, { recursive: true, force: true }));
  const touch = (rel: string): void => {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    writeFileSync(path.join(root, rel), '');
  };
  for (const f of ['b.ts', 'a.ts', 'a.test.ts', 'sub.ts', 'sub/c.ts', 'sub/deep/d.ts', 'notes.md', '!x.ts']) touch(f);
  const skipped = ['node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.turbo', '.oxmutate', '.stryker-tmp', 'reports'];
  for (const dir of skipped) touch(`${dir}/x.ts`);

  it('lists the included files minus the excluded, sorted, with forward slashes', () => {
    expect(matchFiles(root, ['**/*.ts', '!**/*.test.ts'])).toEqual(['!x.ts', 'a.ts', 'b.ts', 'sub.ts', 'sub/c.ts', 'sub/deep/d.ts']);
  });
  it('a file must match an include: excludes alone select nothing', () => {
    expect(matchFiles(root, ['!**/*.test.ts'])).toEqual([]);
    expect(matchFiles(root, ['sub/*.ts'])).toEqual(['sub/c.ts']);
    // A negation is never an include, even for a file whose name starts with `!`.
    expect(matchFiles(root, ['a.ts', '!x.ts'])).toEqual(['a.ts']);
  });
  it('never walks into dependency, build or report directories', () => {
    expect(matchFiles(root, ['**/x.ts'])).toEqual([]);
  });
});
