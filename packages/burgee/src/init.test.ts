/**
 * first-cli R1–R5 — `npx burgee init [dir]`: a first CLI in one command.
 *
 * Two halves. In-process, through `burgee/testing`, every requirement is held against the
 * command as declared: the two files and nothing else, the README quick start byte for byte,
 * the `package.json` it names, the refusal and its `fix:` line, the package manager it runs and
 * the surfaces every burgee command has. Then the stranger's path, end to end: the built `burgee`
 * bin writes the project into a temporary directory, the packed tarballs are installed into it,
 * and the program it wrote answers `--help` and the README's own transcript.
 *
 * The quick start is read here with `shape.test.ts`'s reading, not `init.ts`'s, so a fault in
 * either one's reading of the README fails this file rather than agreeing with itself.
 */
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { ExitCode, runCommand } from './index.js';
import { quickstart } from './init.js';
import { program as burgee } from './program.js';
import { shellLine, shellWord } from './unknown-option.js';

const WINDOWS = process.platform === 'win32';
const pkgRoot = fileURLToPath(new URL('..', import.meta.url));
const manifest = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8')) as { version: string; dependencies: Record<string, string> };
const readme = readFileSync(join(pkgRoot, 'README.md'), 'utf8');

/** The package README's quick start: its source, and the transcript under it — as `shape.test.ts` reads them. */
const section = readme.slice(readme.indexOf('\n## Quick start\n'), readme.indexOf('\n## ', readme.indexOf('\n## Quick start\n') + 1));
const QUICK_START = /```js\n([\s\S]*?)```/.exec(section)?.[1] ?? '';
const TRANSCRIPT = (/```console\n([\s\S]*?)```/.exec(section)?.[1] ?? '')
  .trim()
  .split(/\n\n(?=\$ )/)
  .map((block) => {
    const [command = '', ...output] = block.split('\n');
    const [typed = '', exit] = command.replace(/^\$ node cli\.mjs/, '').split('#');
    return { argv: typed.trim().split(/\s+/).filter((a) => a !== ''), code: exit === undefined ? 0 : Number(/exit (\d+)/.exec(exit)?.[1]), output: output.join('\n') };
  });

const dirs: string[] = [];
function scratch(prefix = 'burgee-init-'): string {
  const at = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(at);
  return at;
}
afterAll(() => {
  for (const at of dirs) rmSync(at, { recursive: true, force: true });
});

/**
 * A package manager that records how it was called, first on a `PATH` of its own: a shell script,
 * or a `.cmd` on Windows, which is what npm, pnpm and yarn are there and what bellpull resolves.
 */
function fakeManager(name: string, exit = 0): { env: Record<string, string>; called: () => string | undefined } {
  const bin = scratch('burgee-pm-');
  const log = join(bin, 'called');
  if (WINDOWS) {
    // bellpull quotes each argument for cmd.exe, so `%~1` reads it back without the quotes.
    writeFileSync(join(bin, `${name}.cmd`), `@echo ${name} %~1> "${log}"\r\n@exit /b ${exit}\r\n`);
  } else {
    writeFileSync(join(bin, name), `#!/bin/sh\necho "${name} $*" > '${log}'\nexit ${exit}\n`);
    chmodSync(join(bin, name), 0o755);
  }
  // The user agent of whatever runs this suite is not the one under test.
  const { npm_config_user_agent: _, ...ambient } = process.env as Record<string, string>;
  const env = { ...ambient, PATH: `${bin}${delimiter}${process.env['PATH'] ?? process.env['Path'] ?? ''}` };
  return { env, called: () => (existsSync(log) ? readFileSync(log, 'utf8').trim() : undefined) };
}

describe('first-cli — burgee init, in-process', () => {
  it('R1 — writes cli.mjs and package.json into the directory, and nothing else', async () => {
    const dir = join(scratch(), 'demo');
    const result = await runCommand(burgee, ['init', dir, '--json']);
    expect(result.code, result.stderr).toBe(ExitCode.OK);
    expect(readdirSync(dir).sort()).toEqual(['cli.mjs', 'package.json']);
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: true, data: { dir, files: ['cli.mjs', 'package.json'], install: 'npm install', installed: false } });
  });

  it('R1 — with no directory it writes where the user stands, and the fix names none', async () => {
    const dir = scratch();
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue(dir);
    try {
      expect((await runCommand(burgee, ['init'])).code).toBe(ExitCode.OK);
      expect(readdirSync(dir).sort()).toEqual(['cli.mjs', 'package.json']);
      const again = await runCommand(burgee, ['init']);
      expect(again.code).toBe(ExitCode.USAGE);
      expect(again.stderr).toContain('fix: npx burgee init --force\n');
    } finally {
      cwd.mockRestore();
    }
  });

  it('R1 — refuses to overwrite with exit 2 and a fix: line naming --force, and writes nothing', async () => {
    const dir = scratch();
    writeFileSync(join(dir, 'package.json'), '{"name":"mine"}\n');
    const refused = await runCommand(burgee, ['init', dir]);
    expect(refused.code).toBe(ExitCode.USAGE);
    expect(refused.stderr).toContain(`error: ${join(dir, 'package.json')} already exists\n`);
    expect(refused.stderr).toContain(`fix: ${shellLine(['npx', 'burgee', 'init', dir, '--force'])}\n`);
    expect(readdirSync(dir)).toEqual(['package.json']);
    expect(readFileSync(join(dir, 'package.json'), 'utf8')).toBe('{"name":"mine"}\n');

    const forced = await runCommand(burgee, ['init', dir, '--force']);
    expect(forced.code, forced.stderr).toBe(ExitCode.OK);
    expect(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))).toMatchObject({ type: 'module' });
  });

  it('R1 — a second init of the same directory is refused on cli.mjs, and the fix keeps --install', async () => {
    const dir = scratch();
    expect((await runCommand(burgee, ['init', dir])).code).toBe(ExitCode.OK);
    const again = await runCommand(burgee, ['init', dir, '--install', '--json']);
    expect(again.code).toBe(ExitCode.USAGE);
    expect(JSON.parse(again.stdout)).toMatchObject({ ok: false, error: { message: `${join(dir, 'cli.mjs')} already exists`, hint: 'pass --force to overwrite it', fix: shellLine(['npx', 'burgee', 'init', dir, '--install', '--force']) } });
  });

  it('R2 — cli.mjs is the README quick start, byte for byte', async () => {
    const dir = scratch();
    await runCommand(burgee, ['init', dir]);
    expect(QUICK_START).toMatch(/^#!\/usr\/bin\/env node\n/);
    expect(readFileSync(join(dir, 'cli.mjs'), 'utf8')).toBe(QUICK_START);
    expect(quickstart(readme)).toBe(QUICK_START);
  });

  it('R2 — the repository README says init writes the file it shows, and it is the same file', () => {
    const root = readFileSync(join(pkgRoot, '..', '..', 'README.md'), 'utf8');
    const start = root.slice(root.indexOf('\n## 👋 Start here\n'), root.indexOf('\n## ', root.indexOf('\n## 👋 Start here\n') + 1));
    expect(start).toContain('npx burgee init');
    expect(/```js\n([\s\S]*?)```/.exec(start)?.[1]).toBe(QUICK_START);
  });

  it('R2 — a README without a quick start is refused, never written around', () => {
    expect(() => quickstart('# burgee\n\n## Install\n')).toThrow('the burgee README has no "## Quick start" js block to write');
    expect(() => quickstart('\n## Quick start\n\nNo code.\n')).toThrow(/no "## Quick start" js block/);
    expect(() => quickstart('\n## Quick start\n\n```js\nrun()\n')).toThrow(/no "## Quick start" js block/);
  });

  it('R3 — package.json is a module with a bin, and burgee at the running version is its only dependency', async () => {
    const dir = join(scratch(), 'My CLI');
    await runCommand(burgee, ['init', dir]);
    expect(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))).toEqual({
      name: 'my-cli',
      version: '0.1.0',
      private: true,
      type: 'module',
      bin: { 'my-cli': './cli.mjs' },
      scripts: { start: 'node cli.mjs' },
      dependencies: { burgee: `^${manifest.version}` },
    });
  });

  it('R3 — a directory name npm would refuse becomes a name it accepts', async () => {
    const root = scratch();
    const cases = [['.hidden', 'my-cli'], ['_x', 'my-cli'], ['Ünïcode', '-n-code'], ['a.b~c', 'a.b~c']] as const;
    await Promise.all(cases.map(([dir]) => runCommand(burgee, ['init', join(root, dir)])));
    for (const [dir, name] of cases) expect(JSON.parse(readFileSync(join(root, dir, 'package.json'), 'utf8'))).toMatchObject({ name });
  });

  it('R4 — without --install it names the one install command and runs nothing', async () => {
    const pm = fakeManager('pnpm');
    const dir = scratch();
    const result = await runCommand(burgee, ['init', dir], { env: { ...pm.env, npm_config_user_agent: 'pnpm/9.12.0 npm/? node/v24.13.0 linux x64' } });
    expect(result.code, result.stderr).toBe(ExitCode.OK);
    expect(result.stdout).toContain('install: pnpm install');
    expect(pm.called()).toBeUndefined();
  });

  it.each([
    ['pnpm/9.12.0 npm/? node/v24.13.0 linux x64', 'pnpm'],
    ['yarn/4.5.0 npm/? node/v24.13.0 darwin arm64', 'yarn'],
    ['bun/1.1.30 npm/? node/v24.13.0 linux x64', 'bun'],
    ['npm/11.6.2 node/v24.13.0 win32 x64 workspaces/false', 'npm'],
    ['deno/2.0.0', 'npm'],
    ['', 'npm'],
  ])('R4 — --install runs the package manager the user agent %j names: %s', async (agent, name) => {
    const pm = fakeManager(name);
    const dir = scratch();
    const result = await runCommand(burgee, ['init', dir, '--install', '--json'], { env: { ...pm.env, npm_config_user_agent: agent } });
    expect(result.code, result.stderr).toBe(ExitCode.OK);
    expect(JSON.parse(result.stdout)).toMatchObject({ data: { install: `${name} install`, installed: true } });
    expect(pm.called()).toBe(`${name} install`);
  });

  it('R4 — an install that fails exits 1 and says how to run it again', async () => {
    const pm = fakeManager('npm', 3);
    const dir = scratch();
    const result = await runCommand(burgee, ['init', dir, '--install', '--json'], { env: pm.env });
    expect(result.code).toBe(ExitCode.RUNTIME);
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: false, error: { message: 'npm install exited 3', fix: `cd ${shellWord(dir)} && npm install` } });
    expect(readdirSync(dir).sort()).toEqual(['cli.mjs', 'package.json']);
  });

  it('R5 — init answers --schema, --help and --json like every burgee command', async () => {
    const schema = await runCommand(burgee, ['--schema']);
    const init = (JSON.parse(schema.stdout) as { commands: { name: string; effects: string; options: Record<string, unknown> }[] }).commands.find((c) => c.name === 'init');
    expect(init).toMatchObject({ effects: 'non_idempotent' });
    expect(Object.keys(init?.options ?? {})).toEqual(expect.arrayContaining(['force', 'install']));
    const help = await runCommand(burgee, ['init', '--help']);
    expect(help.code).toBe(ExitCode.OK);
    expect(help.stdout).toContain('--install');
    expect(help.stdout).toContain('--force');
  });
});

/** npm on Windows is `npm.cmd`, which Node will only spawn through a shell. */
function npm(args: string[], cwd: string): string {
  return String(execFileSync(WINDOWS ? 'npm.cmd' : 'npm', args, { cwd, encoding: 'utf8', shell: WINDOWS, stdio: ['ignore', 'pipe', 'pipe'] }));
}

function node(args: string[], cwd: string): { code: number; stdout: string; stderr: string } {
  try {
    return { code: 0, stdout: execFileSync(process.execPath, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }), stderr: '' };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? 1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
  }
}

describe('first-cli — the stranger’s path: the built bin, a real install, a running program', () => {
  let demo: string;
  let written: { code: number; stdout: string; stderr: string };
  let files: string[];

  beforeAll(() => {
    const root = scratch('burgee-first-cli-');
    // The built bin, as `npx burgee init demo` runs it, from the directory the user is in.
    written = node([join(pkgRoot, 'dist', 'cli.js'), 'init', 'demo', '--json'], root);
    demo = join(root, 'demo');
    files = readdirSync(demo).sort();
    // The packed tarballs rather than the registry, as `shape.test.ts` installs them: on a
    // release branch the version init names is the one about to be published.
    const tarballs = join(root, 'tarballs');
    mkdirSync(tarballs);
    const pack = (at: string): string => join(tarballs, npm(['pack', '--silent', '--pack-destination', tarballs], at).trim());
    const siblings = Object.keys(manifest.dependencies).map((name) => join(pkgRoot, '..', name)).filter((at) => existsSync(join(at, 'package.json')));
    npm(['install', '--no-audit', '--no-fund', '--silent', pack(pkgRoot), ...siblings.map(pack)], demo);
  }, 180_000);

  it('writes exactly cli.mjs and package.json, where the user stands', () => {
    expect(written.code, written.stderr).toBe(0);
    expect(files).toEqual(['cli.mjs', 'package.json']);
    // macOS's tmpdir is a symlink to /private: compare where the paths land, not how they are spelled.
    expect(realpathSync((JSON.parse(written.stdout) as { data: { dir: string } }).data.dir)).toBe(realpathSync(demo));
  });

  it('the program it wrote answers --help', () => {
    const help = node(['cli.mjs', '--help'], demo);
    expect(help.code, help.stderr).toBe(0);
    expect(help.stdout).toContain('Greet someone by name');
    expect(help.stdout).toContain('--name');
  });

  it.each(TRANSCRIPT.map((s) => [s.argv.join(' '), s] as const))('the program it wrote answers the README transcript: %s', (_, session) => {
    const ran = node(['cli.mjs', ...session.argv], demo);
    // A pipe, not a terminal: a failure ends with its structured line, set aside as `shape.test.ts` does.
    const line = /\n\{"error":\{"kind":"[a-z_]+".*\}\}\n$/u;
    expect(`${ran.stdout}${ran.stderr.replace(line, '\n')}`.trimEnd()).toBe(session.output);
    expect(ran.code).toBe(session.code);
  });

  it('runs through its own start script, as npm runs it', () => {
    expect(npm(['start', '--silent', '--', '--name', 'ada'], demo).trim()).toBe('greeting: hello, ada');
  });

  it('runs as the command its bin names, through the shim npm links: a symlink, or a .cmd on Windows', () => {
    const consumer = scratch('burgee-first-cli-user-');
    npm(['install', '--no-audit', '--no-fund', '--silent', demo], consumer);
    const bin = join(consumer, 'node_modules', '.bin', WINDOWS ? 'demo.cmd' : 'demo');
    expect(String(execFileSync(bin, ['--name', 'ada'], { cwd: consumer, encoding: 'utf8', shell: WINDOWS })).trim()).toBe('greeting: hello, ada');
  });
});
