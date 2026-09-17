/**
 * The vendor step's two specifier rules, proven red first (rule 4): a bare public
 * specifier (`yargs-parser`) is rewritten literally, not as a path relative to the test
 * dir; and the vendored root is a package a CJS fixture can `require('../../')` — with
 * the upstream's own `version`, `license` and `repository`, because the suites read them.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { HOSTS, type Host } from './hosts.js';
import { rewriteAt, rootPackage, shimName, splitSpec } from './vendor.js';

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

  it('points main at the very shim it names', () => {
    expect(rootPackage(yargs, { type: 'module' }).main).toBe(`./${shimName(0, 'module')}`);
    expect(rootPackage(commander, { type: 'commonjs' }).main).toBe(`./${shimName(0, 'commonjs')}`);
  });

  it('keeps the upstream module type and never its name', () => {
    const pkg = rootPackage(yargs, { name: 'yargs', type: 'module' });
    expect(pkg.type).toBe('module');
    expect(pkg.name).toBe('@vendored/yargs-suite');
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
