import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

import { resolveEsm } from './resolve.js';

// Real path: Node resolves through the /var -> /private/var link on macOS.
const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'oxmutate-resolve-')));
afterAll(() => rmSync(root, { recursive: true, force: true }));
const pkg = (name: string, manifest: object): void => {
  const dir = path.join(root, 'node_modules', name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name, ...manifest }));
};
const PJ = { './package.json': './package.json' };
const url = (name: string, file: string): string => pathToFileURL(path.join(root, 'node_modules', name, file)).href;

pkg('conditions', { exports: { ...PJ, '.': { require: './r.cjs', import: './i.mjs', default: './d.js' }, './sub': { require: './r.cjs', default: './sub.js' }, './opt': { import: null, default: './opt.js' } } });
pkg('node-only', { exports: { ...PJ, '.': { require: './r.cjs', node: { require: './nr.cjs', import: './ni.mjs' } } } });
pkg('@scope/kit', { exports: { ...PJ, '.': './index.js', './deep/path': { import: './deep.mjs' } } });
pkg('legacy', { module: './esm.js', main: './cjs.js' });
pkg('main-only', { main: './cjs.js' });
pkg('closed', { exports: { ...PJ, '.': { require: './r.cjs' } } });
pkg('nothing', {});

describe('resolveEsm follows import, then node, then default', () => {
  it('takes import over require and default', () => {
    expect(resolveEsm('conditions', root)).toBe(url('conditions', 'i.mjs'));
  });
  it('falls back to default for a subpath with no import', () => {
    expect(resolveEsm('conditions/sub', root)).toBe(url('conditions', 'sub.js'));
    // null is how a package says a condition is not exported.
    expect(resolveEsm('conditions/opt', root)).toBe(url('conditions', 'opt.js'));
  });
  it('descends into nested conditions', () => {
    expect(resolveEsm('node-only', root)).toBe(url('node-only', 'ni.mjs'));
  });
  it('splits a scoped name from its subpath', () => {
    expect(resolveEsm('@scope/kit', root)).toBe(url('@scope/kit', 'index.js'));
    expect(resolveEsm('@scope/kit/deep/path', root)).toBe(url('@scope/kit', 'deep.mjs'));
  });
  it('without exports, prefers module to main, and takes a subpath as a file', () => {
    expect(resolveEsm('legacy', root)).toBe(url('legacy', 'esm.js'));
    expect(resolveEsm('main-only', root)).toBe(url('main-only', 'cjs.js'));
    expect(resolveEsm('legacy/lib/x.js', root)).toBe(url('legacy', 'lib/x.js'));
  });
  it('refuses, naming the specifier, when only require is exported or nothing is', () => {
    expect(() => resolveEsm('closed', root)).toThrow(`oxmutate: cannot resolve closed from ${root}`);
    expect(() => resolveEsm('conditions/missing', root)).toThrow(`oxmutate: cannot resolve conditions/missing from ${root}`);
    expect(() => resolveEsm('nothing', root)).toThrow(`oxmutate: cannot resolve nothing from ${root}`);
  });
  it('resolves from the given directory, not from oxmutate', () => {
    expect(() => resolveEsm('legacy', tmpdir())).toThrow();
  });
});
