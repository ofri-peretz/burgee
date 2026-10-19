/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Installing the family the way a stranger does: from the tarballs `npm pack` builds, never
 * from the workspace links.
 *
 * Two locks need it — `independence-install-lock.test.ts` installs each package alone and
 * imports every entry, `readme-quick-start-lock.test.ts` runs each README's quick start — and
 * they need the same three things: one pack of the published packages, an offline install of
 * some of those tarballs, and a way to tell which package a resolved file belongs to. They live
 * here so that a second lock does not grow a second packer. Both also share `installStamp`, which
 * skips an install whose exact tarballs already passed on this machine.
 */
import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, isAbsolute, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);

export interface Manifest {
  name: string;
  private?: boolean;
  bin?: string | Record<string, string>;
  exports?: Record<string, unknown>;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

export const readManifest = (dir: string): Manifest => JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as Manifest;

/** Every published package under `packages/`, by name. `compat-oracle` is private and ships to nobody. */
export function publishedManifests(root: string): Map<string, Manifest> {
  const manifests = new Map<string, Manifest>();
  for (const dir of readdirSync(join(root, 'packages'))) {
    const at = join(root, 'packages', dir);
    if (!existsSync(join(at, 'package.json'))) continue;
    const m = readManifest(at);
    if (m.private !== true) manifests.set(m.name, m);
  }
  return manifests;
}

/** Every name a manifest lets its code import. */
export const declaredBy = (m: Manifest): string[] => Object.keys({ ...m.dependencies, ...m.peerDependencies, ...m.optionalDependencies });

/**
 * npm, without assuming a POSIX shell — the reasoning is `pack-list-lock.test.ts`'s. Only a
 * `npm_execpath` naming `npm-cli.js` is run through this Node; any other value is not npm's own
 * entry, so it falls back to `npm` on the PATH.
 */
const NPM_CLI = process.env['npm_execpath'];
const WINDOWS = process.platform === 'win32';
/** `npm pack --json` of ten packages lists every file in every tarball. */
const MAX_BUFFER_BYTES = 64 * 1024 * 1024;
export function npm(args: string[], cwd: string): Promise<{ stdout: string }> {
  const io = { cwd, encoding: 'utf8', maxBuffer: MAX_BUFFER_BYTES } as const;
  if (NPM_CLI?.endsWith('npm-cli.js') === true) return run(process.execPath, [NPM_CLI, ...args], io);
  return run(WINDOWS ? 'npm.cmd' : 'npm', args, { ...io, shell: WINDOWS });
}

/**
 * One `npm pack` of the named workspaces into `into`, and the tarball each became. It reads
 * `dist/`, so the packages must be built — which the pre-push battery and CI's `npm test` both
 * do before the root suite runs.
 */
export async function packFamily(root: string, names: Iterable<string>, into: string): Promise<Map<string, string>> {
  mkdirSync(into, { recursive: true });
  const workspaces = [...names].map((name) => `--workspace=packages/${name}`);
  const { stdout } = await npm(['pack', '--json', '--pack-destination', into, ...workspaces], root);
  return new Map((JSON.parse(stdout) as { name: string; filename: string }[]).map((p) => [p.name, join(into, p.filename)]));
}

/**
 * `npm install` these tarballs into `dir` and nothing else: `--offline`, so the registry cannot
 * fill a gap, and no lockfile, so nothing is remembered between runs. `ignoreScripts` is for a
 * caller that measures install scripts rather than wanting them run (`install-graph.ts`).
 */
export async function installTarballs(dir: string, files: string[], { ignoreScripts = false }: { ignoreScripts?: boolean } = {}): Promise<void> {
  await npm(['install', '--offline', '--no-package-lock', '--no-audit', '--no-fund', '--silent', ...(ignoreScripts ? ['--ignore-scripts'] : []), ...files], dir);
}

/**
 * Deleting an install goes to a detached process instead of holding the suite. A synchronous
 * `rmSync` of nine `node_modules` trees outran the independence lock's setup timeout on a
 * machine whose endpoint scanner inspects every unlink, which failed the whole file after all
 * 42 assertions had passed.
 * ponytail: the OS temp dir is the backstop if that process dies; nothing reads it again.
 */
export function discard(dir: string): void {
  spawn(process.execPath, ['-e', 'require("node:fs").rmSync(process.argv[1], { recursive: true, force: true })', dir], {
    detached: true,
    stdio: 'ignore',
  }).unref();
}

/** The part of a vitest suite `record` reads: each test's state, however deeply nested. */
export interface Outcome {
  readonly result?: { readonly state?: string } | undefined;
  readonly tasks?: readonly Outcome[];
}
const passed = (task: Outcome): boolean => (task.tasks === undefined ? task.result?.state === 'pass' : task.tasks.every(passed));

/** What a lock does with its install this run. */
export interface InstallStamp {
  /** Why this run skips the install and what it decides, or `undefined` when it runs them. */
  readonly skip: string | undefined;
  /** Remember this run, when every test under `suite` passed. */
  record(suite: Outcome): void;
}

/**
 * A lock's install, remembered across runs and across worktrees. The installs write thousands of
 * files, and on a machine whose endpoint scanner inspects every new file one root-suite run pushed
 * the load average past 100 — on every push, from every worktree, for bytes nothing had changed.
 *
 * The key is everything the outcome can depend on: the lock's name and source, this file's source,
 * the Node and platform it ran under, and the bytes of every tarball (`npm pack` is reproducible,
 * so an unchanged package packs to the same bytes). A stamp under that key means those exact
 * inputs passed here before, so the lock's install and the tests that read it are skipped, each
 * naming the stamp. CI (`CI` set) never reads or writes one, and `BURGEE_LOCKS_FULL=1` runs it all.
 * ponytail: stamps are never pruned; each is one short line under `burgee-locks/`.
 */
export function installStamp(testFile: string, tarballs: Iterable<string>, env: NodeJS.ProcessEnv = process.env): InstallStamp {
  if (env['CI'] !== undefined || env['BURGEE_LOCKS_FULL'] === '1') return { skip: undefined, record: () => undefined };
  const lock = basename(testFile).replace(/\.test\.ts$/u, '');
  const hash = createHash('sha256').update(`${lock}\0${process.version}\0${process.platform}\0`);
  hash.update(readFileSync(testFile)).update(readFileSync(new URL(import.meta.url)));
  for (const file of [...tarballs].toSorted((a, b) => basename(a).localeCompare(basename(b)))) hash.update(`\0${basename(file)}\0`).update(readFileSync(file));
  const dir = join(env['XDG_CACHE_HOME'] ?? join(homedir(), '.cache'), 'burgee-locks');
  const stamp = join(dir, `${lock}-${hash.digest('hex')}`);
  return {
    skip: existsSync(stamp) ? `these tarballs passed ${lock} before (${stamp}); BURGEE_LOCKS_FULL=1 runs it again` : undefined,
    record(suite) {
      if (!passed(suite)) return;
      mkdirSync(dir, { recursive: true });
      writeFileSync(stamp, `${new Date().toISOString()}\n`);
    },
  };
}

/** One module resolution Node performed: who asked, for what, and the URL it got. */
export interface Edge {
  from: string | null;
  specifier: string;
  to: string;
}

/** The installed package a file URL belongs to, or `undefined` when it is outside `modules`. */
export function ownerOf(url: string, modules: string): string | undefined {
  const rel = relative(modules, fileURLToPath(url));
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return undefined;
  const parts = rel.split(sep);
  const rest = parts.slice(parts.lastIndexOf('node_modules') + 1);
  const [first = '', second = ''] = rest;
  return first.startsWith('@') ? `${first}/${second}` : first;
}

/**
 * Every edge that reaches a package its importer does not declare.
 *
 * `entry` is the adopter's own file, which may reach exactly the package — or packages — it
 * installed (`pkg`). A builtin (`node:`) is always allowed; a file outside the install is never
 * allowed, because that is a package found by walking up past the adopter's own `node_modules`.
 */
export function undeclaredReaches(
  edges: Edge[],
  { modules, entry, pkg, declared }: { modules: string; entry: string; pkg: string | readonly string[]; declared: (name: string) => string[] },
): string[] {
  const adopted = typeof pkg === 'string' ? [pkg] : [...pkg];
  const found = new Set<string>();
  for (const { from, specifier, to } of edges) {
    if (!to.startsWith('file:')) continue;
    const asker = from === null || from === entry ? undefined : ownerOf(from, modules);
    const allowed = asker === undefined ? adopted : [asker, ...declared(asker)];
    const target = ownerOf(to, modules);
    const who = asker ?? 'the adopter';
    if (target === undefined) found.add(`${who} reaches ${fileURLToPath(to)}, outside the install ('${specifier}')`);
    else if (!allowed.includes(target)) found.add(`${who} reaches ${target} without declaring it ('${specifier}')`);
  }
  return [...found].toSorted();
}
