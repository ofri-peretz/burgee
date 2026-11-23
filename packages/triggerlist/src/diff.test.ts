import { describe, expect, it } from 'vitest';

import { parseDiff } from './diff.js';

const MODIFIED = `diff --git a/src/a.ts b/src/a.ts
index 1..2 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -3 +3,2 @@ export const a = 1;
-old three
+new three
+new four
@@ -10,2 +11,0 @@
-ten
--- not a header, a removed line
`;

describe('parseDiff', () => {
  it('numbers added lines in the new file and removed lines in the old one, across hunks', () => {
    expect(parseDiff(MODIFIED)).toEqual([
      {
        path: 'src/a.ts',
        added: [
          { line: 3, text: 'new three' },
          { line: 4, text: 'new four' },
        ],
        removed: [
          { line: 3, text: 'old three' },
          { line: 10, text: 'ten' },
          { line: 11, text: '-- not a header, a removed line' },
        ],
      },
    ]);
  });

  it('keeps the old path of a deleted file', () => {
    const diff = `diff --git a/gone.ts b/gone.ts\ndeleted file mode 100644\n--- a/gone.ts\n+++ /dev/null\n@@ -1 +0,0 @@\n-x\n`;
    expect(parseDiff(diff)).toEqual([{ path: 'gone.ts', added: [], removed: [{ line: 1, text: 'x' }] }]);
  });

  it('takes the new path of an added file', () => {
    const diff = `diff --git a/new.ts b/new.ts\nnew file mode 100644\n--- /dev/null\n+++ b/new.ts\n@@ -0,0 +1 @@\n+y\n`;
    expect(parseDiff(diff)).toEqual([{ path: 'new.ts', added: [{ line: 1, text: 'y' }], removed: [] }]);
  });

  it('keeps a binary or mode-only change as a changed file with no lines, from the git header', () => {
    const diff = `diff --git a/img/a b.png b/img/a b.png\nBinary files a/img/a b.png and b/img/a b.png differ\ndiff --git a/run.sh b/run.sh\nold mode 100644\nnew mode 100755\n`;
    expect(parseDiff(diff)).toEqual([
      { path: 'img/a b.png', added: [], removed: [] },
      { path: 'run.sh', added: [], removed: [] },
    ]);
  });

  it('reads nothing from an empty diff or text before the first file', () => {
    expect(parseDiff('')).toEqual([]);
    expect(parseDiff('+stray\n-stray\n')).toEqual([]);
  });

  it('reads a hunk header without counts and ignores context lines', () => {
    const diff = `diff --git a/a b/a\n--- a/a\n+++ b/a\n@@ -7 +9 @@\n context\n+z\n`;
    expect(parseDiff(diff)[0]?.added).toEqual([{ line: 9, text: 'z' }]);
  });

  it('reads multi-digit counts in a hunk header', () => {
    const diff = `diff --git a/a b/a\n--- a/a\n+++ b/a\n@@ -120,15 +130,16 @@\n-old\n+new\n`;
    expect(parseDiff(diff)[0]).toEqual({ path: 'a', added: [{ line: 130, text: 'new' }], removed: [{ line: 120, text: 'old' }] });
  });

  it('only treats a line as a hunk header at its start', () => {
    const diff = `diff --git a/a b/a\n--- a/a\n+++ b/a\n@@ -1 +1 @@\n+ @@ -5 +5 @@\n+next\n`;
    expect(parseDiff(diff)[0]?.added).toEqual([
      { line: 1, text: ' @@ -5 +5 @@' },
      { line: 2, text: 'next' },
    ]);
  });
});
