/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * The install graph: what `npm install <package>` puts on an adopter's disk, for each published
 * package, measured rather than claimed.
 *
 * Each package is installed alone into an empty directory from the tarballs `npm pack` builds —
 * its own and those of the in-family packages it declares, the same install
 * `independence-install-lock.test.ts` does — `--offline`, so the registry cannot fill a gap, and
 * `--ignore-scripts`, so a script a package should not have does not run while it is being
 * measured. Then `npm ls --all --parseable` lists every package in the tree, and each is read by
 * its own manifest.
 *
 * Two facts come out of one install, and `scripts/install-graph-lock.test.ts` holds both:
 *
 * 1. **every installed package is in the family**, or is an optional peer a family package
 *    declares (react for `controlroom/ink`), which npm does not install unasked;
 * 2. **no installed package runs code at install time**: no `preinstall`, `install` or
 *    `postinstall` script, and no `binding.gyp`, for which npm runs `node-gyp rebuild` without
 *    a script asking it to. Read from the installed manifest, which is the one that shipped.
 *
 * The counts and names are written to `benchmarks/install-graph.json`, which the docs read; the
 * lock compares that file to a fresh measurement, so it cannot drift from the tree.
 *
 *   npx tsx scripts/install-graph.ts           # measure and write (build the packages first)
 *   npx tsx scripts/install-graph.ts --check   # measure and exit 1 if the committed file differs
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { discard, installTarballs, type Manifest, npm, packFamily, publishedManifests } from './family-install.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
export const GRAPH_FILE = join(ROOT, 'benchmarks/install-graph.json');

/** npm runs these when a package is installed as a dependency. `prepare` runs only for a git dependency, never a registry tarball. */
export const INSTALL_SCRIPTS = ['preinstall', 'install', 'postinstall'] as const;

/** One package installed alone: every package in the resulting tree, itself included. */
export interface Installed {
  name: string;
  /** Every package `npm ls --all` lists, by name, sorted. */
  installed: string[];
  /** The manifest of each, as it landed in `node_modules`. */
  manifests: Map<string, InstalledManifest>;
}

export interface InstalledManifest extends Manifest {
  scripts?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
  /** Whether the package directory carries a `binding.gyp`. */
  gyp: boolean;
}

/** The packages `name` needs beside it from the set on offer: what it declares, and what those declare. */
export function closure(name: string, manifests: ReadonlyMap<string, Manifest>): string[] {
  const seen = new Set<string>();
  const visit = (n: string): void => {
    const m = manifests.get(n);
    if (m === undefined) return;
    for (const dep of Object.keys(m.dependencies ?? {})) {
      if (!manifests.has(dep) || seen.has(dep)) continue;
      seen.add(dep);
      visit(dep);
    }
  };
  visit(name);
  seen.delete(name);
  return [...seen].toSorted();
}

/** Every package directory `npm ls --all --parseable` lists under `dir`, the adopter itself excluded. */
async function listed(dir: string): Promise<string[]> {
  let stdout: string;
  try {
    ({ stdout } = await npm(['ls', '--all', '--parseable'], dir));
  } catch (error) {
    // `npm ls` exits 1 on a problem in the tree (a missing or invalid dependency) and still
    // prints the tree; the problem is what the caller is told about, so it is not swallowed.
    const e = error as { stdout?: string; stderr?: string };
    throw new Error(`npm ls found a problem in the tree:\n${e.stderr ?? ''}${e.stdout ?? ''}`);
  }
  const self = realpathSync(dir);
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && realpathSync(line) !== self);
}

/**
 * Install `name` alone into a fresh directory under `base`, from `tarballs`, and read the tree.
 * The packages it declares are installed from their tarballs when there is one; one with no
 * tarball is left for npm, which `--offline` will not let reach the registry.
 */
export async function installAlone(name: string, manifests: ReadonlyMap<string, Manifest>, tarballs: ReadonlyMap<string, string>, base: string): Promise<Installed> {
  const dir = join(base, name.replace('/', '__'));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: `adopter-of-${name.replace('/', '-').replace('@', '')}`, private: true }));
  const files = [name, ...closure(name, manifests)].map((n) => tarballs.get(n) ?? '');
  try {
    await installTarballs(dir, files, { ignoreScripts: true });
  } catch (error) {
    // Offline, a dependency with no tarball on offer cannot be fetched, so the install fails
    // rather than reaching the registry. Say which dependency that was.
    const missing = [name, ...closure(name, manifests)].flatMap((n) => Object.keys(manifests.get(n)?.dependencies ?? {}).filter((d) => !tarballs.has(d)).map((d) => `${n} depends on ${d}`));
    const why = missing.length > 0 ? `${missing.join(', ')}, which is not a burgee package` : String(error);
    throw new Error(`${name}: installing it alone from the family's tarballs failed offline — ${why}`, { cause: error });
  }
  const read = new Map<string, InstalledManifest>();
  for (const at of await listed(dir)) {
    const m = JSON.parse(readFileSync(join(at, 'package.json'), 'utf8')) as InstalledManifest;
    read.set(m.name, { ...m, gyp: existsSync(join(at, 'binding.gyp')) });
  }
  return { name, installed: [...read.keys()].toSorted(), manifests: read };
}

/**
 * Every installed package outside `family`, unless a family package in the same tree declares it
 * as an optional peer.
 */
export function outsiders({ name, installed, manifests }: Installed, family: ReadonlySet<string>): string[] {
  const optionalPeers = new Set(
    [...manifests.values()]
      .filter((m) => family.has(m.name))
      .flatMap((m) => Object.keys(m.peerDependencies ?? {}).filter((peer) => m.peerDependenciesMeta?.[peer]?.optional === true)),
  );
  return installed.filter((pkg) => !family.has(pkg) && !optionalPeers.has(pkg)).map((pkg) => `${name}: installing it installs ${pkg}, which is not a burgee package`);
}

/** Every installed package that would run code when npm installs it. */
export function installScripts({ name, manifests }: Installed): string[] {
  return [...manifests.values()].flatMap((m) => [
    ...INSTALL_SCRIPTS.filter((s) => m.scripts?.[s] !== undefined).map((s) => `${name}: ${m.name} declares a "${s}" script (${m.scripts?.[s] ?? ''}), which runs on every install`),
    ...(m.gyp ? [`${name}: ${m.name} ships a binding.gyp, and npm runs node-gyp rebuild for it on every install`] : []),
  ]);
}

/** The committed projection: per package, how many packages installing it alone puts on disk, and which. */
export interface Graph {
  $comment: string;
  packages: { name: string; count: number; installed: string[] }[];
}

export const COMMENT = 'Generated by scripts/install-graph.ts from an offline install of each published package alone, from the tarballs npm pack builds. Do not edit by hand; held by scripts/install-graph-lock.test.ts.';

export const project = (installs: readonly Installed[]): Graph => ({
  $comment: COMMENT,
  packages: installs
    .map(({ name, installed }) => ({ name, count: installed.length, installed }))
    .toSorted((a, b) => a.name.localeCompare(b.name)),
});

export const render = (graph: Graph): string => `${JSON.stringify(graph, null, 2)}\n`;

/** Pack every published package once and install each alone. The caller discards `base`. */
export async function measureFamily(root: string, base: string): Promise<{ family: Set<string>; installs: Installed[] }> {
  const manifests = publishedManifests(root);
  const tarballs = await packFamily(root, manifests.keys(), join(base, 'tarballs'));
  const installs = await Promise.all([...manifests.keys()].map((name) => installAlone(name, manifests, tarballs, base)));
  return { family: new Set(manifests.keys()), installs };
}

/** The committed file, or nothing when there is none yet. */
function committed(): string {
  try {
    return readFileSync(GRAPH_FILE, 'utf8');
  } catch {
    return '';
  }
}

/** Measure, then write `benchmarks/install-graph.json` — or, with `--check`, only compare it. */
async function main(check: boolean): Promise<void> {
  const base = mkdtempSync(join(tmpdir(), 'burgee-install-graph-'));
  try {
    const { family, installs } = await measureFamily(ROOT, base);
    const problems = installs.flatMap((i) => [...outsiders(i, family), ...installScripts(i)]);
    if (problems.length > 0) {
      for (const p of problems) console.error(p);
      process.exitCode = 1;
    }
    const after = render(project(installs));
    if (check) {
      if (after !== committed()) {
        console.error('benchmarks/install-graph.json is stale — run `npx tsx scripts/install-graph.ts`');
        process.exitCode = 1;
      }
    } else writeFileSync(GRAPH_FILE, after);
    for (const { name, count, installed } of project(installs).packages) console.log(`${name}: ${String(count)} — ${installed.join(' ')}`);
  } finally {
    discard(base);
  }
}

if (process.argv[1]?.endsWith('install-graph.ts') === true) {
  main(process.argv.includes('--check')).catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
