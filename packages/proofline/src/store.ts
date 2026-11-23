/**
 * Where proofline keeps what it saw: under the repository's common git directory, never in the
 * tree (intent, Defaults taken: the receipt lives in the commit and the PR body, not in `.sdlc/`).
 * Stamps and the gate log are JSON lines, appended, so two worktrees of one clone share them.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { ambientRuntime, run } from 'bellpull';

const git = async (root: string, args: readonly string[]): Promise<string | undefined> => {
  const r = await run('git', args, { cwd: root, runtime: ambientRuntime() });
  return r.ok ? r.stdout.trim() : undefined;
};

/** The branch checked out at `root`, before its first commit too; `HEAD` when detached or outside a repository. */
export const branchOf = async (root: string): Promise<string> => (await git(root, ['symbolic-ref', '--short', '-q', 'HEAD'])) ?? 'HEAD';

/** `git config user.name` at `root`, or undefined when git names nobody. */
export const gitUser = async (root: string): Promise<string | undefined> => git(root, ['config', 'user.name']);

/** proofline's directory for the repository at `root`; outside one, `.proofline` under `root`. */
export const storeDir = async (root: string): Promise<string> => {
  const common = await git(root, ['rev-parse', '--git-common-dir']);
  return common === undefined ? join(root, '.proofline') : join(resolve(root, common), 'proofline');
};

export const readLines = <T>(file: string): T[] =>
  existsSync(file)
    ? readFileSync(file, 'utf8')
        .split('\n')
        .filter((line) => line.trim() !== '')
        .map((line) => JSON.parse(line) as T)
    : [];

export const appendLines = (file: string, rows: readonly unknown[]): void => {
  mkdirSync(join(file, '..'), { recursive: true });
  appendFileSync(file, rows.map((row) => `${JSON.stringify(row)}\n`).join(''));
};

export interface Ran {
  readonly exit: number;
  readonly output: string;
}

/** Run one shell command at `root`, stdout and stderr together; a command that could not start or timed out is exit 1. */
export const runShell = async (command: string, root: string, timeoutMs: number): Promise<Ran> => {
  const r = await run(command, [], { cwd: root, shell: true, runtime: ambientRuntime(), timeout: timeoutMs });
  return { exit: r.code ?? 1, output: `${r.stdout}${r.stderr}` };
};

/**
 * False when the command's first word is a file in the repository that is not a script: an
 * evidence cell naming a document (`.sdlc/gaps/<id>.md`) is a pointer, not a command to run. A
 * script starts with `#!`; the execute bit is not read, because Windows has none.
 */
export const runnable = (command: string, root: string): boolean => {
  const file = join(root, (/\S+/u.exec(command) as RegExpExecArray)[0]);
  return !existsSync(file) || !statSync(file).isFile() || readFileSync(file, 'utf8').startsWith('#!');
};
