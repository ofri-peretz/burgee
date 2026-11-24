/**
 * The real shell and worktrees, through bellpull (subprocesses are its job here). Input reaches a
 * command line as a file on stdin, `"$REPLZ_INPUT"`, because a prompt is too long for an argument;
 * without input its stdin is empty, so a command that reads it never waits.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ambientRuntime, run } from 'bellpull';

import { type Shell, type Worktrees } from './run.js';

export const sh: Shell = async (command, options) => {
  const runtime = ambientRuntime();
  const scratch = options.input === undefined ? undefined : mkdtempSync(join(tmpdir(), 'replz-input-'));
  try {
    const env: Record<string, string | undefined> = { ...runtime.env, ...options.env, REPLZ_INPUT: '/dev/null' };
    if (scratch !== undefined) {
      env.REPLZ_INPUT = join(scratch, 'input.txt');
      writeFileSync(env.REPLZ_INPUT, options.input as string);
    }
    // The braces give the whole line the input, not only its last command.
    const result = await run('sh', ['-c', `{ ${command}\n} < "$REPLZ_INPUT"`], { cwd: options.cwd, runtime, env, timeout: 0 });
    return { code: result.code, stdout: result.stdout, stderr: result.stderr };
  } finally {
    // Stryker disable next-line BooleanLiteral: equivalent, the scratch directory is always there to remove
    if (scratch !== undefined) rmSync(scratch, { recursive: true, force: true });
  }
};

const git = async (repo: string, args: readonly string[]): Promise<void> => {
  const result = await run('git', args, { cwd: repo, runtime: ambientRuntime() });
  if (!result.ok) throw new Error(`git ${args.join(' ')} failed: ${result.stderr.trim()}. fix: fetch the commit the case names`);
};

export const worktreesIn = (repo: string): Worktrees => ({
  add: async (ref) => {
    // Stryker disable next-line StringLiteral: equivalent, any fresh directory under tmp serves; the names only help a person reading tmp
    const dir = join(mkdtempSync(join(tmpdir(), 'replz-case-')), 'tree');
    await git(repo, ['worktree', 'add', '--detach', dir, ref]);
    return { dir, remove: () => git(repo, ['worktree', 'remove', '--force', dir]) };
  },
});

/** `git log` on main, for `propose`. */
export const logOf = async (repo: string, args: readonly string[]): Promise<string> => {
  const result = await run('git', args, { cwd: repo, runtime: ambientRuntime() });
  if (!result.ok) throw new Error(`git ${args.join(' ')} failed: ${result.stderr.trim()}. fix: run it inside a clone with history (not a shallow one)`);
  return result.stdout;
};
