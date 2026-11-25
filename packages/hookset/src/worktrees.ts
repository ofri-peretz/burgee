/**
 * The worktrees agents leave behind: every linked worktree of a clone, what it holds that is not
 * kept anywhere else, and, with `--prune`, the removal of those that hold nothing.
 *
 * Claude Code's `--worktree` and subagent isolation, and any agent that runs `git worktree add`,
 * make a full checkout per task, and nothing removes one when the task ends: each keeps its own
 * build output and `node_modules`. A worktree is removable only when all of these hold, so a sweep
 * never loses work: it is not the main worktree or the one the sweep runs in, it is not locked
 * (`git worktree lock` is how a person or agent says "keep"), `git status` is empty (untracked
 * files count, ignored ones do not), every commit on its HEAD is on a remote, and nothing in it
 * changed for `olderThanDays`. A worktree whose directory is gone is left to `git worktree prune`.
 *
 * The person decides the policy: the age, whether a commit only on this machine keeps a worktree
 * (`keepLocalCommits`, default true), and whether anything is removed at all (`prune`). Removal is
 * `git worktree remove` without `--force`, so git refuses anything it would lose. Branches are kept.
 *
 * Builtins only and erasable syntax only, like core.ts.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DAY_MS = 24 * 60 * 60 * 1000;
const MB = 1024 * 1024;
const SHORT_SHA = 7;
/** Days a clean worktree sits unchanged before a sweep removes it. */
export const DEFAULT_OLDER_THAN_DAYS = 3;
/** Directories the age walk does not enter: installs and build output change without an agent. */
const SKIP_FOR_AGE = new Set(['.git', 'node_modules', '.turbo', '.next', 'dist', 'coverage']);

export interface WorktreeOptions {
  /** Remove the removable worktrees, then `git worktree prune`. */
  prune?: boolean;
  /** Days without a change before a clean worktree is removable (default 3). */
  olderThanDays?: number;
  /** A commit on no remote keeps its worktree (default true). */
  keepLocalCommits?: boolean;
  /** Add each worktree's size on disk, which walks every file. */
  size?: boolean;
  /** The clock, for tests. */
  now?: number;
  /** The git runner, for tests. */
  git?: GitRunner;
}

export interface Worktree {
  path: string;
  branch: string | undefined;
  head: string;
  main: boolean;
  current: boolean;
  locked: boolean;
  /** Its directory is gone: `git worktree prune` drops the record. */
  missing: boolean;
  /** Changed or untracked files, from `git status --porcelain`. */
  dirty: number;
  /** Commits on HEAD that are on no remote. */
  localCommits: number;
  /** Days since the newest file under it (outside installs and build output) changed. */
  idleDays: number;
  bytes?: number;
  /** Why it stays, or undefined when it is removable. */
  keep: string | undefined;
  removed: boolean;
  error?: string;
}

export interface WorktreeResult {
  repo: string;
  worktrees: Worktree[];
  removable: number;
  removed: number;
  /** `git worktree prune` ran. */
  pruned: boolean;
  ok: boolean;
  error?: string;
  fix?: string;
}

export interface Git {
  code: number;
  out: string;
  err: string;
}
export type GitRunner = (cwd: string, args: string[]) => Git;

/**
 * git in `cwd`, without the GIT_DIR, GIT_WORK_TREE and GIT_INDEX_FILE a hook may have set: each
 * worktree is read as its own checkout, never as the clone the hook runs for.
 */
export const runGit: GitRunner = (cwd, args) => {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE'].includes(k)));
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env });
  return { code: r.status === 0 ? 0 : 1, out: r.stdout, err: r.stderr.trim() };
};

interface Listed {
  path: string;
  head: string;
  branch: string | undefined;
  locked: boolean;
}

/** `git worktree list --porcelain`: one block per worktree, the main one first. */
export function parseWorktrees(porcelain: string): Listed[] {
  const out: Listed[] = [];
  for (const block of porcelain.split(/\n\s*\n/)) {
    const lines = block.split('\n').filter(Boolean);
    const path = lines.find((l) => l.startsWith('worktree '))?.slice('worktree '.length);
    if (path === undefined) continue;
    const ref = lines.find((l) => l.startsWith('branch '))?.slice('branch '.length);
    out.push({
      path,
      head: lines.find((l) => l.startsWith('HEAD '))?.slice('HEAD '.length) ?? '',
      branch: ref?.replace(/^refs\/heads\//, ''),
      locked: lines.some((l) => l === 'locked' || l.startsWith('locked ')),
    });
  }
  return out;
}

/** The newest mtime under `dir`, outside SKIP_FOR_AGE, and the bytes of every file when asked. */
export function walk(dir: string, withSize: boolean): { newest: number; bytes: number } {
  let newest = statSync(dir).mtimeMs;
  let bytes = 0;
  const visit = (at: string, counted: boolean): void => {
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      const full = join(at, entry.name);
      const skip = SKIP_FOR_AGE.has(entry.name);
      if (skip && !withSize) continue;
      const stat = lstatSync(full);
      if (counted && !skip) newest = Math.max(newest, stat.mtimeMs);
      if (entry.isDirectory()) visit(full, counted && !skip);
      else if (withSize) bytes += stat.size;
    }
  };
  visit(dir, true);
  return { newest, bytes };
}

const same = (a: string, b: string): boolean => {
  try {
    return realpathSync(a) === realpathSync(b);
  } catch {
    return false;
  }
};

/** Why a worktree stays, or undefined when nothing in it would be lost. */
export function keepReason(w: Omit<Worktree, 'keep' | 'removed'>, olderThanDays: number, keepLocalCommits: boolean): string | undefined {
  if (w.main) return 'the main worktree';
  if (w.current) return 'this sweep runs in it';
  if (w.missing) return 'its directory is gone: `git worktree prune` drops it';
  if (w.locked) return 'locked';
  if (w.dirty > 0) return `${String(w.dirty)} uncommitted file(s)`;
  if (keepLocalCommits && w.localCommits > 0) return `${String(w.localCommits)} commit(s) on no remote`;
  if (w.idleDays < olderThanDays) return `changed ${w.idleDays.toFixed(1)} day(s) ago`;
  return undefined;
}

interface Inspect {
  git: GitRunner;
  top: string;
  now: number;
  size: boolean;
  olderThanDays: number;
  keepLocalCommits: boolean;
}

function inspect(l: Listed, main: boolean, o: Inspect): Worktree {
  const missing = !existsSync(l.path);
  const current = same(l.path, o.top);
  if (missing) {
    const gone = { ...l, main, current, missing, dirty: 0, localCommits: 0, idleDays: 0 };
    return { ...gone, keep: keepReason(gone, o.olderThanDays, o.keepLocalCommits), removed: false };
  }
  // The main and the current worktree are never removed: their age is not worth a walk.
  const seen = o.size || (!main && !current) ? walk(l.path, o.size) : { newest: o.now, bytes: 0 };
  const local = l.head === '' ? '0' : o.git(l.path, ['rev-list', '--count', 'HEAD', '--not', '--remotes']).out;
  const base = {
    ...l,
    main,
    current,
    missing,
    dirty: o.git(l.path, ['status', '--porcelain']).out.split('\n').filter(Boolean).length,
    localCommits: Number(local.trim()) || 0,
    idleDays: Math.max(0, (o.now - seen.newest) / DAY_MS),
    ...(o.size ? { bytes: seen.bytes } : {}),
  };
  return { ...base, keep: keepReason(base, o.olderThanDays, o.keepLocalCommits), removed: false };
}

/** `git worktree remove` on each removable worktree, then `git worktree prune`; whether the prune ran. */
function prune(repo: string, worktrees: Worktree[], git: GitRunner): boolean {
  for (const w of worktrees.filter((t) => t.keep === undefined)) {
    const r = git(repo, ['worktree', 'remove', w.path]);
    if (r.code === 0) w.removed = true;
    else w.error = r.err;
  }
  return git(repo, ['worktree', 'prune']).code === 0;
}

export function sweepWorktrees(repo: string, options: WorktreeOptions = {}): WorktreeResult {
  const git = options.git ?? runGit;
  const listed = git(repo, ['worktree', 'list', '--porcelain']);
  if (listed.code !== 0) {
    return { repo, worktrees: [], removable: 0, removed: 0, pruned: false, ok: false, error: listed.err || 'git worktree list failed', fix: 'run it inside a git clone, or pass --cwd' };
  }
  const o: Inspect = {
    git,
    top: git(repo, ['rev-parse', '--show-toplevel']).out.trim(),
    now: options.now ?? Date.now(),
    size: options.size === true,
    olderThanDays: options.olderThanDays ?? DEFAULT_OLDER_THAN_DAYS,
    keepLocalCommits: options.keepLocalCommits ?? true,
  };
  const worktrees = parseWorktrees(listed.out).map((l, index) => inspect(l, index === 0, o));
  const pruned = options.prune === true && prune(repo, worktrees, git);
  const failed = worktrees.filter((w) => w.error !== undefined);
  return {
    repo,
    worktrees,
    removable: worktrees.filter((w) => w.keep === undefined).length,
    removed: worktrees.filter((w) => w.removed).length,
    pruned,
    ok: failed.length === 0,
    ...(failed.length === 0 ? {} : { error: `git refused to remove ${failed.map((w) => w.path).join(', ')}`, fix: 'read the error on each; git keeps what it would lose' }),
  };
}

const mb = (bytes: number): string => `${(bytes / MB).toFixed(0)} MB`;

function stateOf(w: Worktree): string {
  if (w.removed) return 'removed';
  if (w.error !== undefined) return `refused: ${w.error}`;
  return w.keep === undefined ? 'removable' : `kept: ${w.keep}`;
}

function tailOf(result: WorktreeResult): string {
  if (result.pruned) return `removed ${String(result.removed)} of ${String(result.removable)} removable`;
  return result.removable > 0 ? `${String(result.removable)} removable: run with --prune` : 'nothing to remove';
}

export function worktreesText(result: WorktreeResult): string {
  if (result.error !== undefined && result.worktrees.length === 0) return `hookset worktrees: ${result.error}`;
  const lines = result.worktrees.map((w) => {
    const size = w.bytes === undefined ? '' : ` ${mb(w.bytes)}`;
    return `  ${w.path} [${w.branch ?? w.head.slice(0, SHORT_SHA)}]${size} ${stateOf(w)}`;
  });
  const linked = result.worktrees.filter((w) => !w.main).length;
  const total = result.worktrees.reduce((sum, w) => sum + (w.bytes ?? 0), 0);
  const sized = result.worktrees.some((w) => w.bytes !== undefined) ? `, ${mb(total)} in all` : '';
  return [`hookset worktrees: ${String(linked)} linked worktree(s)${sized}; ${tailOf(result)}`, ...lines].join('\n');
}
