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
 * git runs through bellpull, the family's process layer.
 */
import { existsSync, lstatSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { ambientRuntime, run } from 'bellpull';

const DAY_MS = 86_400_000;
const MB = 1_048_576;
const SHORT_SHA = 7;
/** Days a clean worktree sits unchanged before a sweep removes it. */
export const DEFAULT_OLDER_THAN_DAYS = 3;
/** Directories the age walk does not enter: installs and build output change without an agent. */
export const SKIP_FOR_AGE: ReadonlySet<string> = new Set(['.git', 'node_modules', '.turbo', '.next', 'dist', 'coverage']);
/** What a hook may set that would point git at another checkout than the one in `cwd`. */
export const HOOK_GIT_VARS: ReadonlySet<string> = new Set(['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE']);

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
  ok: boolean;
  out: string;
  err: string;
}
export type GitRunner = (cwd: string, args: string[]) => Promise<Git>;

/** The environment for git in a worktree: the caller's, less the variables a hook sets. */
export const gitEnv = (env: Readonly<Record<string, string | undefined>>): Record<string, string | undefined> =>
  Object.fromEntries(Object.entries(env).filter(([key]) => !HOOK_GIT_VARS.has(key)));

/** git in `cwd`, read as its own checkout, never as the clone a hook runs for. */
export const runGit: GitRunner = async (cwd, args) => {
  const runtime = ambientRuntime();
  const r = await run('git', args, { cwd, env: gitEnv(runtime.env), runtime });
  return { ok: r.ok, out: r.stdout, err: r.stderr.trim() };
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
  for (const block of porcelain.split('\n\n')) {
    const lines = block.split('\n');
    const field = (key: string): string | undefined => lines.find((l) => l.startsWith(`${key} `))?.slice(key.length + 1);
    const path = field('worktree');
    if (path === undefined) continue;
    out.push({ path, head: field('HEAD') ?? '', branch: field('branch')?.replace('refs/heads/', ''), locked: lines.some((l) => l.split(' ')[0] === 'locked') });
  }
  return out;
}

/** The newest mtime under `dir`, not entering SKIP_FOR_AGE. */
export function newestUnder(dir: string): number {
  let newest = statSync(dir).mtimeMs;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_FOR_AGE.has(entry.name)) continue;
    const full = join(dir, entry.name);
    newest = Math.max(newest, entry.isDirectory() ? newestUnder(full) : lstatSync(full).mtimeMs);
  }
  return newest;
}

/** The bytes of every file under `dir`, installs and build output included; links are not followed. */
export function bytesUnder(dir: string): number {
  let bytes = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    bytes += entry.isDirectory() ? bytesUnder(full) : lstatSync(full).size;
  }
  return bytes;
}

/** Whether two paths are one directory; a path that does not resolve is never the same. */
export function samePath(a: string, b: string): boolean {
  try {
    return realpathSync(a) === realpathSync(b);
  } catch {
    return false;
  }
}

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

const lineCount = (text: string): number => text.split('\n').filter(Boolean).length;

async function inspect(l: Listed, main: boolean, o: Inspect): Promise<Worktree> {
  const current = samePath(l.path, o.top);
  const facts = { ...l, main, current, missing: !existsSync(l.path), dirty: 0, localCommits: 0, idleDays: 0 };
  if (!facts.missing) {
    facts.dirty = lineCount((await o.git(l.path, ['status', '--porcelain'])).out);
    if (l.head !== '') facts.localCommits = Number((await o.git(l.path, ['rev-list', '--count', 'HEAD', '--not', '--remotes'])).out) || 0;
    // The main and the current worktree are never removed: their age is not worth a walk.
    if (!main && !current) facts.idleDays = Math.max(0, (o.now - newestUnder(l.path)) / DAY_MS);
  }
  const sized = o.size && !facts.missing ? { bytes: bytesUnder(l.path) } : {};
  return { ...facts, ...sized, keep: keepReason(facts, o.olderThanDays, o.keepLocalCommits), removed: false };
}

/** `git worktree remove` on each removable worktree, one at a time, then `git worktree prune`; whether the prune ran. */
async function prune(repo: string, worktrees: Worktree[], git: GitRunner): Promise<boolean> {
  for (const w of worktrees.filter((t) => t.keep === undefined)) {
    // eslint-disable-next-line reliability/no-await-in-loop -- each removal takes the clone's worktree lock; run together they would race on it
    const r = await git(repo, ['worktree', 'remove', w.path]);
    w.removed = r.ok;
    if (!r.ok) w.error = r.err;
  }
  return (await git(repo, ['worktree', 'prune'])).ok;
}

export async function sweepWorktrees(repo: string, options: WorktreeOptions = {}): Promise<WorktreeResult> {
  const git = options.git ?? runGit;
  const listed = await git(repo, ['worktree', 'list', '--porcelain']);
  if (!listed.ok) {
    return { repo, worktrees: [], removable: 0, removed: 0, pruned: false, ok: false, error: listed.err || 'git worktree list failed', fix: 'run it inside a git clone, or pass --cwd' };
  }
  const o: Inspect = {
    git,
    top: (await git(repo, ['rev-parse', '--show-toplevel'])).out.trim(),
    now: options.now ?? Date.now(),
    size: options.size === true,
    olderThanDays: options.olderThanDays ?? DEFAULT_OLDER_THAN_DAYS,
    keepLocalCommits: options.keepLocalCommits ?? true,
  };
  const worktrees = await Promise.all(parseWorktrees(listed.out).map((l, index) => inspect(l, index === 0, o)));
  const pruned = options.prune === true && (await prune(repo, worktrees, git));
  const failed = worktrees.filter((w) => w.error !== undefined).map((w) => w.path);
  const result: WorktreeResult = {
    repo,
    worktrees,
    removable: worktrees.filter((w) => w.keep === undefined).length,
    removed: worktrees.filter((w) => w.removed).length,
    pruned,
    ok: failed.length === 0,
  };
  if (failed.length > 0) Object.assign(result, { error: `git refused to remove ${failed.join(', ')}`, fix: 'read the error on each; git keeps what it would lose' });
  return result;
}

const mb = (bytes: number): string => `${Math.round(bytes / MB).toString()} MB`;

function stateOf(w: Worktree): string {
  if (w.removed) return 'removed';
  if (w.error !== undefined) return `refused: ${w.error}`;
  if (w.keep !== undefined) return `kept: ${w.keep}`;
  return 'removable';
}

function tailOf(result: WorktreeResult): string {
  if (result.pruned) return `removed ${String(result.removed)} of ${String(result.removable)} removable`;
  if (result.removable > 0) return `${String(result.removable)} removable: run with --prune`;
  return 'nothing to remove';
}

export function worktreesText(result: WorktreeResult): string {
  if (result.worktrees.length === 0 && result.error !== undefined) return `hookset worktrees: ${result.error}`;
  const sized = result.worktrees.filter((w) => w.bytes !== undefined);
  const total = sized.length > 0 ? `, ${mb(sized.reduce((sum, w) => sum + (w.bytes as number), 0))} in all` : '';
  const head = `hookset worktrees: ${String(result.worktrees.filter((w) => !w.main).length)} linked worktree(s)${total}; ${tailOf(result)}`;
  const lines = result.worktrees.map((w) => {
    const size = w.bytes === undefined ? '' : ` ${mb(w.bytes)}`;
    return `  ${w.path} [${w.branch ?? w.head.slice(0, SHORT_SHA)}]${size} ${stateOf(w)}`;
  });
  return [head, ...lines].join('\n');
}
