import { describe, expect, it } from 'vitest';

import { parseDiff, parseShard, shardOf, touches } from './lanes.js';

describe('the PR lane reads changed lines from git diff -U0', () => {
  const diff = [
    'diff --git a/src/a.ts b/src/a.ts',
    '--- a/src/a.ts',
    '+++ b/src/a.ts',
    '@@ -3 +3 @@',
    '@@ -10,0 +11,2 @@',
    '@@ -20,2 +22,0 @@',
    'diff --git a/src/gone.ts b/src/gone.ts',
    '+++ /dev/null',
    '@@ -1,3 +0,0 @@',
  ].join('\n');
  const ranges = parseDiff(diff);

  it('keeps added and modified ranges on the new side', () => {
    expect(ranges.get('src/a.ts')).toEqual([[3, 3], [11, 12]]);
  });
  it('drops pure deletions and deleted files: nothing there to mutate', () => {
    expect(ranges.has('src/gone.ts')).toBe(false);
  });
  it('a mutant spanning a changed line belongs to the lane; one beside it does not', () => {
    expect(touches(ranges, 'src/a.ts', 12, 14)).toBe(true);
    expect(touches(ranges, 'src/a.ts', 4, 10)).toBe(false);
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
  it('--shard is 1-based i/n and refuses anything else', () => {
    expect(parseShard('2/8')).toEqual({ index: 1, count: 8 });
    expect(() => parseShard('0/8')).toThrow();
    expect(() => parseShard('9/8')).toThrow();
    expect(() => parseShard('two')).toThrow();
  });
});
