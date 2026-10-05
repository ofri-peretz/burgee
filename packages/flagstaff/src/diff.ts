/**
 * A unified diff, as a component (controlroom R21): what a coding agent shows before it writes
 * a file. On a terminal every line carries the old and the new line number it stands at,
 * removals are drawn with roundel's `error` token and additions with `ok`, and the `-` and `+`
 * stay at the head of each line, so the diff still reads without colour.
 *
 * **The static projection is the diff unchanged**: the text `git apply` and `patch` take, and
 * what an agent or a reviewer copies. Nothing is renumbered, stripped or wrapped.
 *
 * A hunk is read by its header's counts, not by a line's first character, so a `--- a/file`
 * header after a hunk is a header and not a removal.
 */
import { error, hint, muted, ok } from 'roundel/tokens';

import { type Component } from './plugin.js';

export interface DiffState {
  /** A unified diff, as `git diff` or `diff -u` prints it. */
  diff: string;
}

const HUNK = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

interface Row {
  old: string;
  new: string;
  text: string;
}

/** Every line, with the old and new line number it stands at — blank where it has none. */
function rows(diff: string): Row[] {
  let old = 0;
  let next = 0;
  let oldLeft = 0;
  let newLeft = 0;
  return diff.split('\n').map((line): Row => {
    const mark = line[0];
    if ((oldLeft > 0 || newLeft > 0) && mark !== '\\') {
      // Inside a hunk. A context line an editor stripped to nothing is still a context line.
      // A removal stands only in the old file, an addition only in the new, context in both.
      const inOld = mark !== '+';
      const inNew = mark !== '-';
      const paint = inOld ? error : ok;
      const row = { old: inOld ? String(old) : '', new: inNew ? String(next) : '', text: inOld && inNew ? line : paint(line) };
      old += Number(inOld);
      oldLeft -= Number(inOld);
      next += Number(inNew);
      newLeft -= Number(inNew);
      return row;
    }
    const hunk = HUNK.exec(line);
    if (hunk !== null) {
      [old, oldLeft, next, newLeft] = [Number(hunk[1]), Number(hunk[2] ?? 1), Number(hunk[3]), Number(hunk[4] ?? 1)];
      return { old: '', new: '', text: hint(line) };
    }
    // A file header, `\ No newline at end of file`, or anything between files.
    return { old: '', new: '', text: muted(line) };
  });
}

/** One trailing newline is the diff's own last line ending, not an empty line of it. */
const body = (diff: string): string => (diff.endsWith('\n') ? diff.slice(0, -1) : diff);

/** A unified diff: unchanged off a terminal, numbered and coloured on one. */
export function diff(): Component<DiffState> {
  return {
    name: 'diff',
    static: (state) => body(state.diff),
    frame: (_t, state) => {
      const numbered = rows(body(state.diff));
      const gutter = Math.max(...numbered.map((row) => Math.max(row.old.length, row.new.length)));
      return numbered.map((row) => `${muted(`${row.old.padStart(gutter)} ${row.new.padStart(gutter)} │`)} ${row.text}`).join('\n');
    },
  };
}
