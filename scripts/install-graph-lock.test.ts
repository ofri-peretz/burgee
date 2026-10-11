/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — installing any published package installs nothing from outside the family, and nothing
 * that runs at install time.
 *
 * "No dependency outside the burgee family" is stated in every npm description, the family
 * section of every README and the docs. `dependency-claim-lock` holds what a manifest declares;
 * this holds what an install does, which is what an adopter's supply chain actually is. For each
 * published package, `scripts/install-graph.ts` installs it alone from the packed tarballs and
 * lists the tree with `npm ls --all --parseable`. Then:
 *
 *   - every installed package is a family package, or an optional peer a family package declares
 *     (react and react-reconciler for `controlroom/ink`), which npm leaves to the adopter;
 *   - no installed package declares `preinstall`, `install` or `postinstall`, or ships a
 *     `binding.gyp`: nothing runs when the family is installed;
 *   - `benchmarks/install-graph.json`, which the docs print, is the measurement as it stands.
 *
 * Proven red in this file, not only once: two fixture packages are packed and installed the same
 * way — one with a `postinstall` script, one that depends on a package outside the family — and
 * each must be caught.
 *
 * It reads `dist/`, so the packages must be built, as the pre-push battery and CI's `npm test` do
 * before the root suite runs.
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { discard, type Manifest, npm } from './family-install.js';
import { GRAPH_FILE, type Installed, installAlone, installScripts, measureFamily, outsiders, project, render } from './install-graph.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

/** One pack of ten packages and ten installs, then two fixtures packed and installed. */
const SETUP_TIMEOUT_MS = 240_000;

describe('installing a published package installs only the family, and runs nothing', () => {
  let base: string;
  let family = new Set<string>();
  let installs: Installed[] = [];

  beforeAll(async () => {
    base = mkdtempSync(join(tmpdir(), 'burgee-install-graph-'));
    ({ family, installs } = await measureFamily(ROOT, base));
  }, SETUP_TIMEOUT_MS);

  afterAll(() => discard(base));

  it('installs every published package', () => {
    expect(installs.map((i) => i.name).toSorted()).toEqual([...family].toSorted());
    expect(installs.length).toBeGreaterThanOrEqual(10);
  });

  it('installs nothing from outside the family', () => {
    expect(installs.flatMap((i) => outsiders(i, family))).toEqual([]);
  });

  it('installs nothing that runs at install time', () => {
    expect(installs.flatMap((i) => installScripts(i))).toEqual([]);
  });

  it('every install contains the package itself', () => {
    for (const { name, installed } of installs) expect(installed, name).toContain(name);
  });

  it('benchmarks/install-graph.json is the measurement — run `npx tsx scripts/install-graph.ts` if not', () => {
    expect(readFileSync(GRAPH_FILE, 'utf8')).toBe(render(project(installs)));
  });
});

/** Write a package directory for a fixture and return it. */
function fixture(base: string, manifest: Manifest & { version: string; scripts?: Record<string, string> }): string {
  const dir = join(base, 'src', manifest.name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest));
  writeFileSync(join(dir, 'index.js'), 'export {};\n');
  return dir;
}

describe('the lock can fail', () => {
  let base: string;
  let withScript: Installed;
  let withOutsider: Installed;
  let offline: Promise<unknown>;
  const family = new Set(['with-postinstall', 'with-outsider']);

  beforeAll(async () => {
    base = mkdtempSync(join(tmpdir(), 'burgee-install-graph-fixtures-'));
    const dirs = [
      fixture(base, { name: 'with-postinstall', version: '1.0.0', scripts: { postinstall: 'node -e "process.exit(0)"' } }),
      fixture(base, { name: 'with-outsider', version: '1.0.0', dependencies: { 'not-in-the-family': '1.0.0' } }),
      fixture(base, { name: 'not-in-the-family', version: '1.0.0' }),
    ];
    const into = join(base, 'tarballs');
    mkdirSync(into, { recursive: true });
    const { stdout } = await npm(['pack', '--json', '--pack-destination', into, ...dirs], base);
    const tarballs = new Map((JSON.parse(stdout) as { name: string; filename: string }[]).map((p) => [p.name, join(into, p.filename)]));
    const manifests = new Map(
      dirs.map((d) => {
        const m = JSON.parse(readFileSync(join(d, 'package.json'), 'utf8')) as Manifest;
        return [m.name, m] as const;
      }),
    );
    [withScript, withOutsider] = await Promise.all([installAlone('with-postinstall', manifests, tarballs, base), installAlone('with-outsider', manifests, tarballs, base)]);
    // The family's own measurement offers no tarball from outside it, so there the same package fails offline.
    const familyOnly = new Map([...tarballs].filter(([name]) => name !== 'not-in-the-family'));
    offline = installAlone('with-outsider', manifests, familyOnly, join(base, 'family-only')).catch((error: unknown) => error);
    await offline;
  }, SETUP_TIMEOUT_MS);

  afterAll(() => discard(base));

  it('catches a package with a postinstall script', () => {
    expect(installScripts(withScript)).toEqual([expect.stringMatching(/with-postinstall declares a "postinstall" script/u)]);
  });

  it('catches a package whose install pulls in one from outside the family', () => {
    expect(withOutsider.installed).toEqual(['not-in-the-family', 'with-outsider']);
    expect(outsiders(withOutsider, family)).toEqual(['with-outsider: installing it installs not-in-the-family, which is not a burgee package']);
  });

  it('names the outside dependency when only the family is on offer and the install fails offline', async () => {
    const error = await offline;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/with-outsider depends on not-in-the-family, which is not a burgee package/u);
  });

  it('passes an optional peer a family package declares, and nothing else', () => {
    const peer: Installed = {
      name: 'screen',
      installed: ['react', 'screen'],
      manifests: new Map([
        ['screen', { name: 'screen', peerDependencies: { react: '>=18' }, peerDependenciesMeta: { react: { optional: true } }, gyp: false }],
        ['react', { name: 'react', gyp: false }],
      ]),
    };
    expect(outsiders(peer, new Set(['screen']))).toEqual([]);
    const required: Installed = { ...peer, manifests: new Map([...peer.manifests].map(([k, m]) => [k, { ...m, peerDependenciesMeta: {} }])) };
    expect(outsiders(required, new Set(['screen']))).toEqual(['screen: installing it installs react, which is not a burgee package']);
  });

  it('catches a binding.gyp, which npm builds without a script asking it to', () => {
    const native: Installed = { name: 'n', installed: ['n'], manifests: new Map([['n', { name: 'n', gyp: true }]]) };
    expect(installScripts(native)).toEqual([expect.stringMatching(/ships a binding\.gyp/u)]);
  });
});
