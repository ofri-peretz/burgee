/**
 * The CI lanes' selection rules: which mutants a run owns.
 *
 * - `since <ref>` (the PR lane): mutants on lines the change added or modified, from
 *   `git diff -U0 <ref>`, working tree included, so a local run and CI select the same set.
 * - `shard i/n` (a CI matrix): a mutant belongs to shard `fnv(id) mod n`, so a shard's share
 *   does not move when unrelated code changes, and the shards partition the run exactly.
 */
import { ambientRuntime, run } from 'bellpull';

export type LineRanges = Map<string, [number, number][]>;

const NEW_FILE = '+++ ';
/** FNV-1a 32-bit parameters. */
const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** Added or changed line ranges per repository-relative path, new side. */
export async function changedLines(root: string, base: string): Promise<LineRanges> {
  const diff = await run('git', ['diff', '-U0', '--no-color', '--no-ext-diff', base, '--'], { cwd: root, runtime: ambientRuntime() });
  if (!diff.ok) throw new Error(`git diff ${base} failed: ${diff.stderr.trim()}. fix: pass a ref this checkout has (fetch it first in CI)`);
  return parseDiff(diff.stdout);
}

export function parseDiff(diff: string): LineRanges {
  const out: LineRanges = new Map();
  let file: string | undefined;
  for (const line of diff.split('\n')) {
    if (line.startsWith(NEW_FILE)) {
      const p = line.slice(NEW_FILE.length).trim();
      file = p === '/dev/null' ? undefined : p.replace(/^b\//, '');
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (!hunk || !file) continue;
    const start = Number(hunk[1]);
    const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
    if (count === 0) continue; // a pure deletion adds no line to mutate
    // Stryker disable next-line OptionalChaining: the get after a set always finds the list; `?.` is only for the type
    (out.get(file) ?? out.set(file, []).get(file))?.push([start, start + count - 1]);
  }
  return out;
}

export function touches(ranges: LineRanges, file: string, startLine: number, endLine: number): boolean {
  // Stryker disable next-line ArrayDeclaration: a string element destructures to letters, and a number compared with a letter is false, as with no ranges
  return (ranges.get(file) ?? []).some(([a, b]) => startLine <= b && endLine >= a);
}

/** FNV-1a 32 over the stable id: the shard a mutant belongs to. */
export function shardOf(id: string, count: number): number {
  let h = FNV_OFFSET;
  // Ids are hex (`native/src/stable_id.rs`), so a code point is a code unit and the shards are
  // the ones `charCodeAt` gave.
  for (let i = 0; i < id.length; i++) {
    h ^= id.codePointAt(i) ?? 0;
    h = Math.imul(h, FNV_PRIME) >>> 0;
  }
  return h % count;
}

export function parseShard(value: string): { index: number; count: number } {
  const m = /^(\d+)\/(\d+)$/.exec(value);
  const index = Number(m?.[1]);
  const count = Number(m?.[2]);
  // `count < 1` needs no check of its own: with 1 <= index <= count it cannot hold.
  if (!m || index < 1 || index > count) throw new Error(`--shard must be i/n with 1 <= i <= n, got "${value}"`);
  return { index: index - 1, count };
}

/** A Stryker `mutate` range: lines 1-based, columns 0-based and inclusive (`src/a.ts:5:4-6:4`). */
export interface MutateRange {
  start: { line: number; column: number };
  end: { line: number; column: number };
}

/**
 * Stryker's own pattern (`mutate-pattern-constants.js`): `<glob>:<line>[:<col>]-<line>[:<col>]`.
 * No `^`: the lazy glob group can take any prefix, so the leftmost match already starts the string.
 */
const RANGE = /(.*?):((\d+)(?::(\d+))?-(\d+)(?::(\d+))?)$/;

/** A `mutate` entry split into its glob and, when it names one, its range. */
export function parseMutateSpec(spec: string): { glob: string; range?: MutateRange } {
  const m = RANGE.exec(spec);
  if (!m) return { glob: spec };
  // Stryker disable next-line StringLiteral: the glob group always takes part, so its default is never used, and Number('') is 0 as Number('0') is
  const [, glob = '', , startLine, startColumn = '0', endLine, endColumn = String(Number.MAX_SAFE_INTEGER)] = m;
  return { glob, range: { start: { line: Number(startLine), column: Number(startColumn) }, end: { line: Number(endLine), column: Number(endColumn) } } };
}

/**
 * Is the mutant wholly inside the range, as Stryker decides it (`locationIncluded`)? The mutant's
 * columns are the report's, 1-based with the end exclusive; the range's are Stryker's, 0-based.
 */
export function withinRange(range: MutateRange, start: { line: number; column: number }, end: { line: number; column: number }): boolean {
  const from = start.column - 1;
  const to = end.column - 1;
  const startIn = range.start.line < start.line || (range.start.line === start.line && range.start.column <= from);
  const endIn = range.end.line > end.line || (range.end.line === end.line && range.end.column >= to);
  return startIn && endIn;
}
