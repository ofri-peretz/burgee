/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — the complete-CLI dependency bill is published, measured, and agrees with a second
 * instrument (`cli-output-stack` S2).
 *
 * The intent's metrics table promised one number no incumbent publishes: what `npm install`
 * puts on disk for a whole CLI, the burgee stack against commander + chalk + ora + cli-table3 +
 * inquirer. Until this file, nothing computed it, and the benchmarks page had no row for it.
 *
 * What this holds:
 *
 *   - **the page carries the bill as `scripts/dependency-bill.ts` computes it** from the committed
 *     install graph and lockfile, so a lockfile bump that moves the incumbents' tree moves the
 *     page or turns this red (and `bench:page --check` in quality.yml turns red with it);
 *   - **ours installs nothing from outside the family**, the restated "0 external" (D-111);
 *   - **each incumbent's tree, read from `package-lock.json`, is the size `upstream-watch`
 *     resolved from the registry** for the same release (`competitors.json` `seen`). Two
 *     instruments, one answer; a lockfile that resolved a different tree than a fresh install
 *     would disagree here before the sum is published;
 *   - **ours is the smaller bill**, which is the claim the row exists to make.
 *
 * Every helper is proven able to fail on a fixture lockfile below.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// eslint-disable-next-line import-next/no-relative-packages -- by path, never by name: a bare `compat-oracle/*` resolves from another checkout's dist/ in an uninstalled worktree (compat-oracle R6)
import { readDeclarations, watchList } from '../packages/compat-oracle/src/competitors.js';

import { bill, graphClosure, type Lockfile, lockClosure, nameAt, readBill, resolveIn, roles, section, twice } from './dependency-bill.js';
import { publishedManifests } from './family-install.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PAGE = join(ROOT, 'apps/docs/content/docs/benchmarks.mdx');
const lockfile = (): Lockfile => JSON.parse(readFileSync(join(ROOT, 'package-lock.json'), 'utf8')) as Lockfile;

describe('the complete-CLI dependency bill (cli-output-stack S2)', () => {
  it('is on the benchmarks page exactly as computed — run `npm run bench:page` if not', () => {
    expect(readFileSync(PAGE, 'utf8')).toContain(section(readBill(ROOT)));
  });

  it('pairs each job with a published family package and an incumbent the lockfile carries', () => {
    const family = new Set(publishedManifests(ROOT).keys());
    const lock = lockfile();
    for (const { job, ours, theirs } of roles()) {
      expect(family.has(ours), `${job}: ${ours} is not a published family package`).toBe(true);
      expect(lock.packages[`node_modules/${theirs}`], `${job}: ${theirs} is not in package-lock.json`).toBeDefined();
    }
  });

  it('installs nothing from outside the family on our side (D-111, "0 external")', () => {
    const measured = readBill(ROOT);
    expect(measured.ours.outside).toEqual([]);
    expect(measured.ours.installed).toEqual(expect.arrayContaining(measured.ours.asked));
  });

  it("agrees, incumbent by incumbent, with the tree upstream-watch resolved from the registry", () => {
    const watched = watchList(readDeclarations(join(ROOT, 'packages')));
    const lock = lockfile();
    for (const { theirs } of roles()) {
      const seen = watched.find((w) => w.npm === theirs && w.via === undefined)?.seen;
      expect(seen?.packages, `${theirs} has no registry fingerprint in any competitors.json`).toBeTypeOf('number');
      const tree = lockClosure(lock, [theirs]);
      expect(tree, `${theirs}: the lockfile resolves a different release than the one fingerprinted`).toContain(`${theirs}@${String(seen?.version)}`);
      expect(tree.length, `${theirs}: package-lock.json resolves ${String(tree.length)} packages, the registry resolved ${String(seen?.packages)}`).toBe(seen?.packages);
    }
  });

  it('is the smaller bill on our side', () => {
    const measured = readBill(ROOT);
    expect(measured.ours.installed.length).toBeLessThan(measured.theirs.installed.length);
  });
});

/** A lockfile from `path → entry` pairs, with a version on each. */
const lock = (entries: Record<string, Omit<Lockfile['packages'][string], 'version'>>): Lockfile => ({
  packages: Object.fromEntries(Object.entries(entries).map(([path, entry]) => [path, { version: '1.0.0', ...entry }])),
});

describe('the lock can fail', () => {
  it('names the package a nested lockfile path installs', () => {
    expect(nameAt('node_modules/a/node_modules/@s/b')).toBe('@s/b');
    expect(nameAt('node_modules/chalk')).toBe('chalk');
  });

  it('resolves the nearest copy first, then each enclosing level, then the root', () => {
    const l = lock({
      'node_modules/a': {},
      'node_modules/a/node_modules/b': {},
      'node_modules/a/node_modules/b/node_modules/c': {},
      'node_modules/b': {},
      'node_modules/d': {},
    });
    expect(resolveIn(l, 'node_modules/a', 'b')).toBe('node_modules/a/node_modules/b');
    expect(resolveIn(l, 'node_modules/a/node_modules/b/node_modules/c', 'b')).toBe('node_modules/a/node_modules/b');
    expect(resolveIn(l, 'node_modules/a/node_modules/b', 'd')).toBe('node_modules/d');
    expect(resolveIn(l, 'node_modules/a', 'missing')).toBeUndefined();
  });

  it('counts one package per version on disk, through dependencies and required peers', () => {
    const l: Lockfile = {
      packages: {
        'node_modules/ora': { version: '9.0.0', dependencies: { chalk: '^5' }, peerDependencies: { peer: '*', loose: '*' }, peerDependenciesMeta: { loose: { optional: true } } },
        'node_modules/ora/node_modules/chalk': { version: '5.6.2' },
        'node_modules/chalk': { version: '6.0.1' },
        'node_modules/peer': { version: '2.0.0' },
        'node_modules/loose': { version: '3.0.0' },
      },
    };
    expect(lockClosure(l, ['ora', 'chalk'])).toEqual(['chalk@5.6.2', 'chalk@6.0.1', 'ora@9.0.0', 'peer@2.0.0']);
    expect(twice(lockClosure(l, ['ora', 'chalk']))).toEqual(['chalk']);
  });

  it('visits a package reached twice once, and keeps an optional dependency only when the lockfile carries it', () => {
    const l = lock({
      'node_modules/a': { dependencies: { shared: '*' }, optionalDependencies: { native: '*', absent: '*' } },
      'node_modules/b': { dependencies: { shared: '*' } },
      'node_modules/shared': { dependencies: { a: '*' } },
      'node_modules/native': {},
    });
    expect(lockClosure(l, ['a', 'b'])).toEqual(['a@1.0.0', 'b@1.0.0', 'native@1.0.0', 'shared@1.0.0']);
  });

  it('refuses a required dependency the lockfile cannot resolve, rather than publishing a short count', () => {
    expect(() => lockClosure(lock({ 'node_modules/a': { dependencies: { gone: '*' } } }), ['a'])).toThrow(/does not resolve gone, which a requires/u);
    expect(() => lockClosure(lock({ 'node_modules/a': { peerDependencies: { gone: '*' } } }), ['a'])).toThrow(/does not resolve gone/u);
    expect(() => lockClosure(lock({}), ['ora'])).toThrow(/has no ora at the root/u);
  });

  it('unions the install graph, and refuses a package with no row', () => {
    const graph = {
      packages: [
        { name: 'x', installed: ['shared', 'x'] },
        { name: 'y', installed: ['shared', 'y'] },
      ],
    };
    expect(graphClosure(graph, ['y', 'x'])).toEqual(['shared', 'x', 'y']);
    expect(() => graphClosure(graph, ['z'])).toThrow(/no row for z/u);
  });

  it('reads a scoped name installed twice, and nothing installed once', () => {
    expect(twice(['@s/p@1.0.0', '@s/p@2.0.0', 'q@1.0.0'])).toEqual(['@s/p']);
    expect(twice(['q@1.0.0'])).toEqual([]);
  });

  it('flags a package from outside the family on our side', () => {
    const graph = { packages: roles().map((r) => ({ name: r.ours, installed: [r.ours, 'left-pad'] })) };
    const theirs = Object.fromEntries(roles().map((r) => [`node_modules/${r.theirs}`, {}]));
    const b = bill(graph, lock(theirs), new Set(roles().map((r) => r.ours)));
    expect(b.ours.outside).toEqual(['left-pad']);
    expect(b.ours.asked).toEqual(['burgee', 'roundel', 'flagstaff', 'caique']);
    expect(b.theirs.asked).toEqual(['commander', 'chalk', 'ora', 'cli-table3', '@inquirer/prompts']);
    expect(section(b)).toContain('| **5** | 1 | 0 | **1** |');
    expect(section(b)).toContain('Paired by job: parse arguments (`burgee` for `commander`), colour (`roundel` for `chalk`), spinner (`flagstaff` for `ora`), table (`flagstaff` for `cli-table3`), prompts (`caique` for `@inquirer/prompts`).');
  });

  it('renders both columns with their counts', () => {
    const rendered = section({
      pairs: [{ job: 'parse', ours: 'a', theirs: 'c' }],
      ours: { asked: ['a'], installed: ['a', 'b'], outside: [] },
      theirs: { asked: ['c'], installed: ['c@1.0.0', 'd@1.0.0', 'd@2.0.0'] },
    });
    expect(rendered.startsWith('### A complete CLI — the dependency bill\n\n')).toBe(true);
    expect(rendered).toContain('Paired by job: parse (`a` for `c`).');
    expect(rendered).toContain('| `a` | **2** | 1 | 0 | **0** |');
    expect(rendered).toContain('| `c` | **3** | 2 | 1 | — |');
    expect(rendered).toContain('Ours installs `a`, `b`, every one');
    expect(rendered).toContain('Theirs installs `d` twice');
  });
});
