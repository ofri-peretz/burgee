/**
 * The one way truemark asks git anything: a subprocess through bellpull, in the directory the
 * command runs in, that throws with git's own words when git says no.
 */
import { ambientRuntime, run } from 'bellpull';

/** Runs `git <args>` and returns its stdout; rejects with git's stderr when it exits non-zero. */
export type Git = (args: readonly string[]) => Promise<string>;

export const git: Git = async (args) => {
  const result = await run('git', args, { runtime: ambientRuntime() });
  if (!result.ok) throw new Error(`git ${args.join(' ')} failed: ${result.stderr.trim()}`);
  return result.stdout;
};
