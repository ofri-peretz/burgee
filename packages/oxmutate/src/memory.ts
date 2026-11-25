/**
 * Memory: how much a Vitest server holds, how much the machine (or the container) gives the run, and
 * the ceiling past which a warm server is recycled between units (`resources.workerMemoryLimit`).
 *
 * A warm server keeps its Vitest between units, which is most of oxmutate's speed, and a module graph
 * that only grows: each unit leaves the modules it loaded and whatever its mutants leaked behind. On a
 * long run in a container with a memory limit that ends in the kernel's out-of-memory kill of the whole
 * run (exit 137), not of the one server that grew. A server past its ceiling after a unit is closed and
 * the warm spare takes its place, so the memory it held goes back to the machine and no verdict changes:
 * the unit it ran is settled, and the next starts in a fresh Vitest as any replacement does.
 *
 * Pure readers, with the files they read passed in, so a test holds every branch on any OS.
 */
import { readdirSync, readFileSync } from 'node:fs';
import os from 'node:os';

/** Bytes in a kibibyte, as /proc reports `VmRSS`. */
const KIB = 1024;
const MIB = KIB * KIB;
const GIB = MIB * KIB;
const UNITS: Record<string, number> = { b: 1, k: KIB, kb: KIB, m: MIB, mb: MIB, g: GIB, gb: GIB };
/** cgroup v1 reports "no limit" as a number this large or larger (a page-rounded LONG_MAX). */
const V1_UNLIMITED = 2 ** 60;
/** `auto` keeps this share of the memory the run has for its servers; the rest is the coordinator's, the engine's and the page cache's. */
export const AUTO_SHARE = 0.8;
/** The smallest ceiling `auto` or a share gives: below it a server cannot hold one Vitest. */
export const MIN_CEILING = 256 * MIB; // eslint-disable-line conventions/no-magic-numbers -- the floor itself, named by the constant it sets
const PERCENT = 100;

/** `resources.workerMemoryLimit`, as written: off, `auto`, a share (`25%`), or a size (`1.5g`, `800mb`, or a number of MiB). */
export type MemorySetting = 'off' | 'auto' | { share: number } | { bytes: number };

/**
 * Reads the setting. `false`, `0`, `'off'`: off. A number (or a string of one) is MiB. A string is `auto`, a share of the
 * memory the run has (`25%`), or a size with a unit (`b`, `k`, `m`, `g`, with or without `b`).
 * Anything else throws the one line with its fix.
 */
export function memorySetting(raw: unknown): MemorySetting | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (raw === false || raw === 0 || raw === 'off') return 'off';
  if (raw === 'auto') return 'auto';
  // A bare number, written as one or as text (`--worker-memory-limit 800`), is MiB.
  const mib = typeof raw === 'string' && /^\s*\d+(?:\.\d+)?\s*$/u.test(raw) ? Number(raw) : raw;
  if (typeof mib === 'number' && mib > 0) return { bytes: Math.floor(mib * MIB) };
  if (typeof raw === 'string') {
    const share = /^(\d+(?:\.\d+)?)\s*%$/u.exec(raw.trim());
    if (share && Number(share[1]) > 0 && Number(share[1]) <= PERCENT) return { share: Number(share[1]) / PERCENT };
    const size = parseSize(raw);
    if (size !== undefined) return { bytes: size };
  }
  throw new Error(`resources.workerMemoryLimit is 'auto', 'off', a share such as '25%', or a size such as '1.5g' or 800 (MiB), not ${JSON.stringify(raw)}. fix: resources.workerMemoryLimit: 'auto'`);
}

/** A size such as `512m`, `1.5g`, `800mb` or `1048576` (bytes), as Docker's `--memory` takes it; undefined when it is not one. */
export function parseSize(text: string): number | undefined {
  const m = /^(\d+(?:\.\d+)?)\s*([a-z]*)$/iu.exec(text.trim());
  if (!m) return undefined;
  const unit = UNITS[(m[2] ?? '').toLowerCase() || 'b'];
  const n = Number(m[1]);
  return unit === undefined || n <= 0 ? undefined : Math.floor(n * unit);
}

/** A size for a person: `1.5 GiB`, `800 MiB`. */
export function formatBytes(bytes: number): string {
  const mib = bytes / MIB;
  return mib >= KIB ? `${(mib / KIB).toFixed(1)} GiB` : `${String(Math.round(mib))} MiB`;
}

type Read = (file: string) => string;
const readText: Read = (file) => readFileSync(file, 'utf8');

/**
 * The memory limit of the cgroup this process runs in, in bytes, or undefined when there is none (or
 * no cgroup to read, off Linux). v2's `memory.max` (`max` is none), else v1's `memory.limit_in_bytes`.
 * Inside a container started with `--memory`, this is that limit; `os.totalmem()` is the host's.
 */
export function cgroupLimit(read: Read = readText): number | undefined {
  for (const file of ['/sys/fs/cgroup/memory.max', '/sys/fs/cgroup/memory/memory.limit_in_bytes']) {
    let text: string;
    try {
      text = read(file).trim();
    } catch {
      continue;
    }
    if (text === 'max') return undefined;
    const n = Number(text);
    return Number.isFinite(n) && n > 0 && n < V1_UNLIMITED ? n : undefined;
  }
  return undefined;
}

/** The memory the run has: its cgroup's limit, else the machine's. */
export const memoryAvailable = (read: Read = readText, total = os.totalmem()): number => cgroupLimit(read) ?? total;

/**
 * The ceiling in bytes for one server, or undefined for none. `auto` and a share divide the memory the
 * run has across `servers` (the slots and the warm spare); `auto` is on only where the run has a limit
 * of its own (`limited`: inside the container oxmutate starts, or any cgroup with a limit), and is
 * {@link AUTO_SHARE} of it. Unset is `auto`.
 */
export function ceilingOf(setting: MemorySetting | undefined, o: { servers: number; available: number; limited: boolean }): number | undefined {
  const s = setting ?? 'auto';
  if (s === 'off') return undefined;
  if (s === 'auto' && !o.limited) return undefined;
  if (s !== 'auto' && 'bytes' in s) return s.bytes;
  const share = s === 'auto' ? AUTO_SHARE : s.share;
  return Math.max(MIN_CEILING, Math.floor((o.available * share) / Math.max(1, o.servers)));
}

/** `VmRSS` of a `/proc/<pid>/status`, in bytes; 0 when it has none (a zombie). */
export function vmRss(status: string): number {
  const m = /^VmRSS:\s+(\d+)\s+kB/mu.exec(status);
  return m ? Number(m[1]) * KIB : 0;
}

/**
 * The resident memory of a process and every process below it, in bytes: a server and the forks its
 * tests started (a `forks` pool's workers are processes of their own, a `threads` pool's are in the
 * server's). On Linux, from `/proc`; elsewhere, `own` (the server's own `rss`) alone. A process that
 * ends while it is read counts as nothing.
 */
export function treeRss(pid: number, own: number, fs: { read: Read; list: (dir: string) => string[] } = { read: readText, list: (d) => readdirSync(d) }): number {
  const childrenOf = (p: number): number[] => {
    try {
      return fs.list(`/proc/${String(p)}/task`).flatMap((tid) => fs.read(`/proc/${String(p)}/task/${tid}/children`).trim().split(/\s+/u).filter(Boolean).map(Number));
    } catch {
      return [];
    }
  };
  const rssOf = (p: number): number => {
    try {
      return vmRss(fs.read(`/proc/${String(p)}/status`));
    } catch {
      return 0;
    }
  };
  let total = own;
  const seen = new Set([pid]);
  const queue = childrenOf(pid);
  for (let p = queue.shift(); p !== undefined; p = queue.shift()) {
    if (seen.has(p)) continue;
    seen.add(p);
    total += rssOf(p);
    queue.push(...childrenOf(p));
  }
  return total;
}
