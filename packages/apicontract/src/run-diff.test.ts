import { describe, expect, it } from 'vitest';

import { unifiedDiff } from './run-diff.js';

describe('unifiedDiff', () => {
  it('is empty when nothing changes', () => {
    expect(unifiedDiff('a.ts', 'x\n', 'x\n')).toBe('');
  });

  it('adds every line of a new file', () => {
    expect(unifiedDiff('a.ts', undefined, 'x\ny\n')).toBe('--- /dev/null\n+++ b/a.ts\n@@ -0,0 +1,2 @@\n+x\n+y\n');
  });

  it('removes every line of a deleted file', () => {
    expect(unifiedDiff('a.ts', 'x\n', undefined)).toBe('--- a/a.ts\n+++ /dev/null\n@@ -1,1 +0,0 @@\n-x\n');
  });

  it('shows only the lines between the first and the last that differ', () => {
    expect(unifiedDiff('a.ts', 'a\nb\nc\nd\n', 'a\nB\nC\nd\n')).toBe('--- a/a.ts\n+++ b/a.ts\n@@ -2,2 +2,2 @@\n-b\n-c\n+B\n+C\n');
  });

  it('counts an insertion from the line before it', () => {
    expect(unifiedDiff('a.ts', 'a\nc\n', 'a\nb\nc\n')).toBe('--- a/a.ts\n+++ b/a.ts\n@@ -1,0 +2,1 @@\n+b\n');
  });

  it('counts a removal from the line before it', () => {
    expect(unifiedDiff('a.ts', 'a\nb\nc\n', 'a\nc\n')).toBe('--- a/a.ts\n+++ b/a.ts\n@@ -2,1 +1,0 @@\n-b\n');
  });

  it('does not count the same line as both a common head and a common tail', () => {
    expect(unifiedDiff('a.ts', 'a\na\n', 'a\na\na\n')).toBe('--- a/a.ts\n+++ b/a.ts\n@@ -2,0 +3,1 @@\n+a\n');
    expect(unifiedDiff('a.ts', 'a\na\na\n', 'a\na\n')).toBe('--- a/a.ts\n+++ b/a.ts\n@@ -3,1 +2,0 @@\n-a\n');
  });

  it('keeps a change in the last line when the file has no final newline', () => {
    expect(unifiedDiff('a.ts', 'a\nb', 'a\nc')).toBe('--- a/a.ts\n+++ b/a.ts\n@@ -2,1 +2,1 @@\n-b\n+c\n');
  });

  it('stops the common tail at the first line from the end that differs', () => {
    expect(unifiedDiff('a.ts', 'x\na\nb\nc\n', 'y\na\nb\nc\n')).toBe('--- a/a.ts\n+++ b/a.ts\n@@ -1,1 +1,1 @@\n-x\n+y\n');
  });

  it('shows a final newline added or removed', () => {
    expect(unifiedDiff('a.ts', 'a', 'a\n')).toBe('--- a/a.ts\n+++ b/a.ts\n@@ -1,0 +2,1 @@\n+\n');
  });

  it('keeps an empty line in the middle', () => {
    expect(unifiedDiff('a.ts', 'a\n\nb\n', 'a\n\nc\n')).toBe('--- a/a.ts\n+++ b/a.ts\n@@ -3,1 +3,1 @@\n-b\n+c\n');
  });

  it('diffs from an empty file', () => {
    expect(unifiedDiff('a.ts', '', 'x\n')).toBe('--- a/a.ts\n+++ b/a.ts\n@@ -0,0 +1,1 @@\n+x\n');
  });
});
