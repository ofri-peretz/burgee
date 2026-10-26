/**
 * The CI lanes' selection rules: which mutants a run owns.
 *
 * - `since <ref>` (the PR lane): mutants on lines the change added or modified, from
 *   `git diff -U0 <ref>`, working tree included, so a local run and CI select the same set.
 * - `shard i/n` (a CI matrix): a mutant belongs to shard `fnv(id) mod n`, so a shard's share
 *   does not move when unrelated code changes, and the shards partition the run exactly.
 */
import { execFileSync } from 'node:child_process';

export type LineRanges = Map<string, [number, number][]>;

/** Added or changed line ranges per repository-relative path, new side. */
export function changedLines(root: string, base: string): LineRanges {
  const diff = execFileSync('git', ['diff', '-U0', '--no-color', '--no-ext-diff', base, '--'], { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  return parseDiff(diff);
}

export function parseDiff(diff: string): LineRanges {
  const out: LineRanges = new Map();
  let file: string | undefined;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ ')) {
      const p = line.slice(4).trim();
      file = p === '/dev/null' ? undefined : p.replace(/^b\//, '');
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (hunk && file) {
      const start = Number(hunk[1]);
      const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
      if (count === 0) continue; // a pure deletion adds no line to mutate
      if (!out.has(file)) out.set(file, []);
      out.get(file)?.push([start, start + count - 1]);
    }
  }
  return out;
}

export function touches(ranges: LineRanges, file: string, startLine: number, endLine: number): boolean {
  return (ranges.get(file) ?? []).some(([a, b]) => startLine <= b && endLine >= a);
}

/** FNV-1a 32 over the stable id: the shard a mutant belongs to. */
export function shardOf(id: string, count: number): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % count;
}

export function parseShard(value: string): { index: number; count: number } {
  const m = /^(\d+)\/(\d+)$/.exec(value);
  const index = Number(m?.[1]);
  const count = Number(m?.[2]);
  if (!m || count < 1 || index < 1 || index > count) throw new Error(`--shard must be i/n with 1 <= i <= n, got "${value}"`);
  return { index: index - 1, count };
}
