/**
 * `vendor()` over a whole suite: the files it copies, rewrites, classifies and counts, and
 * the refs it will and will not hand to git.
 *
 * Every count here feeds a published denominator — a nested test the walk missed is five
 * cases nobody graded (`test/issues/`, 2026-09-09) — so the fixture is a suite with each
 * shape at once: top-level and nested tests, internal-only and mixed files, sibling helpers
 * named by their emitted extension, fixture trees, and directories that must stay behind.
 * The upstream is a throwaway local repo cloned over `file://`, and `npm view` is faked.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { type Host } from './hosts.js';
import { latestVersion } from './upstream.js';
import { classify, internalImports, keptPath, readSuiteDeps, rewriteAt, rootPackage, siblingImports, splitSpec, vendor } from './vendor.js';

// Every git call still runs for real; the spy only records what `vendor()` asked for.
vi.mock('node:child_process', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:child_process')>();
  return { ...real, execFileSync: vi.fn(real.execFileSync) };
});
vi.mock('./upstream.js', async (importOriginal) => ({ ...(await importOriginal<typeof import('./upstream.js')>()), latestVersion: vi.fn(() => '1.0.0') }));

const SUITE: Record<string, string> = {
  'package.json': '{"name":"fakehost","version":"1.0.0","license":"MIT","description":"a host"}\n',
  'index.js': 'module.exports = {};\n',
  // Public, with siblings: one on disk, one by its emitted `.js` name for a `.ts` file, one
  // that is a test itself, and one that does not exist.
  'test/a.test.js': "const host = require('../index.js');\nrequire('./helper.js');\nrequire('./util.js');\nrequire('./b.test.js');\nrequire('./missing.js');\nrequire('./data.json');\n",
  'test/data.json': '{"data":2}\n',
  'test/fixtures/deep/nested.js': "module.exports = require('../../../index.js');\n",
  // Internal-only: it reaches the host's own file layout and never its public entry.
  'test/b.test.js': "const core = require('../lib/core.js');\n",
  // Public (double-quoted) with an internal import on the side.
  'test/c.test.js': 'const host = require("../index.js");\nconst util = require(\'../lib/util.js\');\n',
  'test/helper.js': "module.exports = require('../index.js');\n",
  'test/util.ts': "export const util = require('../index.js');\n",
  'test/issues/d.test.js': "const deep = require('../../lib/deep.js');\n",
  'test/issues/e.test.js': "const host = require('../../index.js');\n",
  'test/fixtures/load.js': "module.exports = require('../../index.js');\n",
  // ink's fixtures are TSX programs the tests spawn: text, and rewritten like any other.
  'test/fixtures/app.tsx': "import {render} from '../../index.js';\n",
  'test/fixtures/plain.json': '{"a":1}\n',
  'test/fixtures/image.png': "require('../../index.js')",
  'test/.cache/x.test.js': "require('../index.js');\n",
  'test/lib/impl.js': 'module.exports = 1;\n',
};

const made: string[] = [];

afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A local upstream with the suite above committed and tagged `v1.0.0`. */
function upstream(files: Record<string, string> = SUITE): string {
  const repo = mkdtempSync(join(tmpdir(), 'vendor-run-upstream-'));
  made.push(repo);
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(join(repo, dirname(path)), { recursive: true });
    writeFileSync(join(repo, path), body);
  }
  const git = (...args: string[]): void => {
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false', ...args], { cwd: repo, stdio: 'ignore' });
  };
  git('init', '-q');
  git('add', '.');
  git('commit', '-q', '-m', 'fixture');
  git('tag', 'v1.0.0');
  return pathToFileURL(repo).href;
}

const hostAt = (repo: string, over: Partial<Host> = {}): Host => ({
  name: 'fakehost',
  repo,
  testDir: 'test',
  testGlob: '*.test.js',
  imports: [{ upstream: '../index.js', subpath: '', reexportDefault: false }],
  runner: 'node:test',
  target: 'fakehost-target',
  status: 'active',
  pinnedVersion: '1.0.0',
  ...over,
});

function into(): string {
  const dir = mkdtempSync(join(tmpdir(), 'vendor-run-into-'));
  made.push(dir);
  return dir;
}

const read = (...at: string[]): string => readFileSync(join(...at), 'utf8').replaceAll('\r\n', '\n');

describe('vendoring a whole suite', () => {
  it('counts top-level and nested tests, and names the internal-only ones and the internals they reach', () => {
    const dir = into();
    const result = vendor(hostAt(upstream()), dir);
    expect(result).toMatchObject({ host: 'fakehost', version: '1.0.0', tag: 'v1.0.0', files: 5, internalFiles: ['b.test.js', 'issues/d.test.js'], internals: ['lib/core.js', 'lib/deep.js', 'lib/util.js'], missingExtras: [] });
    expect(result.previous).toBeUndefined();
    expect(result.diff).toBeUndefined();
    expect(result.record.internalFiles).toEqual(['b.test.js', 'issues/d.test.js']);
  });

  it('never lists a public entry among the internals, though it sits where internals do', () => {
    // clack's shape: its public import `../src/index.js` also matches the internal pattern.
    const host = hostAt(upstream(), { imports: [{ upstream: '../index.js', subpath: '', reexportDefault: false }, { upstream: '../lib/util.js', subpath: '/util', reexportDefault: false }] });
    expect(vendor(host, into()).internals).toEqual(['lib/core.js', 'lib/deep.js']);
  });

  it('rewrites each public specifier as it reads from the file that holds it', () => {
    const dir = into();
    vendor(hostAt(upstream()), dir);
    const live = join(dir, 'fakehost');
    // A CommonJS package, so the shim is `.mjs`.
    expect(read(live, 'test', 'a.test.js')).toContain("require('../shim.mjs')");
    expect(read(live, 'test', 'c.test.js')).toContain('require("../shim.mjs")');
    expect(read(live, 'test', 'issues', 'e.test.js')).toBe("const host = require('../../shim.mjs');\n");
    expect(read(live, 'test', 'fixtures', 'load.js')).toBe("module.exports = require('../../shim.mjs');\n");
    expect(read(live, 'test', 'fixtures', 'deep', 'nested.js')).toBe("module.exports = require('../../../shim.mjs');\n");
    expect(read(live, 'test', 'fixtures', 'app.tsx')).toBe("import {render} from '../../shim.mjs';\n");
    // Not text, so not touched; and a text file with nothing to rewrite is left as it was.
    expect(read(live, 'test', 'fixtures', 'image.png')).toBe("require('../../index.js')");
    expect(read(live, 'test', 'fixtures', 'plain.json')).toBe('{"a":1}\n');
  });

  it('brings the siblings the tests import, by their emitted name, and nothing the glob already took or that is not there', () => {
    const dir = into();
    vendor(hostAt(upstream()), dir);
    const test = join(dir, 'fakehost', 'test');
    expect(read(test, 'helper.js')).toBe("module.exports = require('../shim.mjs');\n");
    expect(read(test, 'util.ts')).toBe("export const util = require('../shim.mjs');\n");
    // A sibling named with an extension other than `.js` is taken as spelled.
    expect(read(test, 'data.json')).toBe('{"data":2}\n');
    expect(existsSync(join(test, 'missing.js'))).toBe(false);
  });

  it('leaves dot-directories and the host’s own internal directory behind', () => {
    const dir = into();
    vendor(hostAt(upstream()), dir);
    expect(existsSync(join(dir, 'fakehost', 'test', '.cache'))).toBe(false);
    expect(existsSync(join(dir, 'fakehost', 'test', 'lib'))).toBe(false);
  });

  it('writes a root manifest with upstream’s description and a CommonJS type when it declares none', () => {
    const dir = into();
    vendor(hostAt(upstream()), dir);
    expect(JSON.parse(read(dir, 'fakehost', 'package.json'))).toEqual({ name: '@vendored/fakehost-suite', private: true, type: 'commonjs', main: './shim.mjs', version: '1.0.0', license: 'MIT', description: 'a host' });
  });

  it('diffs against the record it replaces', () => {
    const dir = into();
    const repo = upstream();
    vendor(hostAt(repo), dir);
    const again = vendor(hostAt(repo), dir);
    expect(again.previous?.version).toBe('1.0.0');
    expect(again.diff).toEqual({ files: { added: [], removed: [], changed: [] }, tests: { added: [], removed: [] }, surface: { added: [], removed: [] } });
  });

  it('asks npm for the release when the host pins none', () => {
    vi.mocked(latestVersion).mockClear();
    const { pinnedVersion: _, ...unpinned } = hostAt(upstream());
    expect(vendor({ ...unpinned, npmName: '@scope/fakehost' }, into()).version).toBe('1.0.0');
    expect(vi.mocked(latestVersion)).toHaveBeenCalledWith('@scope/fakehost');
    vendor(unpinned, into());
    expect(vi.mocked(latestVersion)).toHaveBeenLastCalledWith('fakehost');
  });
});

// #794's re-vendor deleted `vendor/exit-hook/node_modules/exit-hook/` and
// `vendor/wrap-ansi/.gitignore`: committed by hand, needed by the suites, and provided by no
// upstream release, so the staging swap replaced the directory without them.
describe('what the host keeps across a re-vendor', () => {
  it('carries every declared path from the suite it replaces, on the first re-vendor and every one after', () => {
    const dir = into();
    const host = hostAt(upstream(), { keep: ['.gitignore', 'node_modules/incumbent'] });
    vendor(host, dir);
    const live = join(dir, 'fakehost');
    writeFileSync(join(live, '.gitignore'), '!node_modules/\n');
    mkdirSync(join(live, 'node_modules', 'incumbent', 'lib'), { recursive: true });
    writeFileSync(join(live, 'node_modules', 'incumbent', 'lib', 'index.js'), 'export default 1;\n');

    vendor(host, dir);
    vendor(host, dir);

    expect(read(live, '.gitignore')).toBe('!node_modules/\n');
    expect(read(live, 'node_modules', 'incumbent', 'lib', 'index.js')).toBe('export default 1;\n');
    // The suite itself is still the freshly vendored one.
    expect(read(live, 'test', 'a.test.js')).toContain("require('../shim.mjs')");
  });

  it('drops what the host does not declare, so the list is the whole of what survives', () => {
    const dir = into();
    const host = hostAt(upstream(), { keep: ['.gitignore'] });
    vendor(host, dir);
    const live = join(dir, 'fakehost');
    writeFileSync(join(live, 'stray.js'), '1;\n');
    vendor(host, dir);
    expect(existsSync(join(live, 'stray.js'))).toBe(false);
  });

  it('prefers the committed copy over one the clone also produced', () => {
    const dir = into();
    const host = hostAt(upstream(), { keep: ['test/data.json'] });
    vendor(host, dir);
    writeFileSync(join(dir, 'fakehost', 'test', 'data.json'), '{"data":"ours"}\n');
    vendor(host, dir);
    expect(read(dir, 'fakehost', 'test', 'data.json')).toBe('{"data":"ours"}\n');
  });

  it('refuses an entry that is absolute, empty, or climbs out of the vendored directory', () => {
    for (const bad of ['', '/etc', '../yargs', 'a/../../b', 'a//b', './a', 'a\\b']) {
      expect(() => keptPath(bad), bad).toThrow('must be a relative posix path inside the vendored directory');
    }
    expect(keptPath('node_modules/exit-hook')).toBe(join('node_modules', 'exit-hook'));
  });
});

describe('the ref it clones', () => {
  it('falls back to HEAD, and records no tag, when the release was not tagged', () => {
    const result = vendor(hostAt(upstream(), { tagPrefix: 'release-' }), into());
    expect(result.tag).toBeNull();
    expect(result.commit).toMatch(/^[0-9a-f]{40}$/u);
    expect(result.files).toBe(5);
  });

  it('never hands git a ref that reads as an option, and refuses rather than cloning HEAD', () => {
    const repo = upstream();
    vi.mocked(execFileSync).mockClear();
    expect(() => vendor(hostAt(repo, { tagPrefix: '--upload-pack=touch /tmp/pwned;' }), into())).toThrow('refusing to pass "--upload-pack=touch /tmp/pwned;1.0.0" to git as a ref');
    const clones = vi.mocked(execFileSync).mock.calls.filter(([, args]) => (args as string[]).includes('clone'));
    expect(clones).toEqual([]);
  });

  // A monorepo tags each package by its npm name, so the tag opens with `@`. Refusing the
  // `@` read the release as untagged and vendored the default branch instead: clack's
  // `spinner-accessible.test.ts`, three commits past 1.8.1 and in no release, failed the
  // control 5 times against 1.8.1 itself (PR #794, 2026-10-05).
  it('clones a scoped tag, which opens with @, at the tag and not at HEAD', () => {
    const repo = upstream();
    const cwd = fileURLToPath(repo);
    const git = (...args: string[]): string => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false', ...args], { cwd, encoding: 'utf8' }).trim();
    git('tag', '@fake/host@1.0.0');
    const tagged = git('rev-parse', 'HEAD');
    git('commit', '-q', '--allow-empty', '-m', 'unreleased');
    const result = vendor(hostAt(repo, { tagPrefix: '@fake/host@' }), into());
    expect(result.tag).toBe('@fake/host@1.0.0');
    expect(result.commit).toBe(tagged);
  });
});

describe('the pieces vendor() is made of', () => {
  it('refuses an internal directory it has no pattern for', () => {
    expect(() => internalImports("require('../pkg/x.js')", 'pkg')).toThrow('no internal-import pattern for "pkg" — add one to INTERNAL_PATTERNS');
  });

  it('reads the internal and sibling paths a source names', () => {
    expect(internalImports("import x from '../../build/lib/y.js';\nrequire('../dist/cjs/index.js');", 'lib')).toEqual(['build/lib/y.js']);
    expect(internalImports("require('../dist/cjs/index.js');", 'dist')).toEqual(['dist/cjs/index.js']);
    expect(siblingImports("import a from './a.js';\nconst b = require('./b');\nrequire('../c.js');")).toEqual(['a.js', 'b']);
  });

  // boxen 9's every test file opens with `import './setup.js';` — a side-effect import, no
  // `from` — and the file it names fixes COLUMNS, chalk's level and the snapshot path. Missed,
  // every file failed to load and the control read 0 / 84 against boxen 9.0.0 itself.
  it('reads a side-effect import and a dynamic import of a sibling as well', () => {
    expect(siblingImports("import './setup.js';\nawait import('./later.js');\nimport x from './y.js';")).toEqual(['setup.js', 'later.js', 'y.js']);
  });

  it('calls a file with an internal import public when it also imports a public entry, in either quote', () => {
    const host = hostAt('file:///x');
    expect(classify("require('../lib/a.js');", host)).toBe('internal');
    expect(classify("require('../lib/a.js'); require('../index.js');", host)).toBe('public');
    expect(classify('require("../lib/a.js"); require("../index.js");', host)).toBe('public');
    expect(classify("require('../index.js');", host)).toBe('public');
  });

  it('rewrites a dots-only specifier only where it names the very module, not a deeper path of dots', () => {
    const host = hostAt('file:///x', { imports: [{ upstream: '..', subpath: '', reexportDefault: false }] });
    const out = rewriteAt("require('..');\nrequire('../..');\n", host, { fileDir: '/v/fakehost/test', hostDir: '/v/fakehost', packageType: 'commonjs' });
    expect(out).toBe("require('../shim.mjs');\nrequire('../..');\n");
  });

  it('writes a CommonJS root for an upstream that declares no type, and carries its description', () => {
    expect(rootPackage(hostAt('file:///x'), { description: 'CLI app helper' })).toEqual({ name: '@vendored/fakehost-suite', private: true, type: 'commonjs', main: './shim.mjs', description: 'CLI app helper' });
  });

  it('refuses a suite dependency with no pinned version', () => {
    expect(() => splitSpec('meow')).toThrow('suite dependency "meow" has no pinned version');
    expect(() => splitSpec('@clack/core')).toThrow('suite dependency "@clack/core" has no pinned version');
    expect(splitSpec('@clack/core@1.5.1')).toEqual(['@clack/core', '1.5.1']);
  });

  it('reads no suite dependencies from a directory with no manifest, or a manifest that declares none', () => {
    const dir = into();
    expect(readSuiteDeps(dir)).toEqual({});
    writeFileSync(join(dir, 'package.json'), '{"name":"x"}');
    expect(readSuiteDeps(dir)).toEqual({});
    writeFileSync(join(dir, 'package.json'), '{"devDependencies":{"a":"1.0.0"}}');
    expect(readSuiteDeps(dir)).toEqual({ a: '1.0.0' });
  });
});
