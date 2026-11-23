/**
 * The two things triggerlist asks git, through bellpull (subprocesses are its job here): the diff
 * of a range, and a file as it is at a ref. A test passes its own `Git` and runs no process.
 */
import { ambientRuntime, run } from 'bellpull';

export interface Git {
  /** `git diff --no-renames -U0 <range>`. */
  readonly diff: (range: string) => Promise<string>;
  /** The file at `ref`, as `git show <ref>:<path>` prints it. */
  readonly show: (ref: string, path: string) => Promise<string>;
}

const git = async (cwd: string, args: readonly string[]): Promise<string> => {
  const result = await run('git', ['-c', 'core.quotePath=false', ...args], { cwd, runtime: ambientRuntime() });
  if (!result.ok) throw new Error(`git ${args.join(' ')} failed: ${result.stderr.trim()}. fix: pass a ref this checkout has (fetch it first in CI)`);
  return result.stdout;
};

export const gitIn = (cwd: string): Git => ({
  diff: (range) => git(cwd, ['diff', '--no-color', '--no-ext-diff', '--no-renames', '-U0', range, '--']),
  show: (ref, path) => git(cwd, ['show', `${ref}:${path}`]),
});
