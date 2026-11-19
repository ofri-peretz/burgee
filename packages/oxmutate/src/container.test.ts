import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';

import { run, type RunOptions } from 'bellpull';
import { afterAll, describe, expect, it } from 'vitest';

import { discard } from './__fixtures__/scratch-dir.js';
import { type Container, containerOf, containerPlan, defaultInstall, runInContainer, tarFlags, withFlags } from './container.js';
import { nodeMajor } from './runtime.js';

/** The environment without git's own variables: lefthook's pre-push exports `GIT_DIR`, and a scratch `git init` must not inherit it (scripts/git-env-lock.test.ts). */
const withoutGit = (): NodeJS.ProcessEnv => Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));

const made: string[] = [];
afterAll(() => discard(...made));

const DEFAULTS: Container = { engine: 'docker', image: `node:${nodeMajor}-bookworm-slim`, network: 'none', env: [], args: [], command: 'npx --no oxmutate' };

describe('the container setting', () => {
  it('is off when unset or false, and every default with true', () => {
    expect(containerOf(undefined)).toBeUndefined();
    expect(containerOf(null)).toBeUndefined();
    expect(containerOf(false)).toBeUndefined();
    expect(containerOf(true)).toEqual(DEFAULTS);
  });

  it('takes an image as a string, and every key in the object form', () => {
    expect(containerOf('node:24-alpine')).toEqual({ ...DEFAULTS, image: 'node:24-alpine' });
    const full = { engine: 'podman', image: 'i', network: 'bridge', install: 'pnpm i', setup: 'npm run build', volume: 'v', cpus: 4, memory: '6g', env: ['CI', 'A=1'], args: ['--network=none'], command: 'node dist/bin.js' };
    expect(containerOf(full)).toEqual(full);
    expect(containerOf({ install: false })).toEqual({ ...DEFAULTS, install: '' });
    expect(containerOf({})).toEqual(DEFAULTS);
    expect(containerOf({ cpus: '4', env: 'CI', engine: 5, image: false })).toEqual(DEFAULTS);
  });

  it('refuses a key it does not know, and a value of the wrong kind, with the fix', () => {
    expect(() => containerOf({ imgae: 'x', cpu: 1 })).toThrow('container has no key imgae, cpu. fix: use engine, image, network, install, setup, volume, cpus, memory, env, args, command; anything else goes in container.args');
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

  it('installs as the lockfile asks', () => {
    expect(defaultInstall('package-lock.json')).toBe('npm ci');
    expect(defaultInstall('npm-shrinkwrap.json')).toBe('npm ci');
    expect(defaultInstall('pnpm-lock.yaml')).toBe('corepack enable && pnpm install --frozen-lockfile');
    expect(defaultInstall('yarn.lock')).toBe('corepack enable && yarn install --frozen-lockfile');
    expect(defaultInstall(undefined)).toBe('npm install');
  });
});

const HARDENED = ['--rm', '--cap-drop=ALL', '--security-opt=no-new-privileges', '--label', 'dev.oxmutate=1'];

/** A container's script, line by line. */
const script = (args: readonly string[]): string[] => args.at(-1)!.split('\n');

describe('the container plan', () => {
  const input = { rel: 'packages/a', argv: ['run', "it's"], key: 'k1', install: 'npm ci', volume: 'vol', io: '/c/io', keep: ['packages/a/reports/m.json'] };

  it('labels the volume, and hardens every container: no capability, no privilege gained, removed after', () => {
    const plan = containerPlan(DEFAULTS, input);
    expect(plan.volume).toEqual(['volume', 'create', '--label', 'dev.oxmutate=1', 'vol']);
    expect(plan.sync.slice(0, -1)).toEqual(['run', ...HARDENED, '-v', 'vol:/w', '-v', '/c/io:/io', '-w', '/w', DEFAULTS.image, 'sh', '-c']);
    expect(plan.run.slice(0, -1)).toEqual(['run', ...HARDENED, '--init', '--network=none', '-v', 'vol:/w', '-w', '/w', '-e', 'OXMUTATE_CONTAINER=inside', DEFAULTS.image, 'sh', '-c']);
    expect(plan.back.slice(0, 13)).toEqual(['run', ...HARDENED, '--network=none', '-v', 'vol:/w', '-v', '/c/io:/io', '-w', '/w/src']);
  });

  it('gives the sync and the run the limits, the environment and the extra arguments; the run its network', () => {
    const plan = containerPlan({ ...DEFAULTS, network: 'bridge', cpus: 3, memory: '4g', env: ['CI'], args: ['--pids-limit=512'] }, input);
    const limits = ['--cpus', '3', '--memory', '4g', '-e', 'CI', '--pids-limit=512', DEFAULTS.image];
    expect(plan.sync.slice(-limits.length - 3, -3)).toEqual(limits);
    expect(plan.run.slice(-limits.length - 3, -3)).toEqual(limits);
    expect(plan.run).toContain('--network=bridge');
    expect(plan.back).not.toContain('--cpus');
  });

  it('syncs and installs when the key changed; the run sets up and runs oxmutate in the project', () => {
    const plan = containerPlan({ ...DEFAULTS, setup: 'npm run build' }, input);
    expect(script(plan.sync)).toEqual([
      'set -e',
      'mkdir -p /w/src && cd /w/src',
      'tar -xovf /io/in.tar > /w/manifest.new',
      expect.stringMatching(/^node -e '.*' \/w\/manifest \/w\/manifest\.new$/u),
      'mv /w/manifest.new /w/manifest',
      `if [ "$(cat /w/installed 2>/dev/null)" != 'k1' ]; then npm ci; echo 'k1' > /w/installed; fi`,
    ]);
    expect(script(plan.run)).toEqual(['set -e', 'npm run build', "cd '/w/src/packages/a'", `exec npx --no oxmutate 'run' 'it'\\''s'`]);
    const bare = containerPlan(DEFAULTS, { ...input, install: '', rel: '' });
    expect(script(bare.sync)).toHaveLength(5);
    expect(script(bare.run)).toEqual(['set -e', "cd '/w/src'", `exec npx --no oxmutate 'run' 'it'\\''s'`]);
  });

  it('copies back only the kept files that exist', () => {
    expect(containerPlan(DEFAULTS, input).back.slice(13)).toEqual([DEFAULTS.image, 'sh', '-c', 'for f; do [ -e "$f" ] && printf "%s\\n" "$f"; done > /io/keep.list; if [ -s /io/keep.list ]; then tar -cf /io/out.tar -T /io/keep.list; fi', 'sh', 'packages/a/reports/m.json']);
  });

  it('prunes what the host deleted since the last sync, and nothing else', () => {
    const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'oxmutate-prune-')));
    made.push(dir);
    for (const f of ['kept', 'gone', 'untracked']) writeFileSync(path.join(dir, f), f);
    writeFileSync(path.join(dir, 'old'), 'kept\ngone\n');
    writeFileSync(path.join(dir, 'new'), 'kept\n');
    const prune = /^node -e '(.*)' /mu.exec(containerPlan(DEFAULTS, input).sync.at(-1)!)![1]!.replaceAll(String.raw`'\''`, "'");
    expect(spawnSync(process.execPath, ['-e', prune, 'old', 'new'], { cwd: dir }).status).toBe(0);
    expect(['kept', 'gone', 'untracked'].map((f) => existsSync(path.join(dir, f)))).toEqual([true, false, true]);
    // No previous sync: nothing is pruned.
    expect(spawnSync(process.execPath, ['-e', prune, 'missing', 'new'], { cwd: dir }).status).toBe(0);
    expect(readFileSync(path.join(dir, 'kept'), 'utf8')).toBe('kept');
  });

  it('packs without macOS metadata on macOS, and with only what GNU tar knows elsewhere', () => {
    expect(tarFlags('darwin')).toEqual(['--no-mac-metadata', '--no-xattrs']);
    expect(tarFlags('linux')).toEqual(['--no-xattrs']);
  });
});

function repo(files: Record<string, string>): string {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'oxmutate-container-')));
  made.push(dir);
  for (const [f, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    writeFileSync(path.join(dir, f), text);
  }
  spawnSync('git', ['init', '-q'], { cwd: dir, env: withoutGit() });
  spawnSync('git', ['add', '-A'], { cwd: dir, env: withoutGit() });
  return dir;
}

interface Call { cmd: string; args: readonly string[]; o: RunOptions; phase: string }
const phaseOf = (args: readonly string[]): string => {
  if (args[0] === 'volume') return 'volume';
  if (args.includes('--init')) return 'run';
  return args.at(-1)?.includes('manifest') ? 'sync' : 'back';
};
/**
 * The real git and tar (bellpull's run, GIT_* left out) unless `tarFails`; the engine is recorded
 * by phase. The sync lists what it was sent; the copy back answers with `out`, a tar file, if any.
 */
function fake(result: { code?: number | null; syncCode?: number; out?: string; fail?: Error; tarFails?: boolean }) {
  const calls: Call[] = [];
  let io = '';
  let sent: string[] = [];
  let packed = '';
  let ioMode = 0;
  const spawn = async (cmd: string, args: readonly string[], o: RunOptions) => {
    const phase = cmd === 'engine' ? phaseOf(args) : cmd;
    calls.push({ cmd, args, o, phase });
    if (cmd === 'tar' && result.tarFails) return { code: 2, stdout: '', stderr: ' tar: cannot open \n' };
    if (cmd !== 'engine') return run(cmd, args, { ...o, env: { ...withoutGit(), ...o.env } });
    if (result.fail) throw result.fail;
    const mount = args.find((a) => a.endsWith(':/io'));
    if (mount) io = mount.slice(0, -':/io'.length);
    if (phase === 'sync') {
      sent = spawnSync('tar', ['-tf', 'in.tar'], { cwd: io, encoding: 'utf8' }).stdout.split('\n').filter(Boolean).toSorted();
      packed = readFileSync(path.join(io, 'in.tar'), 'latin1');
      ioMode = statSync(io).mode & 0o777;
      return { code: result.syncCode ?? 0, stdout: '', stderr: '' };
    }
    if (phase === 'back' && result.out) copyFileSync(result.out, path.join(io, 'out.tar'));
    return { code: phase === 'run' && 'code' in result ? (result.code ?? null) : 0, stdout: '', stderr: '' };
  };
  const of = (phase: string): Call[] => calls.filter((c) => c.phase === phase);
  return { calls, spawn, of, io: () => io, sent: () => sent, packed: () => packed, ioMode: () => ioMode };
}

/** The install key in a sync's script. */
const keyOf = (args: readonly string[]): string => /!= '([0-9a-f]+)'/u.exec(args.at(-1)!)![1]!;

describe('running in the container', () => {
  const C = { ...DEFAULTS, engine: 'engine' };

  it('creates the volume, syncs the git files, runs in the project, and returns the run’s exit code', async () => {
    const top = repo({ 'package-lock.json': '{}', 'packages/a/src/x.ts': 'x', '.gitignore': 'dist\n', 'packages/a/dist/y.js': 'y' });
    const f = fake({ code: 3 });
    expect(await runInContainer(C, { root: path.join(top, 'packages/a'), keep: [] }, ['run'], { spawn: f.spawn })).toBe(3);
    expect(f.calls.filter((c) => c.cmd === 'engine').map((c) => c.phase)).toEqual(['volume', 'sync', 'run']);
    expect(f.sent()).toEqual(['.gitignore', 'package-lock.json', 'packages/a/src/x.ts']);
    const volume = `oxmutate-${createHash('sha256').update(top).digest('hex').slice(0, 12)}`;
    expect(f.of('volume')[0]!.args.at(-1)).toBe(volume);
    expect(f.of('sync')[0]!.args).toContain(`${volume}:/w`);
    expect(f.of('sync')[0]!.args.at(-1)).toContain('then npm ci;');
    expect(f.of('run')[0]!.args.at(-1)).toContain("cd '/w/src/packages/a'");
    for (const phase of ['sync', 'run']) expect(f.of(phase)[0]!.o).toMatchObject({ stdio: 'inherit', timeout: 0 });
    expect(f.of('volume')[0]!.o).toMatchObject({ timeout: 0 });
    // The archives go through a private directory under the user's cache, removed after the run.
    expect(path.dirname(f.io())).toBe(path.join(process.env['XDG_CACHE_HOME'] || path.join(homedir(), '.cache'), 'oxmutate'));
    expect(path.basename(f.io())).toMatch(/^io-/u);
    expect(existsSync(f.io())).toBe(false);
    expect(f.calls.find((c) => c.cmd === 'tar')!.args).toEqual(['-cf', 'in.tar', ...tarFlags(process.platform), '-C', top, '--null', '-T', path.join(f.io(), 'files')]);
    expect(f.calls.find((c) => c.cmd === 'tar')!.o.cwd).toBe(f.io());
  });

  it('puts the archives in a private cache directory, in a run directory the container may write', async () => {
    const cache = realpathSync(mkdtempSync(path.join(tmpdir(), 'oxmutate-xdg-')));
    made.push(cache);
    const was = process.env['XDG_CACHE_HOME'];
    process.env['XDG_CACHE_HOME'] = cache;
    try {
      const f = fake({});
      await runInContainer(C, { root: repo({ 'package.json': '{}' }), keep: [] }, [], { spawn: f.spawn });
      expect(path.dirname(f.io())).toBe(path.join(cache, 'oxmutate'));
      expect(path.basename(f.io())).toMatch(/^io-\w{6}$/u);
      // Windows has no POSIX mode bits to check.
      if (process.platform !== 'win32') {
        expect(statSync(path.join(cache, 'oxmutate')).mode & 0o777).toBe(0o700);
        expect(f.ioMode()).toBe(0o777);
      }
    } finally {
      if (was === undefined) delete process.env['XDG_CACHE_HOME'];
      else process.env['XDG_CACHE_HOME'] = was;
    }
  });

  it('packs the flags of the host it runs on', async () => {
    const top = repo({ 'package.json': '{}' });
    const f = fake({});
    await runInContainer(C, { root: top, keep: [] }, [], { spawn: async (cmd, args, o) => f.spawn(cmd, cmd === 'tar' ? args.filter((a) => a !== '--no-mac-metadata') : args, o), host: 'linux' });
    expect(f.calls.find((c) => c.cmd === 'tar')!.args).not.toContain('--no-mac-metadata');
  });

  it.runIf(spawnSync('xattr', ['-h']).status === 0)('packs no extended attribute and no ._ file on macOS', async () => {
    const top = repo({ 'package.json': '{}', 'a.ts': 'a' });
    spawnSync('xattr', ['-w', 'com.example.tag', 'marked', path.join(top, 'a.ts')]);
    const f = fake({});
    await runInContainer(C, { root: top, keep: [] }, [], { spawn: f.spawn });
    expect(f.sent()).toEqual(['a.ts', 'package.json']);
    expect(f.packed()).not.toContain('com.example.tag');
  });

  it('installs again only when the lockfile, the image or the install command changes', async () => {
    const top = repo({ 'yarn.lock': 'a' });
    const key = async (c: Container = C): Promise<string> => {
      const f = fake({});
      await runInContainer({ ...c, volume: 'v' }, { root: top, keep: [] }, [], { spawn: f.spawn });
      expect(f.of('sync')[0]!.args).toContain('v:/w');
      return keyOf(f.of('sync')[0]!.args);
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
      await runInContainer(C, { root: top, keep: [] }, [], { spawn: f.spawn });
      return keyOf(f.of('sync')[0]!.args);
    };
    const first = await key();
    writeFileSync(path.join(top, 'package.json'), '{"a":2}');
    expect(await key()).not.toBe(first);
    const f = fake({});
    await runInContainer(C, { root: repo({ 'x.ts': '' }), keep: [] }, [], { spawn: f.spawn });
    expect(f.of('sync')[0]!.args.at(-1)).toContain('then npm install;');
  });

  it('copies the kept files back, and sends the host’s copy of them in', async () => {
    const top = repo({ 'package.json': '{}', '.gitignore': 'reports\n', 'reports/inc.json': 'host' });
    const from = repo({ 'reports/inc.json': 'from the container' });
    spawnSync('tar', ['-cf', 'out.tar', 'reports/inc.json'], { cwd: from });
    const f = fake({ out: path.join(from, 'out.tar') });
    expect(await runInContainer({ ...C, install: '' }, { root: top, keep: [path.join(top, 'reports/inc.json'), '/elsewhere/x'] }, [], { spawn: f.spawn })).toBe(0);
    expect(f.sent()).toContain('reports/inc.json');
    expect(f.of('sync')[0]!.args.at(-1)).not.toContain('installed');
    expect(f.of('back')[0]!.args.slice(-2)).toEqual(['sh', 'reports/inc.json']);
    expect(f.of('back')[0]!.o).toMatchObject({ timeout: 0 });
    expect(readFileSync(path.join(top, 'reports/inc.json'), 'utf8')).toBe('from the container');
  });

  it('extracts nothing when the copy back found no file, and copies back nothing when nothing is kept', async () => {
    const top = repo({ 'package.json': '{}' });
    const f = fake({});
    expect(await runInContainer(C, { root: top, keep: [path.join(top, 'reports/none.json')] }, [], { spawn: f.spawn })).toBe(0);
    expect(f.of('back')).toHaveLength(1);
    expect(f.calls.filter((c) => c.cmd === 'tar').map((c) => c.args[0])).toEqual(['-cf']);
    const none = fake({});
    await runInContainer(C, { root: top, keep: [] }, [], { spawn: none.spawn });
    expect(none.of('back')).toHaveLength(0);
  });

  it('stops before the run when the sync or its install fails', async () => {
    const top = repo({ 'package.json': '{}' });
    const f = fake({ syncCode: 1 });
    await expect(runInContainer(C, { root: top, keep: [] }, [], { spawn: f.spawn })).rejects.toThrow('the copy into the container or its install failed (exit 1); its output is above. fix: set container.install');
    expect(f.of('run')).toHaveLength(0);
    expect(existsSync(f.io())).toBe(false);
  });

  it('says what to do when it cannot run', async () => {
    const top = repo({});
    await expect(runInContainer(C, { root: top, keep: [], since: 'main' }, [], { spawn: fake({}).spawn })).rejects.toThrow('fix: run them with --no-container');
    await expect(runInContainer(C, { root: top, keep: [], frozenOracle: 'main' }, [], { spawn: fake({}).spawn })).rejects.toThrow('--since and --frozen-oracle');
    await expect(runInContainer(C, { root: tmpdir(), keep: [] }, [], { spawn: fake({}).spawn })).rejects.toThrow('is in none. fix: git init');
    await expect(runInContainer(C, { root: top, keep: [] }, [], { spawn: fake({ tarFails: true }).spawn })).rejects.toThrow(`tar could not pack ${top}: tar: cannot open`);
    await expect(runInContainer(C, { root: top, keep: [] }, [], { spawn: fake({ fail: new Error('engine: not found') }).spawn })).rejects.toThrow('engine did not start (engine: not found). fix: install and start Docker or Podman');
    expect(await runInContainer(C, { root: top, keep: [] }, [], { spawn: fake({ code: null }).spawn })).toBe(1);
  });
});
