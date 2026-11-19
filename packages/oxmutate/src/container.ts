/**
 * `container`: oxmutate runs itself inside a container it starts, isolated from the host. The
 * project's git files are copied into a named volume that also keeps the container's own
 * `node_modules` between runs (installed again only when the lockfile, the image or the install
 * command changes). At the end the reports and the incremental file are copied back to the host.
 *
 * `container: true` takes every default, `container: '<image>'` names the image, and the object
 * form sets any of `engine`, `image`, `install`, `setup`, `volume`, `cpus`, `memory`, `env`,
 * `args` and `command`. `args` goes to `<engine> run` verbatim, for anything not named here.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { env, nodeMajor, platform } from './runtime.js';

export interface Container {
  /** The container CLI: `docker` (default), `podman`, or any that takes `run --rm -i -v`. */
  engine: string;
  /** Default: `node:<the host's Node major>-bookworm-slim`. */
  image: string;
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
const BIG = 1 << 30;
/** Hex characters of the repository path's hash in the default volume name. */
const VOLUME_HASH_CHARS = 12;
const KEYS = new Set(['engine', 'image', 'install', 'setup', 'volume', 'cpus', 'memory', 'env', 'args', 'command']);
export const LOCKS = ['package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock'];

// Stryker disable next-line ConditionalExpression: containerOf returns before this for null, so the null check never decides
const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

/** The config value, resolved: `true`, an image name, or an object; `false` or nothing is no container. */
export function containerOf(raw: unknown): Container | undefined {
  if (raw === undefined || raw === null || raw === false) return undefined;
  const base: Container = { engine: 'docker', image: `node:${nodeMajor}-bookworm-slim`, env: [], args: [], command: 'npx --no oxmutate' };
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
  /** Repository-relative files copied back to the host. */
  keep: readonly string[];
}

/** The `<engine>` arguments of the run (the project's tar on stdin) and of the copy back (a tar on stdout). */
export function containerPlan(c: Container, p: PlanInput): { run: string[]; back: string[] } {
  const script = [
    'set -e',
    `mkdir -p ${SRC} && cd ${SRC}`,
    `tar -xvf - > ${WORK}/manifest.new`,
    `node -e ${quote(PRUNE)} ${WORK}/manifest ${WORK}/manifest.new`,
    `mv ${WORK}/manifest.new ${WORK}/manifest`,
    ...(p.install ? [`if [ "$(cat ${WORK}/installed 2>/dev/null)" != ${quote(p.key)} ]; then ${p.install}; echo ${quote(p.key)} > ${WORK}/installed; fi`] : []),
    ...(c.setup ? [c.setup] : []),
    `cd ${quote(path.posix.join(SRC, p.rel))}`,
    `exec ${c.command} ${p.argv.map(quote).join(' ')}`,
  ].join('\n');
  const mount = ['-v', `${p.volume}:${WORK}`];
  return {
    run: [
      'run', '--rm', '-i', '--init', ...mount, '-w', WORK, '-e', `${INSIDE}=inside`,
      ...(c.cpus === undefined ? [] : ['--cpus', String(c.cpus)]),
      ...(c.memory === undefined ? [] : ['--memory', c.memory]),
      ...c.env.flatMap((e) => ['-e', e]),
      ...c.args,
      c.image, 'sh', '-c', script,
    ],
    back: ['run', '--rm', ...mount, '-w', SRC, c.image, 'sh', '-c', 'for f; do [ -e "$f" ] && printf "%s\\n" "$f"; done | tar -cf - -T -', 'sh', ...p.keep],
  };
}

type Spawn = (cmd: string, args: readonly string[], o: Parameters<typeof spawnSync>[2]) => { status: number | null; stdout: Buffer | string; stderr: Buffer | string; error?: Error | undefined };

/**
 * Runs `argv` (oxmutate's own, after the binary) inside the container and returns its exit code.
 * `keep`: absolute paths to copy back (the reports, the incremental file).
 */
export function runInContainer(c: Container, o: { root: string; keep: readonly string[]; since?: string | undefined; frozenOracle?: string | undefined }, argv: readonly string[], spawn: Spawn = spawnSync): number {
  if (o.since !== undefined || o.frozenOracle !== undefined) throw new Error('--since and --frozen-oracle read git history, and the container gets the files without it. fix: run them with --no-container');
  const git = spawn('git', ['rev-parse', '--show-toplevel'], { cwd: o.root, encoding: 'utf8' });
  if (git.status !== 0) throw new Error(`container copies the git repository the project is in, and ${o.root} is in none. fix: git init, or run with --no-container`);
  const top = String(git.stdout).trim();
  const keep = o.keep.map((f) => path.relative(top, f).split(path.sep).join('/')).filter((f) => !f.startsWith('..'));
  const listed = String(spawn('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: top, encoding: 'utf8', maxBuffer: BIG }).stdout).split('\0');
  const files = [...new Set([...listed, ...keep])].filter((f) => f !== '' && existsSync(path.join(top, f)));
  // macOS tar would add its metadata as `._` files and extended headers Linux tar warns about.
  const mac = platform === 'darwin' ? ['--no-mac-metadata', '--no-xattrs'] : [];
  const tar = spawn('tar', ['-cf', '-', ...mac, '--null', '-T', '-'], { cwd: top, input: files.join('\0'), maxBuffer: BIG, env: { ...env, COPYFILE_DISABLE: '1' } });
  if (tar.status !== 0) throw new Error(`tar could not pack ${top}: ${String(tar.stderr).trim()}`);
  const lock = LOCKS.find((f) => existsSync(path.join(top, f)));
  const install = c.install ?? defaultInstall(lock);
  const manifest = [lock, 'package.json'].find((f) => f !== undefined && existsSync(path.join(top, f)));
  const key = createHash('sha256').update(`${c.image}\0${install}\0`).update(manifest ? readFileSync(path.join(top, manifest)) : '').digest('hex');
  const volume = c.volume ?? `oxmutate-${createHash('sha256').update(top).digest('hex').slice(0, VOLUME_HASH_CHARS)}`;
  const plan = containerPlan(c, { rel: path.relative(top, o.root).split(path.sep).join('/'), argv, key, install, volume, keep });
  const ran = spawn(c.engine, plan.run, { input: tar.stdout, stdio: ['pipe', 'inherit', 'inherit'], maxBuffer: BIG });
  if (ran.error) throw new Error(`${c.engine} did not start (${ran.error.message}). fix: install and start Docker or Podman, or set container.engine`);
  if (keep.length > 0) {
    const back = spawn(c.engine, plan.back, { maxBuffer: BIG });
    if (back.status === 0 && back.stdout.length > 0) spawn('tar', ['-xf', '-'], { cwd: top, input: back.stdout });
  }
  return ran.status ?? 1;
}
