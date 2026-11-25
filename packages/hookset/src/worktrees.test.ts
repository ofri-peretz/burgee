import { spawnSync } from 'node:child_process';
import { mkdirSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { ExitCode } from 'burgee';
import { runBurgee } from 'burgee/testing';
import { beforeAll, describe, expect, it } from 'vitest';

import { scratchDirs } from './__fixtures__/scratch-dir.js';
import { program } from './cli.js';
import { type GitRunner, keepReason, parseWorktrees, runGit, sweepWorktrees, walk, worktreesText } from './worktrees.js';

const scratch = scratchDirs();
const DAY = 24 * 60 * 60 * 1000;

/** git with no inherited GIT_* (a hook's GIT_DIR would point every call at burgee itself). */
function git(cwd: string, ...args: string[]): string {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout;
}

/** A clone with a remote, and one linked worktree per name, each on its own branch from main. */
function clone(...names: string[]): { repo: string; trees: Record<string, string> } {
  const root = scratch('hookset-wt-');
  const origin = join(root, 'origin.git');
  git(root, 'init', '-q', '--bare', '-b', 'main', origin);
  const repo = join(root, 'repo');
  git(root, 'clone', '-q', origin, repo);
  writeFileSync(join(repo, 'a.txt'), 'a');
  git(repo, 'add', '.');
  git(repo, 'commit', '-qm', 'a');
  git(repo, 'push', '-q', 'origin', 'HEAD:main');
  const trees: Record<string, string> = {};
  for (const name of names) {
    trees[name] = join(root, name);
    git(repo, 'worktree', 'add', '-q', '-b', name, trees[name] as string);
  }
  return { repo, trees };
}

const refusing: GitRunner = (cwd, args) => (args[1] === 'remove' ? { code: 128, out: '', err: 'contains modified or untracked files' } : runGit(cwd, args));
const quiet: GitRunner = (cwd, args) => (args[0] === 'worktree' && args[1] === 'list' ? { code: 1, out: '', err: '' } : runGit(cwd, args));
const later = (days: number): number => Date.now() + days * DAY;
const byBranch = (r: ReturnType<typeof sweepWorktrees>, b: string) => r.worktrees.find((w) => w.branch === b);

describe('parseWorktrees', () => {
  it('reads the main, a branch, a detached head and a lock with or without a reason', () => {
    const listed = parseWorktrees('worktree /r\nHEAD abc\nbranch refs/heads/main\n\nworktree /r/a\nHEAD def\ndetached\nlocked\n\nworktree /r/b\nHEAD 123\nbranch refs/heads/b\nlocked agent busy\n\nnoise\n');
    expect(listed).toEqual([
      { path: '/r', head: 'abc', branch: 'main', locked: false },
      { path: '/r/a', head: 'def', branch: undefined, locked: true },
      { path: '/r/b', head: '123', branch: 'b', locked: true },
    ]);
    expect(parseWorktrees('worktree /bare\nbare\n')).toEqual([{ path: '/bare', head: '', branch: undefined, locked: false }]);
  });
});

describe('keepReason', () => {
  const base = { path: '/p', branch: 'b', head: 'h', main: false, current: false, locked: false, missing: false, dirty: 0, localCommits: 0, idleDays: 10 };
  it('names the first thing that keeps a worktree, in order', () => {
    expect(keepReason({ ...base, main: true }, 3, true)).toBe('the main worktree');
    expect(keepReason({ ...base, current: true }, 3, true)).toBe('this sweep runs in it');
    expect(keepReason({ ...base, missing: true }, 3, true)).toMatch(/git worktree prune/);
    expect(keepReason({ ...base, locked: true }, 3, true)).toBe('locked');
    expect(keepReason({ ...base, dirty: 2 }, 3, true)).toBe('2 uncommitted file(s)');
    expect(keepReason({ ...base, localCommits: 1 }, 3, true)).toBe('1 commit(s) on no remote');
    expect(keepReason({ ...base, localCommits: 1 }, 3, false)).toBeUndefined();
    expect(keepReason({ ...base, idleDays: 1 }, 3, true)).toBe('changed 1.0 day(s) ago');
    expect(keepReason({ ...base, idleDays: 3 }, 3, true)).toBeUndefined();
  });
});

describe('walk', () => {
  it('dates a tree by its newest file outside installs, and sizes everything when asked', () => {
    const dir = scratch('hookset-walk-');
    mkdirSync(join(dir, 'src'));
    mkdirSync(join(dir, 'node_modules'));
    writeFileSync(join(dir, 'src', 'a.ts'), 'abcd');
    writeFileSync(join(dir, 'node_modules', 'x.js'), '123456');
    const old = new Date(Date.now() - 10 * DAY);
    utimesSync(join(dir, 'src', 'a.ts'), old, old);
    utimesSync(join(dir, 'src'), old, old);
    utimesSync(dir, old, old);
    const plain = walk(dir, false);
    expect(plain.bytes).toBe(0);
    expect(plain.newest).toBeLessThan(Date.now() - 9 * DAY);
    const sized = walk(dir, true);
    expect(sized.bytes).toBe(10);
    // node_modules changed just now, and still does not make the tree young.
    expect(sized.newest).toBeLessThan(Date.now() - 9 * DAY);
  });
});

describe('sweepWorktrees', () => {
  it('keeps dirty, locked, local-only and fresh worktrees, and removes only the clean idle one', () => {
    const { repo, trees } = clone('done', 'dirty', 'locked', 'local');
    writeFileSync(join(trees['dirty'] as string, 'new.txt'), 'x');
    git(repo, 'worktree', 'lock', trees['locked'] as string);
    writeFileSync(join(trees['local'] as string, 'b.txt'), 'b');
    git(trees['local'] as string, 'add', '.');
    git(trees['local'] as string, 'commit', '-qm', 'b');

    const fresh = sweepWorktrees(repo);
    expect(fresh.removable).toBe(0);
    expect(byBranch(fresh, 'done')?.keep).toMatch(/day\(s\) ago/);

    const look = sweepWorktrees(repo, { now: later(5), size: true });
    expect(look.ok).toBe(true);
    expect(look.worktrees[0]?.keep).toBe('the main worktree');
    expect(look.worktrees[0]?.current).toBe(true);
    expect(look.worktrees[0]?.main).toBe(true);
    expect(byBranch(look, 'dirty')?.keep).toBe('1 uncommitted file(s)');
    expect(byBranch(look, 'locked')?.keep).toBe('locked');
    expect(byBranch(look, 'local')?.keep).toBe('1 commit(s) on no remote');
    expect(byBranch(look, 'done')?.keep).toBeUndefined();
    expect(byBranch(look, 'done')?.bytes).toBeGreaterThan(0);
    expect(look.removable).toBe(1);
    expect(look.removed).toBe(0);
    expect(worktreesText(look)).toMatch(/4 linked worktree\(s\), \d+ MB in all; 1 removable: run with --prune/);

    const swept = sweepWorktrees(repo, { now: later(5), prune: true });
    expect(swept.removed).toBe(1);
    expect(swept.pruned).toBe(true);
    expect(byBranch(swept, 'done')?.removed).toBe(true);
    expect(worktreesText(swept)).toContain('removed 1 of 1 removable');
    expect(git(repo, 'worktree', 'list')).not.toContain(trees['done']);
    // The branch stays: removing a worktree never deletes a ref.
    expect(git(repo, 'branch', '--list', 'done')).toContain('done');

    const all = sweepWorktrees(repo, { now: later(5), prune: true, keepLocalCommits: false });
    expect(byBranch(all, 'local')?.removed).toBe(true);
    expect(byBranch(all, 'dirty')?.removed).toBe(false);
  });

  it('runs from a linked worktree, leaves a missing one to git worktree prune, and reports what git refused', () => {
    const { repo, trees } = clone('here', 'gone', 'stuck');
    spawnSync('rm', ['-rf', trees['gone'] as string]);
    git(trees['stuck'] as string, 'checkout', '-q', '--detach');
    const fromHere = sweepWorktrees(trees['here'] as string, { now: later(5) });
    expect(byBranch(fromHere, 'here')?.keep).toBe('this sweep runs in it');
    const gone = fromHere.worktrees.find((w) => w.path === trees['gone']);
    expect(gone?.missing).toBe(true);
    expect(gone?.keep).toMatch(/git worktree prune/);
    expect(worktreesText(fromHere)).toContain('[here]');

    const stuck = fromHere.worktrees.find((w) => w.path === trees['stuck']);
    expect(stuck?.branch).toBeUndefined();
    expect(worktreesText(fromHere)).toMatch(/\[[0-9a-f]{7}\]/);

    // git refusing a removal (a file it would lose that status does not show) is reported, not forced.
    const swept = sweepWorktrees(repo, { now: later(5), prune: true, git: refusing });
    expect(git(repo, 'worktree', 'list')).not.toContain(trees['gone']);
    expect(swept.ok).toBe(false);
    expect(swept.error).toBe(`git refused to remove ${trees['here'] as string}, ${trees['stuck'] as string}`);
    expect(worktreesText(swept)).toContain('refused: contains modified');
    expect(sweepWorktrees(repo, { git: quiet }).error).toBe('git worktree list failed');
  });

  it('reads a bare clone, whose main entry has no HEAD, as the main worktree', () => {
    const { repo } = clone();
    const bare = join(scratch('hookset-bare-'), 'b.git');
    git(repo, 'clone', '-q', '--bare', repo, bare);
    const r = sweepWorktrees(bare, { now: later(5) });
    expect(r.worktrees[0]).toMatchObject({ main: true, head: '', localCommits: 0, keep: 'the main worktree' });
  });

  it('fails outside a clone with a fix', () => {
    const r = sweepWorktrees(scratch('hookset-nogit-'));
    expect(r.ok).toBe(false);
    expect(r.fix).toMatch(/--cwd/);
    expect(worktreesText(r)).toMatch(/^hookset worktrees: /);
    const { error: _ignored, ...withoutError } = r;
    expect(worktreesText(withoutError)).toMatch(/0 linked worktree\(s\); nothing to remove/);
  });
});

describe('hookset worktrees', () => {
  beforeAll(async () => {
    await runBurgee(program, { argv: ['--version'] });
  });

  it('lists as data, prunes on --prune, and refuses a negative age', async () => {
    const { repo } = clone('one');
    const list = await runBurgee(program, { argv: ['worktrees', '--cwd', repo, '--json'] });
    expect(list.code).toBe(ExitCode.OK);
    expect(JSON.stringify(list.json)).toContain('"branch":"one"');
    const prune = await runBurgee(program, { argv: ['worktrees', '--cwd', repo, '--prune', '--older-than', '0', '--include-local-commits', '--size'] });
    expect(prune.code).toBe(ExitCode.OK);
    expect(prune.stdout).toContain('removed 1 of 1 removable');
    const bad = await runBurgee(program, { argv: ['worktrees', '--cwd', repo, '--older-than', '-1'] });
    expect(bad.code).toBe(ExitCode.USAGE);
    const outside = await runBurgee(program, { argv: ['worktrees', '--cwd', scratch('hookset-nogit-')] });
    expect(outside.code).toBe(ExitCode.RUNTIME);
  });
});
