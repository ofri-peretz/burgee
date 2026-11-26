import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { scratchDirs } from './__fixtures__/scratch-dir.js';
import { coverage, coverageText, DEFAULT_PATHS, devOnly, isChangeset, releasesOf } from './changesets.js';

const made = scratchDirs();

/** A scratch repository holding `files`, by path. */
const repo = (files: Record<string, string>): string => {
  const root = made('changesets-');
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
};

const manifest = (name: string, extra: Record<string, unknown> = {}): string => JSON.stringify({ name, version: '1.0.0', ...extra });
const changeset = (...names: string[]): string => `---\n${names.map((name) => `"${name}": patch`).join('\n')}\n---\n\nWhat changed.\n`;
const nothingAtBase = (): undefined => undefined;
/** A base where only packages/a/package.json existed, as `text`. */
const manifestAtBase = (text: string) => (path: string) => (path === 'packages/a/package.json' ? text : undefined);

describe('releasesOf', () => {
  it('reads quoted and bare names, every bump, and ignores the summary', () => {
    expect(releasesOf('---\n"a": major\n\'@s/b\': minor\nc: patch\n  d :  none  \n---\n\ne: patch\n')).toEqual(['a', '@s/b', 'c', 'd']);
  });

  it('reads an opening line with trailing spaces', () => {
    expect(releasesOf('---  \n"a": patch\n---\n')).toEqual(['a']);
  });

  it('reads CRLF front matter', () => {
    expect(releasesOf('---\r\n"a": patch\r\n---\r\n')).toEqual(['a']);
  });

  it('reads nothing without front matter, or when it never closes, or from a line with no bump', () => {
    expect(releasesOf('"a": patch\n')).toEqual([]);
    expect(releasesOf('intro\n"a": patch\n---\n')).toEqual([]);
    expect(releasesOf('---\n"a": patch\n')).toEqual([]);
    expect(releasesOf('---\n"a": huge\n"b" patch\n"c": patch extra\n---\n')).toEqual([]);
    expect(releasesOf('')).toEqual([]);
  });

  it('does not read a mismatched quote as a name', () => {
    expect(releasesOf('---\n"a\': patch\n---\n')).toEqual([]);
    expect(releasesOf('---\n": patch\n"": patch\n: patch\n"a b": patch\nb\': patch\n---\n')).toEqual([]);
  });
});

describe('isChangeset', () => {
  it('is a markdown file directly under .changeset/, not its README', () => {
    expect(isChangeset('.changeset/x.md')).toBe(true);
    expect(isChangeset('.changeset/README.md')).toBe(false);
    expect(isChangeset('.changeset/readme.md')).toBe(false);
    expect(isChangeset('.changeset/config.json')).toBe(false);
    expect(isChangeset('.changeset/sub/x.md')).toBe(false);
    expect(isChangeset('docs/.changeset/x.md')).toBe(false);
    expect(isChangeset('.changeset/x.mdx')).toBe(false);
  });
});

describe('devOnly', () => {
  it('is true only when devDependencies is the whole change', () => {
    expect(devOnly(manifest('a', { devDependencies: { x: '1' } }), manifest('a', { devDependencies: { x: '2' } }))).toBe(true);
    expect(devOnly(manifest('a'), manifest('a', { dependencies: { x: '1' } }))).toBe(false);
  });

  it('is false for a new or removed manifest, or one that is not JSON', () => {
    expect(devOnly(undefined, manifest('a'))).toBe(false);
    expect(devOnly(manifest('a'), undefined)).toBe(false);
    expect(devOnly('{', manifest('a'))).toBe(false);
  });
});

describe('coverage', () => {
  const two = {
    '.changeset/config.json': JSON.stringify({ ignore: ['docs', 'docs-*'] }),
    'packages/a/package.json': manifest('a'),
    'packages/b/package.json': manifest('@s/b'),
  };

  it('passes when every package with a shipped change is named', () => {
    const root = repo({ ...two, '.changeset/one.md': changeset('a', '@s/b') });
    const result = coverage({ root, changed: ['.changeset/one.md', 'packages/a/src/x.ts', 'packages/b/src/y.ts'], baseText: nothingAtBase });
    expect(result.needed.map((one) => one.name)).toEqual(['a', '@s/b']);
    expect(result.uncovered).toEqual([]);
    expect(coverageText(result)).toBe('changesets: a, @s/b named in .changeset/one.md');
  });

  it('names the package a changeset for another package leaves out, with its files', () => {
    const root = repo({ ...two, '.changeset/one.md': changeset('a') });
    const result = coverage({ root, changed: ['.changeset/one.md', 'packages/a/src/x.ts', 'packages/b/src/y.ts', 'packages/b/src/z.ts'], baseText: nothingAtBase });
    expect(result.uncovered).toEqual([{ name: '@s/b', dir: 'packages/b', files: ['packages/b/src/y.ts', 'packages/b/src/z.ts'] }]);
    expect(coverageText(result)).toBe(
      [
        'changesets: 1 package(s) ship a change no changeset names:',
        '  @s/b (packages/b/src/y.ts, packages/b/src/z.ts)',
        `fix: add "@s/b": patch (or the right bump) to a changeset, or add the 'skip-changeset' label for internal-only work`,
      ].join('\n'),
    );
  });

  it('asks for a changeset when there is none', () => {
    const root = repo(two);
    const result = coverage({ root, changed: ['packages/a/src/x.ts'], baseText: nothingAtBase });
    expect(result.changesets).toEqual([]);
    expect(coverageText(result)).toBe(
      [
        'changesets: 1 package(s) ship a change no changeset names:',
        '  a (packages/a/src/x.ts)',
        "fix: run 'npx changeset' for a, or add the 'skip-changeset' label for internal-only work",
      ].join('\n'),
    );
  });

  it('needs nothing for tests, fixtures, mocks, snapshots or files outside the paths', () => {
    const root = repo({ ...two, 'apps/docs/package.json': manifest('site') });
    const changed = [
      'packages/a/src/x.test.ts',
      'packages/a/src/x.spec.mjs',
      'packages/a/src/__fixtures__/f.ts',
      'packages/a/src/__tests__/t.ts',
      'packages/a/src/__mocks__/m.ts',
      'packages/a/src/__snapshots__/x.snap',
      'packages/a/README.md',
      'apps/docs/src/page.ts',
      
      'scripts/x.ts',
    ];
    const result = coverage({ root, changed, baseText: nothingAtBase });
    expect(result.needed).toEqual([]);
    expect(coverageText(result)).toBe('changesets: no package ships a change (tests, fixtures and devDependencies need none)');
  });

  it('counts a test-like name that is source', () => {
    const root = repo(two);
    for (const path of ['packages/a/src/testing.ts', 'packages/a/src/my__tests__/x.ts', 'packages/a/src/x.test.ts.md', 'packages/a/src/x.snapshot.ts']) {
      expect(coverage({ root, changed: [path], baseText: nothingAtBase }).needed, path).toHaveLength(1);
    }
  });

  it('reads a source file that is JSON as source, even unchanged from the base', () => {
    const root = repo({ ...two, 'packages/a/src/data.json': manifest('a') });
    expect(coverage({ root, changed: ['packages/a/src/data.json'], baseText: () => manifest('a') }).needed).toHaveLength(1);
  });

  it('lists every changeset, and every package in each fix', () => {
    const root = repo({ ...two, '.changeset/one.md': changeset('a'), '.changeset/two.md': changeset('@s/b') });
    const both = ['packages/a/src/x.ts', 'packages/b/src/y.ts'];
    expect(coverageText(coverage({ root, changed: ['.changeset/one.md', '.changeset/two.md', ...both], baseText: nothingAtBase }))).toBe(
      'changesets: a, @s/b named in .changeset/one.md, .changeset/two.md',
    );
    const bare = repo({ ...two, 'packages/c/package.json': manifest('c'), '.changeset/c.md': changeset('c') });
    expect(coverageText(coverage({ root: bare, changed: both, baseText: nothingAtBase }))).toContain("fix: run 'npx changeset' for a, @s/b, or");
    expect(coverageText(coverage({ root: bare, changed: ['.changeset/c.md', ...both], baseText: nothingAtBase }))).toContain('fix: add "a": patch, "@s/b": patch (or');
  });

  it('needs nothing for a manifest whose only change is devDependencies, and something for any other', () => {
    const root = repo({ ...two, 'packages/a/package.json': manifest('a', { devDependencies: { x: '2' } }) });
    expect(coverage({ root, changed: ['packages/a/package.json'], baseText: manifestAtBase(manifest('a', { devDependencies: { x: '1' } })) }).needed).toEqual([]);
    expect(coverage({ root, changed: ['packages/a/package.json'], baseText: manifestAtBase(manifest('a', { version: '0.9.0', devDependencies: { x: '1' } })) }).needed).toHaveLength(1);
  });

  it('skips a folder whose manifest is gone, and counts a manifest new at the head', () => {
    const root = repo(two);
    const result = coverage({ root, changed: ['packages/c/package.json', 'packages/a/package.json'], baseText: (path) => (path === 'packages/c/package.json' ? manifest('c') : undefined) });
    expect(result.needed.map((one) => one.name)).toEqual(['a']);
  });

  it('skips a folder with no package name, an ignored package and an unversioned private one', () => {
    const root = repo({
      '.changeset/config.json': JSON.stringify({ ignore: ['docs', 'docs-*', 7], privatePackages: { version: false } }),
      'packages/docs/package.json': manifest('docs'),
      'packages/docs-x/package.json': manifest('docs-x'),
      'packages/mydocs/package.json': manifest('mydocs'),
      'packages/p/package.json': manifest('p', { private: true }),
      'packages/n/package.json': JSON.stringify({ version: '1.0.0' }),
      'packages/bad/package.json': '{',
    });
    const changed = ['docs', 'docs-x', 'mydocs', 'p', 'n', 'bad', 'gone'].map((dir) => `packages/${dir}/src/i.ts`);
    expect(coverage({ root, changed, baseText: nothingAtBase }).needed.map((one) => one.name)).toEqual(['mydocs']);
  });

  it('counts a private package when changesets versions private packages, as by default', () => {
    const root = repo({ 'packages/p/package.json': manifest('p', { private: true }) });
    expect(coverage({ root, changed: ['packages/p/src/i.ts'], baseText: nothingAtBase }).needed).toHaveLength(1);
    const versioned = repo({ '.changeset/config.json': JSON.stringify({ privatePackages: { version: true } }), 'packages/p/package.json': manifest('p', { private: true }) });
    expect(coverage({ root: versioned, changed: ['packages/p/src/i.ts'], baseText: nothingAtBase }).needed).toHaveLength(1);
  });

  it('treats a config that is not JSON or has no ignore list as ignoring nothing', () => {
    for (const config of ['{', JSON.stringify({ ignore: 'docs' })]) {
      const root = repo({ '.changeset/config.json': config, 'packages/docs/package.json': manifest('docs') });
      expect(coverage({ root, changed: ['packages/docs/src/i.ts'], baseText: nothingAtBase }).needed).toHaveLength(1);
    }
  });

  it('escapes an ignore entry, so its dot is a dot', () => {
    const root = repo({
      '.changeset/config.json': JSON.stringify({ ignore: ['a.b'] }),
      'packages/x/package.json': manifest('axb'),
      'packages/y/package.json': manifest('ab'),
      'packages/z/package.json': manifest('a.b'),
    });
    const changed = ['x', 'y', 'z'].map((dir) => `packages/${dir}/src/i.ts`);
    expect(coverage({ root, changed, baseText: nothingAtBase }).needed.map((one) => one.name)).toEqual(['axb', 'ab']);
  });

  it('reads only changesets the pull request still has, and not the README', () => {
    const root = repo({ ...two, '.changeset/README.md': changeset('a') });
    const result = coverage({ root, changed: ['.changeset/README.md', '.changeset/deleted.md', 'packages/a/src/x.ts'], baseText: nothingAtBase });
    expect(result.changesets).toEqual([]);
    expect(result.uncovered.map((one) => one.name)).toEqual(['a']);
  });

  it('takes the paths the caller names', () => {
    const root = repo({ 'packages/ui/package.json': manifest('ui') });
    const changed = ['packages/ui/components/button.tsx'];
    expect(coverage({ root, changed, baseText: nothingAtBase }).needed).toEqual([]);
    expect(coverage({ root, changed, baseText: nothingAtBase, paths: '^packages/ui/' }).needed).toHaveLength(1);
    expect(DEFAULT_PATHS).toBe(String.raw`^packages/[^/]+/(src|package\.json)`);
  });
});
