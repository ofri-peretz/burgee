import { spawnSync } from 'node:child_process';
import { lstatSync, lutimesSync, mkdirSync, readdirSync, realpathSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { ExitCode } from 'burgee';
import { runBurgee } from 'burgee/testing';
import { beforeAll, describe, expect, it } from 'vitest';

import { scratchDirs } from './__fixtures__/scratch-dir.js';
import { program } from './cli.js';
import {
  bytesUnder,
  DEFAULT_OLDER_THAN_DAYS,
  type Git,
  gitEnv,
  type GitRunner,
  HOOK_GIT_VARS,
  keepReason,
  newestUnder,
  parseWorktrees,
  runGit,
  samePath,
  SKIP_FOR_AGE,
  sweepWorktrees,
  type Worktree,
  type WorktreeResult,
  worktreesText,
} from './worktrees.js';

const made = scratchDirs();
/** A scratch dir by its real path, as git prints it: macOS's temporary directory is behind `/var` -> `/private/var`. */
const scratch = (prefix: string): string => realpathSync(made(prefix));
const DAY = 86_400_000;
const MB = 1_048_576;
const OLD = new Date(Date.UTC(2026, 0, 1));
const OLD_MS = OLD.getTime();

/** git with no inherited GIT_* (a hook's GIT_DIR would point every call at burgee itself). */
function git(cwd: string, ...args: string[]): string {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout;
}

/** Sets every mtime under `dir` (and `dir`) to OLD, links included, children first; in Node, so Windows has it too. */
function age(dir: string): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) age(full);
    else lutimesSync(full, OLD, OLD);
  }
  utimesSync(dir, OLD, OLD);
}

/** A clone with a remote, and one linked worktree per name, each on its own branch from main, all dated OLD. */
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
  writeFileSync(join(repo, '.git', 'info', 'exclude'), 'node_modules/\n');
  const trees: Record<string, string> = {};
  for (const name of names) {
    git(repo, 'worktree', 'add', '-q', '-b', name, join(root, name));
  }
  // Each path as git prints it, which the sweep reports: on Windows `C:/...`, not `join`'s backslashes.
  for (const l of parseWorktrees(git(repo, 'worktree', 'list', '--porcelain'))) if (l.branch !== undefined && names.includes(l.branch)) trees[l.branch] = l.path;
  for (const name of names) age(trees[name] as string);
  return { repo, trees };
}

const at = (days: number): number => OLD_MS + days * DAY;
const by = (r: WorktreeResult, branch: string): Worktree | undefined => r.worktrees.find((w) => w.branch === branch);
const refusing: GitRunner = (cwd, args) => (args[1] === 'remove' ? Promise.resolve({ ok: false, out: '', err: 'contains modified or untracked files' }) : runGit(cwd, args));
const failing =
  (sub: string, answer: Git = { ok: false, out: '', err: '' }): GitRunner =>
  (cwd, args) =>
    args.includes(sub) ? Promise.resolve(answer) : runGit(cwd, args);

describe('parseWorktrees', () => {
  it('reads the main, a branch, a detached head and a lock with or without a reason', () => {
    const listed = parseWorktrees(
      'worktree /r\nHEAD abc\nbranch refs/heads/main\n\nworktree /r/a\nHEAD def\ndetached\nlocked\n\nworktree /r/b\nHEAD 123\nbranch refs/heads/feat/refs/heads/x\nlocked agent busy\n\nnoise\nlockedx\n',
    );
    expect(listed).toEqual([
      { path: '/r', head: 'abc', branch: 'main', locked: false },
      { path: '/r/a', head: 'def', branch: undefined, locked: true },
      { path: '/r/b', head: '123', branch: 'feat/refs/heads/x', locked: true },
    ]);
    expect(parseWorktrees('worktree /bare\nbare\n')).toEqual([{ path: '/bare', head: '', branch: undefined, locked: false }]);
    expect(parseWorktrees('worktree /w\nHEAD h\nlockedx\n')).toEqual([{ path: '/w', head: 'h', branch: undefined, locked: false }]);
  });
});

describe('keepReason', () => {
  const base = { path: '/p', branch: 'b', head: 'h', main: false, current: false, locked: false, missing: false, dirty: 0, localCommits: 0, idleDays: 10 };
  it('names the first thing that keeps a worktree, in order', () => {
    expect(keepReason({ ...base, main: true, current: true }, 3, true)).toBe('the main worktree');
    expect(keepReason({ ...base, current: true, missing: true }, 3, true)).toBe('this sweep runs in it');
    expect(keepReason({ ...base, missing: true, locked: true }, 3, true)).toBe('its directory is gone: `git worktree prune` drops it');
    expect(keepReason({ ...base, locked: true, dirty: 1 }, 3, true)).toBe('locked');
    expect(keepReason({ ...base, dirty: 2, localCommits: 1 }, 3, true)).toBe('2 uncommitted file(s)');
    expect(keepReason({ ...base, dirty: 1 }, 3, true)).toBe('1 uncommitted file(s)');
    expect(keepReason({ ...base, localCommits: 1, idleDays: 0 }, 3, true)).toBe('1 commit(s) on no remote');
    expect(keepReason({ ...base, localCommits: 1 }, 3, false)).toBeUndefined();
    expect(keepReason({ ...base, idleDays: 2.96 }, 3, true)).toBe('changed 3.0 day(s) ago');
    expect(keepReason({ ...base, idleDays: 3 }, 3, true)).toBeUndefined();
    expect(DEFAULT_OLDER_THAN_DAYS).toBe(3);
  });
});

describe('the walks', () => {
  it('dates a tree by its newest file outside installs and build output, at any depth', () => {
    const dir = scratch('hookset-walk-');
    mkdirSync(join(dir, 'src', 'deep'), { recursive: true });
    writeFileSync(join(dir, 'src', 'deep', 'a.ts'), 'abcd');
    for (const skipped of SKIP_FOR_AGE) {
      mkdirSync(join(dir, 'src', skipped));
      writeFileSync(join(dir, 'src', skipped, 'x'), '123456');
    }
    age(dir);
    // Files inside the skipped directories change now; the tree still reads as old.
    for (const skipped of SKIP_FOR_AGE) writeFileSync(join(dir, 'src', skipped, 'x'), '1234567');
    expect([...SKIP_FOR_AGE]).toEqual(['.git', 'node_modules', '.turbo', '.next', 'dist', 'coverage']);
    expect(newestUnder(dir)).toBe(OLD_MS);
    const later = new Date(OLD_MS + DAY);
    utimesSync(join(dir, 'src', 'deep', 'a.ts'), later, later);
    expect(newestUnder(dir)).toBe(OLD_MS + DAY);
  });

  it('dates a tree by its own mtime when that is the newest, and sizes every file, skipped ones too', () => {
    const dir = scratch('hookset-size-');
    mkdirSync(join(dir, 'node_modules', 'p'), { recursive: true });
    writeFileSync(join(dir, 'a'), 'abcd');
    writeFileSync(join(dir, 'node_modules', 'p', 'x'), '123456');
    symlinkSync(join(dir, 'node_modules'), join(dir, 'link'));
    age(dir);
    const own = new Date(OLD_MS + 2 * DAY);
    utimesSync(dir, own, own);
    expect(newestUnder(dir)).toBe(OLD_MS + 2 * DAY);
    // The link counts its own few bytes, not the tree it points at.
    expect(bytesUnder(dir)).toBe(10 + lstatSync(join(dir, 'link')).size);
  });

  it('samePath resolves links and never matches a path that does not exist', () => {
    const dir = scratch('hookset-same-');
    mkdirSync(join(dir, 'real'));
    symlinkSync(join(dir, 'real'), join(dir, 'link'));
    expect(samePath(join(dir, 'link'), join(dir, 'real'))).toBe(true);
    expect(samePath(join(dir, 'nope'), join(dir, 'nope'))).toBe(false);
    expect(samePath(dir, join(dir, 'real'))).toBe(false);
  });
});

describe('git', () => {
  it('drops only the variables a hook sets', () => {
    expect([...HOOK_GIT_VARS]).toEqual(['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE']);
    expect(gitEnv({ GIT_DIR: '/x', GIT_WORK_TREE: '/y', GIT_INDEX_FILE: '/z', GIT_AUTHOR_NAME: 'a', PATH: '/bin' })).toEqual({ GIT_AUTHOR_NAME: 'a', PATH: '/bin' });
  });

  it('runs in cwd with stdout as is and stderr trimmed', async () => {
    const { repo } = clone();
    expect(await runGit(repo, ['rev-parse', '--is-inside-work-tree'])).toEqual({ ok: true, out: 'true\n', err: '' });
    const bad = await runGit(repo, ['rev-parse', 'no-such-ref']);
    expect(bad.ok).toBe(false);
    expect(bad.err).toMatch(/^fatal: ambiguous argument 'no-such-ref'/);
    expect(bad.err).toBe(bad.err.trim());
  });
});

const tree = (over: Partial<Worktree>): Worktree => ({ path: '/w', branch: 'b', head: 'h', main: false, current: false, locked: false, missing: false, dirty: 0, localCommits: 0, idleDays: 9, keep: undefined, removed: false, ...over });
const result = (worktrees: Worktree[], over: Partial<WorktreeResult> = {}): WorktreeResult => ({ repo: '/r', worktrees, removable: 0, removed: 0, pruned: false, ok: true, ...over });

describe('worktreesText', () => {

  it('rounds sizes to whole MB from one byte under the half', () => {
    const text = worktreesText(result([tree({ bytes: 2.5 * MB - 1 })], { removable: 1 }));
    expect(text).toBe('hookset worktrees: 1 linked worktree(s), 2 MB in all; 1 removable: run with --prune\n  /w [b] 2 MB removable');
    expect(worktreesText(result([tree({ bytes: 2.5 * MB })]))).toContain(', 3 MB in all;');
  });

  it('reads an empty list with no error as nothing to remove', () => {
    expect(worktreesText(result([]))).toBe('hookset worktrees: 0 linked worktree(s); nothing to remove');
  });

  it('lists the worktrees under an error when there are any', () => {
    const text = worktreesText(result([tree({ error: 'busy' })], { ok: false, error: 'git refused to remove /w' }));
    expect(text).toBe('hookset worktrees: 1 linked worktree(s); nothing to remove\n  /w [b] refused: busy');
  });
});

describe('sweepWorktrees', () => {
  it('keeps dirty, locked, local-only and fresh worktrees, and removes only the clean idle one', async () => {
    const { repo, trees } = clone('done', 'dirty', 'locked', 'local', 'fresh');
    writeFileSync(join(trees['dirty'] as string, 'new.txt'), 'x');
    writeFileSync(join(trees['dirty'] as string, 'two.txt'), 'x');
    git(repo, 'worktree', 'lock', trees['locked'] as string);
    writeFileSync(join(trees['local'] as string, 'b.txt'), 'b');
    git(trees['local'] as string, 'add', '.');
    git(trees['local'] as string, 'commit', '-qm', 'b');
    age(trees['local'] as string);
    const fresh = new Date(at(4.5));
    utimesSync(join(trees['fresh'] as string, 'a.txt'), fresh, fresh);

    const look = await sweepWorktrees(repo, { now: at(5) });
    expect(look.ok).toBe(true);
    expect(look.error).toBeUndefined();
    expect(look.worktrees[0]).toMatchObject({ main: true, current: true, idleDays: 0, keep: 'the main worktree', removed: false });
    expect(look.worktrees[0]?.bytes).toBeUndefined();
    expect(by(look, 'dirty')).toMatchObject({ dirty: 2, keep: '2 uncommitted file(s)' });
    expect(by(look, 'locked')).toMatchObject({ locked: true, keep: 'locked' });
    expect(by(look, 'local')).toMatchObject({ localCommits: 1, keep: '1 commit(s) on no remote' });
    expect(by(look, 'fresh')).toMatchObject({ idleDays: 0.5, keep: 'changed 0.5 day(s) ago' });
    expect(by(look, 'done')).toMatchObject({ main: false, current: false, dirty: 0, localCommits: 0, idleDays: 5, keep: undefined, removed: false });
    expect(look.removable).toBe(1);
    expect(look.removed).toBe(0);
    expect(look.pruned).toBe(false);
    expect(worktreesText(look).split('\n')[0]).toBe('hookset worktrees: 5 linked worktree(s); 1 removable: run with --prune');
    expect(worktreesText(look)).toContain(`  ${trees['done'] as string} [done] removable`);
    expect(worktreesText(look)).toContain(`  ${trees['dirty'] as string} [dirty] kept: 2 uncommitted file(s)`);

    // A clock before the files changed reads as no age at all, never a negative one.
    expect(by(await sweepWorktrees(repo, { now: at(-1) }), 'done')?.idleDays).toBe(0);

    const swept = await sweepWorktrees(repo, { now: at(5), prune: true });
    expect(swept).toMatchObject({ ok: true, removable: 1, removed: 1, pruned: true });
    expect(by(swept, 'done')).toMatchObject({ removed: true });
    expect(by(swept, 'done')?.error).toBeUndefined();
    expect(by(swept, 'dirty')?.removed).toBe(false);
    expect(worktreesText(swept).split('\n')[0]).toBe('hookset worktrees: 5 linked worktree(s); removed 1 of 1 removable');
    expect(worktreesText(swept)).toContain(`  ${trees['done'] as string} [done] removed`);
    expect(git(repo, 'worktree', 'list')).not.toContain(trees['done']);
    // The branch stays: removing a worktree never deletes a ref.
    expect(git(repo, 'branch', '--list', 'done')).toContain('done');

    const all = await sweepWorktrees(repo, { now: at(5), prune: true, keepLocalCommits: false, olderThanDays: 0 });
    expect(by(all, 'local')?.removed).toBe(true);
    expect(by(all, 'fresh')?.removed).toBe(true);
    expect(by(all, 'dirty')?.removed).toBe(false);
    expect(by(all, 'locked')?.removed).toBe(false);
    expect(worktreesText(await sweepWorktrees(repo, { now: at(5) })).split('\n')[0]).toBe('hookset worktrees: 2 linked worktree(s); nothing to remove');
  });

  it('sizes every worktree, the main one too, and totals them', async () => {
    const { repo, trees } = clone('big');
    mkdirSync(join(trees['big'] as string, 'node_modules'));
    writeFileSync(join(trees['big'] as string, 'node_modules', 'pkg'), Buffer.alloc(3 * MB));
    age(trees['big'] as string);
    const r = await sweepWorktrees(repo, { now: at(5), size: true });
    const main = r.worktrees[0] as Worktree;
    const big = by(r, 'big') as Worktree;
    expect(main.bytes).toBe(bytesUnder(repo));
    expect(big.bytes).toBe(bytesUnder(trees['big'] as string));
    expect(big.bytes).toBeGreaterThan(3 * MB);
    expect(big.idleDays).toBe(5);
    const total = Math.round(((main.bytes as number) + (big.bytes as number)) / MB);
    expect(worktreesText(r).split('\n')[0]).toBe(`hookset worktrees: 1 linked worktree(s), ${String(total)} MB in all; 1 removable: run with --prune`);
    expect(worktreesText(r)).toContain(`  ${trees['big'] as string} [big] 3 MB removable`);
  });

  it('runs from a linked worktree, leaves a missing one to git worktree prune, and reports what git refused', async () => {
    const { repo, trees } = clone('here', 'gone', 'stuck');
    rmSync(trees['gone'] as string, { recursive: true });
    git(trees['stuck'] as string, 'checkout', '-q', '--detach');
    age(trees['stuck'] as string);
    const head = git(trees['stuck'] as string, 'rev-parse', 'HEAD').trim();

    const fromHere = await sweepWorktrees(trees['here'] as string, { now: at(5), size: true });
    expect(by(fromHere, 'here')).toMatchObject({ current: true, main: false, idleDays: 0, keep: 'this sweep runs in it' });
    const gone = fromHere.worktrees.find((w) => w.path === trees['gone']);
    expect(gone).toMatchObject({ missing: true, dirty: 0, localCommits: 0, idleDays: 0, keep: 'its directory is gone: `git worktree prune` drops it' });
    expect(gone?.bytes).toBeUndefined();
    expect(fromHere.worktrees.find((w) => w.path === trees['stuck'])).toMatchObject({ branch: undefined, head, keep: undefined });
    expect(worktreesText(fromHere)).toContain(`  ${trees['stuck'] as string} [${head.slice(0, 7)}] 0 MB removable`);

    const swept = await sweepWorktrees(repo, { now: at(5), prune: true, git: refusing });
    expect(git(repo, 'worktree', 'list')).not.toContain(trees['gone']);
    expect(swept).toMatchObject({
      ok: false,
      removed: 0,
      removable: 2,
      pruned: true,
      error: `git refused to remove ${trees['here'] as string}, ${trees['stuck'] as string}`,
      fix: 'read the error on each; git keeps what it would lose',
    });
    expect(worktreesText(swept)).toContain(`  ${trees['stuck'] as string} [${head.slice(0, 7)}] refused: contains modified or untracked files`);
    expect(worktreesText(swept).split('\n')[0]).toBe('hookset worktrees: 3 linked worktree(s); removed 0 of 2 removable');

    const one: GitRunner = (cwd, args) => (args[1] === 'remove' && args[2] === trees['stuck'] ? Promise.resolve({ ok: false, out: '', err: 'busy' }) : runGit(cwd, args));
    const partly = await sweepWorktrees(trees['here'] as string, { now: at(5), prune: true, git: one });
    expect(partly).toMatchObject({ ok: false, error: `git refused to remove ${trees['stuck'] as string}` });

    const unpruned = await sweepWorktrees(repo, { now: at(5), prune: true, git: failing('prune') });
    expect(unpruned.pruned).toBe(false);
    expect(unpruned.removed).toBe(2);
  });

  it('reads a bare clone, whose main entry has no HEAD, and a failed count as no local commits', async () => {
    const { repo, trees } = clone('w');
    const bare = join(scratch('hookset-bare-'), 'b.git');
    git(repo, 'clone', '-q', '--bare', repo, bare);
    const r = await sweepWorktrees(bare, { now: at(5) });
    expect(r.worktrees).toHaveLength(1);
    expect(r.worktrees[0]).toMatchObject({ main: true, head: '', localCommits: 0, dirty: 0, keep: 'the main worktree' });

    const noCount = await sweepWorktrees(repo, { now: at(5), git: failing('rev-list') });
    expect(noCount.worktrees.find((w) => w.path === trees['w'])).toMatchObject({ localCommits: 0, keep: undefined });
  });

  it("fails outside a clone with git's own message and a fix", async () => {
    const r = await sweepWorktrees(scratch('hookset-nogit-'));
    expect(r).toMatchObject({ ok: false, worktrees: [], removable: 0, removed: 0, pruned: false, fix: 'run it inside a git clone, or pass --cwd' });
    expect(r.error).toMatch(/^fatal: not a git repository/);
    expect(worktreesText(r)).toBe(`hookset worktrees: ${r.error as string}`);
    const quiet = await sweepWorktrees(scratch('hookset-nogit-'), { git: failing('list') });
    expect(quiet.error).toBe('git worktree list failed');
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
    expect(JSON.stringify(list.json)).toContain('"changed":false');
    const kept = await runBurgee(program, { argv: ['worktrees', '--cwd', repo, '--prune', '--older-than', '100000'] });
    expect(kept.stdout).toContain('removed 0 of 0 removable');
    const prune = await runBurgee(program, { argv: ['worktrees', '--cwd', repo, '--prune', '--older-than', '0', '--include-local-commits', '--size', '--json'] });
    expect(prune.code).toBe(ExitCode.OK);
    expect(JSON.stringify(prune.json)).toContain('"removed":1');
    expect(JSON.stringify(prune.json)).toContain('"changed":true');
    const bad = await runBurgee(program, { argv: ['worktrees', '--cwd', repo, '--older-than=-1'] });
    expect(bad.code).toBe(ExitCode.USAGE);
    expect(`${bad.stdout}${bad.stderr}`).toContain('--older-than takes a number of days, not -1');
    const outside = await runBurgee(program, { argv: ['worktrees', '--cwd', scratch('hookset-nogit-')] });
    expect(outside.code).toBe(ExitCode.RUNTIME);
    expect(outside.stdout).toMatch(/^hookset worktrees: fatal: not a git repository/);
  });
});
