/**
 * The vendor step's two specifier rules, proven red first (rule 4): a bare public
 * specifier (`yargs-parser`) is rewritten literally, not as a path relative to the test
 * dir; and the vendored root is a package a CJS fixture can `require('../../')` — with
 * the upstream's own `version`, `license` and `repository`, because the suites read them.
 */
import { describe, expect, it } from 'vitest';

import { HOSTS, type Host } from './hosts.js';
import { rewriteAt, rootPackage } from './vendor.js';

const yargs = HOSTS.find((h) => h.name === 'yargs') as Host;
const commander = HOSTS.find((h) => h.name === 'commander') as Host;

describe('rewriting public specifiers', () => {
  it('rewrites a relative specifier as it reads from the file that holds it', () => {
    const out = rewriteAt("import yargs from '../index.mjs';", yargs, '/v/yargs/test', '/v/yargs');
    expect(out).toBe("import yargs from '../shim.js';");
  });

  it('rewrites a bare specifier literally, wherever the file sits', () => {
    const out = rewriteAt("import * as parser from 'yargs-parser';", yargs, '/v/yargs/test/esm', '/v/yargs');
    expect(out).toBe("import * as parser from '../../shim-2.js';");
  });
});

describe('the vendored root package', () => {
  it('is a package a CJS fixture can require by directory, carrying the fields the suites read', () => {
    const pkg = rootPackage(commander, { version: '15.0.0', license: 'MIT', repository: { type: 'git', url: 'x' }, type: 'commonjs' });
    expect(pkg).toMatchObject({ name: '@vendored/commander-suite', private: true, main: './shim.js', version: '15.0.0', license: 'MIT', repository: { type: 'git' } });
  });

  it('keeps the upstream module type and never its name', () => {
    const pkg = rootPackage(yargs, { name: 'yargs', type: 'module' });
    expect(pkg.type).toBe('module');
    expect(pkg.name).toBe('@vendored/yargs-suite');
  });
});

describe('rewriteAt — tooling shims', () => {
  it("rewrites a host's bare tooling specifiers to the oracle's shims, both quote styles", () => {
    const chalk = HOSTS.find((h) => h.name === 'chalk');
    if (!chalk) throw new Error('chalk host missing');
    const out = rewriteAt("import test from 'ava';\nimport { execaNode } from \"execa\";", chalk, '/v/chalk/test', '/v/chalk');
    expect(out).toBe("import test from 'compat-oracle/ava';\nimport { execaNode } from \"compat-oracle/execa\";");
  });
});
