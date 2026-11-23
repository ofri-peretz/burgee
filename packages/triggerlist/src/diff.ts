/**
 * What a diff changed, read from `git diff --no-renames -U0` text: each file with the lines it
 * added (numbered in the new file) and removed (numbered in the old one). A deleted file keeps its
 * old path, so a trigger on that path still fires when the file goes away, and a binary or
 * mode-only change is still a changed file, with no lines.
 */

export interface Line {
  readonly line: number;
  readonly text: string;
}

export interface Changed {
  readonly path: string;
  readonly added: readonly Line[];
  readonly removed: readonly Line[];
}

interface Building {
  path: string;
  readonly added: Line[];
  readonly removed: Line[];
  /** Before the first hunk, where `--- ` and `+++ ` name the file rather than change a line. */
  header: boolean;
}

const HUNK = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;
const GIT = 'diff --git ';

/**
 * `diff --git a/<p> b/<p>`: with `--no-renames` both halves are the same path, deleted and added
 * files included, so this line alone names the file.
 */
const headerPath = (line: string): string => {
  const rest = line.slice(GIT.length);
  const half = (rest.length - ' b/'.length - 'a/'.length) / 2;
  return rest.slice('a/'.length, 'a/'.length + half);
};

export const parseDiff = (diff: string): Changed[] => {
  const files: Building[] = [];
  let current: Building | undefined;
  // Stryker disable next-line NumericLiteral: equivalent, a hunk header sets both before any line is counted
  let oldLine = 0;
  // Stryker disable next-line NumericLiteral: equivalent, as above
  let newLine = 0;
  for (const raw of diff.split('\n')) {
    if (raw.startsWith(GIT)) {
      current = { path: headerPath(raw), added: [], removed: [], header: true };
      files.push(current);
      continue;
    }
    if (current === undefined) continue;
    const hunk = HUNK.exec(raw);
    if (hunk !== null) {
      current.header = false;
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
    } else if (!current.header && raw.startsWith('+')) {
      current.added.push({ line: newLine++, text: raw.slice(1) });
    } else if (!current.header && raw.startsWith('-')) {
      current.removed.push({ line: oldLine++, text: raw.slice(1) });
    }
  }
  return files.map(({ path, added, removed }) => ({ path, added, removed }));
};
