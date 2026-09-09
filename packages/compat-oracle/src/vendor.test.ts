/**
 * The vendor step's two specifier rules, proven red first (rule 4): a bare public
 * specifier (`yargs-parser`) is rewritten literally, not as a path relative to the test
 * dir; and the vendored root is a package a CJS fixture can `require('../../')` — with
 * the upstream's own `version`, `license` and `repository`, because the suites read them.
 */
import { describe, expect, it } from 'vitest';

import { HOSTS, type Host } from './hosts.js';
import { rewriteAt, rootPackage, shimName } from './vendor.js';

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
});
