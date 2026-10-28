import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { changedLines, type MutateRange, parseDiff, parseMutateSpec, parseShard, shardOf, touches, withinRange } from './lanes.js';

describe('the PR lane reads changed lines from git diff -U0', () => {
  const diff = [
    'diff --git a/src/a.ts b/src/a.ts',
    '--- a/src/a.ts',
    '+++ b/src/a.ts',
    '@@ -3 +3 @@',
    '-old',
    '+new',
    '@@ -10,0 +11,2 @@',
    '+// @@ -1 +90 @@ is content, not a hunk',
    '+x',
    '@@ -20,2 +22,0 @@',
    'diff --git a/src/gone.ts b/src/gone.ts',
    '+++ /dev/null',
    '@@ -1,3 +0,0 @@',
  ].join('\n');

  it('keeps added and modified ranges on the new side', () => {
    expect(parseDiff(diff).get('src/a.ts')).toEqual([[3, 3], [11, 12]]);
  });
  it('drops pure deletions and deleted files: nothing there to mutate', () => {
    expect(parseDiff(diff).has('src/gone.ts')).toBe(false);
    expect([...parseDiff(diff).keys()]).toEqual(['src/a.ts']);
  });
  it('never reports /dev/null as a path, whatever hunk follows it', () => {
    expect([...parseDiff('+++ /dev/null\n@@ -1 +1 @@').keys()]).toEqual([]);
  });
  it('reads counts of more than one digit on both sides', () => {
    expect(parseDiff('+++ b/a.ts\n@@ -100,12 +200,15 @@').get('a.ts')).toEqual([[200, 214]]);
  });
  it('strips only the b/ prefix, and keeps paths under diff.noprefix whole', () => {
    expect([...parseDiff('+++ b/lib/b/x.ts\n@@ -1 +1 @@').keys()]).toEqual(['lib/b/x.ts']);
    expect([...parseDiff('+++ lib/b/x.ts\n@@ -1 +1 @@').keys()]).toEqual(['lib/b/x.ts']);
  });
  it('trims the tab git writes after a path with a space', () => {
    expect([...parseDiff('+++ b/a b.ts\t\n@@ -1 +1 @@').keys()]).toEqual(['a b.ts']);
  });
  it('a mutant spanning a changed line belongs to the lane; one beside it does not', () => {
    const ranges = parseDiff(diff);
    expect(touches(ranges, 'src/a.ts', 12, 14)).toBe(true);
    expect(touches(ranges, 'src/a.ts', 1, 3)).toBe(true);
    expect(touches(ranges, 'src/a.ts', 4, 10)).toBe(false);
    expect(touches(ranges, 'src/other.ts', 1, 100)).toBe(false);
  });
});

describe('changedLines runs git diff against a ref', () => {
  const repo = mkdtempSync(path.join(tmpdir(), 'oxmutate-lanes-'));
  afterAll(() => rmSync(repo, { recursive: true, force: true }));
  const git = (...args: string[]): string => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], { cwd: repo, encoding: 'utf8' });
  git('init', '-q');
  writeFileSync(path.join(repo, 'a.ts'), 'one\ntwo\nthree\n');
  git('add', '.');
  git('commit', '-qm', 'base');

  it('includes the working tree, so a local run selects what CI selects', async () => {
    writeFileSync(path.join(repo, 'a.ts'), 'one\nTWO\nthree\nfour\n');
    expect(await changedLines(repo, 'HEAD')).toEqual(new Map([['a.ts', [[2, 2], [4, 4]]]]));
  });
  it('names the ref and what to do when git cannot diff against it', async () => {
    // git's message is trimmed: the sentence goes straight on to the fix.
    await expect(changedLines(repo, 'no-such-ref')).rejects.toThrow(/^git diff no-such-ref failed: fatal: .*no-such-ref.*\S\. fix: pass a ref this checkout has \(fetch it first in CI\)$/s);
  });
});

describe('shards partition the run exactly and stably', () => {
  const ids = Array.from({ length: 2000 }, (_, i) => i.toString(16).padStart(16, '0'));

  it('every mutant lands in exactly one of n shards', () => {
    const seen = new Map<string, number>();
    for (let s = 0; s < 8; s++) for (const id of ids) if (shardOf(id, 8) === s) seen.set(id, (seen.get(id) ?? 0) + 1);
    expect(seen.size).toBe(ids.length);
    expect([...seen.values()].every((n) => n === 1)).toBe(true);
  });
  it('shards are balanced within 20% of the mean (metric C3)', () => {
    const counts = Array.from({ length: 8 }, (_, s) => ids.filter((id) => shardOf(id, 8) === s).length);
    expect(Math.max(...counts) / (ids.length / 8)).toBeLessThan(1.2);
  });
  it('is FNV-1a 32, so a shard never moves between releases', () => {
    // The published FNV-1a test vectors; a modulus of 2^32 leaves the hash itself.
    expect(shardOf('', 2 ** 32)).toBe(0x811c9dc5);
    expect(shardOf('a', 2 ** 32)).toBe(0xe40c292c);
    expect(shardOf('foobar', 2 ** 32)).toBe(0xbf9cf968);
  });
  it('--shard is 1-based i/n and refuses anything else', () => {
    expect(parseShard('2/8')).toEqual({ index: 1, count: 8 });
    expect(parseShard('1/1')).toEqual({ index: 0, count: 1 });
    expect(parseShard('8/8')).toEqual({ index: 7, count: 8 });
    expect(parseShard('12/16')).toEqual({ index: 11, count: 16 });
    for (const bad of ['0/8', '9/8', '1/0', 'two', '2/8x', 'x2/8']) expect(() => parseShard(bad)).toThrow(`--shard must be i/n with 1 <= i <= n, got "${bad}"`);
  });
});

const at = (line: number, column: number): { line: number; column: number } => ({ line, column });

describe("Stryker's mutate ranges", () => {
  it('splits a glob from its range, columns defaulting to the whole line as Stryker does', () => {
    expect(parseMutateSpec('src/**/*.ts')).toEqual({ glob: 'src/**/*.ts' });
    expect(parseMutateSpec('src/a.ts:5-10')).toEqual({ glob: 'src/a.ts', range: { start: { line: 5, column: 0 }, end: { line: 10, column: Number.MAX_SAFE_INTEGER } } });
    expect(parseMutateSpec('src/a.ts:5:4-6:9')).toEqual({ glob: 'src/a.ts', range: { start: { line: 5, column: 4 }, end: { line: 6, column: 9 } } });
    expect(parseMutateSpec('C:/w/a.ts:12-13').glob).toBe('C:/w/a.ts');
  });

  // Report columns are 1-based with the end exclusive; a range's are Stryker's, 0-based inclusive.
  it('takes a mutant wholly inside the range, and nothing that crosses either edge', () => {
    const lines = parseMutateSpec('a.ts:5-6').range as MutateRange;
    expect(withinRange(lines, at(5, 1), at(6, 30))).toBe(true);
    expect(withinRange(lines, at(4, 9), at(5, 3))).toBe(false);
    expect(withinRange(lines, at(6, 1), at(7, 2))).toBe(false);
    const cols = parseMutateSpec('a.ts:5:4-5:9').range as MutateRange;
    expect(withinRange(cols, at(5, 5), at(5, 10))).toBe(true); // columns 4..9, both included
    expect(withinRange(cols, at(5, 4), at(5, 10))).toBe(false); // starts at column 3
    expect(withinRange(cols, at(5, 5), at(5, 11))).toBe(false); // ends at column 10
  });
});
