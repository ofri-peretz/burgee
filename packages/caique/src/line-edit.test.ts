/**
 * The line editor every typed prompt shares, driven directly: a line and a key in, the line and
 * whether its text changed out. `clack-engine.test.ts` drives the same code through a prompt;
 * these are the keys a prompt never sends on its own — a modifier held over a printable
 * character, a command key that carries one — where an editor that inserted would be wrong.
 */
import { describe, expect, it } from 'vitest';

import { edit, type EditKey, moveTextCursor } from './line-edit.js';

/** `text` with the cursor at `cursor`, edited by one key: the line after, and whether its text changed. */
/** One row: a label, the line and its cursor, the key's character and description, and what should follow. */
type Row = [label: string, text: string, cursor: number, char: string | undefined, key: EditKey, expected: [string, number, boolean]];

/** The line a row's key leaves, its cursor, and whether its text changed. */
function after([, text, cursor, char, key]: Row): [string, number, boolean] {
  const line = { userInput: text, cursor };
  const changed = edit(line, char, key);
  return [line.userInput, line.cursor, changed];
}

describe('edit', () => {
  it.each<Row>([
    ['types a character at the cursor', 'ac', 1, 'b', { name: 'b' }, ['abc', 2, true]],
    ['types a character with no key name', 'a', 1, 'é', {}, ['aé', 2, true]],
    ['types a space', 'a', 1, ' ', { name: 'space' }, ['a ', 2, true]],
    ['types the letter u', 'a', 1, 'u', { name: 'u' }, ['au', 2, true]],
    ['types nothing with ctrl held', 'a', 1, 'b', { name: 'b', ctrl: true }, ['a', 1, false]],
    ['types nothing with meta held', 'a', 1, 'b', { name: 'b', meta: true }, ['a', 1, false]],
    ['types nothing for a key with no character', 'a', 1, undefined, { name: 'b' }, ['a', 1, false]],
    ['types nothing for an empty character', 'a', 1, '', { name: 'b' }, ['a', 1, false]],
    ['types nothing for a control character', 'a', 1, '\u0001', { name: 'a', ctrl: false }, ['a', 1, false]],
    ['types nothing for enter, whatever it carries', 'a', 1, 'x', { name: 'enter' }, ['a', 1, false]],
    ['types nothing for return', 'a', 1, 'x', { name: 'return' }, ['a', 1, false]],
    ['types nothing for escape', 'a', 1, 'escape', { name: 'escape' }, ['a', 1, false]],
    ['types nothing for tab', 'a', 1, 'x', { name: 'tab' }, ['a', 1, false]],
    ['types nothing for up', 'a', 1, 'k', { name: 'up' }, ['a', 1, false]],
    ['types nothing for down', 'a', 1, 'j', { name: 'down' }, ['a', 1, false]],
    ['moves left', 'abc', 2, undefined, { name: 'left' }, ['abc', 1, false]],
    ['stops left at the start', 'abc', 0, undefined, { name: 'left' }, ['abc', 0, false]],
    ['moves right', 'abc', 1, undefined, { name: 'right' }, ['abc', 2, false]],
    ['stops right at the end', 'abc', 3, undefined, { name: 'right' }, ['abc', 3, false]],
    ['goes home', 'abc', 2, undefined, { name: 'home' }, ['abc', 0, false]],
    ['goes to the end', 'abc', 1, undefined, { name: 'end' }, ['abc', 3, false]],
    ['backspace deletes behind the cursor', 'abc', 2, '\u007F', { name: 'backspace' }, ['ac', 1, true]],
    ['backspace does nothing at the start', 'abc', 0, '\u007F', { name: 'backspace' }, ['abc', 0, false]],
    ['delete removes under the cursor', 'abc', 1, undefined, { name: 'delete' }, ['ac', 1, true]],
    ['delete does nothing at the end', 'abc', 3, undefined, { name: 'delete' }, ['abc', 3, false]],
    ['ctrl-u deletes everything before the cursor', 'drop keep', 5, 'u', { name: 'u', ctrl: true }, ['keep', 0, true]],
  ])('%s', (...row) => {
    expect(after(row)).toEqual(row[5]);
  });
});

describe('moveTextCursor', () => {
  it.each<[label: string, at: number, dy: number, value: string, expected: number]>([
    ['up keeps the column where the row above is long enough', 6, -1, 'abc\nabcd', 2],
    ['up stops at the end of a shorter row', 8, -1, 'ab\nabcde', 2],
    ['down from the last row stays on it', 4, 1, 'ab\ncd', 4],
    ['up from the first row stays on it', 1, -1, 'ab\ncd', 1],
    ['down lands on the same column', 1, 1, 'ab\ncd', 4],
  ])('%s', (...[, at, dy, value, expected]) => {
    expect(moveTextCursor(at, dy, value)).toBe(expected);
  });
});
