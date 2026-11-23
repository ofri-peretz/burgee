import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ambientRuntime, run } from 'bellpull';
import { describe, expect, it } from 'vitest';

import { scratchDirs } from './__fixtures__/scratch-dir.js';
import { logOf, sh, worktreesIn } from './shell.js';

// From a worktree's pre-push, an inherited GIT_DIR would point `git init` at the real repository.
const withoutGit = (): NodeJS.ProcessEnv => Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));

const git = async (cwd: string, ...args: string[]): Promise<string> => {
  const result = await run('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', ...args], { cwd, runtime: ambientRuntime(), env: withoutGit() });
  if (!result.ok) throw new Error(result.stderr);
  return result.stdout.trim();
};

const scratch = scratchDirs();

describe('sh', () => {
  it('runs a command line in the folder with the extra env, and reports the exit code and output', async () => {
    const dir = scratch('replay-shell-');
    // A file it writes proves the folder: Git Bash on Windows prints $PWD in its own spelling.
    const ran = await sh('printf here > here.txt; printf "%s" "$REPLAY_PR"; echo oops >&2; exit 3', { cwd: dir, env: { REPLAY_PR: '7' } });
    expect(ran).toEqual({ code: 3, stdout: '7', stderr: 'oops\n' });
    expect(readFileSync(join(dir, 'here.txt'), 'utf8')).toBe('here');
  });

  it('gives a command that reads stdin an empty one when there is no input', async () => {
    const ran = await sh('cat; echo done', { cwd: scratch('replay-shell-') });
    expect(ran).toEqual({ code: 0, stdout: 'done\n', stderr: '' });
  });

  it('gives input on stdin through a file it removes afterwards', async () => {
    const dir = scratch('replay-shell-');
    const ran = await sh('cat; printf "|%s" "$REPLAY_INPUT"', { cwd: dir, input: 'the prompt' });
    const [body, file] = ran.stdout.split('|');
    expect(body).toBe('the prompt');
    expect(file).toMatch(/replay-input-.+[/\\]input\.txt$/);
    expect(existsSync(file as string)).toBe(false);
  });
});

// Every git process and every file it writes is slow where an endpoint scanner inspects each new
// file: `git init` with its sample hooks and a worktree checkout took 17 to 22 s each on a starved
// machine, and the single case that did all of it timed out the pre-push suite three times. So
// a repository here has no template files, its commit is empty, and the error paths (which need a
// repository, not a commit) run in a case of their own with their own budget.
describe('worktreesIn and logOf', () => {
  it('adds a detached worktree at a ref, removes it, and reads the log', async () => {
    const repo = scratch('replay-repo-');
    await git(repo, 'init', '-q', '--template=', '-b', 'main');
    await git(repo, 'commit', '-q', '--allow-empty', '-m', 'first (#1)');
    const { dir, remove } = await worktreesIn(repo).add('HEAD');
    expect(existsSync(join(dir, '.git'))).toBe(true);
    await remove();
    expect(existsSync(dir)).toBe(false);
    expect(await logOf(repo, ['log', '--format=%s'])).toBe('first (#1)\n');
  });

  it('says what to do when the ref or the history is not there', async () => {
    const repo = scratch('replay-repo-');
    await git(repo, 'init', '-q', '--template=', '-b', 'main');
    await expect(worktreesIn(repo).add('nope')).rejects.toThrow(/^git worktree add --detach .+ nope failed: fatal: [^\n]+[^\s]\. fix: fetch the commit the case names$/);
    await expect(logOf(repo, ['log', 'nope'])).rejects.toThrow(/^git log nope failed: fatal: [\s\S]+[^\s]\. fix: run it inside a clone with history \(not a shallow one\)$/);
  });
});
