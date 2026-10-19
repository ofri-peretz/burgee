/**
 * first-cli R1–R4 — `burgee init [dir]`: the README quick start and the `package.json` that runs
 * it, written into a directory, and the one install command that comes next.
 *
 * The file is read from the README this package ships, at the run, so the page and the program
 * are one text and cannot drift (R2): npm packs `README.md` into every tarball, and it sits one
 * level above `src/` and `dist/` alike. Nothing written refers back to burgee beyond the
 * dependency, so deleting this command changes nothing about what it wrote (Z2).
 *
 * Loaded by the `init` command only, behind an `await import()`, like `migrate` and `skill`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

import { ambientRuntime, run } from 'bellpull';

import { UsageError } from './errors.js';
import { ExitCode } from './exit-code.js';
import { shellWord } from './unknown-option.js';

/** The two files, in the order they are written and reported. */
const FILES = ['cli.mjs', 'package.json'] as const;

/** The managers a user agent may name; anything else installs with npm, which every Node ships. */
const MANAGERS = ['npm', 'pnpm', 'yarn', 'bun'];

/** An install is a network call that can be slow, never one that may hang (Y10). */
const INSTALL_TIMEOUT = 600_000;

/** The symbol `failure.ts` reads a class's own exit code from (E7), as `migrate.ts` spells it. */
const EXIT_CODE = Symbol.for('burgee.exitCode');

export interface InitWritten {
  dir: string;
  files: string[];
  /** The command that installs the project: run when `installed`, to run next when not (R4). */
  install: string;
  installed: boolean;
}

/** R4 — the install ran and failed. A runtime failure, with the line that runs it again. */
export class InstallError extends Error {
  static readonly [EXIT_CODE] = ExitCode.RUNTIME;
  constructor(
    command: string,
    code: number | null,
    readonly fix: string,
  ) {
    super(`${command} exited ${code}`);
    this.name = 'InstallError';
  }
}

/** R2 — the `js` block of the README's `## Quick start`, exactly as the page shows it. */
export function quickstart(readme: string): string {
  const open = readme.indexOf('```js\n', readme.indexOf('\n## Quick start\n') + 1);
  const close = readme.indexOf('\n```', open);
  if (!readme.includes('\n## Quick start\n') || open === -1 || close === -1) throw new Error('the burgee README has no "## Quick start" js block to write');
  return readme.slice(open + '```js\n'.length, close + 1);
}

/** A package name npm accepts, from the directory's: lower case, URL-safe, never leading with `.` or `_`. */
function packageName(dir: string): string {
  const name = [...basename(dir).toLowerCase()].map((c) => ('abcdefghijklmnopqrstuvwxyz0123456789-._~'.includes(c) ? c : '-')).join('');
  return name === '' || name.startsWith('.') || name.startsWith('_') ? 'my-cli' : name;
}

/** R4 — the manager the user ran this through, read off `npm_config_user_agent` (`pnpm/9.12.0 npm/? node/…`). */
function managerOf(agent: string | undefined): string {
  const [name] = (agent ?? '').split('/');
  return MANAGERS.includes(name as string) ? (name as string) : 'npm';
}

export async function init(opts: { dir: string; typed: string | undefined; force: boolean; install: boolean; env: Record<string, string | undefined> }): Promise<InitWritten> {
  const dir = resolve(opts.dir);
  const taken = FILES.map((file) => join(dir, file)).find((at) => existsSync(at));
  if (taken !== undefined && !opts.force) {
    const line = ['npx', 'burgee', 'init', ...(opts.typed === undefined ? [] : [opts.typed]), ...(opts.install ? ['--install'] : []), '--force'];
    const refused = new UsageError(`${taken} already exists`, 'pass --force to overwrite it');
    // `fix` beside `hint`, as `failure.ts` carries it off any error (E3): the line to run instead.
    Object.assign(refused, { fix: line.map(shellWord).join(' ') });
    throw refused;
  }

  const pkgRoot = new URL('../', import.meta.url);
  const { version } = JSON.parse(readFileSync(new URL('package.json', pkgRoot), 'utf8')) as { version: string };
  const name = packageName(dir);
  const manifest = {
    name,
    version: '0.1.0',
    private: true,
    type: 'module',
    bin: { [name]: './cli.mjs' },
    scripts: { start: 'node cli.mjs' },
    dependencies: { burgee: `^${version}` },
  };
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'cli.mjs'), quickstart(readFileSync(new URL('README.md', pkgRoot), 'utf8')));
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  const manager = managerOf(opts.env['npm_config_user_agent']);
  const install = `${manager} install`;
  if (opts.install) {
    // The manager's stdout is its own report and would break `--json`'s one envelope; its stderr,
    // where progress and errors go, is the user's to see.
    const ran = await run(manager, ['install'], { runtime: { ...ambientRuntime(), env: opts.env, cwd: dir }, stdio: ['ignore', 'pipe', 'inherit'], timeout: INSTALL_TIMEOUT });
    if (!ran.ok) throw new InstallError(install, ran.code, `cd ${shellWord(dir)} && ${install}`);
  }
  return { dir, files: [...FILES], install, installed: opts.install };
}
