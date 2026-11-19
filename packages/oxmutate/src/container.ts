/**
 * `container`: oxmutate runs itself inside a container it starts, isolated from the host. The
 * project's git files are copied into a named volume that also keeps the container's own
 * `node_modules` between runs (installed again only when the lockfile, the image or the install
 * command changes). At the end the reports and the incremental file are copied back to the host.
 *
 * Three containers, each removed when it ends, each with every capability dropped and no way to
 * gain one (`--cap-drop=ALL`, `no-new-privileges`), each labelled `dev.oxmutate`:
 *   1. sync: the copy is unpacked into the volume (files the host deleted are deleted there), and
 *      the install runs when its key changed. It has the network, for the install.
 *   2. run: `setup`, then oxmutate. No network unless `network` says so: a test reaches nothing
 *      outside the container.
 *   3. copy back: the kept files are packed for the host.
 * The archives go through a directory under the user's cache (`$XDG_CACHE_HOME`, else `~/.cache`)
 * mounted at `/io`: Docker Desktop and Podman machines both share the home directory.
 *
 * `container: true` takes every default, `container: '<image>'` names the image, and the object
 * form sets any of `engine`, `image`, `network`, `install`, `setup`, `volume`, `cpus`, `memory`,
 * `env`, `args` and `command`. `args` goes to each `<engine> run` verbatim, for anything else.
 */
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

import { ambientRuntime, run, type Result, type RunOptions } from 'bellpull';

import { env, nodeMajor, platform } from './runtime.js';
import { removeWorkDir } from './work-dir.js';

export interface Container {
  /** The container CLI: `docker` (default), `podman`, or any that takes `run --rm -i -v`. */
  engine: string;
  /** Default: `node:<the host's Node major>-bookworm-slim`. */
  image: string;
  /** The run's network (`--network`). Default `none`; the install always has the engine's default. */
  network: string;
  /** Run when the lockfile, image or this command changed. Undefined: chosen by the lockfile; `''`: none. */
  install?: string | undefined;
  /** Run before every run, after the install (a build the tests need). */
  setup?: string | undefined;
  /** The named volume holding the copy. Default: `oxmutate-<hash of the repository path>`. */
  volume?: string | undefined;
  cpus?: number | undefined;
  memory?: string | undefined;
  /** `NAME` passes the host's value, `NAME=value` sets one. */
  env: string[];
  /** Extra `<engine> run` arguments, verbatim. */
  args: string[];
  /** oxmutate inside the container. */
  command: string;
}

/** Set inside the container, so the run there does not start another. */
export const INSIDE = 'OXMUTATE_CONTAINER';
const WORK = '/w';
const SRC = `${WORK}/src`;
/** Hex characters of the repository path's hash in the default volume name. */
const VOLUME_HASH_CHARS = 12;
const KEYS = new Set(['engine', 'image', 'network', 'install', 'setup', 'volume', 'cpus', 'memory', 'env', 'args', 'command']);
export const LOCKS = ['package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock'];

// Stryker disable next-line ConditionalExpression: containerOf returns before this for null, so the null check never decides
const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

/** The config value, resolved: `true`, an image name, or an object; `false` or nothing is no container. */
export function containerOf(raw: unknown): Container | undefined {
  if (raw === undefined || raw === null || raw === false) return undefined;
  const base: Container = { engine: 'docker', image: `node:${nodeMajor}-bookworm-slim`, network: 'none', env: [], args: [], command: 'npx --no oxmutate' };
  if (raw === true) return base;
  if (typeof raw === 'string') return { ...base, image: raw };
  if (!isRecord(raw)) throw new Error(`container must be true, an image name or an object, not ${JSON.stringify(raw)}. fix: container: true`);
  const c = raw;
  const unknown = Object.keys(c).filter((k) => !KEYS.has(k));
  if (unknown.length) throw new Error(`container has no key ${unknown.join(', ')}. fix: use ${[...KEYS].join(', ')}; anything else goes in container.args`);
  const str = (k: string): string | undefined => (typeof c[k] === 'string' ? c[k] : undefined);
  const list = (k: string): string[] => (Array.isArray(c[k]) ? c[k].map(String) : []);
  return {
    engine: str('engine') ?? base.engine,
    image: str('image') ?? base.image,
    network: str('network') ?? base.network,
    install: c['install'] === false ? '' : str('install'),
    setup: str('setup'),
    volume: str('volume'),
    cpus: typeof c['cpus'] === 'number' ? c['cpus'] : undefined,
    memory: str('memory'),
    env: list('env'),
    args: list('args'),
    command: str('command') ?? base.command,
  };
}

/** `--container`, `--no-container` and `--container-image <image>` over the config. */
export function withFlags(c: Container | undefined, o: Record<string, unknown>): Container | undefined {
  if (o['container'] === false || o['noContainer'] === true) return undefined;
  const image = typeof o['containerImage'] === 'string' ? o['containerImage'] : undefined;
  if (o['container'] !== true && image === undefined) return c;
  return { ...(c ?? (containerOf(true) as Container)), ...(image !== undefined && { image }) };
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
  /** The host directory mounted at `/io`: `in.tar` goes in, `out.tar` comes out. */
  io: string;
  /** Repository-relative files copied back to the host. */
  keep: readonly string[];
}

/** What every container oxmutate starts gets: no capability, no way to gain one, and a label to find it by. */
const HARDENED = ['--rm', '--cap-drop=ALL', '--security-opt=no-new-privileges', '--label', 'dev.oxmutate=1'];

/** The `<engine>` arguments of the volume, the sync, the run and the copy back. */
export function containerPlan(c: Container, p: PlanInput): { volume: string[]; sync: string[]; run: string[]; back: string[] } {
  const sync = [
    'set -e',
    `mkdir -p ${SRC} && cd ${SRC}`,
    // -o: the files are the container user's, whoever owned them on the host (no CAP_CHOWN here).
    `tar -xovf /io/in.tar > ${WORK}/manifest.new`,
    `node -e ${quote(PRUNE)} ${WORK}/manifest ${WORK}/manifest.new`,
    `mv ${WORK}/manifest.new ${WORK}/manifest`,
    ...(p.install ? [`if [ "$(cat ${WORK}/installed 2>/dev/null)" != ${quote(p.key)} ]; then ${p.install}; echo ${quote(p.key)} > ${WORK}/installed; fi`] : []),
  ].join('\n');
  const run = ['set -e', ...(c.setup ? [c.setup] : []), `cd ${quote(path.posix.join(SRC, p.rel))}`, `exec ${c.command} ${p.argv.map(quote).join(' ')}`].join('\n');
  const volume = ['-v', `${p.volume}:${WORK}`];
  const io = ['-v', `${p.io}:/io`];
  const limits = [...(c.cpus === undefined ? [] : ['--cpus', String(c.cpus)]), ...(c.memory === undefined ? [] : ['--memory', c.memory]), ...c.env.flatMap((e) => ['-e', e]), ...c.args];
  return {
    volume: ['volume', 'create', '--label', 'dev.oxmutate=1', p.volume],
    sync: ['run', ...HARDENED, ...volume, ...io, '-w', WORK, ...limits, c.image, 'sh', '-c', sync],
    run: ['run', ...HARDENED, '--init', `--network=${c.network}`, ...volume, '-w', WORK, '-e', `${INSIDE}=inside`, ...limits, c.image, 'sh', '-c', run],
    back: ['run', ...HARDENED, '--network=none', ...volume, ...io, '-w', SRC, c.image, 'sh', '-c', 'for f; do [ -e "$f" ] && printf "%s\\n" "$f"; done > /io/keep.list; if [ -s /io/keep.list ]; then tar -cf /io/out.tar -T /io/keep.list; fi', 'sh', ...p.keep],
  };
}

type Spawn = (cmd: string, args: readonly string[], o: RunOptions) => Promise<Pick<Result, 'code' | 'stdout' | 'stderr'>>;

/** macOS tar writes extended attributes as `._` files and as headers Linux tar warns about; GNU tar has neither flag but the second. */
export const tarFlags = (host: string): string[] => (host === 'darwin' ? ['--no-mac-metadata', '--no-xattrs'] : ['--no-xattrs']);

/** The cache directory is the user's alone; the run's directory inside it is writable by the container's user too. */
const PRIVATE_MODE = 0o700;
const SHARED_MODE = 0o777;

/** A directory the container can mount: under the user's cache, which every engine shares. */
function ioDir(): string {
  const parent = path.join(env['XDG_CACHE_HOME'] || path.join(homedir(), '.cache'), 'oxmutate');
  mkdirSync(parent, { recursive: true, mode: PRIVATE_MODE });
  const io = mkdtempSync(path.join(parent, 'io-'));
  // The container's user is not the host's: it must write out.tar here. The parent stays private.
  chmodSync(io, SHARED_MODE);
  return io;
}

/** Runs an engine step, with the fix line when the engine itself is missing. */
async function step(spawn: Spawn, c: Container, args: readonly string[], o: Omit<RunOptions, 'runtime'>): Promise<Pick<Result, 'code' | 'stdout' | 'stderr'>> {
  try {
    return await spawn(c.engine, args, { ...o, runtime: ambientRuntime(), timeout: 0 });
  } catch (e) {
    throw new Error(`${c.engine} did not start (${(e as Error).message}). fix: install and start Docker or Podman, or set container.engine`);
  }
}

/**
 * Runs `argv` (oxmutate's own, after the binary) inside the container and returns its exit code.
 * `keep`: absolute paths to copy back (the reports, the incremental file).
 */
export async function runInContainer(c: Container, o: { root: string; keep: readonly string[]; since?: string | undefined; frozenOracle?: string | undefined }, argv: readonly string[], { spawn = run, host = platform }: { spawn?: Spawn; host?: string } = {}): Promise<number> {
  if (o.since !== undefined || o.frozenOracle !== undefined) throw new Error('--since and --frozen-oracle read git history, and the container gets the files without it. fix: run them with --no-container');
  const runtime = ambientRuntime();
  const git = await spawn('git', ['rev-parse', '--show-toplevel'], { cwd: o.root, runtime });
  if (git.code !== 0) throw new Error(`container copies the git repository the project is in, and ${o.root} is in none. fix: git init, or run with --no-container`);
  const top = git.stdout.trim();
  const keep = o.keep.map((f) => path.relative(top, f).split(path.sep).join('/')).filter((f) => !f.startsWith('..'));
  const listed = (await spawn('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: top, runtime, timeout: 0 })).stdout.split('\0');
  const files = [...new Set([...listed, ...keep])].filter((f) => f !== '' && existsSync(path.join(top, f)));
  const io = ioDir();
  try {
    writeFileSync(path.join(io, 'files'), files.join('\0'));
    // The archive is named relative to `io`: GNU tar (Git Bash's on Windows) reads `C:/…` as a remote host.
    const tar = await spawn('tar', ['-cf', 'in.tar', ...tarFlags(host), '-C', top, '--null', '-T', path.join(io, 'files')], { cwd: io, runtime, timeout: 0 });
    if (tar.code !== 0) throw new Error(`tar could not pack ${top}: ${tar.stderr.trim()}`);
    const lock = LOCKS.find((f) => existsSync(path.join(top, f)));
    const install = c.install ?? defaultInstall(lock);
    const manifest = [lock, 'package.json'].find((f) => f !== undefined && existsSync(path.join(top, f)));
    const hash = createHash('sha256').update(`${c.image}\0${install}\0`);
    if (manifest) hash.update(readFileSync(path.join(top, manifest)));
    const volume = c.volume ?? `oxmutate-${createHash('sha256').update(top).digest('hex').slice(0, VOLUME_HASH_CHARS)}`;
    const plan = containerPlan(c, { rel: path.relative(top, o.root).split(path.sep).join('/'), argv, key: hash.digest('hex'), install, volume, io, keep });
    await step(spawn, c, plan.volume, {});
    const synced = await step(spawn, c, plan.sync, { stdio: 'inherit' });
    if (synced.code !== 0) throw new Error(`the copy into the container or its install failed (exit ${String(synced.code)}); its output is above. fix: set container.install, or container.image to one with what the install needs`);
    const ran = await step(spawn, c, plan.run, { stdio: 'inherit' });
    if (keep.length > 0 && (await step(spawn, c, plan.back, {})).code === 0 && existsSync(path.join(io, 'out.tar'))) {
      await spawn('tar', ['-xf', 'out.tar', '-C', top], { cwd: io, runtime, timeout: 0 });
    }
    return ran.code ?? 1;
  } finally {
    removeWorkDir(io);
  }
}
