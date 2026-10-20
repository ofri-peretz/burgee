/**
 * The vendor step's two specifier rules, proven red first (rule 4): a bare public
 * specifier (`yargs-parser`) is rewritten literally, not as a path relative to the test
 * dir; and the vendored root is a package a CJS fixture can `require('../../')` — with
 * the upstream's own `version`, `license` and `repository`, because the suites read them.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import { HOSTS, type Host } from './hosts.js';
import { DEPS_MARGIN_MS, depsCutoff, rewriteAt, rootPackage, shimName, splitSpec, vendor } from './vendor.js';

const VENDOR_DIR = resolve(fileURLToPath(new URL('..', import.meta.url)), 'vendor');

const yargs = HOSTS.find((h) => h.name === 'yargs') as Host;
const commander = HOSTS.find((h) => h.name === 'commander') as Host;

describe('rewriting public specifiers', () => {
  it('rewrites a relative specifier as it reads from the file that holds it', () => {
    const out = rewriteAt("import yargs from '../index.mjs';", yargs, { fileDir: '/v/yargs/test', hostDir: '/v/yargs' });
    expect(out).toBe("import yargs from '../shim.js';");
  });

  it('rewrites a bare specifier literally, wherever the file sits', () => {
    const out = rewriteAt("import * as parser from 'yargs-parser';", yargs, { fileDir: '/v/yargs/test/esm', hostDir: '/v/yargs' });
    expect(out).toBe("import * as parser from '../../shim-2.js';");
  });

  it("rewrites a dots-only specifier where a module is named, and leaves the same dots in a path alone (node-which)", () => {
    const which = HOSTS.find((h) => h.name === 'which') as Host;
    const source = ["const which = t.mock('..', mocks)", "const rel = join('..', dir, name)", "const again = require('..')"].join('\n');
    const out = rewriteAt(source, which, { fileDir: '/v/which/test', hostDir: '/v/which', packageType: 'commonjs' });
    expect(out).toContain("t.mock('../shim.cjs', mocks)");
    expect(out).toContain("require('../shim.cjs')");
    // The path computation is a path, not an import: rewriting it failed a case against node-which itself.
    expect(out).toContain("join('..', dir, name)");
  });

  it('rewrites a `namedOnly` bare specifier where a module is named, and leaves the same word as a value alone (execa)', () => {
    const execa = HOSTS.find((h) => h.name === 'execa') as Host;
    const source = ["import {getCancelSignal, sendMessage} from 'execa';", "const {all} = await execaMethod('verbose-script.js', {env: {NODE_DEBUG: 'execa'}, all: true});", "const again = await import('execa');"].join('\n');
    const out = rewriteAt(source, execa, { fileDir: '/v/execa/test/fixtures', hostDir: '/v/execa' });
    expect(out).toContain("from '../../shim-1.js';");
    expect(out).toContain("import('../../shim-1.js')");
    // A value, not an import: rewriting it set NODE_DEBUG to a shim path and failed three of info.js's fifteen cases against execa itself.
    expect(out).toContain("NODE_DEBUG: 'execa'");
  });
});

describe('the vendored root package', () => {
  it('is a package a CJS fixture can require by directory, carrying the fields the suites read', () => {
    const pkg = rootPackage(commander, { version: '15.0.0', license: 'MIT', repository: { type: 'git', url: 'x' }, type: 'commonjs' });
    expect(pkg).toMatchObject({ name: '@vendored/commander-suite', private: true, main: './shim.mjs', version: '15.0.0', license: 'MIT', repository: { type: 'git' } });
  });

  /**
   * The shim is always ESM. Under `type: module` a `.js` file already is; under
   * `type: commonjs` it is parsed as CommonJS and the shim is a syntax error — which is how
   * cli-table3's suite scored 0 / 7 before this rule existed. `main` and the specifier the
   * vendor step rewrites into the tests are built from the same function, so they cannot
   * disagree about which file they mean.
   */
  it('names the shim so its extension says it is ESM, whatever the package type', () => {
    expect(shimName(0, 'module')).toBe('shim.js');
    expect(shimName(0, 'commonjs')).toBe('shim.mjs');
    expect(shimName(0, undefined)).toBe('shim.mjs');
    expect(shimName(2, 'module')).toBe('shim-2.js');
    expect(shimName(2, 'commonjs')).toBe('shim-2.mjs');
  });

  it("names a host's CommonJS shim .cjs whatever the package type (signal-exit)", () => {
    expect(shimName(0, 'module', 'cjs')).toBe('shim.cjs');
    expect(shimName(1, 'commonjs', 'cjs')).toBe('shim-1.cjs');
  });

  it('points main at the very shim it names', () => {
    expect(rootPackage(yargs, { type: 'module' }).main).toBe(`./${shimName(0, 'module')}`);
    expect(rootPackage(commander, { type: 'commonjs' }).main).toBe(`./${shimName(0, 'commonjs')}`);
  });

  it('keeps the upstream module type and never its name', () => {
    const pkg = rootPackage(yargs, { name: 'yargs', type: 'module' });
    expect(pkg.type).toBe('module');
    expect(pkg.name).toBe('@vendored/yargs-suite');
    expect(pkg).not.toHaveProperty('exports');
  });

  /**
   * The one declared exception: dotenv 18's spawned programs name `dotenv` from the repo root,
   * where upstream answers by self-reference. The vendored root takes the incumbent's name and
   * an exports map of the per-run entries, so the name reaches whatever the run grades.
   */
  it('takes the incumbent’s own name and an exports map for a host that declares `selfExports`', () => {
    const dotenv = HOSTS.find((h) => h.name === 'dotenv') as Host;
    const pkg = rootPackage(dotenv, { name: 'dotenv', type: 'commonjs' });
    expect(pkg.name).toBe('dotenv');
    expect(pkg.exports).toEqual({ '.': './dist/index.cjs', './config': './dist/config.cjs', './config.js': './dist/config.cjs' });
    expect(rootPackage({ ...dotenv, npmName: 'scoped-dotenv' }, { type: 'commonjs' }).name).toBe('scoped-dotenv');
  });

  it('points every self-export at an entry the run writes', () => {
    for (const h of HOSTS.filter((x) => x.selfExports !== undefined)) {
      const written = new Set((h.entries ?? []).map((e) => `./${e.at}`));
      expect(Object.values(h.selfExports ?? {}).filter((at) => !written.has(at))).toEqual([]);
    }
  });

  /**
   * Red before `avaConfig` existed: `rootPackage` wrote name, type, main, version, license
   * and repository and nothing else, so `terminal-link`'s `ava: { serial: true }` was
   * dropped on the floor. ava reads its config from the nearest `package.json` above its
   * cwd, and the run's cwd is this directory, so the setting is lost precisely where it is
   * needed — and the failure is silent: ten cases that mutate one shared module object run
   * concurrently and the rate reads the interleaving.
   *
   * Asserted off the vendored file on disk as well as off the function, because those are
   * two different claims: the second is that the directory a run actually reads carries it.
   */
  it("carries the host's own ava configuration, which ava reads from the manifest and nowhere else", () => {
    const terminalLink = HOSTS.find((h) => h.name === 'terminal-link') as Host;
    expect(rootPackage(terminalLink, { version: '5.0.0', type: 'module' })['ava']).toEqual({ serial: true });
    // A host that declares none gets no key at all, so every directory vendored before this
    // field existed still reproduces byte for byte.
    expect(rootPackage(commander, { type: 'commonjs' })['ava']).toBeUndefined();
  });

  it.each(HOSTS.filter((h) => h.avaConfig !== undefined).map((h) => [h.name, h] as const))(
    "%s's vendored manifest on disk carries it too",
    (name, host) => {
      const at = join(VENDOR_DIR, name, 'package.json');
      if (!existsSync(at)) return;
      expect((JSON.parse(readFileSync(at, 'utf8')) as Record<string, unknown>)['ava']).toEqual(host.avaConfig);
    },
  );
});

/**
 * The monorepo rules, each proven red against the code that shipped before it (rule 4).
 *
 * `@clack/prompts` and `@inquirer/core` are the first hosts whose repository is not their
 * package. Every one of these failed on the unfixed state, and each failure showed up as a
 * wrong *number* rather than a crash — which is the only kind this oracle cannot afford.
 */
describe('a host whose repository is a monorepo', () => {
  const clack = HOSTS.find((h) => h.name === 'clack') as Host;
  const inquirerCore = HOSTS.find((h) => h.name === 'inquirer-core') as Host;

  it('carries its suite-local dependencies into the vendored manifest, not into this workspace', () => {
    // Red before: `rootPackage` dropped `suiteDeps`, so the vendored directory declared
    // nothing, the install beside the tests installed nothing, and the control re-exported
    // a package that was not there — 0 passing, printed as an incompatibility.
    const pkg = rootPackage(clack, { version: '1.8.1', license: 'MIT', type: 'module' });
    expect(pkg['devDependencies']).toMatchObject({ '@clack/prompts': '1.8.1', '@clack/core': '1.5.1' });
  });

  it('pins every suite dependency exactly, because the suite is graded against one release', () => {
    // A range here is a number that moves under you. `vitest-ansi-serializer` at `^0.1.2`
    // resolves to 0.3.1 today, whose rendering differs from the committed snapshots:
    // measured 2026-09-14, clack's control read 40 / 606 on 0.3.1 and 576 / 606 on 0.1.2.
    // Same suite, same package, same afternoon — the difference was a caret.
    for (const host of HOSTS) {
      for (const spec of host.suiteDeps ?? []) {
        const [name, version] = splitSpec(spec);
        expect(/^\d+\.\d+\.\d+/.test(version), `${host.name}: ${name} is pinned as "${version}"`).toBe(true);
      }
    }
  });

  it('pins each prompt package @inquirer/prompts re-exports, not only the package itself', () => {
    // An exact pin on `@inquirer/prompts` holds nothing beneath it: 8.7.3 asks for its ten
    // prompts by caret. On 2026-10-19 they were re-released against `@inquirer/core@^12.0.5`,
    // a second core landed under each one beside the pinned 12.0.4, and checkbox's
    // `toBeInstanceOf(ValidationError)` failed the control, 212 / 213, with no change here.
    const prompts = HOSTS.find((h) => h.name === 'inquirer-prompts') as Host;
    const pinned = new Set((prompts.suiteDeps ?? []).map((spec) => splitSpec(spec)[0]));
    const graded = prompts.imports.flatMap((i) => /^\.\/(\w+)\/src\/index\.ts$/.exec(i.upstream)?.slice(1) ?? []);
    expect(graded).toHaveLength(10);
    expect(graded.map((p) => `@inquirer/${p}`).filter((name) => !pinned.has(name))).toEqual([]);
  });

  it('names the npm package separately from the directory key', () => {
    // Red before: there was no `npmName`, so the release lookup asked npm about a package
    // called "clack" and the control re-exported that same name. Neither throws — the first
    // answers with an unrelated package's version, the second with a resolution error that
    // reads as a suite full of failures.
    expect(clack.npmName).toBe('@clack/prompts');
    expect(inquirerCore.npmName).toBe('@inquirer/core');
    for (const host of HOSTS) {
      const key = host.npmName ?? host.name;
      expect(key.includes('/') ? host.npmName : key, `${host.name}: a scoped package needs npmName`).toBeDefined();
    }
  });

  it('files its tests under the sub-package it declares', () => {
    // `packageDir` is what the internal shims and vitest's root are anchored at, so a
    // `testDir` outside it would put both somewhere the suite never looks.
    for (const host of HOSTS.filter((h) => h.packageDir !== undefined)) {
      expect(host.testDir.startsWith(host.packageDir ?? ''), `${host.name}: testDir is outside packageDir`).toBe(true);
    }
  });

  it('never counts the host’s own public entry as an internal module', () => {
    // clack's public import is `../src/index.js`, which also matches the `src/` internal
    // pattern. Before `internalsOnly` the record listed `src/index.js` among the internals,
    // and the runner wrote a shim over the very path the rewrite had already redirected.
    const record = JSON.parse(readFileSync(join(VENDOR_DIR, 'clack', '.source.json'), 'utf8')) as { internals: string[] };
    expect(record.internals).not.toContain('src/index.js');
    expect(record.internals).toEqual(['src/autocomplete.js', 'src/common.js']);
  });

  it('vendors the sibling helper a TypeScript suite names by its emitted extension', () => {
    // Every one of clack's nineteen files imports `./test-utils.js`, and the file on disk is
    // `test-utils.ts` — nodenext spelling. Taking the specifier literally vendored nothing
    // and all nineteen failed to load, which reads as a compatibility number.
    expect(existsSync(join(VENDOR_DIR, 'clack', 'packages', 'prompts', 'test', 'test-utils.ts'))).toBe(true);
  });
});

/**
 * The two ways a re-vendor run damaged the tree on 2026-09-21, each pinned so it cannot
 * happen twice. Both are about the same thing: a vendor step that acts before it knows it
 * can finish.
 *
 * Proven red before green — each assertion was run against the previous implementation:
 *   1. `pinnedVersion` absent from `Host` entirely: slice-ansi vendored at whatever `npm
 *      view` returned, which was 9.0.1 against a 7.1.2 control.
 *   2. `vendor()` beginning with `rmSync(join(into, host.name))`: a run producing no test
 *      files left the host with no `.source.json`, no `package.json` and no suite, which is
 *      how `dotenv` lost 141 graded cases and reported "no test files vendored".
 */
/**
 * slice-ansi's shape at its pinned tag, in a throwaway local repo. `vendor()` is what these
 * cases test, not GitHub: cloning the real upstream made the required gate fail whenever the
 * network did (run 35962708764, `git clone` exit 128 after ~40 s). `host.repo` is the URL the
 * clone reads, so a `file://` one exercises the same `git clone --depth 1 --branch` path.
 */
function localSliceAnsi(files: Record<string, string> = {}): Host {
  const host = HOSTS.find((h) => h.name === 'slice-ansi');
  if (host === undefined) throw new Error('slice-ansi is not a host');
  const repo = mkdtempSync(join(tmpdir(), 'vendor-upstream-'));
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(join(repo, dirname(path)), { recursive: true });
    writeFileSync(join(repo, path), body);
  }
  const version = host.pinnedVersion ?? '';
  writeFileSync(join(repo, 'package.json'), `{"name":"slice-ansi","version":"${version}","type":"module","license":"MIT"}\n`);
  writeFileSync(join(repo, 'index.js'), 'export default function sliceAnsi(s, a, b) { return s.slice(a, b); }\n');
  writeFileSync(join(repo, 'index.d.ts'), 'export default function sliceAnsi(s: string, a: number, b?: number): string;\n');
  writeFileSync(join(repo, 'test.js'), "import test from 'ava';\nimport sliceAnsi from './index.js';\n\ntest('slices', (t) => {\n  t.is(sliceAnsi('abc', 1), 'bc');\n});\n");
  const git = (...args: string[]): void => {
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false', ...args], { cwd: repo, stdio: 'ignore' });
  };
  git('init', '-q');
  git('add', '.');
  git('commit', '-q', '-m', 'fixture');
  git('tag', `v${version}`);
  return { ...host, repo: pathToFileURL(repo).href };
}

describe('a vendor run that cannot finish', () => {
  it('takes its version from the host pin rather than from npm', () => {
    const sliceAnsi = HOSTS.find((h) => h.name === 'slice-ansi');
    expect(sliceAnsi?.pinnedVersion, 'slice-ansi is pinned in prose; the pin has to be a field vendor() can read').toBeDefined();
  });

  it('pins slice-ansi to the release the workspace installs, which is the one its control grades', () => {
    // The pin is only right while it names the installed release: the control run grades
    // the vendored suite against `node_modules/slice-ansi`. burgee#317 moved both, 7.1.2 to
    // 9.0.1; bumping the root manifest without the pin — or the pin without the manifest —
    // grades one major's suite against another's package, and this is what says so.
    const sliceAnsi = HOSTS.find((h) => h.name === 'slice-ansi');
    const installed = JSON.parse(readFileSync(resolve(VENDOR_DIR, '..', '..', '..', 'node_modules', 'slice-ansi', 'package.json'), 'utf8')) as { version: string };
    expect(sliceAnsi?.pinnedVersion).toBe(installed.version);
  });

  it('writes PROVENANCE beside the record, so `compat --vendor` cannot delete it', () => {
    // `scripts/vendor-suite.ts` was the only writer of PROVENANCE, and `vendor()` replaces
    // the host directory wholesale — so re-vendoring through the oracle removed a file
    // `provenance.test.ts` requires, and blamed the host. The clone here is the same local
    // fixture the refusal case below makes, for the same reason: this is the function under test.
    const into = mkdtempSync(join(tmpdir(), 'vendor-provenance-'));
    const host = localSliceAnsi();
    vendor(host, into);
    const live = join(into, host.name);
    expect(existsSync(join(live, '.source.json'))).toBe(true);
    expect(existsSync(join(live, 'PROVENANCE')), 'vendor() wrote the record and not the provenance').toBe(true);
    expect(readFileSync(join(live, 'PROVENANCE'), 'utf8')).toContain(host.pinnedVersion ?? '?');
    rmSync(into, { recursive: true, force: true });
    rmSync(fileURLToPath(host.repo), { recursive: true, force: true });
  });

  it('leaves the previous suite standing when it produces nothing', () => {
    const into = mkdtempSync(join(tmpdir(), 'vendor-refusal-'));
    const host = localSliceAnsi();
    const live = join(into, host.name);
    mkdirSync(live, { recursive: true });
    writeFileSync(join(live, '.source.json'), `{"version":"${host.pinnedVersion ?? ''}"}`);
    writeFileSync(join(live, 'test.js'), '// the suite that was already here');

    // A glob that matches nothing — the shape `dotenv` hit, where the clone succeeds and
    // the copy yields no graded file. The question is what survives.
    expect(() => vendor({ ...host, testGlob: 'no-such-file-*.js' }, into)).toThrow(/produced no test files/u);
    expect(existsSync(join(live, '.source.json')), 'the previous record was deleted by a failed run').toBe(true);
    expect(readFileSync(join(live, 'test.js'), 'utf8')).toContain('already here');
    rmSync(into, { recursive: true, force: true });
    rmSync(fileURLToPath(host.repo), { recursive: true, force: true });
  });

  it('skips an `extraDirs` fixture the release no longer ships, and says which', () => {
    // dotenv 18 deleted `tests/.env.vault` with the vault support that read it (upstream
    // 4bb2dbd). The host still names it, correctly, because the vendored 17.4.2 suite needs
    // it — so the upstream check's scratch vendor of 18.x hit `cpSync` ENOENT and took the
    // whole daily job down with it (run 36317870604), before a single issue was opened.
    const into = mkdtempSync(join(tmpdir(), 'vendor-missing-extra-'));
    const host = localSliceAnsi({ 'tests/.env': 'BASIC=basic\n' });
    const result = vendor({ ...host, extraDirs: ['tests/.env', 'tests/.env.vault'] }, into);
    const live = join(into, host.name);
    // Windows runners check out with core.autocrlf, so the clone may carry CRLF; presence is the point.
    expect(readFileSync(join(live, 'tests', '.env'), 'utf8').replaceAll('\r\n', '\n'), 'the fixture that is still shipped was dropped too').toBe('BASIC=basic\n');
    expect(existsSync(join(live, 'tests', '.env.vault'))).toBe(false);
    expect(result.missingExtras, 'a skipped fixture has to be named, or a stale extraDirs entry is invisible').toEqual(['tests/.env.vault']);
    rmSync(into, { recursive: true, force: true });
    rmSync(fileURLToPath(host.repo), { recursive: true, force: true });
  });

  it('reports no missing fixture when every `extraDirs` entry is shipped', () => {
    const into = mkdtempSync(join(tmpdir(), 'vendor-all-extras-'));
    const host = localSliceAnsi({ 'fixture.jpg': 'jpeg' });
    const result = vendor({ ...host, extraDirs: ['fixture.jpg'] }, into);
    expect(result.missingExtras).toEqual([]);
    expect(existsSync(join(into, host.name, 'fixture.jpg'))).toBe(true);
    rmSync(into, { recursive: true, force: true });
    rmSync(fileURLToPath(host.repo), { recursive: true, force: true });
  });

  it('vendors exactly the `suiteFiles` of a suite spread over several packages, each rewritten from its own directory', () => {
    // `@inquirer/prompts`' suite is ten files in ten packages, each beside that package's
    // `src/`. Copied by directory it would vendor every prompt's implementation, and every
    // other package's tests with it.
    const into = mkdtempSync(join(tmpdir(), 'vendor-suite-files-'));
    const host = localSliceAnsi({
      'packages/a/a.test.ts': "import a from './src/index.ts';\nimport { helper } from './helper.js';\n",
      'packages/a/helper.ts': 'export const helper = 1;\n',
      'packages/a/src/index.ts': 'export default 1;\n',
      'packages/a/internal.test.ts': "import { x } from '../lib/x.js';\n",
      'packages/b/test/b.test.ts': "import b from '../src/index.ts';\n",
      'packages/b/src/index.ts': 'export default 2;\n',
      'packages/c/c.test.ts': "test('not listed', () => {});\n",
    });
    const result = vendor(
      {
        ...host,
        testDir: 'packages',
        testGlob: '*.test.ts',
        suiteFiles: ['a/a.test.ts', 'a/internal.test.ts', 'b/test/b.test.ts'],
        imports: [
          { upstream: './a/src/index.ts', subpath: '', reexportDefault: false, defaultExport: 'a' },
          { upstream: './b/src/index.ts', subpath: '', reexportDefault: false, defaultExport: 'b' },
        ],
      },
      into,
    );
    const live = join(into, host.name, 'packages');
    expect(result.files).toBe(3);
    // Classified like any other host's file: one that reaches only the host's internals is
    // vendored and graded on the informational line, and its internal module is shimmed.
    expect(result.internalFiles).toEqual(['a/internal.test.ts']);
    expect(result.internals).toEqual(['lib/x.js']);
    expect(readFileSync(join(live, 'a', 'a.test.ts'), 'utf8')).toContain("import a from '../../shim.js';");
    expect(readFileSync(join(live, 'b', 'test', 'b.test.ts'), 'utf8')).toContain("import b from '../../../shim-1.js';");
    expect(existsSync(join(live, 'a', 'helper.ts')), 'the helper a listed file imports from beside itself').toBe(true);
    for (const absent of ['a/src', 'b/src', 'c']) expect(existsSync(join(live, absent)), absent).toBe(false);
    expect(Object.keys(result.record.tests)).toEqual(['packages/a/a.test.ts', 'packages/a/internal.test.ts', 'packages/b/test/b.test.ts']);
    rmSync(into, { recursive: true, force: true });
    rmSync(fileURLToPath(host.repo), { recursive: true, force: true });
  });

  it('refuses a `suiteFiles` entry the release does not ship, rather than grading a smaller suite', () => {
    const into = mkdtempSync(join(tmpdir(), 'vendor-suite-files-missing-'));
    const host = localSliceAnsi({ 'packages/a/a.test.ts': '' });
    expect(() => vendor({ ...host, testDir: 'packages', testGlob: '*.test.ts', suiteFiles: ['a/a.test.ts', 'gone/gone.test.ts'] }, into)).toThrow(/lists gone\/gone\.test\.ts in suiteFiles/u);
    rmSync(into, { recursive: true, force: true });
    rmSync(fileURLToPath(host.repo), { recursive: true, force: true });
  });

  it('copies a `rewrittenDirs` tree with its imports of the library pointed at the shim, and names one the release lacks', () => {
    // ink 8's `render.tsx` runs upstream's `examples/*` under a PTY, and each imports
    // `../../src/index.js`. Copied as an `extraDirs` entry, the import would name ink's source
    // tree, which no published package has, for the control and the target alike.
    const into = mkdtempSync(join(tmpdir(), 'vendor-rewritten-'));
    const host = localSliceAnsi({ 'examples/demo/demo.js': "import sliceAnsi from '../../index.js';\nconsole.log(sliceAnsi('abc', 1));\n" });
    const result = vendor({ ...host, rewrittenDirs: ['examples', 'gone'] }, into);
    const demo = readFileSync(join(into, host.name, 'examples', 'demo', 'demo.js'), 'utf8');
    expect(demo).toContain("from '../../shim.js'");
    expect(demo).not.toContain('index.js');
    expect(result.missingExtras, 'a rewritten tree the release no longer ships is named like a missing extra').toEqual(['gone']);
    rmSync(into, { recursive: true, force: true });
    rmSync(fileURLToPath(host.repo), { recursive: true, force: true });
  });
});

/**
 * D-20261020-oracle-suite-deps-floated — the moment a suite's dependency tree is read as of: the
 * newest pinned release plus an hour, so a monorepo's siblings published in the same batch are
 * in and a batch published a fortnight later is not.
 */
describe('depsCutoff', () => {
  const times: Record<string, string> = {
    'incumbent@8.7.3': '2026-10-04T17:41:40.731Z',
    'sibling@12.0.4': '2026-10-04T17:42:14.098Z',
    'runner@3.3.14': '2026-10-04T17:41:36.010Z',
  };
  const timeOf = (name: string, version: string): string => times[`${name}@${version}`] as string;
  // Any real host, without the two fields the cutoff reads, so each case sets only what it means.
  const { suiteDeps: _pins, npmName: _npm, ...bare } = HOSTS[0] as Host;
  const fake = (over: Partial<Host>): Host => ({ ...bare, name: 'fake', ...over });

  it('is the newest pinned release, plus the margin', () => {
    expect(depsCutoff(fake({ npmName: 'incumbent', suiteDeps: ['runner@3.3.14', 'sibling@12.0.4', 'incumbent@8.7.3'] }), '8.7.3', timeOf)).toBe('2026-10-04T18:42:14.098Z');
    expect(DEPS_MARGIN_MS).toBe(3_600_000);
  });

  it("is the incumbent's own release where the suite pins nothing", () => {
    expect(depsCutoff(fake({ npmName: 'incumbent' }), '8.7.3', timeOf)).toBe('2026-10-04T18:41:40.731Z');
    expect(depsCutoff(fake({ name: 'incumbent' }), '8.7.3', timeOf), 'by its directory name when it has no npm name of its own').toBe('2026-10-04T18:41:40.731Z');
  });
});
