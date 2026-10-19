/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — the subpath floors `burgee migrate` pins by are read from this repository's release
 * tags (migrate-pins-carry-the-drop-in).
 *
 * On 2026-10-18 `next` pinned `roundel@^1.0.4` for an import of `roundel/picocolors`, which first
 * shipped in 1.1.0, and the migrated svgo could not start. `scripts/family-versions.mjs` now
 * writes, for each subpath, the oldest version from which every tagged release of the current
 * major exports it. These cases hold the parts a wrong answer would hide in: the run that a
 * dropped subpath breaks, the bytes `git cat-file --batch` counts, and the tagless checkout.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { compare, familyTable, historyOf, parts, published, sinceOf, subpathsOf } from './family-versions.mjs';

const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), 'family-versions.mjs');

/** The environment without git's own variables: lefthook's pre-push exports `GIT_DIR`, and a scratch `git init` must not inherit it. */
function withoutGit(): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
}

const release = (version: string, exports?: unknown): { version: string; manifest: { exports?: unknown } } => ({ version, manifest: exports === undefined ? {} : { exports } });
const keys = (...subpaths: string[]): Record<string, string> => Object.fromEntries(subpaths.map((s) => [s, `./dist/${s}.js`]));

describe('sinceOf — the oldest version from which every tagged release exports a subpath', () => {
  it('floors a subpath at the first release of the run that reaches the current version', () => {
    const current = release('1.1.1', keys('.', './chalk', './picocolors'));
    const history = [release('1.0.0', keys('.', './chalk')), release('1.0.4', keys('.', './chalk')), release('1.1.0', keys('.', './chalk', './picocolors'))];
    expect(sinceOf(current, history)).toEqual({ '.': '1.0.0', './chalk': '1.0.0', './picocolors': '1.1.0' });
  });

  it('starts the run again after a release that dropped the subpath', () => {
    const current = release('1.3.0', keys('.', './x'));
    const history = [release('1.0.0', keys('.', './x')), release('1.1.0', keys('.')), release('1.2.0', keys('.', './x'))];
    expect(sinceOf(current, history)).toMatchObject({ './x': '1.2.0' });
  });

  it('floors a subpath no tag carries at the current version', () => {
    expect(sinceOf(release('1.2.0', keys('.', './new')), [release('1.0.0', keys('.'))])).toEqual({ '.': '1.0.0', './new': '1.2.0' });
  });

  it('reads only plain releases of the current major older than the current version, in any order', () => {
    const history = [release('1.0.5', keys('.')), release('0.9.0', keys('.')), release('2.0.0', keys('.')), release('1.0.0-rc.1', keys('.')), release('1.0.0', keys('.')), release('1.0.9', keys('.'))];
    expect(sinceOf(release('1.0.9', keys('.')), history)).toEqual({ '.': '1.0.0' });
    // A newer tag in the same major (a release after this checkout) is not this version's history.
    expect(sinceOf(release('1.0.9', keys('.', './z')), [release('1.0.10', keys('.', './z'))])).toEqual({ '.': '1.0.9', './z': '1.0.9' });
    // Nor is a tag at the current version itself: the working tree's manifest is what this build ships.
    expect(sinceOf(release('1.2.0', keys('.', './x')), [release('1.1.0', keys('.', './x')), release('1.2.0', keys('.'))])).toEqual({ '.': '1.1.0', './x': '1.1.0' });
  });

  it('floors every subpath at a current version that is not a plain x.y.z', () => {
    expect(sinceOf(release('0.0.0-dev', keys('.', './a')), [release('0.0.0', keys('.', './a'))])).toEqual({ '.': '0.0.0-dev', './a': '0.0.0-dev' });
  });

  it('orders by minor before patch: 1.10.0 is newer than 1.9.9', () => {
    const history = [release('1.9.9', keys('.')), release('1.10.0', keys('.', './y'))];
    expect(sinceOf(release('1.10.1', keys('.', './y')), history)).toEqual({ '.': '1.9.9', './y': '1.10.0' });
    expect(compare('1.10.0', '1.9.9')).toBeGreaterThan(0);
    expect(compare('2.0.0', '1.99.99')).toBeGreaterThan(0);
    expect(compare('1.0.1', '1.0.1')).toBe(0);
  });

  it('reads no version from a range or a prerelease', () => {
    expect(parts('1.2.3')).toEqual([1, 2, 3]);
    expect(parts('10.20.30')).toEqual([10, 20, 30]);
    expect(parts('^1.2.3')).toBeUndefined();
    expect(parts('1.2.3-rc.0')).toBeUndefined();
    expect(parts('1.2')).toBeUndefined();
  });
});

describe('subpathsOf — what a manifest exports', () => {
  it.each([
    ['no exports field', {}, ['.']],
    ['a bare string', { exports: './index.js' }, ['.']],
    ['conditions only', { exports: { import: './a.mjs', require: './a.cjs' } }, ['.']],
    ['an array', { exports: ['./a.js'] }, ['.']],
    ['null', { exports: null }, ['.']],
    ['subpaths', { exports: { '.': './a.js', './b': './b.js', './package.json': './package.json' } }, ['.', './b', './package.json']],
  ])('%s', (_, manifest, expected) => {
    expect(subpathsOf(manifest)).toEqual(expected);
  });
});

/** A scratch repository with `packages/<dir>/package.json` committed and tagged at each version. */
function repository(dir: string, name: string, versions: { version: string; exports?: Record<string, string>; description?: string; missing?: boolean }[]): string {
  const root = mkdtempSync(join(tmpdir(), 'family-versions-'));
  const git = (...args: string[]): string =>
    execFileSync('git', ['-c', 'user.name=lock', '-c', 'user.email=lock@example.com', '-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false', ...args], { cwd: root, env: withoutGit(), stdio: 'pipe' }).toString();
  git('init', '--quiet');
  const file = join(root, 'packages', dir, 'package.json');
  mkdirSync(dirname(file), { recursive: true });
  for (const v of versions) {
    if (v.missing === true) writeFileSync(join(root, 'README.md'), v.version);
    else writeFileSync(file, `${JSON.stringify({ name, version: v.version, description: v.description, exports: v.exports }, null, 2)}\n`);
    git('add', '-A');
    git('commit', '--quiet', '--allow-empty', '-m', v.version);
    git('tag', `${name.split('/').at(-1) as string}@${v.version}`);
  }
  return root;
}

describe('historyOf — every release tag, read in one batch', () => {
  it('reads each tag’s manifest, cutting each body by bytes so a non-ASCII description does not shift the next', () => {
    const root = repository('roundel', 'roundel', [
      { version: '1.0.0', exports: keys('.'), description: 'Ünïcödé — colours, “quoted”' },
      { version: '1.0.4', exports: keys('.'), description: '— é ü —' },
      { version: '1.1.0', exports: keys('.', './picocolors') },
    ]);
    const history = historyOf(root, { name: 'roundel', dir: 'roundel' });
    expect(history.map((h) => [h.version, subpathsOf(h.manifest)])).toEqual([
      ['1.0.0', ['.']],
      ['1.0.4', ['.']],
      ['1.1.0', ['.', './picocolors']],
    ]);
  });

  it('reads a scoped package by its unscoped tag, and skips a tag whose tree has no manifest', () => {
    // The first tag's tree predates the manifest: no evidence either way, so it is left out.
    const root = repository('pkg', '@scope/pkg', [{ version: '1.0.0', missing: true }, { version: '1.0.1', exports: keys('.') }]);
    expect(historyOf(root, { name: '@scope/pkg', dir: 'pkg' }).map((h) => h.version)).toEqual(['1.0.1']);
    expect(historyOf(root, { name: '@scope/pkg', dir: 'elsewhere' }), 'no manifest at that path in any tag').toEqual([]);
  });

  it('ignores a tag that is not a plain version', () => {
    const root = repository('x', 'x', [{ version: '1.0.0', exports: keys('.') }]);
    execFileSync('git', ['tag', 'x@next'], { cwd: root, env: withoutGit() });
    expect(historyOf(root, { name: 'x', dir: 'x' }).map((h) => h.version)).toEqual(['1.0.0']);
  });

  it('is empty where there is no repository at all', () => {
    expect(historyOf(mkdtempSync(join(tmpdir(), 'family-versions-none-')), { name: 'x', dir: 'x' })).toEqual([]);
  });
});

/** `packages/<dir>/package.json` under `root`. */
function writeManifest(root: string, dir: string, manifest: object): void {
  mkdirSync(join(root, 'packages', dir), { recursive: true });
  writeFileSync(join(root, 'packages', dir, 'package.json'), JSON.stringify(manifest));
}

/** A workspace of roundel (tagged at 1.0.4 and 1.1.0, or not), burgee, a private package, a directory without a manifest and a stray file. */
function workspace(tagged: boolean): string {
  const root = tagged
    ? repository('roundel', 'roundel', [
        { version: '1.0.4', exports: keys('.') },
        { version: '1.1.0', exports: keys('.', './picocolors') },
      ])
    : mkdtempSync(join(tmpdir(), 'family-versions-tagless-'));
  writeManifest(root, 'roundel', { name: 'roundel', version: '1.1.1', exports: keys('.', './picocolors') });
  writeManifest(root, 'burgee', { name: 'burgee', version: '1.6.0' });
  writeManifest(root, 'docs', { name: 'docs', version: '0.0.0', private: true });
  mkdirSync(join(root, 'packages', 'empty'));
  writeFileSync(join(root, 'packages', 'README.md'), '');
  return root;
}

/** The build step, as `packages/burgee/package.json` runs it. */
const run = (root: string, ...args: string[]) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd: join(root, 'packages', 'burgee'), env: withoutGit(), encoding: 'utf8' });

describe('the script — the file the build writes, and the release that refuses a tagless one', () => {
  it('writes { versions, since } from the tags, public packages only', () => {
    const root = workspace(true);
    const result = run(root);
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(readFileSync(join(root, 'packages/burgee/dist/family-versions.json'), 'utf8'))).toEqual({
      versions: { burgee: '1.6.0', roundel: '1.1.1' },
      since: { burgee: { '.': '1.6.0' }, roundel: { '.': '1.0.4', './picocolors': '1.1.0' } },
    });
    expect(published(join(root, 'packages')).map((p) => p.name)).toEqual(['burgee', 'roundel']);
    expect(familyTable(root).tags).toBe(2);
    // Minified, packages in name order, and a second build over an existing dist/ succeeds.
    expect(readFileSync(join(root, 'packages/burgee/dist/family-versions.json'), 'utf8')).toMatch(/^\{"versions":\{"burgee":"1\.6\.0","roundel":"1\.1\.1"\},"since":\{"burgee"/);
    expect(run(root).status).toBe(0);
  });

  it('lists packages in name order whatever order the directory reads in', () => {
    const root = mkdtempSync(join(tmpdir(), 'family-versions-order-'));
    for (const name of ['zeta', 'mid', 'alpha']) writeManifest(root, name, { name, version: '1.0.0' });
    expect(published(join(root, 'packages')).map((p) => p.name)).toEqual(['alpha', 'mid', 'zeta']);
  });

  it('floors at the current version without tags, and says so, and nothing else (git’s own complaint stays out)', () => {
    const root = workspace(false);
    const result = run(root);
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('family-versions: no release tags in this checkout; each subpath floor is the current version.\n');
    expect(JSON.parse(readFileSync(join(root, 'packages/burgee/dist/family-versions.json'), 'utf8')).since.roundel).toEqual({ '.': '1.1.1', './picocolors': '1.1.1' });
  });

  it('refuses to write a tagless table under --require-tags, which release.yml passes', () => {
    const result = run(workspace(false), '--require-tags');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('fetch-tags: true');
    expect(run(workspace(true), '--require-tags').status).toBe(0);
  });

  it('throws on a manifest that is not JSON rather than skipping the package', () => {
    const root = workspace(false);
    writeFileSync(join(root, 'packages', 'roundel', 'package.json'), '{ nope');
    expect(run(root).status).not.toBe(0);
  });
});

describe('release.yml ships the table read with full history', () => {
  it('fetches the tags in the build job and re-runs the script with --require-tags after turbo', () => {
    const source = readFileSync(resolve(dirname(SCRIPT), '../.github/workflows/release.yml'), 'utf8');
    const build = source.slice(source.indexOf('\n  build:'), source.indexOf('\n  verify:'));
    expect(build).toMatch(/fetch-depth: 0/);
    expect(build).toMatch(/fetch-tags: true/);
    const turbo = build.indexOf('turbo run build');
    const rerun = build.indexOf('family-versions.mjs --require-tags');
    expect(turbo).toBeGreaterThan(-1);
    expect(rerun, 'turbo may restore family-versions.json from a tagless build; the release must rewrite it').toBeGreaterThan(turbo);
    expect(rerun, 'before the artifact is uploaded').toBeLessThan(build.indexOf('upload-artifact'));
  });
});
