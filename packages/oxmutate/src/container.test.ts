import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { run, type RunOptions } from 'bellpull';
import { afterAll, describe, expect, it } from 'vitest';

import { discard } from './__fixtures__/scratch-dir.js';
import { type Container, containerOf, containerPlan, defaultInstall, INSIDE, runInContainer, withFlags } from './container.js';
import { nodeMajor } from './runtime.js';

/** The environment without git's own variables: lefthook's pre-push exports `GIT_DIR`, and a scratch `git init` must not inherit it (scripts/git-env-lock.test.ts). */
const withoutGit = (): NodeJS.ProcessEnv => Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));

const made: string[] = [];
afterAll(() => discard(...made));

const DEFAULTS: Container = { engine: 'docker', image: `node:${nodeMajor}-bookworm-slim`, env: [], args: [], command: 'npx --no oxmutate' };

describe('the container setting', () => {
  it('is off when unset or false, and every default with true', () => {
    expect(containerOf(undefined)).toBeUndefined();
    expect(containerOf(null)).toBeUndefined();
    expect(containerOf(false)).toBeUndefined();
    expect(containerOf(true)).toEqual(DEFAULTS);
  });

  it('takes an image as a string, and every key in the object form', () => {
    expect(containerOf('node:24-alpine')).toEqual({ ...DEFAULTS, image: 'node:24-alpine' });
    const full = { engine: 'podman', image: 'i', install: 'pnpm i', setup: 'npm run build', volume: 'v', cpus: 4, memory: '6g', env: ['CI', 'A=1'], args: ['--network=none'], command: 'node dist/bin.js' };
    expect(containerOf(full)).toEqual(full);
    expect(containerOf({ install: false })).toEqual({ ...DEFAULTS, install: '' });
    expect(containerOf({})).toEqual(DEFAULTS);
    expect(containerOf({ cpus: '4', env: 'CI' })).toEqual(DEFAULTS);
  });

  it('refuses a key it does not know, and a value of the wrong kind, with the fix', () => {
    expect(() => containerOf({ imgae: 'x', cpu: 1 })).toThrow('container has no key imgae, cpu. fix: use engine, image, install, setup, volume, cpus, memory, env, args, command; anything else goes in container.args');
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
  });

  it('installs as the lockfile asks', () => {
    expect(defaultInstall('package-lock.json')).toBe('npm ci');
    expect(defaultInstall('npm-shrinkwrap.json')).toBe('npm ci');
    expect(defaultInstall('pnpm-lock.yaml')).toBe('corepack enable && pnpm install --frozen-lockfile');
    expect(defaultInstall('yarn.lock')).toBe('corepack enable && yarn install --frozen-lockfile');
    expect(defaultInstall(undefined)).toBe('npm install');
  });
});

describe('the container plan', () => {
  const input = { rel: 'packages/a', argv: ['run', "it's"], key: 'k1', install: 'npm ci', volume: 'vol', io: '/tmp/io', keep: ['packages/a/reports/m.json'] };

  it('mounts the volume, marks the run inside, and puts every setting before the image', () => {
    const { run } = containerPlan({ ...DEFAULTS, cpus: 3, memory: '4g', env: ['CI'], args: ['--network=none'] }, input);
    expect(run.slice(0, -1)).toEqual(['run', '--rm', '--init', '-v', 'vol:/w', '-v', '/tmp/io:/io', '-w', '/w', '-e', `${INSIDE}=inside`, '--cpus', '3', '--memory', '4g', '-e', 'CI', '--network=none', DEFAULTS.image, 'sh', '-c']);
    expect(containerPlan(DEFAULTS, input).run).not.toContain('--cpus');
    expect(containerPlan(DEFAULTS, input).run).not.toContain('--memory');
  });

  it('syncs, installs only when the key changed, sets up, and runs oxmutate in the project', () => {
    const script = containerPlan({ ...DEFAULTS, setup: 'npm run build' }, input).run.at(-1)!;
    expect(script.split('\n')).toEqual([
      'set -e',
      'mkdir -p /w/src && cd /w/src',
      'tar -xvf /io/in.tar > /w/manifest.new',
      expect.stringMatching(/^node -e '.*' \/w\/manifest \/w\/manifest\.new$/),
      'mv /w/manifest.new /w/manifest',
      `if [ "$(cat /w/installed 2>/dev/null)" != 'k1' ]; then npm ci; echo 'k1' > /w/installed; fi`,
      'npm run build',
      "cd '/w/src/packages/a'",
      `exec npx --no oxmutate 'run' 'it'\\''s'`,
    ]);
    const bare = containerPlan(DEFAULTS, { ...input, install: '', rel: '' }).run.at(-1)!;
    expect(bare).not.toContain('installed');
    expect(bare).toContain("cd '/w/src'\n");
  });

  it('copies back only the kept files that exist', () => {
    expect(containerPlan(DEFAULTS, input).back).toEqual(['run', '--rm', '-v', 'vol:/w', '-v', '/tmp/io:/io', '-w', '/w/src', DEFAULTS.image, 'sh', '-c', 'for f; do [ -e "$f" ] && printf "%s\\n" "$f"; done > /io/keep.list; if [ -s /io/keep.list ]; then tar -cf /io/out.tar -T /io/keep.list; fi', 'sh', 'packages/a/reports/m.json']);
  });

  it('prunes what the host deleted since the last sync, and nothing else', () => {
    const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'oxmutate-prune-')));
    made.push(dir);
    for (const f of ['kept', 'gone', 'untracked']) writeFileSync(path.join(dir, f), f);
    writeFileSync(path.join(dir, 'old'), 'kept\ngone\n');
    writeFileSync(path.join(dir, 'new'), 'kept\n');
    const prune = /^node -e '(.*)' /m.exec(containerPlan(DEFAULTS, input).run.at(-1)!)![1]!.replaceAll(String.raw`'\''`, "'");
    expect(spawnSync(process.execPath, ['-e', prune, 'old', 'new'], { cwd: dir }).status).toBe(0);
    expect(['kept', 'gone', 'untracked'].map((f) => spawnSync('test', ['-e', f], { cwd: dir }).status)).toEqual([0, 1, 0]);
    // No previous sync: nothing is pruned.
    expect(spawnSync(process.execPath, ['-e', prune, 'missing', 'new'], { cwd: dir }).status).toBe(0);
    expect(readFileSync(path.join(dir, 'kept'), 'utf8')).toBe('kept');
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
interface Call { args: readonly string[]; sent: string[] }
/**
 * The real git and tar (bellpull's run, GIT_* left out); the engine is recorded: it lists what
 * the run was sent, and answers the copy back with `out`, a tar file, when given one.
 */
function fake(result: { code: number | null; out?: string; fail?: Error }) {
  const calls: Call[] = [];
  const spawn = async (cmd: string, args: readonly string[], o: RunOptions) => {
    if (cmd !== 'engine') return run(cmd, args, { ...o, env: { ...withoutGit(), ...o.env } });
    if (result.fail) throw result.fail;
    const io = args[args.indexOf('-v', args.indexOf('-v') + 1) + 1]!.replace(/:\/io$/u, '');
    const sent = existsSync(path.join(io, 'in.tar')) && args.includes('--init') ? spawnSync('tar', ['-tf', path.join(io, 'in.tar')], { encoding: 'utf8' }).stdout.split('\n').filter(Boolean).toSorted() : [];
    if (!args.includes('--init') && result.out) copyFileSync(result.out, path.join(io, 'out.tar'));
    calls.push({ args, sent });
    return { code: result.code, stdout: '', stderr: '' };
  };
  return { calls, spawn };
}

describe('running in the container', () => {
  const C = { ...DEFAULTS, engine: 'engine' };

  it('sends the git files, runs in the project, and returns the container’s exit code', async () => {
    const top = repo({ 'package-lock.json': '{}', 'packages/a/src/x.ts': 'x', '.gitignore': 'dist\n', 'packages/a/dist/y.js': 'y' });
    const { calls, spawn } = fake({ code: 3 });
    expect(await runInContainer(C, { root: path.join(top, 'packages/a'), keep: [] }, ['run'], spawn)).toBe(3);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.sent).toEqual(['.gitignore', 'package-lock.json', 'packages/a/src/x.ts']);
    const script = calls[0]!.args.at(-1)!;
    expect(script).toContain('then npm ci;');
    expect(script).toContain("cd '/w/src/packages/a'");
    expect(calls[0]!.args).toContain(`oxmutate-${createHash('sha256').update(top).digest('hex').slice(0, 12)}:/w`);
  });

  it('installs again only when the lockfile changes', async () => {
    const top = repo({ 'yarn.lock': 'a' });
    const key = async (): Promise<string> => {
      const { calls, spawn } = fake({ code: 0 });
      await runInContainer({ ...C, volume: 'v' }, { root: top, keep: [] }, [], spawn);
      expect(calls[0]!.args).toContain('v:/w');
      return /!= '([0-9a-f]+)'/u.exec(calls[0]!.args.at(-1)!)![1]!;
    };
    const first = await key();
    expect(await key()).toBe(first);
    writeFileSync(path.join(top, 'yarn.lock'), 'b');
    expect(await key()).not.toBe(first);
  });

  it('copies the kept files back, and sends the host’s copy of them in', async () => {
    const top = repo({ 'package.json': '{}', '.gitignore': 'reports\n', 'reports/inc.json': 'host' });
    const from = repo({ 'reports/inc.json': 'from the container' });
    spawnSync('tar', ['-cf', path.join(from, 'out.tar'), 'reports/inc.json'], { cwd: from });
    const { calls, spawn } = fake({ code: 0, out: path.join(from, 'out.tar') });
    expect(await runInContainer({ ...C, install: '' }, { root: top, keep: [path.join(top, 'reports/inc.json'), '/elsewhere/x'] }, [], spawn)).toBe(0);
    expect(calls[0]!.sent).toContain('reports/inc.json');
    expect(calls[0]!.args.at(-1)).not.toContain('installed');
    expect(calls[1]!.args.slice(-2)).toEqual(['sh', 'reports/inc.json']);
    expect(readFileSync(path.join(top, 'reports/inc.json'), 'utf8')).toBe('from the container');
  });

  it('copies nothing back when the copy finds no file, and asks for none when nothing is kept', async () => {
    const top = repo({ 'package.json': '{}' });
    const { calls, spawn } = fake({ code: 0 });
    expect(await runInContainer(C, { root: top, keep: [path.join(top, 'reports/none.json')] }, [], spawn)).toBe(0);
    expect(calls).toHaveLength(2);
    expect(existsSync(path.join(top, 'reports'))).toBe(false);
  });

  it('says what to do when it cannot run', async () => {
    const top = repo({});
    await expect(runInContainer(C, { root: top, keep: [], since: 'main' }, [], fake({ code: 0 }).spawn)).rejects.toThrow('fix: run them with --no-container');
    await expect(runInContainer(C, { root: top, keep: [], frozenOracle: 'main' }, [], fake({ code: 0 }).spawn)).rejects.toThrow('--since and --frozen-oracle');
    await expect(runInContainer(C, { root: tmpdir(), keep: [] }, [], fake({ code: 0 }).spawn)).rejects.toThrow('is in none. fix: git init');
    await expect(runInContainer(C, { root: top, keep: [] }, [], fake({ code: null, fail: new Error('engine: not found') }).spawn)).rejects.toThrow('engine did not start (engine: not found). fix: install and start Docker or Podman');
    expect(await runInContainer(C, { root: top, keep: [] }, [], fake({ code: null }).spawn)).toBe(1);
  });
});
