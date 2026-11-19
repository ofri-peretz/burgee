import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { discard } from './__fixtures__/scratch-dir.js';
import { type Container, containerOf, containerPlan, defaultInstall, INSIDE, runInContainer, withFlags } from './container.js';
import { nodeMajor } from './runtime.js';

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
  const input = { rel: 'packages/a', argv: ['run', "it's"], key: 'k1', install: 'npm ci', volume: 'vol', keep: ['packages/a/reports/m.json'] };

  it('mounts the volume, marks the run inside, and puts every setting before the image', () => {
    const { run } = containerPlan({ ...DEFAULTS, cpus: 3, memory: '4g', env: ['CI'], args: ['--network=none'] }, input);
    expect(run.slice(0, -1)).toEqual(['run', '--rm', '-i', '--init', '-v', 'vol:/w', '-w', '/w', '-e', `${INSIDE}=inside`, '--cpus', '3', '--memory', '4g', '-e', 'CI', '--network=none', DEFAULTS.image, 'sh', '-c']);
    expect(containerPlan(DEFAULTS, input).run).not.toContain('--cpus');
    expect(containerPlan(DEFAULTS, input).run).not.toContain('--memory');
  });

  it('syncs, installs only when the key changed, sets up, and runs oxmutate in the project', () => {
    const script = containerPlan({ ...DEFAULTS, setup: 'npm run build' }, input).run.at(-1)!;
    expect(script.split('\n')).toEqual([
      'set -e',
      'mkdir -p /w/src && cd /w/src',
      'tar -xvf - > /w/manifest.new',
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
    expect(containerPlan(DEFAULTS, input).back).toEqual(['run', '--rm', '-v', 'vol:/w', '-w', '/w/src', DEFAULTS.image, 'sh', '-c', 'for f; do [ -e "$f" ] && printf "%s\\n" "$f"; done | tar -cf - -T -', 'sh', 'packages/a/reports/m.json']);
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

describe('running in the container', () => {
  const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));
  function repo(files: Record<string, string>): string {
    const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'oxmutate-container-')));
    made.push(dir);
    for (const [f, text] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
      writeFileSync(path.join(dir, f), text);
    }
    spawnSync('git', ['init', '-q'], { cwd: dir, env: clean });
    spawnSync('git', ['add', '-A'], { cwd: dir, env: clean });
    return dir;
  }
  /** The real git and tar, with GIT_* left out (pre-push exports GIT_DIR); the engine is recorded. */
  function fake(result: { status: number | null; stdout?: Buffer; error?: Error }) {
    const calls: { args: readonly string[]; input?: unknown }[] = [];
    const spawn = (cmd: string, args: readonly string[], o: Parameters<typeof spawnSync>[2]) => {
      if (cmd !== 'engine') return spawnSync(cmd, args, { ...o, env: { ...clean, ...(o?.env as object) } });
      calls.push({ args, input: (o as { input?: unknown }).input });
      return { status: result.status, stdout: result.stdout ?? Buffer.alloc(0), stderr: '', error: result.error };
    };
    return { calls, spawn };
  }
  const C = { ...DEFAULTS, engine: 'engine' };

  it('sends the git files on stdin, runs in the project, and returns the container’s exit code', () => {
    const top = repo({ 'package-lock.json': '{}', 'packages/a/src/x.ts': 'x', '.gitignore': 'dist\n', 'packages/a/dist/y.js': 'y' });
    const { calls, spawn } = fake({ status: 3 });
    expect(runInContainer(C, { root: path.join(top, 'packages/a'), keep: [] }, ['run'], spawn)).toBe(3);
    expect(calls).toHaveLength(1);
    const listed = spawnSync('tar', ['-tf', '-'], { input: calls[0]!.input as Buffer, encoding: 'utf8' }).stdout.split('\n').filter(Boolean).toSorted();
    expect(listed).toEqual(['.gitignore', 'package-lock.json', 'packages/a/src/x.ts']);
    const script = calls[0]!.args.at(-1)!;
    expect(script).toContain('then npm ci;');
    expect(script).toContain("cd '/w/src/packages/a'");
    expect(calls[0]!.args).toContain(`oxmutate-${createHash('sha256').update(top).digest('hex').slice(0, 12)}:/w`);
  });

  it('installs again only when the lockfile changes', () => {
    const top = repo({ 'yarn.lock': 'a' });
    const key = (): string => {
      const { calls, spawn } = fake({ status: 0 });
      runInContainer({ ...C, volume: 'v' }, { root: top, keep: [] }, [], spawn);
      expect(calls[0]!.args).toContain('v:/w');
      return /!= '([0-9a-f]+)'/.exec(calls[0]!.args.at(-1)!)![1]!;
    };
    const first = key();
    expect(key()).toBe(first);
    writeFileSync(path.join(top, 'yarn.lock'), 'b');
    expect(key()).not.toBe(first);
  });

  it('copies the kept files back, and sends the host’s copy of them in', () => {
    const top = repo({ 'package.json': '{}', '.gitignore': 'reports\n', 'reports/inc.json': 'host' });
    const out = spawnSync('tar', ['-cf', '-', 'reports/inc.json'], { cwd: repo({ 'reports/inc.json': 'from the container' }) }).stdout;
    const { calls, spawn } = fake({ status: 0, stdout: out });
    expect(runInContainer({ ...C, install: '' }, { root: top, keep: [path.join(top, 'reports/inc.json'), '/elsewhere/x'] }, [], spawn)).toBe(0);
    const sent = spawnSync('tar', ['-tf', '-'], { input: calls[0]!.input as Buffer, encoding: 'utf8' }).stdout;
    expect(sent).toContain('reports/inc.json');
    expect(calls[0]!.args.at(-1)).not.toContain('installed');
    expect(calls[1]!.args.slice(-2)).toEqual(['sh', 'reports/inc.json']);
    expect(readFileSync(path.join(top, 'reports/inc.json'), 'utf8')).toBe('from the container');
  });

  it('says what to do when it cannot run', () => {
    const top = repo({});
    expect(() => runInContainer(C, { root: top, keep: [], since: 'main' }, [], fake({ status: 0 }).spawn)).toThrow('fix: run them with --no-container');
    expect(() => runInContainer(C, { root: top, keep: [], frozenOracle: 'main' }, [], fake({ status: 0 }).spawn)).toThrow('--since and --frozen-oracle');
    expect(() => runInContainer(C, { root: tmpdir(), keep: [] }, [], fake({ status: 0 }).spawn)).toThrow('is in none. fix: git init');
    expect(() => runInContainer(C, { root: top, keep: [] }, [], fake({ status: null, error: new Error('spawn engine ENOENT') }).spawn)).toThrow('engine did not start (spawn engine ENOENT). fix: install and start Docker or Podman');
    expect(runInContainer(C, { root: top, keep: [] }, [], fake({ status: null }).spawn)).toBe(1);
  });
});
