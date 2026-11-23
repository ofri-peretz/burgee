import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { run, type RunOptions } from 'bellpull';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { discard } from './__fixtures__/scratch-dir.js';
import { MAX_DELETES, planSync, PRUNE, readState, signatures, syncDir, type SyncPlan, writeState } from './container-sync.js';
import { type Container, containerDefaults, containerOf, containerPlan, defaultInstall, engineOf, FULL, FULL_TRAP, fullDisk, fullHostDisk, installFailed, machineDefault, MIN_FREE_KIB, pruneContainers, RESYNC, runInContainer, tarFlags, VERSION, withFlags, withoutContainerFlags, withRuntime } from './container.js';
import { nodeMajor } from './runtime.js';

// The home directory a case may move (os.homedir() does not follow HOME inside every test runner).
const home = vi.hoisted((): { dir: string | undefined } => ({ dir: undefined }));
vi.mock('node:os', async (original) => {
  const os = await original<typeof import('node:os')>();
  return { ...os, homedir: (): string => home.dir ?? os.homedir() };
});

/** The environment without git's own variables: lefthook's pre-push exports `GIT_DIR`, and a scratch `git init` must not inherit it (scripts/git-env-lock.test.ts). */
const withoutGit = (): NodeJS.ProcessEnv => Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));

// A copy to the host that finds the disk full (a case sets `full` to the file name that fails).
const hostDisk = vi.hoisted((): { full: string | undefined; code: string } => ({ full: undefined, code: 'ENOSPC' }));
vi.mock('node:fs', async (original) => {
  const fs = await original<typeof import('node:fs')>();
  return {
    ...fs,
    copyFileSync: (from: string, to: string, ...rest: [number?]): void => {
      if (hostDisk.full !== undefined && to.endsWith(hostDisk.full)) throw Object.assign(new Error(`${hostDisk.code}: copyfile failed`), { code: hostDisk.code });
      fs.copyFileSync(from, to, ...rest);
    },
  };
});

const made: string[] = [];
afterAll(() => discard(...made));

const scratch = (prefix: string): string => {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), prefix)));
  made.push(dir);
  return dir;
};

// Every case gets its own cache and config home, so the host's sync records and a machine default
// of the developer running the suite reach none of them.
// So is the home directory and npm's user config (npm run sets npm_config_userconfig): the
// developer's own ~/.npmrc and ~/.yarnrc.yml are never forwarded by a case.
const saved = { cache: process.env['XDG_CACHE_HOME'], config: process.env['XDG_CONFIG_HOME'], container: process.env['OXMUTATE_CONTAINER'], userconfig: process.env['npm_config_userconfig'] };
beforeEach(() => {
  process.env['XDG_CACHE_HOME'] = scratch('oxmutate-cache-');
  process.env['XDG_CONFIG_HOME'] = scratch('oxmutate-config-');
  delete process.env['OXMUTATE_CONTAINER'];
  delete process.env['npm_config_userconfig'];
  home.dir = scratch('oxmutate-home-');
});
afterEach(() => {
  for (const [key, name] of [['cache', 'XDG_CACHE_HOME'], ['config', 'XDG_CONFIG_HOME'], ['container', 'OXMUTATE_CONTAINER'], ['userconfig', 'npm_config_userconfig']] as const) {
    if (saved[key] === undefined) delete process.env[name];
    else process.env[name] = saved[key];
  }
  home.dir = undefined;
});

const DEFAULTS: Container = { engine: 'docker', image: `node:${nodeMajor}-bookworm-slim`, network: 'none', source: 'copy', cache: 'oxmutate-cache', ephemeral: false, readOnly: false, env: [], installEnv: [], include: [], args: [], runArgs: [] };
/** The defaults with the project's own oxmutate as the command, so a script has no install of oxmutate in it. */
const NPX: Container = { ...DEFAULTS, command: 'npx --no oxmutate' };
/** The version the container installs when the command is unset: this package's. */
const OWN = (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version;

describe('the container setting', () => {
  it('is off when unset or false, and every default with true', () => {
    expect(containerOf(undefined)).toBeUndefined();
    expect(containerOf(null)).toBeUndefined();
    expect(containerOf(false)).toBeUndefined();
    expect(containerOf(true)).toEqual(DEFAULTS);
    expect(containerDefaults()).toEqual(DEFAULTS);
  });

  it('takes an image as a string, and every key in the object form', () => {
    expect(containerOf('node:24-alpine')).toEqual({ ...DEFAULTS, image: 'node:24-alpine' });
    const full = {
      engine: 'podman', image: 'i', network: 'bridge', source: 'git', remote: 'https://example.com/r.git', install: 'pnpm i', setup: 'npm run build', volume: 'v', cache: 'c', ephemeral: true,
      context: 'box', host: 'ssh://u@box', platform: 'linux/amd64', user: '1000:1000', runtime: 'runsc', readOnly: true, pull: 'always', pidsLimit: 512, cpus: 4, memory: '6g',
      env: ['CI', 'A=1'], installEnv: ['NODE_AUTH_TOKEN'], registryAuth: false, include: ['.env.test'], args: ['--ulimit=nofile=1024'], runArgs: ['--shm-size=1g'], command: 'node dist/bin.js',
    };
    expect(containerOf(full)).toEqual(full);
    expect(containerOf({ install: false, cache: false })).toEqual({ ...DEFAULTS, install: '', cache: false });
    expect(containerOf({})).toEqual(DEFAULTS);
    expect(containerOf({ cpus: '4', pidsLimit: '9', env: 'CI', engine: 5, image: false, readOnly: 'yes', ephemeral: 1, cache: 3, installEnv: 'X', include: '.env', registryAuth: 'yes' })).toEqual(DEFAULTS);
    expect(containerOf({ source: 'copy' })).toEqual(DEFAULTS);
  });

  it('refuses a key it does not know, a source it does not know, and a value of the wrong kind, with the fix', () => {
    expect(() => containerOf({ imgae: 'x', cpu: 1 })).toThrow('container has no key imgae, cpu. fix: use engine, image, network, remote, install, setup, volume, context, host, platform, user, runtime, pull, memory, command, source, cache, ephemeral, readOnly, pidsLimit, cpus, env, installEnv, registryAuth, include, args, runArgs; anything else goes in container.args');
    expect(() => containerOf({ source: 'svn' })).toThrow(`container.source is 'copy' or 'git', not "svn"`);
    expect(() => containerOf(3)).toThrow('container must be true, an image name or an object, not 3. fix: container: true');
    expect(() => containerOf(['x'])).toThrow('not ["x"]');
  });

  it('is turned on, off or given an image from the command line', () => {
    const set = { ...DEFAULTS, cpus: 2 };
    expect(withFlags(undefined, {})).toBeUndefined();
    expect(withFlags(set, {})).toBe(set);
    expect(withFlags(undefined, { container: true })).toEqual(DEFAULTS);
    expect(withFlags(set, { container: true })).toEqual(set);
    expect(withFlags(set, { container: false })).toBeUndefined();
    expect(withFlags(set, { noContainer: true })).toBeUndefined();
    expect(withFlags(undefined, { containerImage: 'x' })).toEqual({ ...DEFAULTS, image: 'x' });
    expect(withFlags(set, { container: true, containerImage: 'x' })).toEqual({ ...set, image: 'x' });
    expect(withFlags(set, { containerImage: true })).toBe(set);
  });

  it('takes the machine default from OXMUTATE_CONTAINER, else the user config, else none', () => {
    expect(machineDefault()).toBeUndefined();
    const file = path.join(process.env['XDG_CONFIG_HOME']!, 'oxmutate', 'config.json');
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ container: { cpus: 2 } }));
    expect(machineDefault()).toEqual({ cpus: 2 });
    for (const [value, expected] of [['1', true], ['true', true], ['0', false], ['false', false], ['node:24-alpine', 'node:24-alpine'], ['{"engine":"podman"}', { engine: 'podman' }], [' {"cpus":1}', { cpus: 1 }], ['', { cpus: 2 }], ['inside', { cpus: 2 }]] as const) {
      process.env['OXMUTATE_CONTAINER'] = value;
      expect(machineDefault()).toEqual(expected);
    }
    rmSync(file);
    process.env['OXMUTATE_CONTAINER'] = 'inside';
    expect(machineDefault()).toBeUndefined();
  });

  it('reads the machine default from ~/.config when XDG_CONFIG_HOME is unset or empty', () => {
    const dir = home.dir!;
    delete process.env['XDG_CONFIG_HOME'];
    mkdirSync(path.join(dir, '.config', 'oxmutate'), { recursive: true });
    writeFileSync(path.join(dir, '.config', 'oxmutate', 'config.json'), JSON.stringify({ container: 'node:24-alpine' }));
    expect(machineDefault()).toBe('node:24-alpine');
    process.env['XDG_CONFIG_HOME'] = '';
    expect(machineDefault()).toBe('node:24-alpine');
  });

  it('hands the oxmutate inside its arguments without the container flags, and each ref as its tag', () => {
    expect(withoutContainerFlags(['run', '--container', '--container-image', 'node:24', '--json', '--no-container', '--container-image=x', '--containerish', 'x--container', '--concurrency', '2'])).toEqual(['run', '--json', '--containerish', 'x--container', '--concurrency', '2']);
    const tags = new Map([['origin/main', 'oxmutate-base-0'], ['v1', 'oxmutate-base-1']]);
    expect(withoutContainerFlags(['run', '--since', 'origin/main', '--frozen-oracle=v1', '--since=other', '--frozen-oracle', 'unknown'], tags)).toEqual(['run', '--since', 'oxmutate-base-0', '--frozen-oracle=oxmutate-base-1', '--since=other', '--frozen-oracle', 'unknown']);
    expect(withoutContainerFlags(['--since=a=b'], new Map([['a=b', 't']]))).toEqual(['--since=t']);
    // The ref after a bare --frozen-oracle is its tag too; an argument that only contains the flag is not one.
    expect(withoutContainerFlags(['--frozen-oracle', 'v1', 'x--since=v1'], tags)).toEqual(['--frozen-oracle', 'oxmutate-base-1', 'x--since=v1']);
  });

  it('installs as the lockfile asks', () => {
    expect(defaultInstall('package-lock.json')).toBe('npm ci');
    expect(defaultInstall('npm-shrinkwrap.json')).toBe('npm ci');
    expect(defaultInstall('pnpm-lock.yaml')).toBe('corepack enable && pnpm install --frozen-lockfile');
    expect(defaultInstall('yarn.lock')).toBe('corepack enable && yarn install --frozen-lockfile');
    expect(defaultInstall(undefined)).toBe('npm install');
    expect(defaultInstall('yarn.lock', true)).toBe('corepack enable && yarn install --immutable');
  });

  it('talks to the engine the context or the host names', () => {
    expect(engineOf(DEFAULTS)).toStrictEqual({ global: [], env: {} });
    expect(engineOf({ ...DEFAULTS, engine: 'podman-remote', context: 'box' }).global).toEqual(['--connection', 'box']);
    expect(engineOf({ ...DEFAULTS, context: 'box', host: 'ssh://u@box' })).toEqual({ global: ['--context', 'box'], env: { DOCKER_HOST: 'ssh://u@box' } });
    expect(engineOf({ ...DEFAULTS, engine: '/opt/homebrew/bin/podman', context: 'box', host: 'ssh://u@box' })).toEqual({ global: ['--connection', 'box'], env: { CONTAINER_HOST: 'ssh://u@box' } });
  });

  it('runs on gVisor when Docker has it and the runtime is unset, and never asks otherwise', async () => {
    const asked: string[][] = [];
    const engine = (answer: string, code = 0) => async (args: readonly string[]) => {
      asked.push([...args]);
      return { code, stdout: answer, stderr: '' };
    };
    expect((await withRuntime(DEFAULTS, engine('{"io.containerd.runc.v2":{},"runsc":{"path":"runsc"}}'))).runtime).toBe('runsc');
    expect((await withRuntime(DEFAULTS, engine('{"runc":{}}'))).runtime).toBeUndefined();
    expect((await withRuntime(DEFAULTS, engine('"runsc"', 1))).runtime).toBeUndefined();
    expect(asked).toEqual([['info', '--format', '{{json .Runtimes}}'], ['info', '--format', '{{json .Runtimes}}'], ['info', '--format', '{{json .Runtimes}}']]);
    asked.length = 0;
    expect((await withRuntime({ ...DEFAULTS, runtime: 'default' }, engine('"runsc"'))).runtime).toBe('default');
    expect((await withRuntime({ ...DEFAULTS, engine: 'podman' }, engine('"runsc"'))).runtime).toBeUndefined();
    expect(asked).toEqual([]);
    // Docker on Windows is docker.exe.
    expect((await withRuntime({ ...DEFAULTS, engine: 'docker.exe' }, engine('{"runsc":{}}'))).runtime).toBe('runsc');
  });
});

/** A record of `a` and `n` more files, each deleted since. */
const deletedSince = (n: number): { token: string; install: string; files: Record<string, string> } => ({ token: 't', install: 'k', files: Object.fromEntries([['a', '1:1'], ...Array.from({ length: n }, (_, i) => [`f${String(i)}`, '1:1'])]) });

describe('what the host sends', () => {
  it('sends everything the first time, then only what changed, and nothing when nothing did', () => {
    expect(planSync({ a: '1:1' }, undefined, { volumeExisted: true, install: 'k', mustRun: false })).toMatchObject({ mode: 'whole', send: ['a'] });
    const prior = { token: 't', install: 'k', files: { a: '1:1', b: '2:2', gone: '3:3' } };
    expect(planSync({ a: '1:1', b: '2:5', c: '9:9' }, prior, { volumeExisted: true, install: 'k', mustRun: false })).toEqual({ mode: 'delta', token: 't', send: ['b', 'c'], deleted: ['gone'] });
    expect(planSync({ a: '1:1', b: '2:2', gone: '3:3' }, prior, { volumeExisted: true, install: 'k', mustRun: false })).toEqual({ mode: 'skip', token: 't' });
    // A new install key, or a run that needs the sync (refs to unpack), still syncs.
    expect(planSync({ a: '1:1', b: '2:2', gone: '3:3' }, prior, { volumeExisted: true, install: 'k2', mustRun: false })).toMatchObject({ mode: 'delta', send: [], deleted: [] });
    expect(planSync({ a: '1:1', b: '2:2', gone: '3:3' }, prior, { volumeExisted: true, install: 'k', mustRun: true })).toMatchObject({ mode: 'delta' });
  });

  it('sends a delta when files changed and none was deleted', () => {
    const prior = { token: 't', install: 'k', files: { a: '1:1' } };
    expect(planSync({ a: '1:2' }, prior, { volumeExisted: true, install: 'k', mustRun: false })).toEqual({ mode: 'delta', token: 't', send: ['a'], deleted: [] });
  });

  it('sends a delta of up to 500 deletions, and everything past that', () => {
    expect(planSync({ a: '1:1' }, deletedSince(500), { volumeExisted: true, install: 'k', mustRun: false }).mode).toBe('delta');
    expect(planSync({ a: '1:1' }, deletedSince(501), { volumeExisted: true, install: 'k', mustRun: false }).mode).toBe('whole');
  });

  it('keeps one record per volume under XDG_CACHE_HOME, else ~/.cache, its name safe for any file system', () => {
    expect(syncDir()).toBe(path.join(process.env['XDG_CACHE_HOME']!, 'oxmutate', 'sync'));
    const state = { token: 't', install: 'k', files: { a: '1:1' } };
    writeState('ssh://box/a:b.c-d', state);
    expect(readdirSync(syncDir())).toEqual(['ssh___box_a_b.c-d.json']);
    expect(readState('ssh://box/a:b.c-d')).toEqual(state);
    delete process.env['XDG_CACHE_HOME'];
    expect(syncDir()).toBe(path.join(homedir(), '.cache', 'oxmutate', 'sync'));
    process.env['XDG_CACHE_HOME'] = '';
    expect(syncDir()).toBe(path.join(homedir(), '.cache', 'oxmutate', 'sync'));
  });

  it('ignores a record that is not one and a missing one, and removes one that is not JSON', () => {
    expect(readState('v')).toBeUndefined();
    mkdirSync(syncDir(), { recursive: true });
    const file = path.join(syncDir(), 'v.json');
    for (const bad of [{ install: 'k', files: {} }, { token: 't', files: {} }, { token: 't', install: 'k' }, { token: 't', install: 'k', files: 'x' }, { token: 1, install: 'k', files: {} }]) {
      writeFileSync(file, JSON.stringify(bad));
      expect(readState('v')).toBeUndefined();
    }
    expect(existsSync(file)).toBe(true);
    writeFileSync(file, '{');
    expect(readState('v')).toBeUndefined();
    expect(existsSync(file)).toBe(false);
    writeFileSync(file, 'null');
    expect(readState('v')).toBeUndefined();
    expect(existsSync(file)).toBe(false);
    writeFileSync(file, JSON.stringify({ token: 't', install: 'k', files: {} }));
    expect(readState('v')).toEqual({ token: 't', install: 'k', files: {} });
  });

  it('sends everything when the volume is new, or too much was deleted', () => {
    const prior = { token: 't', install: 'k', files: Object.fromEntries(Array.from({ length: MAX_DELETES + 1 }, (_, i) => [`f${String(i)}`, '1:1'])) };
    const fresh = planSync({ a: '1:1' }, { ...prior, files: { a: '1:1' } }, { volumeExisted: false, install: 'k', mustRun: false });
    expect(fresh).toMatchObject({ mode: 'whole', send: ['a'] });
    expect(fresh.token).not.toBe('t');
    expect(planSync({ a: '1:1' }, prior, { volumeExisted: true, install: 'k', mustRun: false })).toMatchObject({ mode: 'whole' });
    expect(planSync({ a: '1:1' }, { ...prior, files: Object.fromEntries(Object.entries(prior.files).slice(1)) }, { volumeExisted: true, install: 'k', mustRun: false })).toMatchObject({ mode: 'delta' });
  });

  it('signs each file by size and time, and skips what is not a file', () => {
    const dir = scratch('oxmutate-sig-');
    writeFileSync(path.join(dir, 'a'), 'abc');
    mkdirSync(path.join(dir, 'd'));
    const sig = signatures(dir, ['a', 'd', 'missing']);
    expect(Object.keys(sig)).toEqual(['a']);
    expect(sig['a']).toMatch(/^3:\d/u);
  });

  it.skipIf(process.platform === 'win32')('signs a symbolic link as the file it is, even one to a directory or to nothing', () => {
    const dir = scratch('oxmutate-link-');
    mkdirSync(path.join(dir, 'A'));
    symlinkSync('A', path.join(dir, 'Current'));
    symlinkSync('nowhere', path.join(dir, 'dangling'));
    expect(Object.keys(signatures(dir, ['Current', 'dangling', 'A']))).toEqual(['Current', 'dangling']);
  });

  it('prunes a whole sync to the host’s listing, outside node_modules and .git', () => {
    const dir = scratch('oxmutate-prune-');
    const listing = path.join(scratch('oxmutate-listing-'), 'listing');
    for (const f of ['kept', 'gone', 'sub/kept', 'sub/gone', 'node_modules/x/i.js', '.git/HEAD']) {
      mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
      writeFileSync(path.join(dir, f), f);
    }
    writeFileSync(listing, ['kept', 'sub/kept'].join('\0'));
    expect(spawnSync(process.execPath, ['-e', PRUNE, dir, listing]).status).toBe(0);
    expect(['kept', 'gone', 'sub/kept', 'sub/gone', 'node_modules/x/i.js', '.git/HEAD'].map((f) => existsSync(path.join(dir, f)))).toEqual([true, false, true, false, true, true]);
  });
});

const HARDENED = ['--cap-drop=ALL', '--security-opt=no-new-privileges', '--label', 'dev.oxmutate=1'];
/** The run's volume, and the label a second run on it sees. */
const VOL = ['-v', 'vol:/w', '--label', 'dev.oxmutate.volume=vol'];
const CACHE = ['-v', 'oxmutate-cache:/cache', '-e', 'npm_config_cache=/cache/npm', '-e', 'npm_config_store_dir=/cache/pnpm', '-e', 'YARN_CACHE_FOLDER=/cache/yarn'];

/** The sync script's fetch of one commit from the test's remote. */
const fetch = (sha: string): string => `git fetch -q --depth 1 'https://example.com/r.git' '${sha}' || { echo 'oxmutate: the container could not fetch ${sha}. fix: push it, or set container.remote' >&2; exit 4; }`;

/** The install, guarded by its key, on a line of its own. */
const INSTALL = [`if [ "$(cat /w/installed 2>/dev/null)" != 'k1' ]; then`, '{', 'npm ci', '} || exit "$?"', "echo 'k1' > /w/installed; fi"];

/** A container's script, line by line. */
const script = (args: readonly string[]): string[] => args.at(-1)!.split('\n');

describe('the container plan', () => {
  const input = { rel: 'packages/a', argv: ['run', "it's"], key: 'k1', install: 'npm ci', volume: 'vol', keep: ['packages/a/reports/m.json'] };
  const whole: SyncPlan = { mode: 'whole', token: 'T', send: ['a'] };

  it('labels the volumes, hardens every container, shares the package caches with the sync alone, and mounts nothing of the host', () => {
    const plan = containerPlan(NPX, input);
    expect(plan.volumes).toEqual([['volume', 'create', '--label', 'dev.oxmutate=1', 'vol'], ['volume', 'create', '--label', 'dev.oxmutate=1', 'oxmutate-cache']]);
    expect(plan.drop).toEqual(['volume', 'rm', '-f', 'vol']);
    expect(plan.sync.slice(0, -1)).toEqual(['create', '--rm', ...HARDENED, ...VOL, ...CACHE, '-w', '/w', DEFAULTS.image, 'sh', '-c']);
    expect(plan.run.slice(0, -1)).toEqual(['run', '--rm', '--init', '--network=none', ...HARDENED, ...VOL, '-w', '/w', '-e', 'OXMUTATE_CONTAINER=inside', DEFAULTS.image, 'sh', '-c']);
    expect(plan.back).toEqual(['create', '--network=none', ...HARDENED, ...VOL, DEFAULTS.image, 'true']);
    const uncached = containerPlan({ ...NPX, cache: false }, input);
    expect(uncached.volumes).toEqual([['volume', 'create', '--label', 'dev.oxmutate=1', 'vol']]);
    expect(uncached.sync.slice(0, -1)).toEqual(['create', '--rm', ...HARDENED, ...VOL, '-w', '/w', DEFAULTS.image, 'sh', '-c']);
  });

  it('gives every container every option set, and the run alone its network and runArgs', () => {
    const c = { ...DEFAULTS, cache: false as const, network: 'bridge', platform: 'linux/amd64', user: '1000', runtime: 'runsc', pull: 'never', readOnly: true, pidsLimit: 64, cpus: 3, memory: '4g', env: ['CI'], args: ['--ulimit=nofile=1024'], runArgs: ['--shm-size=1g'] };
    const all = ['--platform', 'linux/amd64', '--user', '1000', '--runtime', 'runsc', '--pull=never', '--read-only', '--tmpfs', '/tmp:exec', '-e', 'HOME=/tmp', '--pids-limit', '64', '--cpus', '3', '--memory', '4g', '-e', 'CI', '--ulimit=nofile=1024'];
    const plan = containerPlan(c, input);
    expect(plan.sync.slice(2, 2 + HARDENED.length + all.length)).toEqual([...HARDENED, ...all]);
    expect(plan.back.slice(2, 2 + HARDENED.length + all.length)).toEqual([...HARDENED, ...all]);
    expect(plan.run.slice(3, 4 + HARDENED.length + all.length)).toEqual(['--network=bridge', ...HARDENED, ...all]);
    expect(plan.run.slice(-5, -3)).toEqual(['--shm-size=1g', c.image]);
    expect(plan.sync).not.toContain('--shm-size=1g');
    expect(containerPlan({ ...NPX, runtime: 'default' }, input).sync).not.toContain('--runtime');
  });

  it('syncs a whole copy, pruned to the listing, and installs when the key changed; the run sets up and runs oxmutate in the project', () => {
    const plan = containerPlan({ ...NPX, setup: 'npm run build' }, { ...input, sync: whole });
    expect(script(plan.sync)).toEqual([
      'set -e',
      FULL_TRAP,
      'mkdir -p /w/src && cd /w/src',
      '[ ! -f /w/in.tar ] || tar -xovf /w/in.tar >/dev/null',
      'rm -f /w/in.tar',
      expect.stringMatching(/^node -e '.*' \/w\/src \/w\/listing$/u),
      'rm -f /w/listing',
      "echo 'T' > /w/synced",
      ...INSTALL,
    ]);
    expect(script(plan.run)).toEqual(['set -e', 'npm run build', "cd '/w/src/packages/a'", String.raw`exec npx --no oxmutate 'run' 'it'\''s'`]);
    const bare = containerPlan(NPX, { ...input, install: '', rel: '' });
    expect(script(bare.sync)).toEqual(['set -e', FULL_TRAP, 'mkdir -p /w/src && cd /w/src']);
    expect(script(bare.run)).toEqual(['set -e', "cd '/w/src'", String.raw`exec npx --no oxmutate 'run' 'it'\''s'`]);
  });

  it('applies a delta only to the volume it was computed for, and removes what the host deleted', () => {
    const deleted = Array.from({ length: 51 }, (_, i) => `d${String(i)}`);
    const lines = script(containerPlan(NPX, { ...input, install: '', sync: { mode: 'delta', token: 'T', send: ['a'], deleted } }).sync);
    expect(lines.slice(3, 6)).toEqual([
      `[ "$(cat /w/synced 2>/dev/null)" = 'T' ] || { echo 'oxmutate: the volume is not the one last synced; sending the whole repository' >&2; exit ${String(RESYNC)}; }`,
      '[ ! -f /w/in.tar ] || tar -xovf /w/in.tar >/dev/null',
      'rm -f /w/in.tar',
    ]);
    expect(lines.slice(6)).toEqual([`rm -f -- ${deleted.slice(0, 50).map((f) => `'${f}'`).join(' ')}`, "rm -f -- 'd50'"]);
    expect(RESYNC).toBe(75);
    const lineCount = (n: number): number => script(containerPlan(NPX, { ...input, install: '', sync: { mode: 'delta', token: 'T', send: [], deleted: Array.from({ length: n }, (_, i) => `d${String(i)}`) } }).sync).filter((l) => l.startsWith('rm -f --')).length;
    expect([lineCount(0), lineCount(50)]).toEqual([0, 1]);
  });

  it('keeps the install guard whole when the install command has a comment', () => {
    const lines = script(containerPlan(NPX, { ...input, install: 'npm ci # note', sync: whole }).sync);
    expect(lines.slice(-5)).toEqual([`if [ "$(cat /w/installed 2>/dev/null)" != 'k1' ]; then`, '{', 'npm ci # note', '} || exit "$?"', "echo 'k1' > /w/installed; fi"]);
    if (spawnSync('sh', ['-c', 'true']).status === 0) {
      const file = path.join(scratch('oxmutate-sh-'), 'sync.sh');
      writeFileSync(file, lines.join('\n'));
      expect(spawnSync('sh', ['-n', file], { encoding: 'utf8' })).toMatchObject({ status: 0, stderr: '' });
    }
  });

  it('stops at a step that fails in the middle of an install chain and writes no stamp, so the install runs again', () => {
    const dir = scratch('oxmutate-install-');
    const ran = (install: string): number | null => {
      const block = script(containerPlan(NPX, { ...input, install, sync: whole }).sync).slice(-5).join('\n').replaceAll('/w/', `${dir.replaceAll('\\', '/')}/`);
      const file = path.join(dir, 'install-block.sh');
      writeFileSync(file, block);
      return spawnSync('sh', ['-e', file], { encoding: 'utf8' }).status;
    };
    // errexit ignores `false` here, since it is not the last command of its `&&` list: the stamp was written all the same.
    expect(ran('false && true')).toBe(1);
    expect(existsSync(path.join(dir, 'installed'))).toBe(false);
    expect(ran('true && true')).toBe(0);
    expect(readFileSync(path.join(dir, 'installed'), 'utf8').trim()).toBe('k1');
  });

  it('turns each ref the run names into a commit and a tag inside, and stages the source so a diff sees new files', () => {
    const bases = [{ ref: 'origin/main', commit: 'abc', tag: 'oxmutate-base-0' }];
    const lines = script(containerPlan(NPX, { ...input, install: '', sync: whole, bases }).sync);
    expect(lines.slice(8)).toEqual([
      `command -v git >/dev/null || { echo 'oxmutate: --since or --frozen-oracle in a container needs git in the image. fix: container.image node:${nodeMajor}' >&2; exit 3; }`,
      'rm -rf /w/base-0 && mkdir -p /w/base-0 && tar -xof /w/base-0.tar -C /w/base-0 && rm -f /w/base-0.tar',
      'rm -rf .git && git init -q',
      'git --work-tree=/w/base-0 add -A',
      "git -c user.name=oxmutate -c user.email=oxmutate@localhost commit -q --allow-empty -m 'origin/main'",
      "git tag -f 'oxmutate-base-0'",
      "git add -A -- . ':!**/node_modules'",
    ]);
  });

  it('fetches the commit instead with source git, each base as a tag first, keeping node_modules and the kept files', () => {
    const bases = [{ ref: 'origin/main', commit: 'b0', tag: 'oxmutate-base-0' }];
    const plan = containerPlan(NPX, { ...input, fetch: { remote: 'https://example.com/r.git', commit: 'abc123' }, bases });
    expect(script(plan.sync).slice(3, 15)).toEqual([
      `command -v git >/dev/null || { echo 'oxmutate: source git needs git in the image. fix: container.image node:${nodeMajor}' >&2; exit 3; }`,
      '[ -d .git ] || git init -q',
      fetch('b0'),
      "git tag -f 'oxmutate-base-0' FETCH_HEAD",
      fetch('abc123'),
      'git checkout -q -f FETCH_HEAD',
      "git clean -q -fdx -e 'node_modules' -e 'packages/a/reports/m.json'",
      ...INSTALL,
    ]);
  });

  it('installs the host’s own oxmutate into the volume once, outside the source, and runs it, unless the command is set', () => {
    const plan = containerPlan(DEFAULTS, { ...input, sync: whole });
    expect(script(plan.sync).at(-1)).toBe(
      `[ -x /w/.oxmutate/${OWN}/node_modules/.bin/oxmutate ] || npm install --no-save --no-audit --no-fund --prefix /w/.oxmutate/${OWN} oxmutate@${OWN} || { echo 'oxmutate: the container could not install oxmutate@${OWN} from the registry. fix: set container.command to an oxmutate the image or the project has, and container.install to an install that needs no network' >&2; exit 5; }`,
    );
    expect(script(plan.run).at(-1)).toBe(String.raw`exec /w/.oxmutate/${OWN}/node_modules/.bin/oxmutate 'run' 'it'\''s'`);
    expect(VERSION).toBe(OWN);
    if (spawnSync('sh', ['-c', 'true']).status === 0) {
      const file = path.join(scratch('oxmutate-sh-'), 'sync.sh');
      writeFileSync(file, plan.sync.at(-1)!);
      expect(spawnSync('sh', ['-n', file], { encoding: 'utf8' })).toMatchObject({ status: 0, stderr: '' });
    }
    expect(script(containerPlan(NPX, { ...input, sync: whole }).sync).join('\n')).not.toContain('.oxmutate');
  });

  it('gives installEnv and the forwarded auth to the sync container alone, never to the run or the copy back', () => {
    const auth = ['-e', 'npm_config_userconfig=/tmp/oxmutate-npmrc', '-e', 'NODE_AUTH_TOKEN'];
    const plan = containerPlan({ ...NPX, cache: false, installEnv: ['NPM_TOKEN', 'A=1'], env: ['CI'] }, { ...input, auth });
    expect(plan.sync.slice(0, -4)).toEqual(['create', '--rm', ...HARDENED, '-e', 'CI', ...VOL, '-e', 'NPM_TOKEN', '-e', 'A=1', ...auth, '-w', '/w']);
    for (const args of [plan.run, plan.back]) {
      expect(args).toContain('CI');
      for (const secret of ['NPM_TOKEN', 'A=1', 'NODE_AUTH_TOKEN', 'npm_config_userconfig=/tmp/oxmutate-npmrc']) expect(args).not.toContain(secret);
    }
  });

  it('packs without macOS metadata on macOS, and with only what GNU tar knows elsewhere', () => {
    expect(tarFlags('darwin')).toEqual(['--no-mac-metadata', '--no-xattrs']);
    expect(tarFlags('linux')).toEqual(['--no-xattrs']);
  });
});

function repo(files: Record<string, string>): string {
  const dir = scratch('oxmutate-container-');
  for (const [f, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    writeFileSync(path.join(dir, f), text);
  }
  spawnSync('git', ['init', '-q'], { cwd: dir, env: withoutGit() });
  spawnSync('git', ['add', '-A'], { cwd: dir, env: withoutGit() });
  return dir;
}

const commit = (dir: string): void => void spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'c'], { cwd: dir, env: withoutGit() });

interface Call { cmd: string; args: readonly string[]; o: RunOptions }
interface Outcome {
  code?: number | null; syncCodes?: number[]; volumeExists?: boolean; info?: string; out?: string; outFails?: boolean; fail?: Error; tarFails?: boolean; createFails?: boolean; backFails?: boolean; cpFails?: boolean; listFails?: boolean;
  /** `git archive` fails. */
  archiveFails?: boolean;
  /** `create` (the sync's, or with `back` the copy back's) fails with this on stderr. */
  createSays?: string;
  /** The copy back's `create` fails with this on stderr. */
  backSays?: string;
  /** `cp` into the container fails with this on stderr. */
  cpSays?: string;
  /** `tar` fails with this on stderr. */
  tarSays?: string;
  /** `volume create` fails with this on stderr. */
  volumeSays?: string;
  /** Every engine call fails with this on stderr. */
  daemonSays?: string;
  /** How many polls of the volume's label answer that another run's container is on it. */
  busy?: number;
  /** What prune's listings answer. */
  listed?: { containers: string; volumes: string };
}
type Answer = { code: number | null; stdout: string; stderr: string };
const answer = (code: number | null, stdout = ''): Answer => ({ code, stdout, stderr: code === 0 ? '' : ' engine said no \n' });
/** The engine's verb and its own arguments, without the context flag before them. */
function verbOf(args: readonly string[]): [string, string[]] {
  const rest = args[0] === '--context' || args[0] === '--connection' ? args.slice(2) : [...args];
  return rest[0] === 'volume' ? [`volume ${rest[1] ?? ''}`, rest.slice(2)] : [rest[0] ?? '', rest.slice(1)];
}

/** The permission bits of a file's mode. */
const MODE_BITS = 0o777;

/**
 * The real git and tar (bellpull's run, GIT_* left out) unless `tarFails`. The engine is a fake
 * that keeps what each step was given: the files copied in (each tar's listing), each container's
 * script, and it answers the copy out with `out` when given one.
 */
function fake(result: Outcome) {
  const calls: Call[] = [];
  const verbs: string[] = [];
  const scripts = new Map<string, string>();
  const syncCodes = [...(result.syncCodes ?? [])];
  const sent: string[][] = [];
  const copied: string[] = [];
  /** Each host file copied in, by its name, and each whole sync's listing as the container reads it. */
  const froms: string[] = [];
  const listings: string[] = [];
  /** The `.yarnrc.yml` of each HOME the sync container got. */
  const homes: string[] = [];
  /** The npm user config as the sync container got it: its text and its mode when copied (the staging directory is gone after the run). */
  const npmrcs: { text: string; mode: number }[] = [];
  /** The mode of each `.yarnrc.yml` copied in. */
  const yarnrcModes: number[] = [];
  let busy = result.busy ?? 0;
  const isSync = (id: string): boolean => (scripts.get(id) ?? '') !== '';
  const copyIn = (from: string, to: string): Answer => {
    copied.push(to);
    froms.push(path.basename(from));
    if (path.basename(from) === 'listing') listings.push(readFileSync(from, 'utf8'));
    if (path.basename(from) === 'home') {
      homes.push(readFileSync(path.join(from, '.yarnrc.yml'), 'utf8'));
      yarnrcModes.push(statSync(path.join(from, '.yarnrc.yml')).mode & MODE_BITS);
    }
    if (to.endsWith('/oxmutate-npmrc')) npmrcs.push({ text: readFileSync(from, 'utf8'), mode: statSync(from).mode & MODE_BITS });
    if (path.basename(from) === 'in.tar') sent.push(spawnSync('tar', ['-tf', 'in.tar'], { cwd: path.dirname(from), encoding: 'utf8' }).stdout.split(/\r?\n/u).filter(Boolean).toSorted());
    if (result.cpSays !== undefined) return { code: 1, stdout: '', stderr: result.cpSays };
    return answer(result.cpFails ? 1 : 0);
  };
  const copyOut = (to: string): Answer => {
    if (result.outFails || !result.out) return answer(1);
    copyFileSync(result.out, to);
    return answer(0);
  };
  const handlers: Record<string, (rest: string[]) => Answer> = {
    create: (rest) => {
      if (result.backSays !== undefined && rest.at(-1) === 'true') return { code: 1, stdout: '', stderr: result.backSays };
      if (result.createSays !== undefined) return { code: 1, stdout: '', stderr: result.createSays };
      if (result.createFails || (result.backFails && rest.at(-1) === 'true')) return answer(1);
      const id = `c${String(scripts.size + 1)}`;
      scripts.set(id, rest.includes('-c') ? (rest[rest.indexOf('-c') + 1] ?? '') : '');
      return answer(0, `${id}\n`);
    },
    // A container side is `<id>:<path>`; a Windows host path has a colon too (`C:\…`).
    cp: ([from = '', to = '']) => (/^c\d+:/u.test(from) ? copyOut(to) : copyIn(from, to)),
    start: (rest) => answer(isSync(rest.at(-1) ?? '') ? (syncCodes.shift() ?? 0) : 0),
    run: () => answer('code' in result ? (result.code ?? null) : 0),
    'volume inspect': () => answer(result.volumeExists ? 0 : 1),
    info: () => answer(0, result.info ?? '{"runc":{}}'),
    // prune lists every container (`-aq`); a run asks which are running on its volume (`-q`).
    ps: (rest) => {
      if (rest[0] === '-aq') return answer(result.listFails ? 1 : 0, result.listed?.containers ?? 'c7\nc8\n');
      return answer(0, busy-- > 0 ? 'c9\n' : '\n');
    },
    'volume ls': () => answer(0, result.listed?.volumes ?? 'oxmutate-a\noxmutate-cache\n'),
    'volume create': () => (result.volumeSays === undefined ? answer(0) : { code: 1, stdout: '', stderr: result.volumeSays }),
  };
  const spawn = async (cmd: string, args: readonly string[], o: RunOptions) => {
    calls.push({ cmd, args, o });
    if (cmd === 'tar' && result.tarSays !== undefined) return { code: 1, stdout: '', stderr: result.tarSays };
    if (cmd === 'tar' && result.tarFails) return { code: 2, stdout: '', stderr: ' tar: cannot open \n' };
    if (cmd === 'git' && args[0] === 'archive' && result.archiveFails) return { code: 128, stdout: '', stderr: ' fatal: not a tree object \n' };
    if (cmd !== 'engine') return run(cmd, args, { ...o, env: { ...withoutGit(), ...o.env } });
    if (result.fail) throw result.fail;
    const [verb, rest] = verbOf(args);
    verbs.push(verb);
    if (result.daemonSays !== undefined) return { code: 1, stdout: '', stderr: result.daemonSays };
    return handlers[verb]?.(rest) ?? answer(0);
  };
  const ofEngine = (): Call[] => calls.filter((c) => c.cmd === 'engine');
  const io = (): string => {
    const tar = calls.find((c) => c.cmd === 'tar');
    return typeof tar?.o.cwd === 'string' ? tar.o.cwd : '';
  };
  return { calls, spawn, ofEngine, verbs: () => verbs, scripts, sent, copied, froms, listings, homes, npmrcs, yarnrcModes, io };
}

/** The run container's arguments, and the sync container's (the first created). */
const runArgs = (f: ReturnType<typeof fake>): readonly string[] => f.ofEngine().find((c) => c.args[0] === 'run')!.args;
const syncArgs = (f: ReturnType<typeof fake>): readonly string[] => f.ofEngine().find((c) => c.args[0] === 'create')!.args;

/** The install key in a sync's script. */
const keyOf = (s: string): string => /!= '([0-9a-f]+)'/u.exec(s)![1]!;

describe('running in the container', () => {
  const C = { ...NPX, engine: 'engine' };

  it('creates the volumes, sends the git files, syncs, runs in the project, and returns the run’s exit code', async () => {
    const top = repo({ 'package-lock.json': '{}', 'packages/a/src/x.ts': 'x', '.gitignore': 'dist\n', 'packages/a/dist/y.js': 'y' });
    const f = fake({ code: 3 });
    expect(await runInContainer(C, { root: path.join(top, 'packages/a'), keep: [] }, ['run', '--container'], { spawn: f.spawn })).toBe(3);
    expect(f.verbs()).toEqual(['volume create', 'volume create', 'ps', 'volume inspect', 'create', 'cp', 'cp', 'start', 'run']);
    expect(f.sent).toEqual([['.gitignore', 'package-lock.json', 'packages/a/src/x.ts']]);
    expect(f.copied.toSorted()).toEqual(['c1:/w/in.tar', 'c1:/w/listing']);
    expect(f.listings).toEqual(['.gitignore\0package-lock.json\0packages/a/src/x.ts']);
    const name = `oxmutate-${createHash('sha256').update(realpathSync.native(top)).digest('hex').slice(0, 12)}`;
    const ran = f.ofEngine().find((c) => c.args[0] === 'run')!;
    expect(f.ofEngine()[0]!.args.at(-1)).toBe(name);
    expect(f.scripts.get('c1')).toContain('then\n{\nnpm ci\n}');
    expect(ran.args).toContain(`${name}:/w`);
    expect(ran.args.at(-1)).toContain("cd '/w/src/packages/a'");
    expect(ran.args.at(-1)).toMatch(/exec npx --no oxmutate 'run'$/u);
    for (const call of [f.ofEngine().find((c) => c.args[0] === 'start')!, ran]) expect(call.o).toMatchObject({ stdio: 'inherit', timeout: 0 });
    // The host's archives live in its own temporary directory, removed after the run; the container mounts none of it.
    expect([tmpdir(), realpathSync(tmpdir())]).toContain(path.dirname(f.io()));
    expect(path.basename(f.io())).toMatch(/^oxmutate-io-/u);
    expect(existsSync(f.io())).toBe(false);
    expect(f.calls.find((c) => c.cmd === 'tar')!.args).toEqual(['-cf', 'in.tar', ...tarFlags(process.platform), '-C', realpathSync.native(top), '--null', '-T', path.join(f.io(), 'files')]);
    // What was sent is remembered for the next run, by volume.
    expect(Object.keys(readState(name)!.files).toSorted()).toEqual(['.gitignore', 'package-lock.json', 'packages/a/src/x.ts']);
  });

  it('the next run sends only what changed, removes what was deleted, and skips the sync when nothing did', async () => {
    const top = repo({ 'package.json': '{}', 'a.ts': 'a', 'b.ts': 'b' });
    await runInContainer(C, { root: top, keep: [] }, [], { spawn: fake({}).spawn });
    writeFileSync(path.join(top, 'a.ts'), 'a changed');
    rmSync(path.join(top, 'b.ts'));
    spawnSync('git', ['add', '-A'], { cwd: top, env: withoutGit() });
    const delta = fake({ volumeExists: true });
    await runInContainer(C, { root: top, keep: [] }, [], { spawn: delta.spawn });
    expect(delta.sent).toEqual([['a.ts']]);
    expect(delta.copied).toEqual(['c1:/w/in.tar']);
    expect(delta.scripts.get('c1')).toContain("rm -f -- 'b.ts'");
    const idle = fake({ volumeExists: true });
    await runInContainer(C, { root: top, keep: [] }, [], { spawn: idle.spawn });
    expect(idle.verbs()).toEqual(['volume create', 'volume create', 'ps', 'volume inspect', 'run']);
    // A volume removed since (or another machine's) gets everything again.
    const gone = fake({ volumeExists: false });
    await runInContainer(C, { root: top, keep: [] }, [], { spawn: gone.spawn });
    expect(gone.sent).toEqual([['a.ts', 'package.json']]);
  });

  it('sends everything again when the volume refuses the delta, and keeps no record for an ephemeral volume', async () => {
    const top = repo({ 'package.json': '{}', 'a.ts': 'a' });
    await runInContainer(C, { root: top, keep: [] }, [], { spawn: fake({}).spawn });
    writeFileSync(path.join(top, 'a.ts'), 'a2');
    const refused = fake({ volumeExists: true, syncCodes: [RESYNC, 0] });
    await runInContainer(C, { root: top, keep: [] }, [], { spawn: refused.spawn });
    expect(refused.sent).toEqual([['a.ts'], ['a.ts', 'package.json']]);
    expect(refused.verbs().filter((v) => v === 'start')).toHaveLength(2);
    const failing = fake({ volumeExists: true, syncCodes: [RESYNC, RESYNC] });
    writeFileSync(path.join(top, 'a.ts'), 'a3');
    await expect(runInContainer(C, { root: top, keep: [] }, [], { spawn: failing.spawn })).rejects.toThrow(`the sync into the container or its install failed (exit ${String(RESYNC)})`);
    rmSync(syncDir(), { recursive: true, force: true });
    // A whole sync is not retried: the volume holds nothing a delta was computed for.
    const wholeRefused = fake({ syncCodes: [RESYNC, 0] });
    await expect(runInContainer(C, { root: top, keep: [] }, [], { spawn: wholeRefused.spawn })).rejects.toThrow(`(exit ${String(RESYNC)})`);
    expect(wholeRefused.verbs().filter((v) => v === 'start')).toHaveLength(1);
    await runInContainer({ ...C, ephemeral: true, volume: 'eph' }, { root: top, keep: [] }, [], { spawn: fake({}).spawn });
    expect(readState('eph')).toBeUndefined();
  });

  it('runs --since and --frozen-oracle inside: each ref goes in as its tree and the run names its tag', async () => {
    const top = repo({ 'package.json': '{}', 'a.ts': 'a' });
    commit(top);
    const f = fake({});
    await runInContainer(C, { root: top, keep: [], since: 'HEAD', frozenOracle: 'HEAD' }, ['run', '--since', 'HEAD', '--frozen-oracle=HEAD'], { spawn: f.spawn });
    expect(f.copied.toSorted()).toEqual(['c1:/w/base-0.tar', 'c1:/w/in.tar', 'c1:/w/listing']);
    expect(f.froms.toSorted()).toEqual(['base-0.tar', 'in.tar', 'listing']);
    expect(f.scripts.get('c1')).toContain("git tag -f 'oxmutate-base-0'");
    expect(f.ofEngine().find((c) => c.args[0] === 'run')!.args.at(-1)).toMatch(/'--since' 'oxmutate-base-0' '--frozen-oracle=oxmutate-base-0'$/u);
    await expect(runInContainer(C, { root: top, keep: [], since: 'no-such-ref' }, [], { spawn: fake({}).spawn })).rejects.toThrow('no-such-ref is not a commit in');
  });

  it('syncs the refs in even when no file changed, and says when git cannot archive one', async () => {
    const top = repo({ 'package.json': '{}', 'a.ts': 'a' });
    commit(top);
    await runInContainer(C, { root: top, keep: [] }, [], { spawn: fake({}).spawn });
    const again = fake({ volumeExists: true });
    await runInContainer(C, { root: top, keep: [], since: 'HEAD' }, ['--since', 'HEAD'], { spawn: again.spawn });
    expect(again.verbs()).toContain('start');
    expect(again.froms).toEqual(['base-0.tar']);
    await expect(runInContainer(C, { root: top, keep: [], since: 'HEAD' }, [], { spawn: fake({ archiveFails: true }).spawn })).rejects.toThrow('git could not archive HEAD: fatal: not a tree object');
  });

  it('sends no archive when files were only deleted', async () => {
    const top = repo({ 'package.json': '{}', 'a.ts': 'a', 'b.ts': 'b' });
    await runInContainer(C, { root: top, keep: [] }, [], { spawn: fake({}).spawn });
    rmSync(path.join(top, 'b.ts'));
    spawnSync('git', ['add', '-A'], { cwd: top, env: withoutGit() });
    const f = fake({ volumeExists: true });
    await runInContainer(C, { root: top, keep: [] }, [], { spawn: f.spawn });
    expect(f.verbs()).toContain('start');
    expect(f.copied).toEqual([]);
    expect(f.scripts.get('c1')).toContain("rm -f -- 'b.ts'");
  });

  it('runs on gVisor when Docker has it', async () => {
    const top = repo({ 'package.json': '{}' });
    const f = fake({ info: '{"runsc":{}}' });
    // A call that succeeds is not read as a stopped daemon, whatever warning it prints.
    const warned = async (cmd: string, args: readonly string[], o: RunOptions) => {
      const r = await f.spawn(cmd === 'docker' ? 'engine' : cmd, args, o);
      return cmd === 'docker' && r.code === 0 ? { ...r, stderr: 'WARNING: registry mirror: connection refused\n' } : r;
    };
    await runInContainer({ ...C, engine: 'docker' }, { root: top, keep: [] }, [], { spawn: warned });
    expect(f.verbs()[0]).toBe('info');
    expect(f.ofEngine().find((c) => c.args[0] === 'run')!.args).toContain('runsc');
  });

  it('sends every engine call to the context and the host it names', async () => {
    const top = repo({ 'package.json': '{}' });
    const f = fake({});
    await runInContainer({ ...C, context: 'box', host: 'ssh://u@box' }, { root: top, keep: [path.join(top, 'r.json')] }, [], { spawn: f.spawn });
    for (const call of f.ofEngine()) {
      expect(call.args.slice(0, 2)).toEqual(['--context', 'box']);
      expect(call.o.env).toMatchObject({ DOCKER_HOST: 'ssh://u@box' });
    }
  });

  it('with source git, sends no file: the container fetches HEAD from origin, or from the remote it is given', async () => {
    const top = repo({ 'package.json': '{}', 'a.ts': 'a' });
    commit(top);
    spawnSync('git', ['remote', 'add', 'origin', 'https://example.com/origin.git'], { cwd: top, env: withoutGit() });
    const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: top, env: withoutGit(), encoding: 'utf8' }).stdout.trim();
    const f = fake({});
    await runInContainer({ ...C, source: 'git' }, { root: top, keep: [] }, [], { spawn: f.spawn });
    expect(f.verbs()).toEqual(['volume create', 'volume create', 'ps', 'create', 'start', 'run']);
    expect(f.ofEngine().find((c) => c.args[0] === 'start')!.o).toMatchObject({ stdio: 'inherit' });
    expect(f.calls.filter((c) => c.cmd === 'tar')).toEqual([]);
    expect(f.scripts.get('c1')).toContain(`git fetch -q --depth 1 'https://example.com/origin.git' '${head}'`);
    const g = fake({});
    await runInContainer({ ...C, source: 'git', remote: 'https://example.com/fork.git' }, { root: top, keep: [] }, [], { spawn: g.spawn });
    expect(g.scripts.get('c1')).toContain("'https://example.com/fork.git'");
    await expect(runInContainer({ ...C, source: 'git' }, { root: repo({ 'a.ts': '' }), keep: [] }, [], { spawn: fake({}).spawn })).rejects.toThrow('source git fetches from a remote, and this repository has no origin. fix: set container.remote');
    await expect(runInContainer({ ...C, source: 'git' }, { root: top, keep: [] }, [], { spawn: fake({ syncCodes: [4] }).spawn })).rejects.toThrow('(exit 4)');
  });

  it.runIf(spawnSync('xattr', ['-h']).status === 0)('packs no extended attribute and no ._ file on macOS', async () => {
    const top = repo({ 'package.json': '{}', 'a.ts': 'a' });
    spawnSync('xattr', ['-w', 'com.example.tag', 'marked', path.join(top, 'a.ts')]);
    let packed = '';
    const f = fake({});
    await runInContainer(C, { root: top, keep: [] }, [], {
      spawn: async (cmd, args, o) => {
        if (cmd === 'engine' && args[0] === 'cp' && args[1]!.endsWith('in.tar')) packed = readFileSync(args[1]!, 'latin1');
        return f.spawn(cmd, args, o);
      },
    });
    expect(f.sent).toEqual([['a.ts', 'package.json']]);
    expect(packed).toContain('a.ts');
    expect(packed).not.toContain('com.example.tag');
  });

  it('packs the flags of the host it runs on', async () => {
    const top = repo({ 'package.json': '{}' });
    const f = fake({});
    await runInContainer(C, { root: top, keep: [] }, [], { spawn: async (cmd, args, o) => f.spawn(cmd, cmd === 'tar' ? args.filter((a) => a !== '--no-mac-metadata') : args, o), host: 'linux' });
    expect(f.calls.find((c) => c.cmd === 'tar')!.args).not.toContain('--no-mac-metadata');
  });

  it('installs again only when the lockfile, the image or the install command changes', async () => {
    const top = repo({ 'yarn.lock': 'a' });
    const key = async (c: Container = C): Promise<string> => {
      const f = fake({});
      await runInContainer({ ...c, volume: 'v', ephemeral: true }, { root: top, keep: [] }, [], { spawn: f.spawn });
      expect(f.ofEngine()[0]!.args.at(-1)).toBe('v');
      return keyOf(f.scripts.get('c1')!);
    };
    const first = await key();
    expect(await key()).toBe(first);
    expect(await key({ ...C, image: 'other' })).not.toBe(first);
    expect(await key({ ...C, install: 'yarn' })).not.toBe(first);
    writeFileSync(path.join(top, 'yarn.lock'), 'b');
    expect(await key()).not.toBe(first);
  });

  it('keys the install by package.json when there is no lockfile, and by nothing when there is neither', async () => {
    const top = repo({ 'package.json': '{"a":1}' });
    const key = async (): Promise<string> => {
      const f = fake({});
      await runInContainer({ ...C, ephemeral: true }, { root: top, keep: [] }, [], { spawn: f.spawn });
      return keyOf(f.scripts.get('c1')!);
    };
    const first = await key();
    writeFileSync(path.join(top, 'package.json'), '{"a":2}');
    expect(await key()).not.toBe(first);
    const f = fake({});
    await runInContainer(C, { root: repo({ 'x.ts': '' }), keep: [] }, [], { spawn: f.spawn });
    expect(f.scripts.get('c1')).toContain('then\n{\nnpm install\n}');
  });

  it('copies each kept file back from a container never started, removes it, and sends the host’s copy of them in', async () => {
    const top = repo({ 'package.json': '{}', '.gitignore': 'reports\n', 'reports/inc.json': 'host' });
    const from = repo({ 'inc.json': 'from the container' });
    const f = fake({ out: path.join(from, 'inc.json') });
    expect(await runInContainer({ ...C, install: '' }, { root: top, keep: [path.join(top, 'reports/inc.json'), path.join(top, 'reports/new/m.json')] }, [], { spawn: f.spawn })).toBe(0);
    expect(f.verbs().slice(-5)).toEqual(['run', 'create', 'cp', 'cp', 'rm']);
    expect(f.sent[0]).toContain('reports/inc.json');
    expect(f.scripts.get('c1')).not.toContain('installed');
    const outs = f.ofEngine().filter((c) => c.args[0] === 'cp' && c.args[1]!.startsWith('c2:')).map((c) => c.args[1]);
    expect(outs.toSorted()).toEqual(['c2:/w/src/reports/inc.json', 'c2:/w/src/reports/new/m.json']);
    expect(f.ofEngine().at(-1)!.args).toEqual(['rm', '-f', 'c2']);
    expect(readFileSync(path.join(top, 'reports/inc.json'), 'utf8')).toBe('from the container');
    // A kept file in a directory the host does not have yet gets it.
    expect(readFileSync(path.join(top, 'reports/new/m.json'), 'utf8')).toBe('from the container');
  });

  it('finds the kept files of a project below the root, whatever spelling of its path the host gives', async () => {
    const top = repo({ 'package.json': '{}', '.gitignore': 'reports\n', 'packages/a/reports/m.json': 'host' });
    // macOS's tmpdir is a symlink (/var -> /private/var), as Windows' is a short name (RUNNER~1): git answers the real path.
    const spelled = path.join(tmpdir(), path.basename(top), 'packages/a');
    const f = fake({});
    await runInContainer(C, { root: spelled, keep: [path.join(spelled, 'reports/m.json')] }, [], { spawn: f.spawn });
    expect(f.sent[0]).toContain('packages/a/reports/m.json');
    expect(f.ofEngine().filter((c) => c.args[0] === 'cp').map((c) => c.args[1]).at(-1)).toBe('c2:/w/src/packages/a/reports/m.json');
    expect(f.ofEngine().find((c) => c.args[0] === 'run')!.args.at(-1)).toContain("cd '/w/src/packages/a'");
  });

  it('keeps no file outside the repository, on another drive included', async () => {
    const top = repo({ 'package.json': '{}', 'packages/a/x.ts': '' });
    const f = fake({});
    const elsewhere = process.platform === 'win32' ? 'Z:\\elsewhere\\r.json' : '/elsewhere/r.json';
    await runInContainer(C, { root: path.join(top, 'packages/a'), keep: [elsewhere, path.join(top, 'r.json')] }, [], { spawn: f.spawn });
    expect(f.ofEngine().filter((c) => c.args[0] === 'cp' && c.args[1]!.startsWith('c2:')).map((c) => c.args[1])).toEqual(['c2:/w/src/r.json']);
  });

  it('writes nothing when a kept file did not come back, still removes the container, and copies back nothing when nothing is kept', async () => {
    const top = repo({ 'package.json': '{}' });
    const f = fake({ outFails: true });
    expect(await runInContainer(C, { root: top, keep: [path.join(top, 'reports/none.json')] }, [], { spawn: f.spawn })).toBe(0);
    expect(f.verbs().slice(-3)).toEqual(['create', 'cp', 'rm']);
    expect(existsSync(path.join(top, 'reports'))).toBe(false);
    const none = fake({});
    await runInContainer(C, { root: top, keep: [] }, [], { spawn: none.spawn });
    expect(none.verbs()).not.toContain('rm');
    const lost = fake({ backFails: true });
    await expect(runInContainer(C, { root: top, keep: [path.join(top, 'r.json')] }, [], { spawn: lost.spawn })).rejects.toThrow("the container could not be created: engine said no. fix: check container.image and the engine's own error");
  });

  it('copies the reports back after exit 0 or 1, never after a run that failed: the volume then holds an earlier run’s', async () => {
    const top = repo({ 'package.json': '{}' });
    const keep = [path.join(top, 'reports/m.json')];
    await Promise.all(
      ([[0, true], [1, true], [3, false], [2, false], [null, false]] as const).map(async ([code, copiesBack]) => {
        const f = fake({ code, out: path.join(top, 'package.json') });
        expect(await runInContainer(C, { root: top, keep }, [], { spawn: f.spawn })).toBe(code ?? 1);
        expect(f.ofEngine().some((c) => c.args[0] === 'cp' && c.args[1]!.startsWith('c2:'))).toBe(copiesBack);
      }),
    );
  });

  it('with ephemeral, removes the volume after the run, and after a failed one', async () => {
    const top = repo({ 'package.json': '{}' });
    const f = fake({});
    await runInContainer({ ...C, ephemeral: true, volume: 'v' }, { root: top, keep: [] }, [], { spawn: f.spawn });
    expect(f.ofEngine().at(-1)!.args).toEqual(['volume', 'rm', '-f', 'v']);
    const failed = fake({ syncCodes: [1] });
    await expect(runInContainer({ ...C, ephemeral: true, volume: 'v' }, { root: top, keep: [] }, [], { spawn: failed.spawn })).rejects.toThrow('the sync');
    expect(failed.ofEngine().at(-1)!.args).toEqual(['volume', 'rm', '-f', 'v']);
    const kept = fake({});
    await runInContainer(C, { root: top, keep: [] }, [], { spawn: kept.spawn });
    expect(kept.verbs()).not.toContain('volume rm');
  });

  it('stops before the run when the sync, its copy or its creation fails, and leaves no temporary directory', async () => {
    const top = repo({ 'package.json': '{}' });
    const f = fake({ syncCodes: [1] });
    const said = await runInContainer(C, { root: top, keep: [] }, [], { spawn: f.spawn }).then(() => '', (e: Error) => e.message);
    // One line, naming each fix a failed install most often needs: the lockfile, the registry login, the install itself.
    expect(said).not.toContain('\n');
    for (const part of ['install failed (exit 1); its output is above', 'update the lockfile on the host', 'commit it', 'log in to the registry on the host (~/.npmrc, ~/.yarnrc.yml; container.installEnv', 'set container.install, or container.image']) expect(said).toContain(part);
    expect(f.verbs()).not.toContain('run');
    expect(existsSync(f.io())).toBe(false);
    const copy = fake({ cpFails: true });
    await expect(runInContainer(C, { root: top, keep: [] }, [], { spawn: copy.spawn })).rejects.toThrow('the copy into the container failed: engine said no');
    expect(copy.ofEngine().at(-1)!.args).toEqual(['rm', '-f', 'c1']);
    await expect(runInContainer(C, { root: top, keep: [] }, [], { spawn: fake({ createFails: true }).spawn })).rejects.toThrow("the container could not be created: engine said no. fix: check container.image and the engine's own error");
  });

  it('says what to do when it cannot run', async () => {
    const top = repo({});
    await expect(runInContainer(C, { root: tmpdir(), keep: [] }, [], { spawn: fake({}).spawn })).rejects.toThrow('is in none. fix: git init');
    const packed = repo({ 'a.ts': '' });
    await expect(runInContainer(C, { root: packed, keep: [] }, [], { spawn: fake({ tarFails: true }).spawn })).rejects.toThrow(`tar could not pack ${realpathSync.native(packed)}: tar: cannot open`);
    await expect(runInContainer(C, { root: top, keep: [] }, [], { spawn: fake({ fail: new Error('engine: not found') }).spawn })).rejects.toThrow('engine did not start (engine: not found). fix: install and start Docker or Podman');
    expect(await runInContainer(C, { root: top, keep: [] }, [], { spawn: fake({ code: null }).spawn })).toBe(1);
  });
});

describe('what the install gets', () => {
  const C = { ...NPX, engine: 'engine' };
  afterEach(() => void vi.restoreAllMocks());

  it('forwards the host’s ~/.npmrc and ~/.yarnrc.yml to the sync, with each variable they name, and none of it to the run', async () => {
    const said = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const dir = home.dir!;
    // eslint-disable-next-line node-security/require-storage-encryption -- a fixture npmrc that names a variable, no secret in it
    writeFileSync(path.join(dir, '.npmrc'), '//npm.example.com/:_authToken=${NODE_AUTH_TOKEN}\n@acme:registry=${ACME_REGISTRY}\nalways=${NODE_AUTH_TOKEN}\n');
    // eslint-disable-next-line node-security/require-storage-encryption -- a fixture yarnrc that names a variable, no secret in it
    writeFileSync(path.join(dir, '.yarnrc.yml'), 'npmAuthToken: "${YARN_TOKEN}"\n');
    const top = repo({ 'package.json': '{}' });
    const f = fake({});
    await runInContainer(C, { root: top, keep: [] }, [], { spawn: f.spawn });
    const copies = f.ofEngine().filter((c) => c.args[0] === 'cp').map((c) => [path.basename(c.args[1]!), c.args[2]]);
    expect(copies).toContainEqual(['npmrc', 'c1:/tmp/oxmutate-npmrc']);
    expect(copies).toContainEqual(['home', 'c1:/tmp/oxmutate-home']);
    expect(f.npmrcs.map((x) => x.text)).toEqual([readFileSync(path.join(dir, '.npmrc'), 'utf8')]);
    expect(f.homes).toEqual(['npmAuthToken: "${YARN_TOKEN}"\n']);
    const auth = ['-e', 'npm_config_userconfig=/tmp/oxmutate-npmrc', '-e', 'HOME=/tmp/oxmutate-home', '-e', 'NODE_AUTH_TOKEN', '-e', 'ACME_REGISTRY', '-e', 'YARN_TOKEN'];
    expect(syncArgs(f).join(' ')).toContain(auth.join(' '));
    for (const secret of auth.filter((a) => a !== '-e')) expect(runArgs(f)).not.toContain(secret);
    expect(runArgs(f).join(' ')).not.toContain('oxmutate-npmrc');
    expect(said).not.toHaveBeenCalled();
  });

  it.skipIf(process.platform === 'win32')('stages the forwarded files readable, whatever the host mode: the container has no capability to read another uid’s 0600 file', async () => {
    const dir = home.dir!;
    // eslint-disable-next-line node-security/require-storage-encryption -- a fixture npmrc that names a variable, no secret in it
    writeFileSync(path.join(dir, '.npmrc'), '//npm.example.com/:_authToken=${NODE_AUTH_TOKEN}\n', { mode: 0o600 });
    // eslint-disable-next-line node-security/require-storage-encryption -- a fixture yarnrc that names a variable, no secret in it
    writeFileSync(path.join(dir, '.yarnrc.yml'), 'npmAuthToken: "${YARN_TOKEN}"\n', { mode: 0o600 });
    const f = fake({});
    await runInContainer(C, { root: repo({ 'package.json': '{}' }), keep: [] }, [], { spawn: f.spawn });
    expect(f.npmrcs.map((x) => x.mode)).toEqual([0o644]);
    expect(f.yarnrcModes).toEqual([0o644]);
    // The host's own files are not touched.
    expect(statSync(path.join(dir, '.npmrc')).mode & MODE_BITS).toBe(0o600);
  });

  it('takes the npm user config npm names, and forwards nothing when there is none or registryAuth is false', async () => {
    const top = repo({ 'package.json': '{}' });
    const other = path.join(scratch('oxmutate-rc-'), 'npmrc');
    writeFileSync(other, 'registry=https://r.example.com/\n');
    writeFileSync(path.join(home.dir!, '.npmrc'), 'x=${NOT_THIS}\n');
    process.env['npm_config_userconfig'] = other;
    const f = fake({});
    await runInContainer(C, { root: top, keep: [] }, [], { spawn: f.spawn });
    expect(f.npmrcs.map((x) => x.text)).toEqual(['registry=https://r.example.com/\n']);
    expect(syncArgs(f)).not.toContain('NOT_THIS');
    const off = fake({});
    await runInContainer({ ...C, registryAuth: false }, { root: top, keep: [] }, [], { spawn: off.spawn });
    expect(syncArgs(off).join(' ')).not.toContain('oxmutate-npmrc');
    expect(off.copied).not.toContain('c1:/tmp/oxmutate-npmrc');
    delete process.env['npm_config_userconfig'];
    rmSync(path.join(home.dir!, '.npmrc'));
    const none = fake({});
    await runInContainer(C, { root: top, keep: [] }, [], { spawn: none.spawn });
    expect(syncArgs(none).join(' ')).not.toContain('/tmp/oxmutate');
    // Nothing forwarded is nothing at all: the cache's last variable is followed by the work directory.
    for (const f of [none, off]) {
      const args = syncArgs(f);
      expect(args[args.indexOf('-w') - 1]).toBe('YARN_CACHE_FOLDER=/cache/yarn');
      expect(f.copied.toSorted()).toEqual(['c1:/w/in.tar', 'c1:/w/listing']);
    }
  });

  it('forwards nothing to a remote engine unless registryAuth says so, and says how once', async () => {
    const said = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    writeFileSync(path.join(home.dir!, '.npmrc'), 'a=b\n');
    const top = repo({ 'package.json': '{}' });
    const remote = fake({});
    await runInContainer({ ...C, host: 'ssh://u@box' }, { root: top, keep: [] }, [], { spawn: remote.spawn });
    expect(remote.copied).not.toContain('c1:/tmp/oxmutate-npmrc');
    expect(said.mock.calls).toEqual([['oxmutate: ~/.npmrc and ~/.yarnrc.yml are not forwarded to a remote engine (container.host). fix: set container.registryAuth: true to forward them to the install\n']]);
    said.mockClear();
    const asked = fake({});
    await runInContainer({ ...C, host: 'ssh://u@box', registryAuth: true }, { root: top, keep: [] }, [], { spawn: asked.spawn });
    expect(asked.copied).toContain('c1:/tmp/oxmutate-npmrc');
    await runInContainer({ ...C, host: 'ssh://u@box', registryAuth: false }, { root: top, keep: [] }, [], { spawn: fake({}).spawn });
    expect(said).not.toHaveBeenCalled();
  });

  it('forwards the auth to a source git sync too', async () => {
    writeFileSync(path.join(home.dir!, '.npmrc'), 'a=b\n');
    const top = repo({ 'package.json': '{}' });
    commit(top);
    spawnSync('git', ['remote', 'add', 'origin', 'https://example.com/o.git'], { cwd: top, env: withoutGit() });
    const f = fake({});
    await runInContainer({ ...C, source: 'git' }, { root: top, keep: [] }, [], { spawn: f.spawn });
    expect(f.copied).toEqual(['c1:/tmp/oxmutate-npmrc']);
  });

  it('sends the ignored files include names, by path or glob, and no other ignored file', async () => {
    const top = repo({ '.gitignore': '.env.test\n*.fixture.json\n*.secret\ndist\n', 'package.json': '{}', '.env.test': 'A=1', 'top.fixture.json': '{}', 'deep/b.fixture.json': '{}', 'x.secret': 's', 'dist/y.js': 'y' });
    const f = fake({});
    await runInContainer({ ...C, include: ['.env.test', '**/*.fixture.json'] }, { root: top, keep: [] }, [], { spawn: f.spawn });
    expect(f.sent).toEqual([['.env.test', '.gitignore', 'deep/b.fixture.json', 'package.json', 'top.fixture.json']]);
    const one = fake({});
    await runInContainer({ ...C, include: ['.env.test'] }, { root: top, keep: [] }, [], { spawn: one.spawn });
    expect(one.sent).toEqual([['.env.test', '.gitignore', 'package.json']]);
    // A file git does not track yet, and does not ignore, is sent without include.
    writeFileSync(path.join(top, 'new.ts'), 'n');
    const plain = fake({});
    await runInContainer(C, { root: top, keep: [] }, [], { spawn: plain.spawn });
    expect(plain.sent).toEqual([['.gitignore', 'new.ts', 'package.json']]);
  });

  it('installs Yarn 2 and later with --immutable, by .yarnrc.yml or packageManager', async () => {
    const installOf = async (files: Record<string, string>): Promise<string> => {
      const f = fake({});
      await runInContainer({ ...C, ephemeral: true }, { root: repo(files), keep: [] }, [], { spawn: f.spawn });
      const lines = script(['', f.scripts.get('c1')!]);
      return lines[lines.findIndex((l) => l.endsWith('; then')) + 2]!;
    };
    const berry = 'corepack enable && yarn install --immutable';
    expect(await installOf({ 'yarn.lock': '', '.yarnrc.yml': 'nodeLinker: node-modules\n' })).toBe(berry);
    expect(await installOf({ 'yarn.lock': '', 'package.json': '{ "packageManager": "yarn@4.5.0" }' })).toBe(berry);
    expect(await installOf({ 'yarn.lock': '', 'package.json': '{"packageManager":"yarn@10.0.0"}' })).toBe(berry);
    expect(await installOf({ 'yarn.lock': '', 'package.json': '{ "packageManager" : "yarn@3.8.0" }' })).toBe(berry);
    expect(await installOf({ 'yarn.lock': '', 'package.json': '{"packageManager":"yarn@1.22.22"}' })).toBe('corepack enable && yarn install --frozen-lockfile');
    expect(await installOf({ 'package-lock.json': '{}', 'package.json': '{"packageManager":"npm@10.0.0"}' })).toBe('npm ci');
  });

  it('refuses a bun project before syncing, unless the install is given', async () => {
    for (const lock of ['bun.lock', 'bun.lockb']) {
      const f = fake({});
      // eslint-disable-next-line reliability/no-await-in-loop -- two lockfiles, each its own run
      await expect(runInContainer(C, { root: repo({ 'package.json': '{}', [lock]: '' }), keep: [] }, [], { spawn: f.spawn })).rejects.toThrow(`${lock} is bun's, and the container installs with npm, pnpm or yarn. fix: set container.image to one with bun (such as oven/bun) and container.install (such as bun install --frozen-lockfile)`);
      expect(f.verbs()).toEqual([]);
    }
    const given = fake({});
    expect(await runInContainer({ ...C, install: 'bun install' }, { root: repo({ 'package.json': '{}', 'bun.lockb': '' }), keep: [] }, [], { spawn: given.spawn })).toBe(0);
    expect(given.scripts.get('c1')).toContain('\nbun install\n');
  });
});

describe('when the engine cannot run', () => {
  const C = { ...NPX, engine: 'engine' };

  it('says the daemon is not running at the first engine call that finds it so, Docker’s and Podman’s', async () => {
    const top = repo({ 'package.json': '{}' });
    const down = 'engine is installed but its daemon is not running. fix: start Docker Desktop (or `podman machine start`), or set container.engine';
    const says = ['Error: unable to connect to Podman socket: failed to connect: dial unix /run/user/501/podman/podman.sock: connect: no such file or directory', 'Cannot connect to Podman. Please verify your connection to the Linux system using `podman system connection list`, or try `podman machine init` and `podman machine start` to manage a new Linux VM', 'Cannot connect to the Docker daemon at unix:///var/run/docker.sock.', 'error during connect: Is the docker daemon running?', 'dial tcp 10.0.0.2:2376: connect: connection refused', 'Error: Cannot connect to Podman. Please verify your connection'];
    await Promise.all(
      says.map(async (said) => {
        const f = fake({ daemonSays: said });
        await expect(runInContainer(C, { root: top, keep: [] }, [], { spawn: f.spawn })).rejects.toThrow(down);
        expect(f.verbs()).toEqual(['volume create']);
      }),
    );
    await expect(pruneContainers(C, fake({ daemonSays: 'Cannot connect to Podman' }).spawn)).rejects.toThrow(down);
  });

  it('names the remote daemon it could not reach, the host or the context, instead of Docker Desktop', async () => {
    const top = repo({ 'package.json': '{}' });
    const refused = { daemonSays: 'dial tcp 127.0.0.1:1: connect: connection refused' };
    await expect(runInContainer({ ...C, host: 'tcp://10.0.0.2:2376' }, { root: top, keep: [] }, [], { spawn: fake(refused).spawn })).rejects.toThrow('engine could not reach the daemon at tcp://10.0.0.2:2376 (container.host). fix: check that it is running and reachable from here (its address, ssh or tls), or remove it to use the local daemon');
    await expect(runInContainer({ ...C, context: 'build-box' }, { root: top, keep: [] }, [], { spawn: fake(refused).spawn })).rejects.toThrow('engine could not reach the daemon at build-box (container.context). fix:');
  });

  it('stops when the volume cannot be created, and goes on when Podman says it exists', async () => {
    const top = repo({ 'package.json': '{}' });
    const f = fake({ volumeSays: ' no space left on device \n' });
    await expect(runInContainer(C, { root: top, keep: [] }, [], { spawn: f.spawn })).rejects.toThrow(/^the volume oxmutate-[0-9a-f]{12} could not be created: the engine's disk is full\. fix: run `oxmutate prune` to remove oxmutate's volumes and `docker system prune` for the rest, or give Docker Desktop or the Podman machine a bigger disk \(`podman machine set --disk-size`\)$/u);
    expect(f.verbs()).toEqual(['volume create']);
    const podman = fake({ volumeSays: 'Error: volume with name v already exists: volume already exists' });
    expect(await runInContainer({ ...C, volume: 'v' }, { root: top, keep: [] }, [], { spawn: podman.spawn })).toBe(0);
    expect(podman.verbs()).toContain('run');
  });
});

/** The message of a rejected run: its start and a literal ending, so a path spelled two ways on Windows (`RUNNER~1`) compares. */
const hostLine = async (run: Promise<unknown>, start: string): Promise<void> => {
  const message = await run.then(() => '', (e: Error) => e.message);
  const ending = `: the host's disk is full (${tmpdir()} holds the run's staging). fix: free space there, or set TMPDIR to a disk with room`;
  expect(message.startsWith(start)).toBe(true);
  expect(message.endsWith(ending)).toBe(true);
  expect(message.length).toBeGreaterThan(start.length + ending.length);
};

/** A repository with one file. */
const top = (): string => repo({ 'package.json': '{}' });

/** The line a full engine disk gives, for the step it names. */
const LINE = (what: string): string => fullDisk(what, 'engine');

describe('a full disk says what to free', () => {

  const C = { ...NPX, engine: 'engine' };

  it('names the fix on one line for every engine step, in the engine’s own words', async () => {
    const full = 'write /w/in.tar: no space left on device';
    const sync = (f: ReturnType<typeof fake>): Promise<number> => runInContainer({ ...C, volume: 'v' }, { root: top(), keep: [] }, [], { spawn: f.spawn });
    await expect(sync(fake({ volumeSays: 'Error: ENOSPC' }))).rejects.toThrow(LINE('the volume v could not be created'));
    await expect(sync(fake({ createSays: full }))).rejects.toThrow(LINE('the container could not be created'));
    await expect(sync(fake({ cpSays: full }))).rejects.toThrow(LINE('the copy into the container failed'));
    const message = await sync(fake({ cpSays: full })).catch((e: Error) => e.message);
    expect(message).not.toContain('\n');
  });

  it('says so for the copy back, which creates a container on the volume', async () => {
    const f = fake({ backSays: 'Disk quota exceeded' });
    const copyRoot = top();
    await expect(runInContainer({ ...C, volume: 'v' }, { root: copyRoot, keep: [path.join(copyRoot, 'reports/m.json')] }, [], { spawn: f.spawn })).rejects.toThrow(LINE('the container could not be created'));
    expect(f.verbs().at(-1)).toBe('create');
  });

  it('keeps the engine’s own words, with its fix, for a volume that could not be created for another reason', async () => {
    await expect(runInContainer({ ...C, volume: 'v' }, { root: top(), keep: [] }, [], { spawn: fake({ volumeSays: ' permission denied \n' }).spawn })).rejects.toThrow("the volume v could not be created: permission denied. fix: check the engine's own error, or set container.volume");
  });

  it('says it for the host’s disk when a kept file cannot be written back', async () => {
    const f = fake({ out: fileURLToPath(import.meta.url) });
    const root = top();
    hostDisk.full = 'm.json';
    try {
      await hostLine(runInContainer(C, { root, keep: [path.join(root, 'reports/m.json')] }, [], { spawn: f.spawn }), 'reports/m.json could not be written to ');
      // Any other error on that copy is the host's own, said as it is.
      hostDisk.code = 'EACCES';
      await expect(runInContainer(C, { root, keep: [path.join(root, 'reports/m.json')] }, [], { spawn: f.spawn })).rejects.toThrow('EACCES: copyfile failed');
    } finally {
      hostDisk.full = undefined;
      hostDisk.code = 'ENOSPC';
    }
  });

  it('says it for the host’s disk when tar cannot pack', async () => {
    await hostLine(runInContainer(C, { root: top(), keep: [] }, [], { spawn: fake({ tarSays: 'tar: in.tar: Cannot write: No space left on device' }).spawn }), 'tar could not pack ');
  });

  it('tells a Podman short-name refusal to use a full image name, and keeps the engine’s own words', async () => {
    const said = 'Error: short-name resolution enforced but cannot prompt without a TTY';
    await expect(runInContainer(C, { root: top(), keep: [] }, [], { spawn: fake({ createSays: ` ${said}\n` }).spawn })).rejects.toThrow(`the container could not be created: ${said}. fix: set container.image to a full name, such as docker.io/library/node:${String(nodeMajor)}-bookworm-slim`);
  });

  it('keeps the old line, now with a fix, for a copy that failed for another reason', async () => {
    await expect(runInContainer(C, { root: top(), keep: [] }, [], { spawn: fake({ cpSays: 'no such container' }).spawn })).rejects.toThrow('the copy into the container failed: no such container. fix: run `oxmutate prune` and try again');
  });

  it('turns a sync that failed with the volume nearly empty of room into exit FULL, and nothing else', () => {
    if (spawnSync('sh', ['-c', 'true']).status !== 0) return;
    const dir = scratch('oxmutate-df-');
    const bin = path.join(dir, 'bin');
    mkdirSync(bin);
    const df = (availableKiB: number): void => {
      writeFileSync(path.join(bin, 'df'), `#!/bin/sh\necho 'Filesystem 1024-blocks Used Available Capacity Mounted on'\necho 'overlay 100 100 ${String(availableKiB)} 100% /w'\n`, { mode: 0o755 });
    };
    const ran = (body: string): number | null => {
      const file = path.join(dir, 'sync.sh');
      writeFileSync(file, ['set -e', FULL_TRAP, body].join('\n'));
      // The stub first, joined by the platform's delimiter, and one PATH key: Windows names it `Path`,
      // and a second, differently cased key leaves which one the child reads to chance.
      const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toUpperCase() !== 'PATH'));
      return spawnSync('sh', [file], { encoding: 'utf8', env: { ...env, PATH: `${bin}${path.delimiter}${process.env['PATH'] ?? ''}` } }).status;
    };
    expect(MIN_FREE_KIB).toBe(65536);
    df(65535);
    expect(ran('exit 1')).toBe(FULL);
    expect(ran('true')).toBe(0);
    expect(ran(`exit ${String(RESYNC)}`)).toBe(RESYNC);
    df(65536);
    expect(ran('exit 1')).toBe(1);
    expect(ran('exit 3')).toBe(3);
  });

  it('words the host’s line and attaches the sync container, as literals', async () => {
    expect(fullHostDisk('x')).toBe(`x: the host's disk is full (${tmpdir()} holds the run's staging). fix: free space there, or set TMPDIR to a disk with room`);
    const f = fake({});
    await runInContainer(C, { root: top(), keep: [] }, [], { spawn: f.spawn });
    expect(f.ofEngine().find((c) => c.args[0] === 'start')!.args).toEqual(['start', '-a', 'c1']);
  });

  it('has a line of its own for FULL, and Podman’s own prune in it', () => {
    expect(installFailed(FULL, 'engine')).toBe(fullDisk('the sync into the container or its install failed (exit 6)', 'engine'));
    expect(installFailed(FULL, 'docker')).toContain('`docker system prune`');
    expect(installFailed(FULL, '/usr/local/bin/podman')).toContain('`podman system prune`');
    expect(fullDisk('x', 'podman-remote')).toContain('`podman system prune`');
    expect(fullDisk('x', '/opt/docker-podman')).toContain('`docker system prune`');
    expect(installFailed(1, 'engine')).toContain('its output is above');
  });

  it('turns the exit code of a sync that ran out of room into that line', async () => {
    await expect(runInContainer(C, { root: top(), keep: [] }, [], { spawn: fake({ syncCodes: [FULL] }).spawn })).rejects.toThrow(LINE('the sync into the container or its install failed (exit 6)'));
  });
});

describe('two runs on one volume', () => {
  const C = { ...NPX, engine: 'engine', volume: 'v' };
  afterEach(() => void vi.restoreAllMocks());

  it('waits while another run’s container is on the volume, says so once, then syncs', async () => {
    const said = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const top = repo({ 'package.json': '{}' });
    const f = fake({ busy: 2 });
    const waits: number[] = [];
    expect(await runInContainer(C, { root: top, keep: [] }, [], { spawn: f.spawn, wait: async (ms) => void waits.push(ms) })).toBe(0);
    expect(waits).toEqual([2000, 2000]);
    expect(said.mock.calls).toEqual([['oxmutate: another run is using v; waiting\n']]);
    expect(f.verbs().slice(0, 6)).toEqual(['volume create', 'volume create', 'ps', 'ps', 'ps', 'volume inspect']);
    expect(f.ofEngine().find((c) => c.args.includes('ps'))!.args).toEqual(['ps', '-q', '--filter', 'label=dev.oxmutate.volume=v']);
  });

  it('says it waits before the first wait, and only then', async () => {
    const events: string[] = [];
    vi.spyOn(process.stderr, 'write').mockImplementation(() => {
      events.push('said');
      return true;
    });
    const top = repo({ 'package.json': '{}' });
    await runInContainer(C, { root: top, keep: [] }, [], { spawn: fake({ busy: 3 }).spawn, wait: async () => void events.push('wait') });
    expect(events).toEqual(['said', 'wait', 'wait', 'wait']);
  });

  it('gives up after ten minutes of waiting, before syncing', async () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const top = repo({ 'package.json': '{}' });
    const f = fake({ busy: 1000 });
    let waited = 0;
    await expect(runInContainer(C, { root: top, keep: [] }, [], { spawn: f.spawn, wait: async (ms) => void (waited += ms) })).rejects.toThrow('another run has used v for 10 minutes. fix: wait for it to end, stop it (oxmutate prune removes its containers), or set container.volume to another');
    expect(waited).toBe(10 * 60 * 1000);
    expect(f.verbs()).not.toContain('volume inspect');
  });
});

describe('prune', () => {
  it('removes every container and volume oxmutate labelled, and the host’s sync records', async () => {
    mkdirSync(syncDir(), { recursive: true });
    writeFileSync(path.join(syncDir(), 'v.json'), '{}');
    const f = fake({});
    expect(await pruneContainers({ ...DEFAULTS, engine: 'engine', context: 'box' }, f.spawn)).toEqual({ containers: ['c7', 'c8'], volumes: ['oxmutate-a', 'oxmutate-cache'] });
    expect(f.ofEngine().map((c) => c.args)).toEqual([
      ['--context', 'box', 'ps', '-aq', '--filter', 'label=dev.oxmutate=1'],
      ['--context', 'box', 'rm', '-f', 'c7', 'c8'],
      ['--context', 'box', 'volume', 'ls', '-q', '--filter', 'label=dev.oxmutate=1'],
      ['--context', 'box', 'volume', 'rm', '-f', 'oxmutate-a', 'oxmutate-cache'],
    ]);
    expect(existsSync(syncDir())).toBe(false);
    await expect(pruneContainers({ ...DEFAULTS, engine: 'engine' }, fake({ listFails: true }).spawn)).rejects.toThrow('engine could not list what oxmutate made: engine said no. fix: start the engine, or set container.engine');
  });

  it('removes nothing when there is nothing, and one of each when there is one, CRLF output included', async () => {
    const none = fake({ listed: { containers: '', volumes: '\n' } });
    expect(await pruneContainers({ ...DEFAULTS, engine: 'engine' }, none.spawn)).toEqual({ containers: [], volumes: [] });
    expect(none.verbs()).toEqual(['ps', 'volume ls']);
    const one = fake({ listed: { containers: 'c7\r\n', volumes: 'oxmutate-a\r\n' } });
    expect(await pruneContainers({ ...DEFAULTS, engine: 'engine' }, one.spawn)).toEqual({ containers: ['c7'], volumes: ['oxmutate-a'] });
    expect(one.ofEngine().map((c) => c.args)).toEqual([['ps', '-aq', '--filter', 'label=dev.oxmutate=1'], ['rm', '-f', 'c7'], ['volume', 'ls', '-q', '--filter', 'label=dev.oxmutate=1'], ['volume', 'rm', '-f', 'oxmutate-a']]);
  });
});
