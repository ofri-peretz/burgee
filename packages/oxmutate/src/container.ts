/**
 * `container`: oxmutate runs a repository's mutation testing inside containers it starts, the host a
 * black box to the run. The host packs the source (or, with `source: 'git'`, names only a commit for
 * the container to fetch), hands it to the engine, and gets the reports back; it mounts nothing, so
 * the engine may be local, remote (`host`, `context`), Docker or Podman.
 *
 * A run is four steps on a named volume that keeps the container's own `node_modules`:
 *   1. sync: the source is put into the volume (files the host deleted are deleted there), and the
 *      install runs when its key changed. The only step with the network unless `network` says so.
 *   2. run: `setup`, then oxmutate, with no network by default.
 *   3. copy back: each kept file (the reports, the incremental file) is copied to the host with
 *      `<engine> cp` from a container created on the volume and never started.
 *   4. with `ephemeral`, the volume is removed.
 * Every container drops all capabilities, cannot gain one (`no-new-privileges`), is labelled
 * `dev.oxmutate=1` and is removed after it ends. `platform`, `user`, `runtime` (a sandbox such as
 * gVisor's `runsc`, used by default when Docker has it), `readOnly`, `pull`, `pidsLimit`, `cpus` and
 * `memory` reach every container; `args` passes anything else to each, `runArgs` to the run's alone.
 *
 * The sync sends only what changed since the volume was last synced (`container-sync.ts`), and the
 * install's package caches live in one volume every repository shares (`cache`). `--since` and
 * `--frozen-oracle` work inside: each ref the run names goes in as its tree and becomes a tag there.
 * `OXMUTATE_CONTAINER` or `~/.config/oxmutate/config.json` turns container mode on for every project
 * on the machine; a project's own `container` setting, and `--no-container`, win.
 */
import { createHash } from 'node:crypto';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { ambientRuntime, run, type Result, type RunOptions } from 'bellpull';

import { nextState, planSync, PRUNE, readState, signatures, syncDir, type SyncPlan, wholeSync, writeState } from './container-sync.js';
import { env, nodeMajor, platform, stderr } from './runtime.js';
import { removeWorkDir } from './work-dir.js';

export interface Container {
  /** The container CLI: `docker` (default), `podman`, or any that takes the same `create`, `cp`, `start` and `run`. */
  engine: string;
  /** Default: `node:<the host's Node major>-bookworm-slim`. */
  image: string;
  /** The run's network (`--network`). Default `none`; the sync has the engine's default, for the install. */
  network: string;
  /** `copy` (default): the git files as they are on the host, committed or not. `git`: the container fetches `HEAD`'s commit. */
  source: 'copy' | 'git';
  /** With `source: 'git'`, where to fetch from. Default: the `origin` remote's URL. */
  remote?: string | undefined;
  /** Run when the lockfile, image or this command changed. Undefined: chosen by the lockfile; `''`: none. */
  install?: string | undefined;
  /** Run in the run's container before oxmutate (a build the tests need). */
  setup?: string | undefined;
  /** The named volume holding the copy. Default: `oxmutate-<hash of the repository path>`. */
  volume?: string | undefined;
  /** Remove the volume after the run: nothing stays behind, and every run installs. */
  ephemeral: boolean;
  /** The engine's context (`docker --context`, `podman --connection`). */
  context?: string | undefined;
  /** The engine's daemon (`DOCKER_HOST`, `CONTAINER_HOST` for Podman), such as `ssh://user@box`. */
  host?: string | undefined;
  platform?: string | undefined;
  user?: string | undefined;
  /** The container runtime, such as gVisor's `runsc`. Unset: `runsc` when Docker has it, else the engine's default; `'default'`: always the engine's. */
  runtime?: string | undefined;
  /** The volume the install's package caches live in, shared by every repository. `false`: none. */
  cache: string | false;
  /** A read-only root filesystem; `/tmp` is a tmpfs and `HOME`. */
  readOnly: boolean;
  /** `always`, `missing` or `never` (`--pull`). */
  pull?: string | undefined;
  pidsLimit?: number | undefined;
  cpus?: number | undefined;
  memory?: string | undefined;
  /** `NAME` passes the host's value, `NAME=value` sets one, to every container: the tests see it. */
  env: string[];
  /** As `env`, to the sync container alone: the install sees it, the tests do not. */
  installEnv: string[];
  /** Forward the host's `~/.npmrc` (or `$npm_config_userconfig`) and `~/.yarnrc.yml` to the install, and each `${NAME}` they name. Unset: on, off with `host`. */
  registryAuth?: boolean | undefined;
  /** Files git ignores that the tests need (`.env.test`, generated fixtures): paths or globs, sent with the git files. */
  include: string[];
  /** Extra arguments to every container, verbatim. */
  args: string[];
  /** Extra arguments to the run's container alone. */
  runArgs: string[];
  /** oxmutate inside the container. Unset: the host's own version, installed into the volume by the sync. */
  command?: string | undefined;
}

/** Set inside the container, so the run there does not start another. */
export const INSIDE = 'OXMUTATE_CONTAINER';
const WORK = '/w';
const SRC = `${WORK}/src`;
/** Hex characters of the repository path's hash in the default volume name. */
const VOLUME_HASH_CHARS = 12;
const STRINGS = ['engine', 'image', 'network', 'remote', 'install', 'setup', 'volume', 'context', 'host', 'platform', 'user', 'runtime', 'pull', 'memory', 'command'] as const;
const KEYS = new Set<string>([...STRINGS, 'source', 'cache', 'ephemeral', 'readOnly', 'pidsLimit', 'cpus', 'env', 'installEnv', 'registryAuth', 'include', 'args', 'runArgs']);
/** The label each sync, run and copy-back container has: the volume it works on. */
const VOLUME_LABEL = 'dev.oxmutate.volume';
/** The shared package-cache volume's default name. */
const CACHE = 'oxmutate-cache';
export const LOCKS = ['package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock'];
/** Bun's lockfiles: no install is chosen for them. */
const BUN_LOCKS = ['bun.lock', 'bun.lockb'];
/** This package's version: the oxmutate the container installs when `command` is unset. */
// Stryker disable next-line StringLiteral: without an encoding readFileSync answers a Buffer, and JSON.parse reads a Buffer as UTF-8 text all the same
export const VERSION = (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version;
/** Where the sync installs that version, in the volume, outside the source. */
const SELF = `${WORK}/.oxmutate/${VERSION}`;
const SELF_BIN = `${SELF}/node_modules/.bin/oxmutate`;
/** Where the sync container gets the host's npm user config, and its HOME with the host's `.yarnrc.yml`: never in the volume. */
const NPMRC = '/tmp/oxmutate-npmrc';
/** The mode the forwarded auth files are staged with. */
const READABLE = 0o644;
const AUTH_HOME = '/tmp/oxmutate-home';

// Stryker disable next-line ConditionalExpression: containerOf returns before this for null, so the null check never decides
const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

/** `cache`: `false` (none), a volume name, or the shared default. */
const cacheOf = (raw: unknown): string | false => {
  if (raw === false) return false;
  return typeof raw === 'string' ? raw : CACHE;
};

/** Every key's default. */
export const containerDefaults = (): Container => ({ engine: 'docker', image: `node:${nodeMajor}-bookworm-slim`, network: 'none', source: 'copy', cache: CACHE, ephemeral: false, readOnly: false, env: [], installEnv: [], include: [], args: [], runArgs: [] });

/** The config value, resolved: `true`, an image name, or an object; `false` or nothing is no container. */
export function containerOf(raw: unknown): Container | undefined {
  if (raw === undefined || raw === null || raw === false) return undefined;
  const base = containerDefaults();
  if (raw === true) return base;
  if (typeof raw === 'string') return { ...base, image: raw };
  if (!isRecord(raw)) throw new Error(`container must be true, an image name or an object, not ${JSON.stringify(raw)}. fix: container: true`);
  const unknown = Object.keys(raw).filter((k) => !KEYS.has(k));
  if (unknown.length) throw new Error(`container has no key ${unknown.join(', ')}. fix: use ${[...KEYS].join(', ')}; anything else goes in container.args`);
  if (raw['source'] !== undefined && raw['source'] !== 'copy' && raw['source'] !== 'git') throw new Error(`container.source is 'copy' or 'git', not ${JSON.stringify(raw['source'])}`);
  const strings = Object.fromEntries(STRINGS.filter((k) => typeof raw[k] === 'string').map((k) => [k, raw[k]]));
  const number = (k: string): number | undefined => (typeof raw[k] === 'number' ? raw[k] : undefined);
  const list = (k: string): string[] => (Array.isArray(raw[k]) ? raw[k].map(String) : []);
  return {
    ...base,
    ...strings,
    install: raw['install'] === false ? '' : (strings['install'] as string | undefined),
    source: raw['source'] === 'git' ? 'git' : 'copy',
    cache: cacheOf(raw['cache']),
    ephemeral: raw['ephemeral'] === true,
    readOnly: raw['readOnly'] === true,
    pidsLimit: number('pidsLimit'),
    cpus: number('cpus'),
    env: list('env'),
    installEnv: list('installEnv'),
    registryAuth: typeof raw['registryAuth'] === 'boolean' ? raw['registryAuth'] : undefined,
    include: list('include'),
    args: list('args'),
    runArgs: list('runArgs'),
  };
}

/** `--container`, `--no-container` and `--container-image <image>` over the config. */
export function withFlags(c: Container | undefined, o: Record<string, unknown>): Container | undefined {
  if (o['container'] === false || o['noContainer'] === true) return undefined;
  const image = typeof o['containerImage'] === 'string' ? o['containerImage'] : undefined;
  if (o['container'] !== true && image === undefined) return c;
  return { ...(c ?? containerDefaults()), ...(image !== undefined && { image }) };
}

/**
 * The machine's own default, for a project that sets nothing: `OXMUTATE_CONTAINER` (`1`/`true`,
 * `0`/`false`, an image name, or the object form as JSON), else `container` in
 * `$XDG_CONFIG_HOME/oxmutate/config.json` (else `~/.config/oxmutate/config.json`).
 */
export function machineDefault(): unknown {
  const value = env[INSIDE];
  if (value !== undefined && value !== '' && value !== 'inside') {
    if (value === '1' || value === 'true') return true;
    if (value === '0' || value === 'false') return false;
    return value.trimStart().startsWith('{') ? (JSON.parse(value) as unknown) : value;
  }
  const file = path.join(env['XDG_CONFIG_HOME'] || path.join(homedir(), '.config'), 'oxmutate', 'config.json');
  if (!existsSync(file)) return undefined;
  // Stryker disable next-line StringLiteral: without an encoding readFileSync answers a Buffer, and JSON.parse reads a Buffer as UTF-8 text all the same
  return (JSON.parse(readFileSync(file, 'utf8')) as { container?: unknown }).container;
}

const REF_FLAGS = new Set(['--since', '--frozen-oracle']);

/**
 * The run's own arguments for the oxmutate inside: without the container's (it is the project's,
 * which may not know them, and is inside already), and with each git ref the run names replaced by
 * the tag that ref's tree has inside.
 */
export function withoutContainerFlags(argv: readonly string[], tags: ReadonlyMap<string, string> = new Map()): string[] {
  const out: string[] = [];
  let skip = false;
  let ref = false;
  for (const a of argv) {
    if (skip) skip = false;
    else if (ref) {
      out.push(tags.get(a) ?? a);
      ref = false;
    } else if (a === '--container-image') skip = true;
    else if (REF_FLAGS.has(a)) {
      out.push(a);
      ref = true;
    } else if (/^--(?:since|frozen-oracle)=/u.test(a)) {
      const at = a.indexOf('=');
      const value = a.slice(at + 1);
      out.push(`${a.slice(0, at)}=${tags.get(value) ?? value}`);
    } else if (!/^--(?:no-)?container(?:$|-image=)/u.test(a)) out.push(a);
  }
  return out;
}

/** The install command a lockfile asks for; Yarn 2 and later (`berry`) installs with `--immutable`. */
export function defaultInstall(lock: string | undefined, berry = false): string {
  if (berry) return 'corepack enable && yarn install --immutable';
  if (lock === 'package-lock.json' || lock === 'npm-shrinkwrap.json') return 'npm ci';
  if (lock === 'pnpm-lock.yaml') return 'corepack enable && pnpm install --frozen-lockfile';
  if (lock === 'yarn.lock') return 'corepack enable && yarn install --frozen-lockfile';
  return 'npm install';
}

const quote = (s: string): string => `'${s.replaceAll("'", String.raw`'\''`)}'`;

/** The sync script's exit when the volume is not the one the host last synced: send it whole. */
export const RESYNC = 75;

/** The sync script's exit code when it failed with its volume (nearly) full. */
export const FULL = 6;

/** What the engine, tar, npm or the kernel say when a disk has no room. */
const DISK_FULL = /no space left on device|ENOSPC|disk quota exceeded/iu;

/**
 * The one line a full disk gives: the engine's disk (Docker Desktop's or the Podman machine's image
 * holds every volume), or the host's own temporary directory, and what frees it.
 */
export const fullDisk = (what: string, engine: string, where: 'engine' | 'host' = 'engine'): string => {
  const base = path.basename(engine).startsWith('podman') ? 'podman' : 'docker';
  return where === 'host'
    ? `${what}: the host's disk is full (${tmpdir()} holds the run's staging). fix: free space there, or set TMPDIR to a disk with room`
    : `${what}: the engine's disk is full. fix: run \`oxmutate prune\` to remove oxmutate's volumes and \`${base} system prune\` for the rest, or give Docker Desktop or the Podman machine a bigger disk (\`podman machine set --disk-size\`)`;
};


/** A git ref the run names (`--since`, `--frozen-oracle`), the commit it is, and the tag it becomes inside. */
export interface Base {
  ref: string;
  commit: string;
  tag: string;
}

export interface PlanInput {
  /** The project, relative to the repository root, `/`-separated. */
  rel: string;
  /** The oxmutate inside's arguments, as it will get them. */
  argv: readonly string[];
  /** Changes when the install must run again. */
  key: string;
  install: string;
  volume: string;
  /** Repository-relative files copied back to the host. */
  keep: readonly string[];
  /** `source: 'git'`: what to fetch, and from where. */
  fetch?: { remote: string; commit: string } | undefined;
  /** `source: 'copy'`: what this sync sends. */
  sync?: Sending | undefined;
  /** The sync container's own `create` arguments: the forwarded registry auth (`registryAuth`). */
  auth?: readonly string[] | undefined;
  bases?: readonly Base[] | undefined;
}

const GIT_CHECK = (why: string): string => `command -v git >/dev/null || { echo 'oxmutate: ${why} needs git in the image. fix: container.image node:${nodeMajor}' >&2; exit 3; }`;

/** Files removed per line of the sync script. */
const REMOVALS_PER_LINE = 50;

/** `rm -f -- <files>`, a bounded number to a line. */
const removals = (files: readonly string[]): string[] => {
  const lines: string[] = [];
  for (let i = 0; i < files.length; i += REMOVALS_PER_LINE) lines.push(`rm -f -- ${files.slice(i, i + REMOVALS_PER_LINE).map(quote).join(' ')}`);
  return lines;
};

/** Below this much room on the volume (KiB), a failed sync is reported as a full volume. */
export const MIN_FREE_KIB = 65536;

/**
 * Installed first in the sync script: when the script fails (not for RESYNC, which is a request) and the volume
 * has under \`MIN_FREE_KIB\` left, the exit code is \`FULL\`. The install's own output goes to the terminal, where
 * the host cannot read it, so the volume itself says whether a failed install ran out of room.
 */
export const FULL_TRAP = `trap 'rc=$?; if [ "$rc" -ne 0 ] && [ "$rc" -ne ${String(RESYNC)} ]; then set -- $(df -Pk ${WORK} 2>/dev/null | tail -n 1); [ "\${4:-999999}" -ge ${String(MIN_FREE_KIB)} ] || { echo "oxmutate: the volume has no room left" >&2; exit ${String(FULL)}; }; fi; exit "$rc"' EXIT`;

/** How the copy gets into the volume: whole (unpacked, then pruned to the host's listing), or a delta on the volume last synced. */
function copySteps(sync: Sending): string[] {
  const unpack = [`[ ! -f ${WORK}/in.tar ] || tar -xovf ${WORK}/in.tar >/dev/null`, `rm -f ${WORK}/in.tar`];
  if (sync.mode === 'whole') {
    // -o: the files are the container user's, whoever owned them on the host (no CAP_CHOWN here).
    return [...unpack, `node -e ${quote(PRUNE)} ${SRC} ${WORK}/listing`, `rm -f ${WORK}/listing`, `echo ${quote(sync.token)} > ${WORK}/synced`];
  }
  return [
    `[ "$(cat ${WORK}/synced 2>/dev/null)" = ${quote(sync.token)} ] || { echo 'oxmutate: the volume is not the one last synced; sending the whole repository' >&2; exit ${String(RESYNC)}; }`,
    ...unpack,
    ...removals(sync.deleted),
  ];
}

/** Each base's tree, from the archive the host sent, as a commit and a tag; then the source's own files staged, so a diff sees new ones. */
function baseSteps(bases: readonly Base[]): string[] {
  if (bases.length === 0) return [];
  return [
    GIT_CHECK('--since or --frozen-oracle in a container'),
    ...bases.map((_, i) => `rm -rf ${WORK}/base-${String(i)} && mkdir -p ${WORK}/base-${String(i)} && tar -xof ${WORK}/base-${String(i)}.tar -C ${WORK}/base-${String(i)} && rm -f ${WORK}/base-${String(i)}.tar`),
    'rm -rf .git && git init -q',
    ...bases.flatMap((b, i) => [
      `git --work-tree=${WORK}/base-${String(i)} add -A`,
      `git -c user.name=oxmutate -c user.email=oxmutate@localhost commit -q --allow-empty -m ${quote(b.ref)}`,
      `git tag -f ${quote(b.tag)}`,
    ]),
    "git add -A -- . ':!**/node_modules'",
  ];
}

/** How a `source: 'git'` volume gets the commit, and each base as a tag. */
function fetchSteps(fetch: { remote: string; commit: string }, keep: readonly string[], bases: readonly Base[]): string[] {
  const kept = ['node_modules', ...keep].map((f) => `-e ${quote(f)}`).join(' ');
  const get = (commit: string): string => `git fetch -q --depth 1 ${quote(fetch.remote)} ${quote(commit)} || { echo 'oxmutate: the container could not fetch ${commit}. fix: push it, or set container.remote' >&2; exit 4; }`;
  return [
    GIT_CHECK('source git'),
    '[ -d .git ] || git init -q',
    ...bases.flatMap((b) => [get(b.commit), `git tag -f ${quote(b.tag)} FETCH_HEAD`]),
    get(fetch.commit),
    'git checkout -q -f FETCH_HEAD',
    `git clean -q -fdx ${kept}`,
  ];
}

/** What every container gets: no capability, no way to gain one, a label, and the options set for all. */
function common(c: Container): string[] {
  return [
    '--cap-drop=ALL', '--security-opt=no-new-privileges', '--label', 'dev.oxmutate=1',
    ...(c.platform === undefined ? [] : ['--platform', c.platform]),
    ...(c.user === undefined ? [] : ['--user', c.user]),
    ...(c.runtime === undefined || c.runtime === 'default' ? [] : ['--runtime', c.runtime]),
    ...(c.pull === undefined ? [] : [`--pull=${c.pull}`]),
    ...(c.readOnly ? ['--read-only', '--tmpfs', '/tmp:exec', '-e', 'HOME=/tmp'] : []),
    ...(c.pidsLimit === undefined ? [] : ['--pids-limit', String(c.pidsLimit)]),
    ...(c.cpus === undefined ? [] : ['--cpus', String(c.cpus)]),
    ...(c.memory === undefined ? [] : ['--memory', c.memory]),
    ...c.env.flatMap((e) => ['-e', e]),
    ...c.args,
  ];
}

/** The package managers' caches, in the shared volume. */
const cacheMount = (cache: string | false): string[] =>
  cache === false ? [] : ['-v', `${cache}:/cache`, '-e', 'npm_config_cache=/cache/npm', '-e', 'npm_config_store_dir=/cache/pnpm', '-e', 'YARN_CACHE_FOLDER=/cache/yarn'];

/** Creates a named volume, labelled as oxmutate's. */
const label = (name: string): string[] => ['volume', 'create', '--label', 'dev.oxmutate=1', name];

/** The `<engine>` arguments of each step. `sync` is created, then started; `run` is run; `back` is created and copied from. */
export function containerPlan(c: Container, p: PlanInput): { volumes: string[][]; sync: string[]; run: string[]; back: string[]; drop: string[] } {
  const bases = p.bases ?? [];
  const source = p.fetch ? fetchSteps(p.fetch, p.keep, bases) : [...(p.sync ? copySteps(p.sync) : []), ...baseSteps(bases)];
  // The install on a line of its own: a `#` in it comments out the rest of its line, not the `fi`.
  // A brace group with `|| exit`: errexit ignores a failing command in the middle of an `&&` chain, so a
  // `corepack enable && pnpm install && ...` that failed at pnpm went on to write the stamp, and the volume
  // was never installed again (a pnpm install aborted for want of a TTY left an old oxmutate in use, 2026-11-22).
  const install = p.install ? [`if [ "$(cat ${WORK}/installed 2>/dev/null)" != ${quote(p.key)} ]; then`, '{', p.install, '} || exit "$?"', `echo ${quote(p.key)} > ${WORK}/installed; fi`] : [];
  // The host's own oxmutate, once per version: the project need not depend on it, and it reads the argv the host wrote.
  const self = c.command === undefined ? [`[ -x ${SELF_BIN} ] || npm install --no-save --no-audit --no-fund --prefix ${SELF} oxmutate@${VERSION} || { echo 'oxmutate: the container could not install oxmutate@${VERSION} from the registry. fix: set container.command to an oxmutate the image or the project has, and container.install to an install that needs no network' >&2; exit 5; }`] : [];
  const sync = ['set -e', FULL_TRAP, `mkdir -p ${SRC} && cd ${SRC}`, ...source, ...install, ...self].join('\n');
  const run = ['set -e', ...(c.setup ? [c.setup] : []), `cd ${quote(path.posix.join(SRC, p.rel))}`, `exec ${c.command ?? SELF_BIN} ${p.argv.map(quote).join(' ')}`].join('\n');
  // The volume's label is how a second run on it sees this one running (`waitForVolume`).
  const volume = ['-v', `${p.volume}:${WORK}`, '--label', `${VOLUME_LABEL}=${p.volume}`];
  return {
    volumes: [label(p.volume), ...(c.cache === false ? [] : [label(c.cache)])],
    // The install's own environment and auth reach the sync container alone, never the run's.
    sync: ['create', '--rm', ...common(c), ...volume, ...cacheMount(c.cache), ...c.installEnv.flatMap((e) => ['-e', e]), ...(p.auth ?? []), '-w', WORK, c.image, 'sh', '-c', sync],
    run: ['run', '--rm', '--init', `--network=${c.network}`, ...common(c), ...volume, '-w', WORK, '-e', `${INSIDE}=inside`, ...c.runArgs, c.image, 'sh', '-c', run],
    back: ['create', '--network=none', ...common(c), ...volume, c.image, 'true'],
    drop: ['volume', 'rm', '-f', p.volume],
  };
}

type Spawn = (cmd: string, args: readonly string[], o: RunOptions) => Promise<Pick<Result, 'code' | 'stdout' | 'stderr'>>;

/** macOS tar writes extended attributes as `._` files and as headers Linux tar warns about; GNU tar has neither flag but the second. */
export const tarFlags = (host: string): string[] => (host === 'darwin' ? ['--no-mac-metadata', '--no-xattrs'] : ['--no-xattrs']);

/** The engine's own flags and environment: which context or daemon it talks to. */
export function engineOf(c: Container): { global: string[]; env: Record<string, string> } {
  const podman = path.basename(c.engine).startsWith('podman');
  const flag = podman ? '--connection' : '--context';
  const daemon = podman ? 'CONTAINER_HOST' : 'DOCKER_HOST';
  return { global: c.context === undefined ? [] : [flag, c.context], env: c.host === undefined ? {} : { [daemon]: c.host } };
}

/** What Docker and Podman say when the CLI is there and the daemon it talks to is not. */
const DAEMON_DOWN = ['Cannot connect to the Docker daemon', 'Is the docker daemon running', 'connection refused', 'Cannot connect to Podman', 'unable to connect to Podman', 'podman machine start'];

/** Runs the engine, with the fix line when the engine itself is missing or its daemon is not running. */
function engineRunner(spawn: Spawn, c: Container) {
  const { global, env: engineEnv } = engineOf(c);
  return async (args: readonly string[], o: { stdio?: 'inherit' } = {}): Promise<Pick<Result, 'code' | 'stdout' | 'stderr'>> => {
    let r: Pick<Result, 'code' | 'stdout' | 'stderr'>;
    try {
      r = await spawn(c.engine, [...global, ...args], { ...o, runtime: ambientRuntime(), timeout: 0, env: { ...env, ...engineEnv } });
    } catch (e) {
      throw new Error(`${c.engine} did not start (${(e as Error).message}). fix: install and start Docker or Podman, or set container.engine`);
    }
    if (r.code !== 0 && DAEMON_DOWN.some((said) => r.stderr.includes(said))) {
      // A remote daemon is not Docker Desktop: name where it was asked for, and what to check there.
      const remote = c.host ?? c.context;
      if (remote !== undefined) throw new Error(`${c.engine} could not reach the daemon at ${remote} (container.${c.host === undefined ? 'context' : 'host'}). fix: check that it is running and reachable from here (its address, ssh or tls), or remove it to use the local daemon`);
      throw new Error(`${c.engine} is installed but its daemon is not running. fix: start Docker Desktop (or \`podman machine start\`), or set container.engine`);
    }
    return r;
  };
}

type Engine = ReturnType<typeof engineRunner>;

/** gVisor (`runsc`) when the runtime is unset and Docker has it: a kernel of its own between the tests and the host's. */
export async function withRuntime(c: Container, engine: Engine): Promise<Container> {
  if (c.runtime !== undefined || !path.basename(c.engine).startsWith('docker')) return c;
  const info = await engine(['info', '--format', '{{json .Runtimes}}']);
  return info.code === 0 && info.stdout.includes('"runsc"') ? { ...c, runtime: 'runsc' } : c;
}

/** The line a container that could not be created gives: a full disk and a Podman short name have their own fix. */
const createFailed = (stderr: string, name: string): string => {
  if (DISK_FULL.test(stderr)) return fullDisk('the container could not be created', name);
  // Podman refuses a name with no registry when its registries.conf names none and there is no TTY to ask on.
  if (/short-name/iu.test(stderr)) return `the container could not be created: ${stderr.trim()}. fix: set container.image to a full name, such as docker.io/library/node:${String(nodeMajor)}-bookworm-slim`;
  return `the container could not be created: ${stderr.trim()}. fix: check container.image and the engine's own error`;
};

/** Creates a container, copies `files` (host path, container path) into it, starts it attached, and returns its exit code and id. */
async function startWith(engine: Engine, create: readonly string[], files: readonly (readonly [string, string])[], o: { stdio?: 'inherit'; name: string }): Promise<{ code: number | null; id: string }> {
  const made = await engine(create);
  if (made.code !== 0) throw new Error(createFailed(made.stderr, o.name));
  const id = made.stdout.trim();
  const copied = await Promise.all(files.map(async ([from, to]) => engine(['cp', from, `${id}:${to}`])));
  const failed = copied.find((r) => r.code !== 0);
  if (failed) {
    await engine(['rm', '-f', id]);
    throw new Error(DISK_FULL.test(failed.stderr) ? fullDisk('the copy into the container failed', o.name) : `the copy into the container failed: ${failed.stderr.trim()}. fix: run \`oxmutate prune\` and try again; if it repeats, check the engine's own error and container.image`);
  }
  const started = await engine(['start', '-a', id], o.stdio ? { stdio: o.stdio } : {});
  return { code: started.code, id };
}

/** A sync that sends something (a skip starts no sync container). */
export type Sending = Exclude<SyncPlan, { mode: 'skip' }>;

interface Host {
  spawn: Spawn;
  top: string;
  io: string;
  host: string;
}


/** The files the copy source sends: a tar of `send`, the listing for a whole sync, and each base's tree. */
async function pack({ spawn, top, io, host }: Host, sync: Sending, listing: readonly string[], bases: readonly Base[]): Promise<[string, string][]> {
  const runtime = ambientRuntime();
  const files: [string, string][] = [];
  const { send } = sync;
  if (send.length > 0) {
    writeFileSync(path.join(io, 'files'), send.join('\0'));
    // The archive is named relative to `io`: GNU tar (Git Bash's on Windows) reads `C:/…` as a remote host.
    const tar = await spawn('tar', ['-cf', 'in.tar', ...tarFlags(host), '-C', top, '--null', '-T', path.join(io, 'files')], { cwd: io, runtime, timeout: 0 });
    if (tar.code !== 0) throw new Error(DISK_FULL.test(tar.stderr) ? fullDisk(`tar could not pack ${top}`, '', 'host') : `tar could not pack ${top}: ${tar.stderr.trim()}. fix: check the tar error above and that every listed file is readable`);
    files.push([path.join(io, 'in.tar'), `${WORK}/in.tar`]);
  }
  if (sync.mode === 'whole') {
    writeFileSync(path.join(io, 'listing'), listing.join('\0'));
    files.push([path.join(io, 'listing'), `${WORK}/listing`]);
  }
  for (const [i, b] of bases.entries()) {
    // eslint-disable-next-line reliability/no-await-in-loop -- one archive per ref the run names: two at most, and each is git reading its own pack
    const archived = await spawn('git', ['archive', '--format=tar', '-o', path.join(io, `base-${String(i)}.tar`), b.commit], { cwd: top, runtime, timeout: 0 });
    if (archived.code !== 0) throw new Error(`git could not archive ${b.ref}: ${archived.stderr.trim()}`);
    files.push([path.join(io, `base-${String(i)}.tar`), `${WORK}/base-${String(i)}.tar`]);
  }
  return files;
}

/** Each ref the run names, as a commit (resolved on the host) and the tag it becomes inside. */
async function basesOf(spawn: Spawn, top: string, refs: readonly (string | undefined)[]): Promise<Base[]> {
  const named = [...new Set(refs.filter((r): r is string => r !== undefined))];
  return Promise.all(
    named.map(async (ref, i) => {
      const r = await spawn('git', ['rev-parse', '--verify', `${ref}^{commit}`], { cwd: top, runtime: ambientRuntime() });
      if (r.code !== 0) throw new Error(`${ref} is not a commit in ${top}. fix: name a branch, tag or commit that exists, such as origin/main`);
      return { ref, commit: r.stdout.trim(), tag: `oxmutate-base-${String(i)}` };
    }),
  );
}

/** The install's key: the image, the command, and the lockfile (else package.json). */
function installKey(c: Container, top: string, install: string, lock: string | undefined): string {
  const manifest = [lock, 'package.json'].find((f) => f !== undefined && existsSync(path.join(top, f)));
  const hash = createHash('sha256').update(`${c.image}\0${install}\0${VERSION}\0`);
  if (manifest) hash.update(readFileSync(path.join(top, manifest)));
  return hash.digest('hex');
}

/**
 * Copies each kept file back to the host from a container created on the volume and never started.
 * One `<engine> cp` per file, into the host's own temporary directory first, so a file the run did
 * not write leaves nothing behind, not even its directory. No tar runs on the host.
 */
async function copyBack({ engine, name, back, keep, io, top }: { engine: Engine; name: string; back: readonly string[]; keep: readonly string[]; io: string; top: string }): Promise<void> {
  const made = await engine(back);
  if (made.code !== 0) throw new Error(createFailed(made.stderr, name));
  const id = made.stdout.trim();
  try {
    await Promise.all(
      keep.map(async (file, i) => {
        const staged = path.join(io, `kept-${String(i)}`);
        if ((await engine(['cp', `${id}:${SRC}/${file}`, staged])).code !== 0) return;
        try {
          mkdirSync(path.dirname(path.join(top, file)), { recursive: true });
          copyFileSync(staged, path.join(top, file));
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code === 'ENOSPC') throw new Error(fullDisk(`${file} could not be written to ${top}`, name, 'host'));
          throw e;
        }
      }),
    );
  } finally {
    await engine(['rm', '-f', id]);
  }
}

/** The repository's git files and the kept ones, repository-relative. */
async function listed(spawn: Spawn, top: string, keep: readonly string[], include: readonly string[]): Promise<string[]> {
  const files = async (args: string[]): Promise<string[]> => (await spawn('git', ['ls-files', '-z', ...args], { cwd: top, runtime: ambientRuntime(), timeout: 0 })).stdout.split('\0');
  const out = await files(['--cached', '--others', '--exclude-standard']);
  // `include`: the ignored files it names, as git pathspecs with glob magic (`**`, `*`, or a plain path).
  const ignored = include.length > 0 ? await files(['--others', '--ignored', '--exclude-standard', '--', ...include.map((g) => `:(glob)${g}`)]) : [];
  return [...new Set([...out, ...ignored, ...keep])].filter((f) => f !== '');
}

/** The registry auth the install gets: the host's npm user config and `.yarnrc.yml`, copied into the sync container, and each `${NAME}` they name. */
function registryAuth(io: string): { files: [string, string][]; create: string[] } {
  const npmrc = env['npm_config_userconfig'] || path.join(homedir(), '.npmrc');
  const yarnrc = path.join(homedir(), '.yarnrc.yml');
  const files: [string, string][] = [];
  const create: string[] = [];
  // Staged world-readable in the run's own 0700 directory: the container drops every capability, so root
  // cannot read a file another uid owns (`docker cp` keeps the host's uid), and an npmrc is mode 0600.
  if (existsSync(npmrc)) {
    const staged = path.join(io, 'npmrc');
    copyFileSync(npmrc, staged);
    chmodSync(staged, READABLE);
    files.push([staged, NPMRC]);
    create.push('-e', `npm_config_userconfig=${NPMRC}`);
  }
  if (existsSync(yarnrc)) {
    // Yarn reads `.yarnrc.yml` from HOME and no variable names it, so the sync gets a HOME of its own holding it.
    mkdirSync(path.join(io, 'home'));
    copyFileSync(yarnrc, path.join(io, 'home', '.yarnrc.yml'));
    chmodSync(path.join(io, 'home', '.yarnrc.yml'), READABLE);
    files.push([path.join(io, 'home'), AUTH_HOME]);
    create.push('-e', `HOME=${AUTH_HOME}`);
  }
  // Each `${NAME}` either file names, read as text (a Buffer has no matchAll), passed from the host's environment.
  const named = [npmrc, yarnrc].filter((f) => existsSync(f)).flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/\$\{(\w+)\}/gu)].map((m) => String(m[1])));
  return { files, create: [...create, ...[...new Set(named)].flatMap((n) => ['-e', n])] };
}

/**
 * Syncs the volume: the copy's delta (or all of it, when the volume is not the one last synced),
 * or the commit to fetch. Records what was sent once the sync succeeded.
 */
async function syncVolume(h: Host & { engine: Engine; c: Container; plan: (sync: Sending | undefined) => ReturnType<typeof containerPlan>; key: string; volume: string; keep: readonly string[]; bases: readonly Base[]; auth: readonly [string, string][] }): Promise<void> {
  const { engine, c, key, volume, bases, auth } = h;
  if (c.source === 'git') {
    const synced = await startWith(engine, h.plan(undefined).sync, auth, { stdio: 'inherit', name: c.engine });
    if (synced.code !== 0) throw new Error(installFailed(synced.code, c.engine));
    return;
  }
  const names = await listed(h.spawn, h.top, h.keep, c.include);
  const now = signatures(h.top, names);
  const volumeExisted = (await engine(['volume', 'inspect', volume])).code === 0;
  let sync = planSync(now, c.ephemeral ? undefined : readState(volume), { volumeExisted, install: key, mustRun: bases.length > 0 });
  if (sync.mode !== 'skip') {
    const send = async (s: Sending): Promise<number | null> => (await startWith(engine, h.plan(s).sync, [...(await pack(h, s, names, bases)), ...auth], { stdio: 'inherit', name: c.engine })).code;
    let code = await send(sync);
    // A volume that is not the one last synced refuses the delta: it gets everything, once.
    if (code === RESYNC && sync.mode === 'delta') {
      sync = wholeSync(now);
      code = await send(sync);
    }
    if (code !== 0) throw new Error(installFailed(code, c.engine));
  }
  if (!c.ephemeral) writeState(volume, nextState(sync, key, now));
}

/** The one line a failed sync or install gives: what its output above most often means, and what to set. */
export const installFailed = (code: number | null, engine = 'docker'): string =>
  code === FULL ? fullDisk(`the sync into the container or its install failed (exit ${String(code)})`, engine) : `the sync into the container or its install failed (exit ${String(code)}); its output is above. fix: for "out of date" or "frozen", update the lockfile on the host (npm, pnpm or yarn install) and commit it; for 401, 403 or 404, log in to the registry on the host (~/.npmrc, ~/.yarnrc.yml; container.installEnv for a token variable); otherwise set container.install, or container.image to one with what the install needs`;

/** How often a run waiting for the volume asks again, and how many times before it gives up (10 minutes). */
const BUSY_POLL_MS = 2000;
const BUSY_POLLS = 300;

/**
 * Waits while another run's containers work on `volume`, so two runs on one repository never sync
 * into it at once: polls `<engine> ps` for the volume's label, says once that it waits, and fails
 * with the fix line after ten minutes.
 */
async function waitForVolume(engine: Engine, volume: string, wait: (ms: number) => Promise<unknown>): Promise<void> {
  for (let poll = 0; poll < BUSY_POLLS; poll++) {
    const running = await engine(['ps', '-q', '--filter', `label=${VOLUME_LABEL}=${volume}`]);
    if (running.stdout.trim() === '') return;
    if (poll === 0) stderr.write(`oxmutate: another run is using ${volume}; waiting\n`);
    await wait(BUSY_POLL_MS);
  }
  throw new Error(`another run has used ${volume} for 10 minutes. fix: wait for it to end, stop it (oxmutate prune removes its containers), or set container.volume to another`);
}

/**
 * Runs `argv` (oxmutate's own, after the binary) inside the container and returns its exit code.
 * `keep`: absolute paths to copy back (the reports, the incremental file).
 */
export async function runInContainer(
  c: Container,
  o: { root: string; keep: readonly string[]; since?: string | undefined; frozenOracle?: string | undefined },
  argv: readonly string[],
  { spawn = run, host = platform, wait = sleep }: { spawn?: Spawn; host?: string; wait?: (ms: number) => Promise<unknown> } = {},
): Promise<number> {
  const git = await spawn('git', ['rev-parse', '--show-toplevel'], { cwd: o.root, runtime: ambientRuntime() });
  if (git.code !== 0) throw new Error(`container copies the git repository the project is in, and ${o.root} is in none. fix: git init, or run with --no-container`);
  // Both resolved the same way: on Windows git answers `C:/Users/runneradmin/…` where Node has
  // `C:\\Users\\RUNNER~1\\…`, and paths compared across the two never match.
  const top = realpathSync.native(git.stdout.trim());
  const rel = path.relative(top, realpathSync.native(o.root)).split(path.sep).join('/');
  const keep = o.keep.flatMap((f) => {
    const fromRoot = path.relative(o.root, f);
    // A file on another drive has no relative path; Windows answers it absolute, and it is not in the repository.
    // Stryker disable next-line all: path.relative answers an absolute path only across Windows drives; the Windows CI leg runs the test that needs it
    if (path.isAbsolute(fromRoot)) return [];
    const inRepo = path.posix.join(rel, fromRoot.split(path.sep).join('/'));
    return inRepo.startsWith('..') ? [] : [inRepo];
  });
  const io = mkdtempSync(path.join(tmpdir(), 'oxmutate-io-'));
  const engine = engineRunner(spawn, c);
  try {
    const bases = await basesOf(spawn, top, [o.since, o.frozenOracle]);
    const tags = new Map(bases.map((b) => [b.ref, b.tag]));
    const runnable = await withRuntime(c, engine);
    const { install, key, auth } = installOf(runnable, top, io);
    const volume = runnable.volume ?? `oxmutate-${createHash('sha256').update(top).digest('hex').slice(0, VOLUME_HASH_CHARS)}`;
    const fetch = runnable.source === 'git' ? await fetchOf(spawn, runnable, top) : undefined;
    const plan = (sync: Sending | undefined): ReturnType<typeof containerPlan> => containerPlan(runnable, { rel, argv: withoutContainerFlags(argv, tags), key, install, volume, keep, fetch, sync, bases, auth: auth.create });
    const steps = plan(undefined);
    for (const v of steps.volumes) {
      // eslint-disable-next-line reliability/no-await-in-loop -- the run's volume and the shared cache, in order
      const made = await engine(v);
      // Podman, unlike Docker, refuses to create a volume that exists.
      if (made.code !== 0 && !made.stderr.includes('already exists')) throw new Error(DISK_FULL.test(made.stderr) ? fullDisk(`the volume ${String(v.at(-1))} could not be created`, runnable.engine) : `the volume ${String(v.at(-1))} could not be created: ${made.stderr.trim()}. fix: check the engine's own error, or set container.volume`);
    }
    await waitForVolume(engine, volume, wait);
    try {
      await syncVolume({ spawn, top, io, host, engine, c: runnable, plan, key, volume, keep, bases, auth: auth.files });
      const ran = await engine(steps.run, { stdio: 'inherit' });
      // Exit 0 and 1 end with a report (1: a threshold missed). Any other code failed before writing one, and what the volume holds is an earlier run's.
      if (keep.length > 0 && (ran.code === 0 || ran.code === 1)) await copyBack({ engine, name: runnable.engine, back: steps.back, keep, io, top });
      return ran.code ?? 1;
    } finally {
      if (runnable.ephemeral) await engine(steps.drop);
    }
  } finally {
    removeWorkDir(io);
  }
}

/** The install, its key, and the registry auth it gets; a bun project without an install refuses here, before anything is synced. */
function installOf(c: Container, top: string, io: string): { install: string; key: string; auth: { files: [string, string][]; create: string[] } } {
  const lock = LOCKS.find((f) => existsSync(path.join(top, f)));
  const bun = BUN_LOCKS.find((f) => existsSync(path.join(top, f)));
  if (c.install === undefined && bun !== undefined) throw new Error(`${bun} is bun's, and the container installs with npm, pnpm or yarn. fix: set container.image to one with bun (such as oven/bun) and container.install (such as bun install --frozen-lockfile)`);
  const install = c.install ?? defaultInstall(lock, isBerry(top));
  const forward = c.registryAuth ?? c.host === undefined;
  if (c.registryAuth === undefined && !forward) stderr.write('oxmutate: ~/.npmrc and ~/.yarnrc.yml are not forwarded to a remote engine (container.host). fix: set container.registryAuth: true to forward them to the install\n');
  return { install, key: installKey(c, top, install, lock), auth: forward ? registryAuth(io) : { files: [], create: [] } };
}

/** Yarn 2 or later: a `.yarnrc.yml`, or `packageManager` naming yarn 2+. */
function isBerry(top: string): boolean {
  if (existsSync(path.join(top, '.yarnrc.yml'))) return true;
  const manifest = path.join(top, 'package.json');
  // Stryker disable next-line StringLiteral: RegExp#test reads a Buffer as its UTF-8 text, so the encoding changes nothing
  return existsSync(manifest) && /"packageManager"\s*:\s*"yarn@(?:[2-9]|[1-9]\d)/u.test(readFileSync(manifest, 'utf8'));
}

/** `source: 'git'`: `HEAD`'s commit, and the remote to fetch it from. */
async function fetchOf(spawn: Spawn, c: Container, top: string): Promise<{ remote: string; commit: string }> {
  const runtime = ambientRuntime();
  const commit = (await spawn('git', ['rev-parse', 'HEAD'], { cwd: top, runtime })).stdout.trim();
  const remote = c.remote ?? (await spawn('git', ['remote', 'get-url', 'origin'], { cwd: top, runtime })).stdout.trim();
  if (!remote) throw new Error('source git fetches from a remote, and this repository has no origin. fix: set container.remote');
  return { remote, commit };
}

/** `oxmutate prune`: every container and volume oxmutate's container mode made, and the host's sync records. */
export async function pruneContainers(c: Container, spawn: Spawn = run): Promise<{ containers: string[]; volumes: string[] }> {
  const engine = engineRunner(spawn, c);
  const list = async (args: string[]): Promise<string[]> => {
    const r = await engine(args);
    if (r.code !== 0) throw new Error(`${c.engine} could not list what oxmutate made: ${r.stderr.trim()}. fix: start the engine, or set container.engine`);
    return r.stdout.split(/\s/u).filter(Boolean);
  };
  const containers = await list(['ps', '-aq', '--filter', 'label=dev.oxmutate=1']);
  if (containers.length > 0) await engine(['rm', '-f', ...containers]);
  const volumes = await list(['volume', 'ls', '-q', '--filter', 'label=dev.oxmutate=1']);
  if (volumes.length > 0) await engine(['volume', 'rm', '-f', ...volumes]);
  rmSync(syncDir(), { recursive: true, force: true });
  return { containers, volumes };
}
