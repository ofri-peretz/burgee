/**
 * Writes a mutant makes outside its sandbox: caught after the unit that made them, put back, and
 * traced to the mutant (staged spec oxmutate-load-robust, L6; gap A-20261101-oxmutate-disk-pollution-restart).
 *
 * The canary (runner.ts) sees state a mutant leaves in memory. A file a mutant writes into the project
 * survives every restart: on 2026-11-02 a compat-oracle mutant emptied `` `${live}.vendoring` `` to
 * `""`, the vendor step wrote a fake host's `package.json` over the package's own and copied its
 * `test/` in, and every later mutant ran against a broken package for four hours (#1453).
 *
 * The guard takes the project's tracked files (content, size, mtime) and the directories that hold them
 * before the run. After each unit it re-reads sizes and mtimes, and lists those directories for
 * entries that were not there and git does not ignore. Anything changed is written back from the
 * snapshot, anything new is removed, and the unit's verdicts are dropped and re-run in halves until
 * the one mutant that writes is alone (coordinator.ts). Ignored paths (scratch a suite keeps under
 * its package, `.grade-*` in compat-oracle) are the suite's own business and never touched.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { ambientRuntime, run } from 'bellpull';

/** Above this much tracked content the guard only reports changes; it does not keep copies to restore. */
export const MAX_SNAPSHOT_BYTES = 64 * 1024 * 1024;

interface Tracked {
  size: number;
  mtimeMs: number;
  content?: Buffer;
}

/** What one check found, relative to the project root. */
export interface DiskChange {
  /** Tracked files whose size or mtime moved. */
  changed: string[];
  /** Entries that appeared and git does not ignore. */
  added: string[];
  /** Tracked files that are gone. */
  removed: string[];
}

export const isClean = (c: DiskChange): boolean => c.changed.length + c.added.length + c.removed.length === 0;

export interface DiskGuard {
  check(): Promise<DiskChange>;
  /** Put a change back: tracked files rewritten from the snapshot, added entries removed. Returns whether all of it could be. */
  restore(change: DiskChange): boolean;
}

/** `git` in `cwd` through bellpull, the layer that owns spawning: its stdout, or undefined when it failed. */
async function git(cwd: string, args: string[]): Promise<string | undefined> {
  const r = await run('git', args, { cwd, runtime: ambientRuntime() }).catch(() => undefined);
  return r?.ok ? r.stdout : undefined;
}

/** The guard for `root`, or undefined when `root` is not inside a git work tree (nothing says what is tracked). */
export async function guardDisk(root: string, maxSnapshotBytes = MAX_SNAPSHOT_BYTES, stillThere: (abs: string) => boolean = existsSync): Promise<DiskGuard | undefined> {
  const listed = await git(root, ['ls-files', '-z', '--cached', '--', '.']);
  if (listed === undefined) return undefined;
  // Stryker disable next-line MethodExpression: an empty name joins to `root` itself, a directory, which the isFile check below skips
  const files = listed.split('\0').filter(Boolean);
  const tracked = new Map<string, Tracked>();
  let bytes = 0;
  for (const rel of files) {
    const abs = path.join(root, rel);
    if (!existsSync(abs)) continue;
    const st = statSync(abs);
    if (!st.isFile()) continue;
    bytes += st.size;
    tracked.set(rel, { size: st.size, mtimeMs: st.mtimeMs });
  }
  const restorable = bytes <= maxSnapshotBytes;
  // Stryker disable next-line ConditionalExpression: copies past the limit only cost memory; restore() refuses past it either way
  if (restorable) for (const [rel, t] of tracked) t.content = readFileSync(path.join(root, rel));
  // The directories that hold tracked files, and what each held at the start.
  const dirs = new Map<string, Set<string>>();
  for (const rel of tracked.keys()) {
    const dir = path.dirname(rel);
    // Stryker disable next-line ConditionalExpression: reading a directory again in the same moment gives the same set
    if (!dirs.has(dir)) dirs.set(dir, new Set(readdirSync(path.join(root, dir))));
  }
  // Git's answer per path, kept: ignored scratch a suite leaves behind (compat-oracle's `.grade-*`)
  // would otherwise cost a `git` process after every unit.
  const knownIgnored = new Map<string, boolean>();
  const ignored = async (rels: string[]): Promise<Set<string>> => {
    // Stryker disable next-line MethodExpression,ConditionalExpression: asking git again, or with no paths, gives the same answers; the cache only saves processes
    const ask = rels.filter((rel) => !knownIgnored.has(rel));
    // Stryker disable next-line ConditionalExpression: `git check-ignore --` with no paths answers nothing, as skipping it does
    if (ask.length) {
      // check-ignore prints each ignored path on a line and exits 1 when none is: that is an answer,
      // read from stdout either way. (`-z` needs `--stdin`, which bellpull's run does not feed.)
      const r = await run('git', ['check-ignore', '--', ...ask], { cwd: root, runtime: ambientRuntime() }).catch(() => undefined);
      // Stryker disable next-line OptionalChaining,StringLiteral,MethodExpression: `r` is missing only when git cannot be spawned at all, which listing the files ruled out; an empty line is never a path asked about
      const yes = new Set((r?.stdout ?? '').split('\n').filter(Boolean));
      for (const rel of ask) knownIgnored.set(rel, yes.has(rel));
    }
    return new Set(rels.filter((rel) => knownIgnored.get(rel)));
  };
  return {
    async check(): Promise<DiskChange> {
      const changed: string[] = [];
      const removed: string[] = [];
      for (const [rel, t] of tracked) {
        const abs = path.join(root, rel);
        if (!existsSync(abs)) {
          removed.push(rel);
          continue;
        }
        const st = statSync(abs);
        if (st.size !== t.size || st.mtimeMs !== t.mtimeMs) changed.push(rel);
      }
      const fresh: string[] = [];
      for (const [dir, before] of dirs) {
        const abs = path.join(root, dir);
        if (!existsSync(abs)) continue;
        for (const name of readdirSync(abs)) if (!before.has(name)) fresh.push(path.join(dir, name));
      }
      const skip = await ignored(fresh);
      // An entry already gone again is a running test's scratch, removed by that test: nothing is
      // left to put back and nothing a later unit can read. Git also cannot say a path that no
      // longer exists is ignored by a directory rule (`scratch-*/`), so it would read as a write.
      return { changed, added: fresh.filter((rel) => !skip.has(rel) && stillThere(path.join(root, rel))), removed };
    },
    restore(change: DiskChange): boolean {
      if (!restorable) return false;
      for (const rel of [...change.changed, ...change.removed]) {
        const t = tracked.get(rel);
        if (!t?.content) return false;
        // A mutant may have removed the directory too.
        mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
        writeFileSync(path.join(root, rel), t.content);
        // The restored copy is the new baseline: same bytes, a new mtime.
        const st = statSync(path.join(root, rel));
        t.mtimeMs = st.mtimeMs;
        t.size = st.size;
      }
      for (const rel of change.added) rmSync(path.join(root, rel), { recursive: true, force: true });
      return true;
    },
  };
}
