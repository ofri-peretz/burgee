/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * oxmutate platforms lock — the seven packages oxmutate ships as (PRINCIPLES rule 9,
 * `native-engine`: per-platform optional dependencies, no postinstall) stay one release.
 *
 * npm installs oxmutate, then exactly one `oxmutate-<platform>` whose `os`/`cpu`/`libc` match the
 * machine, and `src/native.ts` loads that package's `oxmutate.node`. Each way that silently breaks:
 * a platform package named other than `src/native.ts` asks for, one whose `os`/`cpu`/`libc` admit
 * the wrong machine (or none), a version that is not oxmutate's (the optional dependency then
 * resolves nothing and every install has no core), a published oxmutate whose optionalDependencies
 * miss a platform or pin another version, a package that ships more than its core, and a build
 * matrix that skips a platform or builds it for the wrong Rust target.
 *
 * Every rule is a function over a copy of packages/oxmutate, run on the real one (no problems) and
 * on a broken copy per rule (that rule's problem), so none of them can pass vacuously.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { load as loadYaml } from 'js-yaml';
import { describe, expect, it } from 'vitest';

import { plan, readWorkspace } from './release-order.mjs';
import { scratchDirs } from './scratch-dir.js';

/** Every scratch directory this file makes, removed after its last test (`scripts/scratch-dir.ts`). */
const scratchDir = scratchDirs();

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OXMUTATE = join(REPO_ROOT, 'packages', 'oxmutate');
const NATIVE_WORKFLOW = join(REPO_ROOT, '.github', 'workflows', 'oxmutate-native.yml');
const SYNC = join(OXMUTATE, 'scripts', 'sync-platform-versions.mjs');

interface Manifest {
  name?: string;
  version?: string;
  private?: boolean;
  os?: string[];
  cpu?: string[];
  libc?: string[];
  files?: string[];
  main?: string;
  optionalDependencies?: Record<string, string>;
  oxmutate?: { rustTarget?: string };
}

const readJson = (file: string): Manifest => JSON.parse(readFileSync(file, 'utf8')) as Manifest;
const writeJson = (file: string, value: unknown): void => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);

/** The platform directories under `<root>/npm`. */
const platformDirs = (root: string): string[] =>
  readdirSync(join(root, 'npm'), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .toSorted();

/** `darwin-arm64` → darwin/arm64, no libc; `linux-x64-gnu` → glibc; `linux-x64-musl` → musl; `-msvc` → none. */
const LIBC: Readonly<Record<string, string>> = { gnu: 'glibc', musl: 'musl' };

function expectedPlatform(dir: string): { os: string; cpu: string; libc?: string } {
  const [os = '', cpu = '', abi = ''] = dir.split('-');
  const libc = LIBC[abi];
  return libc === undefined ? { os, cpu } : { os, cpu, libc };
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** What is wrong with one platform manifest `m` in `npm/<dir>`, against its parent's version. */
function manifestProblems(dir: string, m: Manifest, version: string | undefined): string[] {
  const want = expectedPlatform(dir);
  const wantLibc = want.libc === undefined ? undefined : [want.libc];
  const checks: [boolean, string][] = [
    [m.name === `oxmutate-${dir}`, `name is ${String(m.name)}, not oxmutate-${dir}`],
    [same(m.os, [want.os]), `os is ${JSON.stringify(m.os)}, not ["${want.os}"]`],
    [same(m.cpu, [want.cpu]), `cpu is ${JSON.stringify(m.cpu)}, not ["${want.cpu}"]`],
    [same(m.libc, wantLibc), `libc is ${JSON.stringify(m.libc)}, not ${wantLibc === undefined ? 'absent' : JSON.stringify(wantLibc)}`],
    [m.version === version, `version is ${String(m.version)}, not oxmutate's ${String(version)}`],
    [same(m.files, ['oxmutate.node']), `files is ${JSON.stringify(m.files)}, not ["oxmutate.node"]`],
    [m.main === 'oxmutate.node', `main is ${String(m.main)}, not oxmutate.node (src/native.ts resolves the package to it)`],
  ];
  return checks.filter(([ok]) => !ok).map(([, why]) => `npm/${dir}: ${why}`);
}

/**
 * What is wrong with oxmutate at `root` and its platform packages. `published`: check the
 * manifest npm receives (after `sync-platform-versions.mjs --publish`), whose optionalDependencies
 * must list exactly the platform packages; otherwise the committed one, which lists none or exactly them.
 */
export function platformProblems(root: string, { published }: { published: boolean }): string[] {
  const parent = readJson(join(root, 'package.json'));
  const dirs = platformDirs(root);
  const problems: string[] = dirs.length === 0 ? ['no platform package under npm/'] : [];
  const expectedOptional: Record<string, string> = {};
  for (const dir of dirs) {
    const file = join(root, 'npm', dir, 'package.json');
    if (existsSync(file)) problems.push(...manifestProblems(dir, readJson(file), parent.version));
    else problems.push(`npm/${dir}: no package.json`);
    expectedOptional[`oxmutate-${dir}`] = parent.version ?? '';
  }
  const optional = parent.optionalDependencies;
  const exact = JSON.stringify(Object.entries(optional ?? {}).toSorted()) === JSON.stringify(Object.entries(expectedOptional).toSorted());
  if (published ? !exact : optional !== undefined && !exact)
    problems.push(`oxmutate's optionalDependencies are ${JSON.stringify(optional)}, not exactly ${JSON.stringify(expectedOptional)}`);
  return problems;
}

interface MatrixRow {
  platform?: string;
  target?: string;
}

/** What is wrong with the native build matrix against the platform packages at `root`. */
export function matrixProblems(root: string, workflowText: string): string[] {
  const wf = loadYaml(workflowText) as { jobs?: Record<string, { strategy?: { matrix?: { include?: MatrixRow[] } } }> };
  const rows = Object.values(wf.jobs ?? {}).flatMap((j) => j.strategy?.matrix?.include ?? []);
  const dirs = platformDirs(root);
  const problems: string[] = [];
  const listed = rows.map((r) => r.platform ?? '').toSorted();
  if (JSON.stringify(listed) !== JSON.stringify(dirs)) problems.push(`oxmutate-native.yml builds ${JSON.stringify(listed)}, not exactly npm/: ${JSON.stringify(dirs)}`);
  for (const r of rows) {
    const file = join(root, 'npm', r.platform ?? '', 'package.json');
    if (!existsSync(file)) continue;
    const target = readJson(file).oxmutate?.rustTarget;
    if (r.target !== target) problems.push(`oxmutate-native.yml builds ${String(r.platform)} for ${String(r.target)}, but its package says rustTarget ${String(target)}`);
  }
  return problems;
}

/** A scratch copy of packages/oxmutate's manifest and platform packages. */
function copy(): string {
  const root = scratchDir('oxmutate-platforms-');
  writeFileSync(join(root, 'package.json'), readFileSync(join(OXMUTATE, 'package.json')));
  for (const dir of platformDirs(OXMUTATE)) {
    mkdirSync(join(root, 'npm', dir), { recursive: true });
    cpSync(join(OXMUTATE, 'npm', dir, 'package.json'), join(root, 'npm', dir, 'package.json'));
  }
  return root;
}

/** Edit one platform manifest of a copy. */
function breakPlatform(root: string, dir: string, edit: (m: Manifest & Record<string, unknown>) => void): void {
  const file = join(root, 'npm', dir, 'package.json');
  const m = readJson(file) as Manifest & Record<string, unknown>;
  edit(m);
  writeJson(file, m);
}

const sync = (root: string, ...args: string[]) => {
  const r = spawnSync(process.execPath, [SYNC, '--root', root, ...args], { encoding: 'utf8' });
  return { status: r.status ?? -1, output: `${r.stdout ?? ''}${r.stderr ?? ''}` };
};

/** The manifest the release job would publish: a copy, after `--publish`. */
function publishedCopy(): string {
  const root = copy();
  const r = sync(root, '--publish');
  if (r.status !== 0) throw new Error(`sync-platform-versions --publish failed: ${r.output}`);
  return root;
}

describe('the real oxmutate and its platform packages', () => {
  it('has the six platform packages napi-rs names', () => {
    expect(platformDirs(OXMUTATE)).toEqual(['darwin-arm64', 'darwin-x64', 'linux-arm64-gnu', 'linux-x64-gnu', 'linux-x64-musl', 'win32-x64-msvc']);
  });

  it('holds every rule as committed', () => {
    expect(platformProblems(OXMUTATE, { published: false })).toEqual([]);
  });

  it('holds every rule as published — optionalDependencies list exactly the six, at its version', () => {
    const root = publishedCopy();
    expect(platformProblems(root, { published: true })).toEqual([]);
    const m = readJson(join(root, 'package.json'));
    expect(Object.keys(m.optionalDependencies ?? {})).toHaveLength(6);
    expect(new Set(Object.values(m.optionalDependencies ?? {}))).toEqual(new Set([readJson(join(OXMUTATE, 'package.json')).version]));
  });

  it('builds every platform package, each for its own Rust target', () => {
    expect(matrixProblems(OXMUTATE, readFileSync(NATIVE_WORKFLOW, 'utf8'))).toEqual([]);
  });

  it('ignores the built cores in git', () => {
    const r = spawnSync('git', ['check-ignore', '-q', 'packages/oxmutate/npm/darwin-arm64/oxmutate.node'], { cwd: REPO_ROOT });
    expect(r.status).toBe(0);
  });
});

/** The problems the lock finds in `root`, one per line. */
const only = (root: string, published = false): string => platformProblems(root, { published }).join('\n');

describe('each rule fails on a broken copy', () => {
  it('a platform dir with no package.json', () => {
    const root = copy();
    mkdirSync(join(root, 'npm', 'freebsd-x64'));
    expect(only(root)).toMatch(/npm\/freebsd-x64: no package\.json/);
  });

  it('a name that is not oxmutate-<dir>', () => {
    const root = copy();
    breakPlatform(root, 'darwin-arm64', (m) => (m.name = '@oxmutate/binding-darwin-arm64'));
    expect(only(root)).toMatch(/npm\/darwin-arm64: name is @oxmutate\/binding-darwin-arm64, not oxmutate-darwin-arm64/);
  });

  it('an os that does not match the dir', () => {
    const root = copy();
    breakPlatform(root, 'win32-x64-msvc', (m) => (m.os = ['linux']));
    expect(only(root)).toMatch(/npm\/win32-x64-msvc: os is \["linux"\], not \["win32"\]/);
  });

  it('a cpu that does not match the dir', () => {
    const root = copy();
    breakPlatform(root, 'darwin-x64', (m) => (m.cpu = ['arm64']));
    expect(only(root)).toMatch(/npm\/darwin-x64: cpu is \["arm64"\], not \["x64"\]/);
  });

  it('a libc that does not match the dir, a missing one, and one where none belongs', () => {
    const root = copy();
    breakPlatform(root, 'linux-x64-musl', (m) => (m.libc = ['glibc']));
    breakPlatform(root, 'linux-arm64-gnu', (m) => delete m.libc);
    breakPlatform(root, 'darwin-arm64', (m) => (m.libc = ['glibc']));
    const out = only(root);
    expect(out).toMatch(/npm\/linux-x64-musl: libc is \["glibc"\], not \["musl"\]/);
    expect(out).toMatch(/npm\/linux-arm64-gnu: libc is undefined, not \["glibc"\]/);
    expect(out).toMatch(/npm\/darwin-arm64: libc is \["glibc"\], not absent/);
  });

  it("a version that is not oxmutate's", () => {
    const root = copy();
    breakPlatform(root, 'linux-x64-gnu', (m) => (m.version = '0.0.9'));
    expect(only(root)).toMatch(/npm\/linux-x64-gnu: version is 0\.0\.9, not oxmutate's/);
  });

  it('files other than ["oxmutate.node"]', () => {
    const root = copy();
    breakPlatform(root, 'darwin-arm64', (m) => (m.files = ['oxmutate.node', 'src']));
    expect(only(root)).toMatch(/npm\/darwin-arm64: files is \["oxmutate\.node","src"\], not \["oxmutate\.node"\]/);
  });

  it('a main other than oxmutate.node', () => {
    const root = copy();
    breakPlatform(root, 'darwin-arm64', (m) => (m.main = 'index.js'));
    expect(only(root)).toMatch(/npm\/darwin-arm64: main is index\.js/);
  });

  it('a published oxmutate missing a platform, pinning another version, or naming an extra one', () => {
    const missing = publishedCopy();
    const m = readJson(join(missing, 'package.json'));
    delete m.optionalDependencies?.['oxmutate-linux-x64-musl'];
    writeJson(join(missing, 'package.json'), m);
    expect(only(missing, true)).toMatch(/optionalDependencies are .* not exactly/);

    const pinned = publishedCopy();
    const p = readJson(join(pinned, 'package.json'));
    p.optionalDependencies = { ...p.optionalDependencies, 'oxmutate-darwin-arm64': '^0.1.0' };
    writeJson(join(pinned, 'package.json'), p);
    expect(only(pinned, true)).toMatch(/optionalDependencies are .* not exactly/);

    const extra = publishedCopy();
    const e = readJson(join(extra, 'package.json'));
    e.optionalDependencies = { ...e.optionalDependencies, 'oxmutate-freebsd-x64': e.version ?? '' };
    writeJson(join(extra, 'package.json'), e);
    expect(only(extra, true)).toMatch(/optionalDependencies are .* not exactly/);
  });

  it('a published oxmutate with no optionalDependencies at all', () => {
    expect(only(copy(), true)).toMatch(/optionalDependencies are undefined, not exactly/);
  });

  it('a build matrix that skips a platform, or builds one for the wrong target', () => {
    const text = readFileSync(NATIVE_WORKFLOW, 'utf8');
    const skipped = text.replace(/\n {10}- platform: linux-x64-musl\n(?: {12}.*\n)+/, '\n');
    expect(skipped).not.toBe(text);
    expect(matrixProblems(OXMUTATE, skipped).join('\n')).toMatch(/builds .* not exactly npm\//);
    const wrong = text.replace('target: x86_64-unknown-linux-musl', 'target: x86_64-unknown-linux-gnu');
    expect(matrixProblems(OXMUTATE, wrong).join('\n')).toMatch(/builds linux-x64-musl for x86_64-unknown-linux-gnu, but its package says rustTarget x86_64-unknown-linux-musl/);
  });
});

describe('sync-platform-versions.mjs keeps the seven in step', () => {
  it('--check names each platform package out of step, and writes nothing', () => {
    const root = copy();
    breakPlatform(root, 'darwin-x64', (m) => (m.version = '0.0.9'));
    const r = sync(root, '--check');
    expect(r.status).toBe(1);
    expect(r.output).toMatch(/npm\/darwin-x64\/package\.json is oxmutate-darwin-x64@0\.0\.9/);
    expect(readJson(join(root, 'npm', 'darwin-x64', 'package.json')).version).toBe('0.0.9');
  });

  it('with no flag, moves every platform package to oxmutate\'s version (what the Version PR runs)', () => {
    const root = copy();
    const m = readJson(join(root, 'package.json'));
    writeJson(join(root, 'package.json'), { ...m, version: '0.2.0' });
    expect(only(root)).toMatch(/version is .*, not oxmutate's 0\.2\.0/);
    expect(sync(root).status).toBe(0);
    expect(platformProblems(root, { published: false })).toEqual([]);
    expect(readJson(join(root, 'package.json')).optionalDependencies, 'optionalDependencies are written only by --publish').toBeUndefined();
  });

  it('--publish refuses a platform package out of step, and writes no optionalDependencies', () => {
    const root = copy();
    breakPlatform(root, 'win32-x64-msvc', (m) => (m.version = '0.0.9'));
    const r = sync(root, '--publish');
    expect(r.status).toBe(1);
    expect(readJson(join(root, 'package.json')).optionalDependencies).toBeUndefined();
  });
});

/** A workspace with oxmutate (private or not) and two platform packages. */
function workspace(isPrivate: boolean): string {
  const root = scratchDir('oxmutate-order-');
  const write = (dir: string, manifest: object) => {
    mkdirSync(join(root, 'packages', dir), { recursive: true });
    writeFileSync(join(root, 'packages', dir, 'package.json'), JSON.stringify(manifest));
  };
  write('burgee', { name: 'burgee', version: '1.0.0' });
  write('oxmutate', { name: 'oxmutate', version: '0.1.0', private: isPrivate, dependencies: { burgee: '*' } });
  write('oxmutate/npm/darwin-arm64', { name: 'oxmutate-darwin-arm64', version: '0.1.0' });
  write('oxmutate/npm/linux-x64-gnu', { name: 'oxmutate-linux-x64-gnu', version: '0.1.0' });
  return root;
}

describe('release-order.mts publishes the platform packages before oxmutate', () => {
  it('orders them first, marks them, and makes oxmutate wait for them', () => {
    const rows = plan(readWorkspace(workspace(false)));
    const names = rows.map((r) => r.name);
    expect(names.indexOf('oxmutate')).toBeGreaterThan(names.indexOf('oxmutate-darwin-arm64'));
    expect(names.indexOf('oxmutate')).toBeGreaterThan(names.indexOf('oxmutate-linux-x64-gnu'));
    expect(rows.find((r) => r.name === 'oxmutate-darwin-arm64')).toMatchObject({ dir: 'oxmutate/npm/darwin-arm64', platformOf: 'oxmutate' });
    expect(rows.find((r) => r.name === 'oxmutate')?.deps.map((d) => `${d.name}@${d.version}`)).toEqual(['burgee@1.0.0', 'oxmutate-darwin-arm64@0.1.0', 'oxmutate-linux-x64-gnu@0.1.0']);
    expect(rows.find((r) => r.name === 'burgee')).not.toHaveProperty('platformOf');
  });

  it('publishes none of them while oxmutate is private', () => {
    expect(plan(readWorkspace(workspace(true))).map((r) => r.name)).toEqual(['burgee']);
  });

  it('on the real workspace, matches what oxmutate\'s package.json says', () => {
    const real = readWorkspace(REPO_ROOT);
    const ox = real.find((p) => p.name === 'oxmutate');
    const platforms = real.filter((p) => p.platformOf === 'oxmutate');
    expect(platforms.map((p) => p.name).toSorted()).toEqual(platformDirs(OXMUTATE).map((d) => `oxmutate-${d}`));
    for (const p of platforms) expect(p.private, `${p.name} must ship exactly when oxmutate does`).toBe(ox?.private);
  });
});
