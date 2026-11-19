import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { run, type RunOptions } from 'bellpull';
import { afterAll, describe, expect, it } from 'vitest';

import { discard } from './__fixtures__/scratch-dir.js';
import { type Container, containerDefaults, containerOf, containerPlan, defaultInstall, engineOf, runInContainer, tarFlags, withFlags, withoutContainerFlags } from './container.js';
import { nodeMajor } from './runtime.js';

/** The environment without git's own variables: lefthook's pre-push exports `GIT_DIR`, and a scratch `git init` must not inherit it (scripts/git-env-lock.test.ts). */
const withoutGit = (): NodeJS.ProcessEnv => Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));

const made: string[] = [];
afterAll(() => discard(...made));

const DEFAULTS: Container = { engine: 'docker', image: `node:${nodeMajor}-bookworm-slim`, network: 'none', source: 'copy', ephemeral: false, readOnly: false, env: [], args: [], runArgs: [], command: 'npx --no oxmutate' };

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
      engine: 'podman', image: 'i', network: 'bridge', source: 'git', remote: 'https://example.com/r.git', install: 'pnpm i', setup: 'npm run build', volume: 'v', ephemeral: true,
      context: 'box', host: 'ssh://u@box', platform: 'linux/amd64', user: '1000:1000', runtime: 'runsc', readOnly: true, pull: 'always', pidsLimit: 512, cpus: 4, memory: '6g',
      env: ['CI', 'A=1'], args: ['--ulimit=nofile=1024'], runArgs: ['--shm-size=1g'], command: 'node dist/bin.js',
    };
    expect(containerOf(full)).toEqual(full);
    expect(containerOf({ install: false })).toEqual({ ...DEFAULTS, install: '' });
    expect(containerOf({})).toEqual(DEFAULTS);
    expect(containerOf({ cpus: '4', pidsLimit: '9', env: 'CI', engine: 5, image: false, readOnly: 'yes', ephemeral: 1 })).toEqual(DEFAULTS);
    expect(containerOf({ source: 'copy' })).toEqual(DEFAULTS);
  });

  it('refuses a key it does not know, a source it does not know, and a value of the wrong kind, with the fix', () => {
    expect(() => containerOf({ imgae: 'x', cpu: 1 })).toThrow('container has no key imgae, cpu. fix: use engine, image, network, remote, install, setup, volume, context, host, platform, user, runtime, pull, memory, command, source, ephemeral, readOnly, pidsLimit, cpus, env, args, runArgs; anything else goes in container.args');
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

  it('hands the oxmutate inside its arguments without the container flags', () => {
    expect(withoutContainerFlags(['run', '--container', '--container-image', 'node:24', '--json', '--no-container', '--container-image=x', '--containerish', '--concurrency', '2'])).toEqual(['run', '--json', '--containerish', '--concurrency', '2']);
  });

  it('installs as the lockfile asks', () => {
    expect(defaultInstall('package-lock.json')).toBe('npm ci');
    expect(defaultInstall('npm-shrinkwrap.json')).toBe('npm ci');
    expect(defaultInstall('pnpm-lock.yaml')).toBe('corepack enable && pnpm install --frozen-lockfile');
    expect(defaultInstall('yarn.lock')).toBe('corepack enable && yarn install --frozen-lockfile');
    expect(defaultInstall(undefined)).toBe('npm install');
  });

  it('talks to the engine the context or the host names', () => {
    expect(engineOf(DEFAULTS)).toEqual({ global: [], env: {} });
    expect(engineOf({ ...DEFAULTS, context: 'box', host: 'ssh://u@box' })).toEqual({ global: ['--context', 'box'], env: { DOCKER_HOST: 'ssh://u@box' } });
    expect(engineOf({ ...DEFAULTS, engine: '/opt/homebrew/bin/podman', context: 'box', host: 'ssh://u@box' })).toEqual({ global: ['--connection', 'box'], env: { CONTAINER_HOST: 'ssh://u@box' } });
  });
});

const HARDENED = ['--cap-drop=ALL', '--security-opt=no-new-privileges', '--label', 'dev.oxmutate=1'];

/** A container's script, line by line. */
const script = (args: readonly string[]): string[] => args.at(-1)!.split('\n');
/** The script of a create or run whose script is last but for `sh` and the kept files (the copy back). */
const backScript = (args: readonly string[]): string => args[args.indexOf('-c') + 1]!;

describe('the container plan', () => {
  const input = { rel: 'packages/a', argv: ['run', "it's"], key: 'k1', install: 'npm ci', volume: 'vol', keep: ['packages/a/reports/m.json'] };

  it('labels the volume, hardens every container, and mounts nothing of the host', () => {
    const plan = containerPlan(DEFAULTS, input);
    expect(plan.volume).toEqual(['volume', 'create', '--label', 'dev.oxmutate=1', 'vol']);
    expect(plan.drop).toEqual(['volume', 'rm', '-f', 'vol']);
    expect(plan.sync.slice(0, -1)).toEqual(['create', '--rm', ...HARDENED, '-v', 'vol:/w', '-w', '/w', DEFAULTS.image, 'sh', '-c']);
    expect(plan.run.slice(0, -1)).toEqual(['run', '--rm', '--init', '--network=none', ...HARDENED, '-v', 'vol:/w', '-w', '/w', '-e', 'OXMUTATE_CONTAINER=inside', DEFAULTS.image, 'sh', '-c']);
    expect(plan.back.slice(0, 11)).toEqual(['create', '--network=none', ...HARDENED, '-v', 'vol:/w', '-w', '/w/src', DEFAULTS.image]);
  });

  it('gives every container every option set, and the run alone its network and runArgs', () => {
    const c = { ...DEFAULTS, network: 'bridge', platform: 'linux/amd64', user: '1000', runtime: 'runsc', pull: 'never', readOnly: true, pidsLimit: 64, cpus: 3, memory: '4g', env: ['CI'], args: ['--ulimit=nofile=1024'], runArgs: ['--shm-size=1g'] };
    const all = ['--platform', 'linux/amd64', '--user', '1000', '--runtime', 'runsc', '--pull=never', '--read-only', '--tmpfs', '/tmp:exec', '-e', 'HOME=/tmp', '--pids-limit', '64', '--cpus', '3', '--memory', '4g', '-e', 'CI', '--ulimit=nofile=1024'];
    const plan = containerPlan(c, input);
    expect(plan.sync.slice(2, 2 + HARDENED.length + all.length)).toEqual([...HARDENED, ...all]);
    expect(plan.back.slice(2, 2 + HARDENED.length + all.length)).toEqual([...HARDENED, ...all]);
    expect(plan.run.slice(3, 4 + HARDENED.length + all.length)).toEqual(['--network=bridge', ...HARDENED, ...all]);
    expect(plan.run.slice(-5, -3)).toEqual(['--shm-size=1g', c.image]);
    expect(plan.sync).not.toContain('--shm-size=1g');
    expect(plan.back).not.toContain('--shm-size=1g');
  });

  it('syncs a copy and installs when the key changed; the run sets up and runs oxmutate in the project', () => {
    const plan = containerPlan({ ...DEFAULTS, setup: 'npm run build' }, input);
    expect(script(plan.sync)).toEqual([
      'set -e',
      'mkdir -p /w/src && cd /w/src',
      'tar -xovf /w/in.tar > /w/manifest.new',
      'rm -f /w/in.tar',
      expect.stringMatching(/^node -e '.*' \/w\/manifest \/w\/manifest\.new$/u),
      'mv /w/manifest.new /w/manifest',
      `if [ "$(cat /w/installed 2>/dev/null)" != 'k1' ]; then npm ci; echo 'k1' > /w/installed; fi`,
    ]);
    expect(script(plan.run)).toEqual(['set -e', 'npm run build', "cd '/w/src/packages/a'", String.raw`exec npx --no oxmutate 'run' 'it'\''s'`]);
    const bare = containerPlan(DEFAULTS, { ...input, install: '', rel: '' });
    expect(script(bare.sync)).toHaveLength(6);
    expect(script(bare.run)).toEqual(['set -e', "cd '/w/src'", String.raw`exec npx --no oxmutate 'run' 'it'\''s'`]);
  });

  it('fetches the commit instead with source git, keeping node_modules and the kept files', () => {
    const plan = containerPlan(DEFAULTS, { ...input, fetch: { remote: 'https://example.com/r.git', commit: 'abc123' } });
    expect(script(plan.sync).slice(2, 7)).toEqual([
      `command -v git >/dev/null || { echo 'oxmutate: source git needs git in the image. fix: container.image node:${nodeMajor}, or source copy' >&2; exit 3; }`,
      '[ -d .git ] || git init -q',
      "git fetch -q --depth 1 'https://example.com/r.git' 'abc123' || { echo 'oxmutate: the container could not fetch abc123. fix: push it, or set container.remote' >&2; exit 4; }",
      'git checkout -q -f FETCH_HEAD',
      "git clean -q -fdx -e 'node_modules' -e 'packages/a/reports/m.json'",
    ]);
    expect(plan.sync.at(-1)).not.toContain('in.tar');
  });

  it('copies back only the kept files that exist', () => {
    const { back } = containerPlan(DEFAULTS, input);
    expect(backScript(back)).toBe('rm -f /w/out.tar; for f; do [ -e "$f" ] && printf "%s\\n" "$f"; done > /w/keep.list; if [ -s /w/keep.list ]; then tar -cf /w/out.tar -T /w/keep.list; fi');
    expect(back.slice(-2)).toEqual(['sh', 'packages/a/reports/m.json']);
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

interface Call { cmd: string; args: readonly string[]; o: RunOptions }
interface Outcome { code?: number | null; syncCode?: number; out?: string; outFails?: boolean; fail?: Error; tarFails?: boolean; createFails?: boolean; cpFails?: boolean }

type Answer = { code: number | null; stdout: string; stderr: string };
const answer = (code: number | null, stdout = ''): Answer => ({ code, stdout, stderr: code === 0 ? '' : ' engine said no \n' });
/** The engine's verb and its own arguments, without the context flag before them. */
function verbOf(args: readonly string[]): [string, string[]] {
  const rest = args[0] === '--context' || args[0] === '--connection' ? args.slice(2) : [...args];
  return rest[0] === 'volume' ? [`volume ${rest[1] ?? ''}`, rest.slice(2)] : [rest[0] ?? '', rest.slice(1)];
}

/**
 * The real git and tar (bellpull's run, GIT_* left out) unless `tarFails`. The engine is a fake
 * that keeps what each step was given: the files copied in (their tar listing), each container's
 * script, and it answers the copy out with `out`, a tar file, when given one.
 */
function fake(result: Outcome) {
  const calls: Call[] = [];
  const verbs: string[] = [];
  const scripts = new Map<string, string>();
  let sent: string[] = [];
  let copiedFrom = '';
  const isSync = (id: string): boolean => /manifest|git fetch/u.test(scripts.get(id) ?? '');
  const copyIn = (from: string): Answer => {
    copiedFrom = from;
    sent = spawnSync('tar', ['-tf', path.basename(from)], { cwd: path.dirname(from), encoding: 'utf8' }).stdout.split('\n').filter(Boolean).toSorted();
    return answer(result.cpFails ? 1 : 0);
  };
  const copyOut = (to: string): Answer => {
    if (result.outFails || !result.out) return answer(1);
    copyFileSync(result.out, to);
    return answer(0);
  };
  const handlers: Record<string, (rest: string[]) => Answer> = {
    create: (rest) => {
      if (result.createFails) return answer(1);
      const id = `c${String(scripts.size + 1)}`;
      scripts.set(id, rest[rest.indexOf('-c') + 1] ?? '');
      return answer(0, `${id}\n`);
    },
    cp: ([from = '', to = '']) => (from.includes(':') ? copyOut(to) : copyIn(from)),
    start: (rest) => answer(isSync(rest.at(-1) ?? '') ? (result.syncCode ?? 0) : 0),
    run: () => answer('code' in result ? (result.code ?? null) : 0),
  };
  const spawn = async (cmd: string, args: readonly string[], o: RunOptions) => {
    calls.push({ cmd, args, o });
    if (cmd === 'tar' && result.tarFails) return { code: 2, stdout: '', stderr: ' tar: cannot open \n' };
    if (cmd !== 'engine') return run(cmd, args, { ...o, env: { ...withoutGit(), ...o.env } });
    if (result.fail) throw result.fail;
    const [verb, rest] = verbOf(args);
    verbs.push(verb);
    return handlers[verb]?.(rest) ?? answer(0);
  };
  const ofEngine = (): Call[] => calls.filter((c) => c.cmd === 'engine');
  return { calls, spawn, ofEngine, verbs: () => verbs, scripts, sent: () => sent, io: () => path.dirname(copiedFrom) };
}

/** The install key in a sync's script. */
const keyOf = (s: string): string => /!= '([0-9a-f]+)'/u.exec(s)![1]!;

describe('running in the container', () => {
  const C = { ...DEFAULTS, engine: 'engine' };

  it('creates the volume, copies the git files in, syncs, runs in the project, and returns the run’s exit code', async () => {
    const top = repo({ 'package-lock.json': '{}', 'packages/a/src/x.ts': 'x', '.gitignore': 'dist\n', 'packages/a/dist/y.js': 'y' });
    const f = fake({ code: 3 });
    expect(await runInContainer(C, { root: path.join(top, 'packages/a'), keep: [] }, ['run'], { spawn: f.spawn })).toBe(3);
    expect(f.verbs()).toEqual(['volume create', 'create', 'cp', 'start', 'run']);
    expect(f.sent()).toEqual(['.gitignore', 'package-lock.json', 'packages/a/src/x.ts']);
    const [volume, , cp, start, ran] = f.ofEngine();
    const name = `oxmutate-${createHash('sha256').update(top).digest('hex').slice(0, 12)}`;
    expect(volume!.args.at(-1)).toBe(name);
    expect(cp!.args).toEqual(['cp', path.join(f.io(), 'in.tar'), 'c1:/w/in.tar']);
    expect(start!.args).toEqual(['start', '-a', 'c1']);
    expect(f.scripts.get('c1')).toContain('then npm ci;');
    expect(ran!.args).toContain(`${name}:/w`);
    expect(ran!.args.at(-1)).toContain("cd '/w/src/packages/a'");
    for (const call of [start!, ran!]) expect(call.o).toMatchObject({ stdio: 'inherit', timeout: 0 });
    expect(volume!.o).toMatchObject({ timeout: 0 });
    // The host's archives live in its own temporary directory, removed after the run; the container mounts none of it.
    expect([tmpdir(), realpathSync(tmpdir())]).toContain(path.dirname(f.io()));
    expect(path.basename(f.io())).toMatch(/^oxmutate-io-/u);
    expect(existsSync(f.io())).toBe(false);
    expect(f.ofEngine().flatMap((c) => c.args).filter((a) => a.includes(f.io()))).toEqual([path.join(f.io(), 'in.tar')]);
    expect(f.calls.find((c) => c.cmd === 'tar')!.args).toEqual(['-cf', 'in.tar', ...tarFlags(process.platform), '-C', top, '--null', '-T', path.join(f.io(), 'files')]);
    expect(f.calls.find((c) => c.cmd === 'tar')!.o.cwd).toBe(f.io());
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
    spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'one'], { cwd: top, env: withoutGit() });
    spawnSync('git', ['remote', 'add', 'origin', 'https://example.com/origin.git'], { cwd: top, env: withoutGit() });
    const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: top, env: withoutGit(), encoding: 'utf8' }).stdout.trim();
    const f = fake({});
    await runInContainer({ ...C, source: 'git' }, { root: top, keep: [] }, [], { spawn: f.spawn });
    expect(f.verbs()).toEqual(['volume create', 'create', 'start', 'run']);
    expect(f.calls.filter((c) => c.cmd === 'tar')).toEqual([]);
    expect(f.scripts.get('c1')).toContain(`git fetch -q --depth 1 'https://example.com/origin.git' '${head}'`);
    const g = fake({});
    await runInContainer({ ...C, source: 'git', remote: 'https://example.com/fork.git' }, { root: top, keep: [] }, [], { spawn: g.spawn });
    expect(g.scripts.get('c1')).toContain("'https://example.com/fork.git'");
    await expect(runInContainer({ ...C, source: 'git' }, { root: repo({ 'a.ts': '' }), keep: [] }, [], { spawn: fake({}).spawn })).rejects.toThrow('source git fetches from a remote, and this repository has no origin. fix: set container.remote');
  });

  it.runIf(spawnSync('xattr', ['-h']).status === 0)('packs no extended attribute and no ._ file on macOS', async () => {
    const top = repo({ 'package.json': '{}', 'a.ts': 'a' });
    spawnSync('xattr', ['-w', 'com.example.tag', 'marked', path.join(top, 'a.ts')]);
    let packed = '';
    const f = fake({});
    await runInContainer(C, { root: top, keep: [] }, [], {
      spawn: async (cmd, args, o) => {
        if (cmd === 'engine' && args[0] === 'cp') packed = readFileSync(args[1]!, 'latin1');
        return f.spawn(cmd, args, o);
      },
    });
    expect(f.sent()).toEqual(['a.ts', 'package.json']);
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
      await runInContainer({ ...c, volume: 'v' }, { root: top, keep: [] }, [], { spawn: f.spawn });
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
      await runInContainer(C, { root: top, keep: [] }, [], { spawn: f.spawn });
      return keyOf(f.scripts.get('c1')!);
    };
    const first = await key();
    writeFileSync(path.join(top, 'package.json'), '{"a":2}');
    expect(await key()).not.toBe(first);
    const f = fake({});
    await runInContainer(C, { root: repo({ 'x.ts': '' }), keep: [] }, [], { spawn: f.spawn });
    expect(f.scripts.get('c1')).toContain('then npm install;');
  });

  it('copies the kept files back through a stopped container, removes it, and sends the host’s copy of them in', async () => {
    const top = repo({ 'package.json': '{}', '.gitignore': 'reports\n', 'reports/inc.json': 'host' });
    const from = repo({ 'reports/inc.json': 'from the container' });
    spawnSync('tar', ['-cf', 'out.tar', 'reports/inc.json'], { cwd: from });
    const f = fake({ out: path.join(from, 'out.tar') });
    expect(await runInContainer({ ...C, install: '' }, { root: top, keep: [path.join(top, 'reports/inc.json'), '/elsewhere/x'] }, [], { spawn: f.spawn })).toBe(0);
    expect(f.verbs()).toEqual(['volume create', 'create', 'cp', 'start', 'run', 'create', 'start', 'cp', 'rm']);
    expect(f.sent()).toContain('reports/inc.json');
    expect(f.scripts.get('c1')).not.toContain('installed');
    const [, , , , , back, , out, rm] = f.ofEngine();
    expect(back!.args.slice(-2)).toEqual(['sh', 'reports/inc.json']);
    expect(out!.args.slice(0, 2)).toEqual(['cp', 'c2:/w/out.tar']);
    expect(rm!.args).toEqual(['rm', '-f', 'c2']);
    expect(readFileSync(path.join(top, 'reports/inc.json'), 'utf8')).toBe('from the container');
  });

  it('extracts nothing when the copy out fails, still removes the container, and copies back nothing when nothing is kept', async () => {
    const top = repo({ 'package.json': '{}' });
    const f = fake({ outFails: true });
    expect(await runInContainer(C, { root: top, keep: [path.join(top, 'reports/none.json')] }, [], { spawn: f.spawn })).toBe(0);
    expect(f.verbs().slice(-4)).toEqual(['create', 'start', 'cp', 'rm']);
    expect(f.calls.filter((c) => c.cmd === 'tar').map((c) => c.args[0])).toEqual(['-cf']);
    const none = fake({});
    await runInContainer(C, { root: top, keep: [] }, [], { spawn: none.spawn });
    expect(none.verbs()).not.toContain('rm');
  });

  it('with ephemeral, removes the volume after the run, and after a failed one', async () => {
    const top = repo({ 'package.json': '{}' });
    const f = fake({});
    await runInContainer({ ...C, ephemeral: true, volume: 'v' }, { root: top, keep: [] }, [], { spawn: f.spawn });
    expect(f.ofEngine().at(-1)!.args).toEqual(['volume', 'rm', '-f', 'v']);
    const failed = fake({ syncCode: 1 });
    await expect(runInContainer({ ...C, ephemeral: true, volume: 'v' }, { root: top, keep: [] }, [], { spawn: failed.spawn })).rejects.toThrow('the sync');
    expect(failed.ofEngine().at(-1)!.args).toEqual(['volume', 'rm', '-f', 'v']);
    const kept = fake({});
    await runInContainer(C, { root: top, keep: [] }, [], { spawn: kept.spawn });
    expect(kept.ofEngine().map((c) => c.args.join(' '))).not.toContain(expect.stringMatching(/^volume rm/u));
  });

  it('stops before the run when the sync, its copy or its creation fails, and leaves no temporary directory', async () => {
    const top = repo({ 'package.json': '{}' });
    const f = fake({ syncCode: 1 });
    await expect(runInContainer(C, { root: top, keep: [] }, [], { spawn: f.spawn })).rejects.toThrow('the sync into the container or its install failed (exit 1); its output is above. fix: set container.install');
    expect(f.verbs()).not.toContain('run');
    expect(existsSync(f.io())).toBe(false);
    await expect(runInContainer(C, { root: top, keep: [] }, [], { spawn: fake({ cpFails: true }).spawn })).rejects.toThrow('the copy into the container failed: engine said no');
    await expect(runInContainer(C, { root: top, keep: [] }, [], { spawn: fake({ createFails: true }).spawn })).rejects.toThrow("the container could not be created: engine said no. fix: check container.image and the engine's own error");
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
