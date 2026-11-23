/**
 * @fileoverview Tests for the changed-lines checks.
 *
 * The intent's success criterion is the planted case: a `toBe(3)` changed to
 * `toBeTruthy()` is reported with file and line. The traps: a stronger
 * matcher, a different subject, a `.not` matcher, an unranked matcher, and a
 * snapshot change whose commit message does give a reason.
 */

import { describe, expect, it } from 'vitest';

import { MATCHER_RANK, parseUnifiedDiff, unexplainedSnapshots, weakenedAssertions } from './checks.js';

const DIFF = `diff --git a/src/sum.test.ts b/src/sum.test.ts
index 1111111..2222222 100644
--- a/src/sum.test.ts
+++ b/src/sum.test.ts
@@ -12 +12 @@ describe('sum', () => {
-    expect(sum(1, 2)).toBe(3);
+    expect(sum(1, 2)).toBeTruthy();
@@ -20,2 +20,2 @@
-    expect(a).toEqual({ x: 1 });
-    expect(b).toMatchObject({});
+    expect(a).toStrictEqual({ x: 1 });
+    expect(c).toBeDefined();
diff --git a/src/gone.test.ts b/src/gone.test.ts
deleted file mode 100644
--- a/src/gone.test.ts
+++ /dev/null
@@ -1 +0,0 @@
-    expect(x).toBe(1);
`;

describe('parseUnifiedDiff', () => {
  it('reads files, hunks and line numbers on both sides', () => {
    const files = parseUnifiedDiff(DIFF);
    expect(files.map((f) => f.path)).toEqual(['src/sum.test.ts']);
    const [first, second] = files[0]!.hunks;
    expect(first!.removed).toEqual([{ line: 12, text: '    expect(sum(1, 2)).toBe(3);' }]);
    expect(first!.added).toEqual([{ line: 12, text: '    expect(sum(1, 2)).toBeTruthy();' }]);
    expect(second!.added.map((l) => l.line)).toEqual([20, 21]);
  });

  it("gives a deleted file's hunks to no file, even after another file", () => {
    const diff = `diff --git a/a.ts b/a.ts
--- a/a.ts
+++ b/a.ts
@@ -1 +1 @@
-a
+b
diff --git a/gone.ts b/gone.ts
--- a/gone.ts
+++ /dev/null
@@ -1,2 +0,0 @@
-x
-y
`;
    expect(parseUnifiedDiff(diff)).toEqual([
      {
        path: 'a.ts',
        hunks: [
          {
            removed: [{ line: 1, text: 'a' }],
            added: [{ line: 1, text: 'b' }],
          },
        ],
      },
    ]);
  });

  it('reads a diff with no git headers, and paths with no b/ prefix', () => {
    const diff = `--- a.ts
+++ lib/b/a.ts
@@ -10,12 +10,12 @@
-one
-two
+three
\\ No newline at end of file
--- b.ts
+++ /dev/null
@@ -1 +0,0 @@
-gone
--- c.ts
+++ c.ts
@@ -3 +3 @@
-@@ -9 +9 @@
+kept
`;
    expect(parseUnifiedDiff(diff)).toEqual([
      {
        path: 'lib/b/a.ts',
        hunks: [
          {
            removed: [
              { line: 10, text: 'one' },
              { line: 11, text: 'two' },
            ],
            added: [{ line: 10, text: 'three' }],
          },
        ],
      },
      {
        path: 'c.ts',
        hunks: [
          {
            removed: [{ line: 3, text: '@@ -9 +9 @@' }],
            added: [{ line: 3, text: 'kept' }],
          },
        ],
      },
    ]);
  });

  it('ignores hunks before any file header and context outside hunks', () => {
    expect(parseUnifiedDiff('@@ -1 +1 @@\n-a\n+b\n')).toEqual([]);
    expect(parseUnifiedDiff('+++ b/x.ts\n+stray\n')).toEqual([{ path: 'x.ts', hunks: [] }]);
  });
});

describe('weakenedAssertions', () => {
  it('reports toBe → toBeTruthy on the same subject, with file and line', () => {
    const findings = weakenedAssertions(parseUnifiedDiff(DIFF), '');
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      check: 'weakened-assertion',
      path: 'src/sum.test.ts',
      line: 12,
    });
    expect(findings[0]!.message).toContain('.toBe()');
    expect(findings[0]!.message).toContain('.toBeTruthy()');
  });

  it('does not report a stronger matcher, a new subject, .not, or an unranked matcher', () => {
    const diff = `+++ b/a.test.ts
@@ -1,4 +1,4 @@
-expect(a).toEqual(1);
-expect(b).toBe(1);
-expect(c).toBe(1);
-expect(d).toBe(1);
+expect(a).toBe(1);
+expect(b).not.toBeTruthy();
+expect(c).toHaveLength(1);
+expect(e).toBeTruthy();
`;
    expect(weakenedAssertions(parseUnifiedDiff(diff), '')).toEqual([]);
  });

  it('accepts an Assertion: line in a commit message of the range', () => {
    const files = parseUnifiedDiff(DIFF);
    expect(weakenedAssertions(files, 'test: x\n\nAssertion: sum now returns a branded number\n')).toEqual([]);
    expect(weakenedAssertions(files, 'Assertion:\n')).toHaveLength(1);
  });

  it('ignores whitespace inside the subject', () => {
    const diff = `+++ b/a.test.ts
@@ -1 +1 @@
-expect(sum(1,2)).toEqual(3);
+expect( sum(1, 2) ).toMatchObject(3);
`;
    expect(weakenedAssertions(parseUnifiedDiff(diff), '')).toHaveLength(1);
  });

  it('reads a subject with calls inside it, and skips an expect with no matcher or no closing paren', () => {
    const diff = `+++ b/a.test.ts
@@ -1,3 +1,3 @@
-expect(sum(f(1), 2)).toBe(3);
-expect(ready);
-expect(open(
+expect(sum(f(1), 2)).toBeDefined();
+expect(ready);
+expect(open(
`;
    const findings = weakenedAssertions(parseUnifiedDiff(diff), '');
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain('expect(sum(f(1),2))');
  });

  it('reads spaced matcher calls, and not a matcher that is not chained on the expect', () => {
    const diff = `+++ b/a.test.ts
@@ -1,3 +1,3 @@
-expect(a) . toEqual (1);
-expect(b).toEqual(1);
-const plain = 1;
+expect(a) . toBeTruthy ();
+expect(b), other.toBeTruthy();
+const plainer = 2;
`;
    const findings = weakenedAssertions(parseUnifiedDiff(diff), '');
    expect(findings.map((f) => f.message)).toEqual([
      'Weakened assertion: expect(a) moved from .toEqual() to the weaker .toBeTruthy() in this change. fix: keep the strict matcher and fix the code, or assert the new exact value with .toEqual(). If the looser claim is intended, add an "Assertion: <why>" line to the commit message.',
    ]);
    expect(findings[0]).toEqual({
      check: 'weakened-assertion',
      path: 'a.test.ts',
      line: 1,
      message: findings[0]!.message,
    });
  });

  it('reads every expect on a line, and stops at one that never closes', () => {
    const diff = `+++ b/a.test.ts
@@ -1 +1 @@
-expect(a).toEqual(1); expect(b).toEqual(2); expect(c
+expect(a).toBeTruthy(); expect(b).toBeTruthy(); expect(c
`;
    expect(weakenedAssertions(parseUnifiedDiff(diff), '').map((f) => f.line)).toEqual([1, 1]);
  });

  it('reports toMatchObject → toBeTruthy, one rank down', () => {
    const diff = `+++ b/a.test.ts
@@ -1 +1 @@
-expect(a).toMatchObject({});
+expect(a).toBeTruthy();
`;
    expect(weakenedAssertions(parseUnifiedDiff(diff), '')).toHaveLength(1);
  });

  it('does not report a move between matchers of the same rank', () => {
    const diff = `+++ b/a.test.ts
@@ -1,3 +1,3 @@
-expect(a).toBe(1);
-expect(b).toStrictEqual(1);
-expect(c).toBeTruthy();
+expect(a).toStrictEqual(1);
+expect(b).toBe(1);
+expect(c).toBeDefined();
`;
    expect(weakenedAssertions(parseUnifiedDiff(diff), '')).toEqual([]);
  });

  it('accepts an Assertion: line only at the start of a line, with or without a space', () => {
    const files = parseUnifiedDiff(DIFF);
    expect(weakenedAssertions(files, 'Assertion:looser on purpose\n')).toEqual([]);
    expect(weakenedAssertions(files, 'see Assertion: below\n')).toHaveLength(1);
  });

  it('ranks the documented order', () => {
    expect(MATCHER_RANK['toBe']!).toBeGreaterThan(MATCHER_RANK['toEqual']!);
    expect(MATCHER_RANK['toEqual']!).toBeGreaterThan(MATCHER_RANK['toMatchObject']!);
    expect(MATCHER_RANK['toMatchObject']!).toBeGreaterThan(MATCHER_RANK['toBeTruthy']!);
    expect(MATCHER_RANK['toBeDefined']).toBe(MATCHER_RANK['toBeTruthy']);
  });
});

describe('unexplainedSnapshots', () => {
  const paths = ['src/a.ts', 'src/__snapshots__/a.test.ts.snap', 'x/y.snap'];

  it('reports each changed snapshot when no commit gives a reason', () => {
    const findings = unexplainedSnapshots(paths, 'feat(x): change output\n');
    expect(findings.map((f) => f.path)).toEqual(['src/__snapshots__/a.test.ts.snap', 'x/y.snap']);
    expect(findings[0]).toMatchObject({
      check: 'unexplained-snapshot',
      line: 1,
    });
  });

  it('accepts a Snapshot: line in any commit of the range', () => {
    const messages = 'feat(x): change output\n\nSnapshot: the header now includes the version\n';
    expect(unexplainedSnapshots(paths, messages)).toEqual([]);
  });

  it('says what it found and the fix', () => {
    expect(unexplainedSnapshots(['a.snap'], '')).toEqual([
      {
        check: 'unexplained-snapshot',
        path: 'a.snap',
        line: 1,
        message:
          'Unexplained snapshot update: A snapshot changed and no commit in the range says why the new output is correct. fix: add a "Snapshot: <what changed and why it is right>" line to the commit message, or revert the snapshot and fix the code.',
      },
    ]);
  });

  it('matches .snap only at the end, and __snapshots__ at the root too', () => {
    expect(unexplainedSnapshots(['a.snap.orig', '__snapshots__/a.json', 'my__snapshots__/a.json'], '').map((f) => f.path)).toEqual([
      '__snapshots__/a.json',
    ]);
  });

  it('accepts a Snapshot: line only at the start of a line, with or without a space', () => {
    expect(unexplainedSnapshots(paths, 'Snapshot:new header\n')).toEqual([]);
    expect(unexplainedSnapshots(paths, 'no Snapshot: here\n')).toHaveLength(2);
  });

  it('does not accept an empty Snapshot: line', () => {
    expect(unexplainedSnapshots(paths, 'Snapshot:\n')).toHaveLength(2);
  });
});
