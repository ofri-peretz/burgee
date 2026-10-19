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
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

import { beforeAll, describe, expect, it } from 'vitest';

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

/** A release tag the fixture carries: `packages/<dir>/package.json` in its tree, or, with no `manifest`, a tree without one. */
interface Tagged {
  tag: string;
  dir: string;
  manifest?: { name: string; version: string; description?: string; exports?: Record<string, string> };
}

/** The release of `name@version` at `packages/<dir>/package.json`, tagged by its unscoped name as `release.yml` tags. */
const tagged = (dir: string, { name, version, description, exports }: NonNullable<Tagged['manifest']>): Tagged => ({
  tag: `${name.split('/').at(-1) as string}@${version}`,
  dir,
  manifest: { name, version, description, exports },
});

/**
 * Every release tag a case reads, one package per scenario so no case sees another's: `pennant`
 * for the bytes `cat-file --batch` counts, `@scope/pkg` for a tag whose tree has no manifest,
 * `x` for a tag that is not a version, and `roundel` (1.0.4, then 1.1.0 with `./picocolors`) for
 * the workspace the script runs in. Each tag is its own root commit holding only what it lists.
 */
const TAGS: readonly Tagged[] = [
  tagged('pennant', { name: 'pennant', version: '1.0.0', description: 'Ünïcödé — colours, “quoted”', exports: keys('.') }),
  tagged('pennant', { name: 'pennant', version: '1.0.4', description: '— é ü —', exports: keys('.') }),
  tagged('pennant', { name: 'pennant', version: '1.1.0', exports: keys('.', './picocolors') }),
  { tag: 'pkg@1.0.0', dir: 'pkg' },
  tagged('pkg', { name: '@scope/pkg', version: '1.0.1', exports: keys('.') }),
  tagged('x', { name: 'x', version: '1.0.0', exports: keys('.') }),
  tagged('roundel', { name: 'roundel', version: '1.0.4', exports: keys('.') }),
  tagged('roundel', { name: 'roundel', version: '1.1.0', exports: keys('.', './picocolors') }),
];
/** Tags that name another tag's commit rather than a release of their own. */
const ALIASES: Readonly<Record<string, string>> = { 'x@next': 'x@1.0.0' };

let fixture: string | undefined;

/**
 * A fresh scratch directory under the system's temporary directory, left for the OS to clear.
 * Removing them in `afterAll` was tried: under the load below, unlinking these few dozen files
 * from Node took 152 s and failed the file on the 60 s hook timeout.
 */
const scratchDir = (prefix: string): string => mkdtempSync(join(tmpdir(), prefix));

/**
 * The one repository whose tags every case reads, written once and never again — and written by
 * Node, not by git: each object is a new file under `.git/objects`, each tag a new file under
 * `.git/refs/tags`, all of it git's documented on-disk format (`git fsck --strict` passes).
 *
 * Why. Each case used to build its own repository: `git init`, then `add`, `commit` and `tag`
 * for every version. On this machine, while the pre-push root suite runs, a process that renames
 * or unlinks a file — every lock file git commits through — can stall for many seconds, where a
 * spawn, a file Node creates and a read-only git command stay fast (scripts/affected.test.ts).
 * Measured 2026-10-19 with three root suites side by side: "ignores a tag that is not a plain
 * version" 94 s and "writes { versions, since }" 76 s against the 30 s timeout. One fixture in
 * `beforeAll` from `git init` and one `git fast-import` took 4 s in one such run and over the
 * 60 s hook timeout in the next. Creating files only, it has nothing to wait on; the cases only
 * read: `historyOf` here, or the script in a workspace whose `.git` file points at this one.
 */
function repository(): string {
  if (fixture) return fixture;
  const root = scratchDir('family-versions-');
  const gitDir = join(root, '.git');
  for (const dir of ['objects', 'refs/heads', 'refs/tags']) mkdirSync(join(gitDir, dir), { recursive: true });
  writeFileSync(join(gitDir, 'HEAD'), 'ref: refs/heads/main\n');
  /** A loose object: `<type> <size>\0<body>`, deflated, at the path its SHA-1 names. */
  const object = (type: 'blob' | 'tree' | 'commit', body: Buffer): string => {
    const raw = Buffer.concat([Buffer.from(`${type} ${String(body.length)}\0`), body]);
    const sha = createHash('sha1').update(raw).digest('hex');
    mkdirSync(join(gitDir, 'objects', sha.slice(0, 2)), { recursive: true });
    writeFileSync(join(gitDir, 'objects', sha.slice(0, 2), sha.slice(2)), deflateSync(raw));
    return sha;
  };
  /** A tree of one entry; `path` nests one tree per directory. */
  const tree = (path: string, blob: string): string =>
    path
      .split('/')
      .toReversed()
      .reduce((sha, name, i) => object('tree', Buffer.concat([Buffer.from(`${i === 0 ? '100644' : '40000'} ${name}\0`), Buffer.from(sha, 'hex')])), blob);
  const commits = new Map<string, string>();
  for (const { tag, dir, manifest } of TAGS) {
    const [path, text] = manifest ? [`packages/${dir}/package.json`, `${JSON.stringify(manifest, null, 2)}\n`] : ['README.md', `${tag}\n`];
    const who = 'lock <lock@example.com> 0 +0000';
    const commit = object('commit', Buffer.from(`tree ${tree(path, object('blob', Buffer.from(text)))}\nauthor ${who}\ncommitter ${who}\n\n${tag}\n`));
    commits.set(tag, commit);
  }
  for (const [alias, tag] of Object.entries(ALIASES)) commits.set(alias, commits.get(tag) as string);
  for (const [tag, commit] of commits) writeFileSync(join(gitDir, 'refs', 'tags', tag), `${commit}\n`);
  fixture = root;
  return root;
}

describe('historyOf — every release tag, read in one batch', () => {
  beforeAll(() => {
    repository();
  });

  it('reads each tag’s manifest, cutting each body by bytes so a non-ASCII description does not shift the next', () => {
    const history = historyOf(repository(), { name: 'pennant', dir: 'pennant' });
    expect(history.map((h) => [h.version, subpathsOf(h.manifest)])).toEqual([
      ['1.0.0', ['.']],
      ['1.0.4', ['.']],
      ['1.1.0', ['.', './picocolors']],
    ]);
  });

  it('reads a scoped package by its unscoped tag, and skips a tag whose tree has no manifest', () => {
    // The first tag's tree predates the manifest: no evidence either way, so it is left out.
    const root = repository();
    expect(historyOf(root, { name: '@scope/pkg', dir: 'pkg' }).map((h) => h.version)).toEqual(['1.0.1']);
    expect(historyOf(root, { name: '@scope/pkg', dir: 'elsewhere' }), 'no manifest at that path in any tag').toEqual([]);
  });

  it('ignores a tag that is not a plain version', () => {
    // `x@next` names the same commit as `x@1.0.0`, so only the name tells them apart.
    expect(historyOf(repository(), { name: 'x', dir: 'x' }).map((h) => h.version)).toEqual(['1.0.0']);
  });

  it('is empty where there is no repository at all', () => {
    expect(historyOf(scratchDir('family-versions-none-'), { name: 'x', dir: 'x' })).toEqual([]);
  });
});

/** `packages/<dir>/package.json` under `root`. */
function writeManifest(root: string, dir: string, manifest: object): void {
  mkdirSync(join(root, 'packages', dir), { recursive: true });
  writeFileSync(join(root, 'packages', dir, 'package.json'), JSON.stringify(manifest));
}

/**
 * A workspace of roundel (tagged at 1.0.4 and 1.1.0, or not), burgee, a private package, a
 * directory without a manifest and a stray file. Tagged, its `.git` is a file naming the
 * fixture's repository, as a linked worktree's is: the working tree is this case's own, the
 * tags are the fixture's, and making one writes no git at all.
 */
function workspace(withTags: boolean): string {
  const root = scratchDir(withTags ? 'family-versions-tagged-' : 'family-versions-tagless-');
  if (withTags) writeFileSync(join(root, '.git'), `gitdir: ${join(repository(), '.git')}\n`);
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
  beforeAll(() => {
    repository();
  });

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
    const root = scratchDir('family-versions-order-');
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
