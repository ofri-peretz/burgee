/**
 * The diff `gen --dry-run` prints: one unified hunk per file, from the first line that differs to
 * the last, with no context. It is what `git apply` takes, and enough for a reader or an agent to
 * see what a run would write without a diff algorithm in the package.
 */

// A final newline leaves an empty last line on both sides, where it is part of the common tail.
const linesOf = (text: string): string[] => text.split('\n');

/** A unified diff from `before` (absent: a new file) to `after` (absent: a deleted file). Empty when they are equal. */
export const unifiedDiff = (path: string, before: string | undefined, after: string | undefined): string => {
  if (before === after) return '';
  const old = linesOf(before ?? '');
  const now = linesOf(after ?? '');
  let head = 0;
  // Ends: the two differ, so they differ at some line, or one runs out (`undefined`) before the other.
  while (old[head] === now[head]) head += 1;
  let tail = 0;
  while (tail < old.length - head && tail < now.length - head && old.at(-1 - tail) === now.at(-1 - tail)) tail += 1;
  const removed = old.slice(head, old.length - tail);
  const added = now.slice(head, now.length - tail);
  // A range of no lines starts at the line before it (diff -u).
  const range = (count: number): string => `${String(count === 0 ? head : head + 1)},${String(count)}`;
  return [
    `--- ${before === undefined ? '/dev/null' : `a/${path}`}`,
    `+++ ${after === undefined ? '/dev/null' : `b/${path}`}`,
    `@@ -${range(removed.length)} +${range(added.length)} @@`,
    ...removed.map((line) => `-${line}`),
    ...added.map((line) => `+${line}`),
    '',
  ].join('\n');
};
