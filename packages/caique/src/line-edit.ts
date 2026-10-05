/**
 * The line editing caique's prompts share: insert, delete, backspace, the cursor moves and
 * Ctrl-U on one line of typed text, and moving the cursor between the rows of a multi-line one.
 *
 * It was two private functions — `edit()` in `clack-core.ts` and `moveTextCursor()` in
 * `clack-prompts.ts` — until `caique/editor` needed the same behaviour (controlroom R20). It
 * lives here so there is one editor in the package rather than two that agree by inspection:
 * `caique/clack`'s prompts and the component a screen hosts edit text with the same code.
 *
 * Pure: a line and a key in, the line changed in place. No stream, no terminal, no `process`.
 */

/** The editing half of a key press — node's report, or `caique/keys`' `KeyPress`. */
export interface EditKey {
  name?: string | undefined;
  ctrl?: boolean | undefined;
  meta?: boolean | undefined;
}

/** A line being typed, and where in it the cursor sits. */
export interface Line {
  userInput: string;
  cursor: number;
}

/** Keys the line editor never inserts, whatever their `char` says. */
const NOT_TYPED = new Set(['return', 'enter', 'escape', 'tab', 'up', 'down']);

/** Whether a key is text to insert rather than a command: printable, and no modifier held. */
const printable = (char: string | undefined, key: EditKey): char is string =>
  key.ctrl !== true && key.meta !== true && char !== undefined && char !== '' && !NOT_TYPED.has(key.name ?? '') && char >= ' ';

/** Where a key that only moves the cursor puts it, or `undefined` for any other key. */
function moved(name: string | undefined, cursor: number, length: number): number | undefined {
  switch (name) {
    case 'left':
      return Math.max(0, cursor - 1);
    case 'right':
      return Math.min(length, cursor + 1);
    case 'home':
      return 0;
    case 'end':
      return length;
    default:
      return undefined;
  }
}

/** One key's edit to the typed line: insert, delete, move. What `readline` does for clack. Says whether the text changed. */
export function edit(line: Line, char: string | undefined, key: EditKey): boolean {
  const { userInput: text, cursor } = line;
  const set = (next: string, at: number): boolean => {
    line.userInput = next;
    line.cursor = at;
    return true;
  };
  const at = moved(key.name, cursor, text.length);
  if (at !== undefined) {
    line.cursor = at;
    return false;
  }
  if (key.name === 'backspace') return cursor > 0 && set(text.slice(0, cursor - 1) + text.slice(cursor), cursor - 1);
  if (key.name === 'delete') return cursor < text.length && set(text.slice(0, cursor) + text.slice(cursor + 1), cursor);
  if (key.ctrl === true && key.name === 'u') return set(text.slice(cursor), 0);
  return printable(char, key) && set(text.slice(0, cursor) + char + text.slice(cursor), cursor + char.length);
}

/** Move a text cursor by columns and rows through a multi-line string, as clack's editor does. */
export function moveTextCursor(at: number, dy: number, value: string): number {
  const rows = value.split('\n');
  let row = 0;
  let column = at;
  for (const line of rows) {
    if (column <= line.length) break;
    column -= line.length + 1;
    row++;
  }
  row = Math.max(0, Math.min(rows.length - 1, row + dy));
  column = Math.min(column, (rows[row] as string).length);
  return rows.slice(0, row).reduce((total, line) => total + line.length + 1, 0) + column;
}
