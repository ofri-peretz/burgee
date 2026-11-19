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
 *   3. copy back: the reports and the incremental file are packed and copied to the host.
 *   4. with `ephemeral`, the volume is removed.
 * Every container drops all capabilities, cannot gain one (`no-new-privileges`), is labelled
 * `dev.oxmutate=1` and is removed after it ends. `platform`, `user`, `runtime` (a sandbox such as
 * gVisor's `runsc`), `readOnly`, `pull`, `pidsLimit`, `cpus` and `memory` reach every container;
 * `args` passes anything else to each, `runArgs` to the run's alone.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { ambientRuntime, run, type Result, type RunOptions } from 'bellpull';

import { env, nodeMajor, platform } from './runtime.js';
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
  /** The container runtime, such as gVisor's `runsc`. */
  runtime?: string | undefined;
  /** A read-only root filesystem; `/tmp` is a tmpfs and `HOME`. */
  readOnly: boolean;
  /** `always`, `missing` or `never` (`--pull`). */
  pull?: string | undefined;
  pidsLimit?: number | undefined;
  cpus?: number | undefined;
  memory?: string | undefined;
  /** `NAME` passes the host's value, `NAME=value` sets one. */
  env: string[];
  /** Extra arguments to every container, verbatim. */
  args: string[];
  /** Extra arguments to the run's container alone. */
  runArgs: string[];
  /** oxmutate inside the container. */
  command: string;
}

/** Set inside the container, so the run there does not start another. */
export const INSIDE = 'OXMUTATE_CONTAINER';
const WORK = '/w';
const SRC = `${WORK}/src`;
/** Hex characters of the repository path's hash in the default volume name. */
const VOLUME_HASH_CHARS = 12;
const STRINGS = ['engine', 'image', 'network', 'remote', 'install', 'setup', 'volume', 'context', 'host', 'platform', 'user', 'runtime', 'pull', 'memory', 'command'] as const;
const KEYS = new Set<string>([...STRINGS, 'source', 'ephemeral', 'readOnly', 'pidsLimit', 'cpus', 'env', 'args', 'runArgs']);
export const LOCKS = ['package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock'];

// Stryker disable next-line ConditionalExpression: containerOf returns before this for null, so the null check never decides
const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Every key's default. */
export const containerDefaults = (): Container => ({ engine: 'docker', image: `node:${nodeMajor}-bookworm-slim`, network: 'none', source: 'copy', ephemeral: false, readOnly: false, env: [], args: [], runArgs: [], command: 'npx --no oxmutate' });

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
    ephemeral: raw['ephemeral'] === true,
    readOnly: raw['readOnly'] === true,
    pidsLimit: number('pidsLimit'),
    cpus: number('cpus'),
    env: list('env'),
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
 * The run's own arguments without the container's: the oxmutate inside is the project's, which
 * may be a version that does not know them, and is inside already.
 */
export function withoutContainerFlags(argv: readonly string[]): string[] {
  const out: string[] = [];
  let value = false;
  for (const a of argv) {
    if (value) value = false;
    else if (a === '--container-image') value = true;
    else if (!/^--(?:no-)?container(?:$|-image=)/u.test(a)) out.push(a);
  }
  return out;
}

/** The install command a lockfile asks for. */
export function defaultInstall(lock: string | undefined): string {
  if (lock === 'package-lock.json' || lock === 'npm-shrinkwrap.json') return 'npm ci';
  if (lock === 'pnpm-lock.yaml') return 'corepack enable && pnpm install --frozen-lockfile';
  if (lock === 'yarn.lock') return 'corepack enable && yarn install --frozen-lockfile';
  return 'npm install';
}

const quote = (s: string): string => `'${s.replaceAll("'", String.raw`'\''`)}'`;

/** Deletes what the last sync wrote and this one did not: a file deleted on the host. */
const PRUNE = "const fs=require('fs');const [a,b]=process.argv.slice(1);if(fs.existsSync(a)){const k=new Set(fs.readFileSync(b,'utf8').split('\\n'));for(const f of fs.readFileSync(a,'utf8').split('\\n'))if(f&&!k.has(f))fs.rmSync(f,{force:true})}";

export interface PlanInput {
  /** The project, relative to the repository root, `/`-separated. */
  rel: string;
  argv: readonly string[];
  /** Changes when the install must run again. */
  key: string;
  install: string;
  volume: string;
  /** Repository-relative files copied back to the host. */
  keep: readonly string[];
  /** `source: 'git'`: what to fetch, and from where. */
  fetch?: { remote: string; commit: string } | undefined;
}

/** How the source gets into the volume: unpacked from what the host copied in, or fetched by commit. */
function sourceSteps(p: PlanInput): string[] {
  if (!p.fetch) {
    return [
      // -o: the files are the container user's, whoever owned them on the host (no CAP_CHOWN here).
      `tar -xovf ${WORK}/in.tar > ${WORK}/manifest.new`,
      `rm -f ${WORK}/in.tar`,
      `node -e ${quote(PRUNE)} ${WORK}/manifest ${WORK}/manifest.new`,
      `mv ${WORK}/manifest.new ${WORK}/manifest`,
    ];
  }
  const kept = ['node_modules', ...p.keep].map((f) => `-e ${quote(f)}`).join(' ');
  return [
    `command -v git >/dev/null || { echo 'oxmutate: source git needs git in the image. fix: container.image node:${nodeMajor}, or source copy' >&2; exit 3; }`,
    '[ -d .git ] || git init -q',
    `git fetch -q --depth 1 ${quote(p.fetch.remote)} ${quote(p.fetch.commit)} || { echo 'oxmutate: the container could not fetch ${p.fetch.commit}. fix: push it, or set container.remote' >&2; exit 4; }`,
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
    ...(c.runtime === undefined ? [] : ['--runtime', c.runtime]),
    ...(c.pull === undefined ? [] : [`--pull=${c.pull}`]),
    ...(c.readOnly ? ['--read-only', '--tmpfs', '/tmp:exec', '-e', 'HOME=/tmp'] : []),
    ...(c.pidsLimit === undefined ? [] : ['--pids-limit', String(c.pidsLimit)]),
    ...(c.cpus === undefined ? [] : ['--cpus', String(c.cpus)]),
    ...(c.memory === undefined ? [] : ['--memory', c.memory]),
    ...c.env.flatMap((e) => ['-e', e]),
    ...c.args,
  ];
}

/** The `<engine>` arguments of each step. `sync` and `back` are created, then started; `run` is run. */
export function containerPlan(c: Container, p: PlanInput): { volume: string[]; sync: string[]; run: string[]; back: string[]; drop: string[] } {
  const sync = ['set -e', `mkdir -p ${SRC} && cd ${SRC}`, ...sourceSteps(p), ...(p.install ? [`if [ "$(cat ${WORK}/installed 2>/dev/null)" != ${quote(p.key)} ]; then ${p.install}; echo ${quote(p.key)} > ${WORK}/installed; fi`] : [])].join('\n');
  const run = ['set -e', ...(c.setup ? [c.setup] : []), `cd ${quote(path.posix.join(SRC, p.rel))}`, `exec ${c.command} ${p.argv.map(quote).join(' ')}`].join('\n');
  const volume = ['-v', `${p.volume}:${WORK}`];
  return {
    volume: ['volume', 'create', '--label', 'dev.oxmutate=1', p.volume],
    sync: ['create', '--rm', ...common(c), ...volume, '-w', WORK, c.image, 'sh', '-c', sync],
    run: ['run', '--rm', '--init', `--network=${c.network}`, ...common(c), ...volume, '-w', WORK, '-e', `${INSIDE}=inside`, ...c.runArgs, c.image, 'sh', '-c', run],
    back: ['create', '--network=none', ...common(c), ...volume, '-w', SRC, c.image, 'sh', '-c', `rm -f ${WORK}/out.tar; for f; do [ -e "$f" ] && printf "%s\\n" "$f"; done > ${WORK}/keep.list; if [ -s ${WORK}/keep.list ]; then tar -cf ${WORK}/out.tar -T ${WORK}/keep.list; fi`, 'sh', ...p.keep],
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

/** Runs the engine, with the fix line when the engine itself is missing. */
function engineRunner(spawn: Spawn, c: Container) {
  const { global, env: engineEnv } = engineOf(c);
  return async (args: readonly string[], o: { stdio?: 'inherit' } = {}): Promise<Pick<Result, 'code' | 'stdout' | 'stderr'>> => {
    try {
      return await spawn(c.engine, [...global, ...args], { ...o, runtime: ambientRuntime(), timeout: 0, env: { ...env, ...engineEnv } });
    } catch (e) {
      throw new Error(`${c.engine} did not start (${(e as Error).message}). fix: install and start Docker or Podman, or set container.engine`);
    }
  };
}

type Engine = ReturnType<typeof engineRunner>;

/** Creates a container, copies `file` (host path, container path) into it, starts it attached, and returns its exit code and id. */
async function startWith(engine: Engine, create: readonly string[], file: readonly [string, string] | undefined, o: { stdio?: 'inherit' } = {}): Promise<{ code: number | null; id: string }> {
  const made = await engine(create);
  if (made.code !== 0) throw new Error(`the container could not be created: ${made.stderr.trim()}. fix: check container.image and the engine's own error`);
  const id = made.stdout.trim();
  if (file) {
    const cp = await engine(['cp', file[0], `${id}:${file[1]}`]);
    if (cp.code !== 0) throw new Error(`the copy into the container failed: ${cp.stderr.trim()}`);
  }
  const started = await engine(['start', '-a', id], o.stdio ? { stdio: o.stdio } : {});
  return { code: started.code, id };
}

/** The source as the plan needs it: a tar of the git files to copy in, or a commit to fetch. */
async function sourceOf({ spawn, c, top, keep, io, host }: { spawn: Spawn; c: Container; top: string; keep: readonly string[]; io: string; host: string }): Promise<{ file?: [string, string]; fetch?: { remote: string; commit: string } }> {
  const runtime = ambientRuntime();
  if (c.source === 'git') {
    const commit = (await spawn('git', ['rev-parse', 'HEAD'], { cwd: top, runtime })).stdout.trim();
    const remote = c.remote ?? (await spawn('git', ['remote', 'get-url', 'origin'], { cwd: top, runtime })).stdout.trim();
    if (!remote) throw new Error('source git fetches from a remote, and this repository has no origin. fix: set container.remote');
    return { fetch: { remote, commit } };
  }
  const listed = (await spawn('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: top, runtime, timeout: 0 })).stdout.split('\0');
  const files = [...new Set([...listed, ...keep])].filter((f) => f !== '' && existsSync(path.join(top, f)));
  writeFileSync(path.join(io, 'files'), files.join('\0'));
  // The archive is named relative to `io`: GNU tar (Git Bash's on Windows) reads `C:/…` as a remote host.
  const tar = await spawn('tar', ['-cf', 'in.tar', ...tarFlags(host), '-C', top, '--null', '-T', path.join(io, 'files')], { cwd: io, runtime, timeout: 0 });
  if (tar.code !== 0) throw new Error(`tar could not pack ${top}: ${tar.stderr.trim()}`);
  return { file: [path.join(io, 'in.tar'), `${WORK}/in.tar`] };
}

/** The install's key: the image, the command, and the lockfile (else package.json). */
function installKey(c: Container, top: string, install: string, lock: string | undefined): string {
  const manifest = [lock, 'package.json'].find((f) => f !== undefined && existsSync(path.join(top, f)));
  const hash = createHash('sha256').update(`${c.image}\0${install}\0`);
  if (manifest) hash.update(readFileSync(path.join(top, manifest)));
  return hash.digest('hex');
}

/** Copies the kept files back to the host, through a stopped container. */
async function copyBack({ engine, spawn, back, io, top }: { engine: Engine; spawn: Spawn; back: readonly string[]; io: string; top: string }): Promise<void> {
  const packed = await startWith(engine, back, undefined);
  try {
    if (packed.code === 0 && (await engine(['cp', `${packed.id}:${WORK}/out.tar`, path.join(io, 'out.tar')])).code === 0) {
      await spawn('tar', ['-xf', 'out.tar', '-C', top], { cwd: io, runtime: ambientRuntime(), timeout: 0 });
    }
  } finally {
    await engine(['rm', '-f', packed.id]);
  }
}

/**
 * Runs `argv` (oxmutate's own, after the binary) inside the container and returns its exit code.
 * `keep`: absolute paths to copy back (the reports, the incremental file).
 */
export async function runInContainer(c: Container, o: { root: string; keep: readonly string[]; since?: string | undefined; frozenOracle?: string | undefined }, argv: readonly string[], { spawn = run, host = platform }: { spawn?: Spawn; host?: string } = {}): Promise<number> {
  if (o.since !== undefined || o.frozenOracle !== undefined) throw new Error('--since and --frozen-oracle read git history, and the container gets the files without it. fix: run them with --no-container');
  const git = await spawn('git', ['rev-parse', '--show-toplevel'], { cwd: o.root, runtime: ambientRuntime() });
  if (git.code !== 0) throw new Error(`container copies the git repository the project is in, and ${o.root} is in none. fix: git init, or run with --no-container`);
  // Both resolved the same way: on Windows git answers `C:/Users/runneradmin/…` where Node has
  // `C:\\Users\\RUNNER~1\\…`, and paths compared across the two never match.
  const top = realpathSync.native(git.stdout.trim());
  const rel = path.relative(top, realpathSync.native(o.root)).split(path.sep).join('/');
  const keep = o.keep.map((f) => path.posix.join(rel, path.relative(o.root, f).split(path.sep).join('/'))).filter((f) => !f.startsWith('..'));
  const io = mkdtempSync(path.join(tmpdir(), 'oxmutate-io-'));
  const engine = engineRunner(spawn, c);
  try {
    const source = await sourceOf({ spawn, c, top, keep, io, host });
    const lock = LOCKS.find((f) => existsSync(path.join(top, f)));
    const install = c.install ?? defaultInstall(lock);
    const volume = c.volume ?? `oxmutate-${createHash('sha256').update(top).digest('hex').slice(0, VOLUME_HASH_CHARS)}`;
    const plan = containerPlan(c, { rel, argv, key: installKey(c, top, install, lock), install, volume, keep, fetch: source.fetch });
    await engine(plan.volume);
    try {
      const synced = await startWith(engine, plan.sync, source.file, { stdio: 'inherit' });
      if (synced.code !== 0) throw new Error(`the sync into the container or its install failed (exit ${String(synced.code)}); its output is above. fix: set container.install, or container.image to one with what the install needs`);
      const ran = await engine(plan.run, { stdio: 'inherit' });
      if (keep.length > 0) await copyBack({ engine, spawn, back: plan.back, io, top });
      return ran.code ?? 1;
    } finally {
      if (c.ephemeral) await engine(plan.drop);
    }
  } finally {
    removeWorkDir(io);
  }
}
