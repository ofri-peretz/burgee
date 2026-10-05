/**
 * `caique/editor` — caique's line editor as a component a host drives (controlroom R20).
 *
 * **It does no I/O.** A host owns the terminal: it reads keys (`caique/keys`' `readKeys`),
 * hands each one to `onKey`, and paints what `render` returns wherever its layout puts the
 * input line. The editor is state in, state out — a reducer — so a screen can host it in a
 * live region, a test can drive it with a list of key presses, and nothing here can hang.
 *
 * **It is not a second editor.** Insert, delete, backspace, the cursor moves and Ctrl-U are
 * `line-edit.ts`, the same code `caique/clack`'s prompts edit with, and moving between the rows
 * of a multi-line entry is clack's `multiline` arithmetic from the same file. What this adds is
 * what a chat-shaped input needs on top: history, bracketed paste, and a completion menu.
 *
 * **Its commands are a keymap**, data in `caique/keys`' sense: Enter submits, Alt+Enter and
 * Ctrl+J insert a newline, Up and Down walk the rows and then the history, Tab accepts a
 * completion and Escape dismisses the menu. A host replaces any of it with `keymap`, and builds
 * its hint line from the same object, so the hint and the editor cannot disagree.
 *
 * **Off a terminal it reads lines** (controlroom R7): `submissions()` turns an input stream into
 * the same entries, one per line, and ends when the input does, without waiting for a key.
 */
import { createInterface } from 'node:readline';

import { width } from 'linegauge';

import { type Keymap, type KeyPress, match } from './keys.js';
import { edit, moveTextCursor } from './line-edit.js';

/** What a key can ask the editor to do, beyond typing. */
export type EditorAction = 'submit' | 'newline' | 'previous' | 'next' | 'complete' | 'dismiss' | 'cancel';

/** The editor's commands, as data. A host passes its own `keymap` to change them. */
export const EDITOR_KEYS = {
  enter: 'submit',
  'meta+enter': 'newline',
  'ctrl+j': 'newline',
  up: 'previous',
  down: 'next',
  tab: 'complete',
  escape: 'dismiss',
  'ctrl+c': 'cancel',
} as const satisfies Keymap<EditorAction>;

/** The completion menu: what the program offered for the word before the cursor. */
export interface Menu {
  word: string;
  items: readonly string[];
  selected: number;
}

/** Everything the editor is. Plain data: no functions, nothing a host cannot copy or log. */
export interface EditorState {
  /** The entry being written; `\n` separates its rows. */
  readonly text: string;
  /** Where the cursor is in `text`, in UTF-16 units. */
  readonly cursor: number;
  /** Earlier entries, oldest first. */
  readonly history: readonly string[];
  /** Which history entry is shown; `history.length` is the entry being written. */
  readonly at: number;
  /** The entry being written, kept while the history is browsed. */
  readonly draft: string;
  /** A bracketed paste being collected, or `undefined` outside one. */
  readonly paste: string | undefined;
  readonly menu: Menu | undefined;
  /** The word whose menu Escape closed: it stays closed until the word changes. */
  readonly dismissed: string | undefined;
}

/** What a key did that the host has to act on. */
export type EditorEvent = { type: 'submit'; text: string } | { type: 'cancel' };

/** One key's result: the next state, and an event when the key ended the entry. */
export interface Step {
  state: EditorState;
  event?: EditorEvent;
}

/** Where the editor sits on screen once rendered: its rows, and the cursor among them. */
export interface Frame {
  lines: string[];
  /** Row and display column of the cursor within `lines`, before any wrapping by the host. */
  cursor: { row: number; column: number };
}

export interface EditorOptions {
  /** The entry the editor opens with. */
  text?: string;
  /** Earlier entries, oldest first: what Up recalls. */
  history?: readonly string[];
  /**
   * Candidates for the word before the cursor (`/com`, `@fi`); an empty list shows no menu.
   * The program decides what a word means — the editor only asks.
   */
  complete?: (word: string) => readonly string[];
  /** Replaces `EDITOR_KEYS`. Any key it does not bind is typed, if it is text. */
  keymap?: Keymap<EditorAction>;
  /** Drawn before the first row; the rows under it are indented to match. */
  prompt?: string;
}

/** An editor: its first state, its reducer, and its drawing. All three are pure. */
export interface Editor {
  initial: EditorState;
  onKey: (state: EditorState, key: KeyPress) => Step;
  render: (state: EditorState) => Frame;
}

const fresh = (history: readonly string[], text: string): EditorState => ({
  text,
  cursor: text.length,
  history,
  at: history.length,
  draft: '',
  paste: undefined,
  menu: undefined,
  dismissed: undefined,
});

/** The run of non-space characters that ends at the cursor: what a completion replaces. */
const wordOf = (state: EditorState): string => {
  const before = state.text.slice(0, state.cursor);
  return before.slice(before.search(/\S*$/));
};

/** `piece` typed at the cursor. */
const insert = (state: EditorState, piece: string): EditorState => ({
  ...state,
  text: state.text.slice(0, state.cursor) + piece + state.text.slice(state.cursor),
  cursor: state.cursor + piece.length,
});

/** The selected candidate in place of the word it completes. */
function accept(state: EditorState, menu: Menu): EditorState {
  const start = state.cursor - menu.word.length;
  const item = menu.items[menu.selected] as string;
  return { ...state, text: state.text.slice(0, start) + item + state.text.slice(state.cursor), cursor: start + item.length };
}

/** Up: a row up inside a multi-line entry, then the entry before in the history. */
function previous(state: EditorState): EditorState {
  if (state.text.slice(0, state.cursor).includes('\n')) return { ...state, cursor: moveTextCursor(state.cursor, -1, state.text) };
  if (state.at === 0) return state;
  const text = state.history[state.at - 1] as string;
  const draft = state.at === state.history.length ? state.text : state.draft;
  return { ...state, at: state.at - 1, draft, text, cursor: text.length };
}

/** Down: a row down inside a multi-line entry, then the entry after — and last, the draft. */
function next(state: EditorState): EditorState {
  if (state.text.slice(state.cursor).includes('\n')) return { ...state, cursor: moveTextCursor(state.cursor, 1, state.text) };
  if (state.at === state.history.length) return state;
  const at = state.at + 1;
  const text = at === state.history.length ? state.draft : (state.history[at] as string);
  return { ...state, at, text, cursor: text.length };
}

/** Move the menu's selection, wrapping at both ends as caique's lists do. */
const choose = (state: EditorState, menu: Menu, step: number): EditorState => ({
  ...state,
  menu: { ...menu, selected: (menu.selected + step + menu.items.length) % menu.items.length },
});

/** A key with no command: the shared line editor's, which types text and moves the cursor. */
function typed(state: EditorState, key: KeyPress): EditorState {
  const line = { userInput: state.text, cursor: state.cursor };
  edit(line, key.sequence, key);
  return { ...state, text: line.userInput, cursor: line.cursor };
}

/** The entry, submitted: it joins the history, unless it is empty or repeats the last one. */
function submit(state: EditorState): Step {
  const repeat = state.text === '' || state.history.at(-1) === state.text;
  return { state: fresh(repeat ? state.history : [...state.history, state.text], ''), event: { type: 'submit', text: state.text } };
}

/**
 * Build an editor.
 *
 * `onKey` never reads a stream and never waits: it is called with a key, returns a state, and
 * says when the entry was submitted or cancelled. `render` is the frame for a state.
 */
export function editor(options: EditorOptions = {}): Editor {
  const keymap: Keymap<EditorAction> = options.keymap ?? EDITOR_KEYS;
  const prompt = options.prompt ?? '';
  const indent = ' '.repeat(width(prompt));

  /** The menu for the word now before the cursor, asked of the program after every key. */
  function settle(state: EditorState): EditorState {
    const word = wordOf(state);
    // A candidate that is the word already completes nothing: offering it would make Enter
    // accept it forever instead of submitting the entry.
    const offered = word === '' || word === state.dismissed || options.complete === undefined ? [] : options.complete(word);
    const items = offered.filter((item) => item !== word);
    const dismissed = word === state.dismissed ? state.dismissed : undefined;
    if (items.length === 0) return { ...state, menu: undefined, dismissed };
    const kept = state.menu?.word === word ? Math.min(state.menu.selected, items.length - 1) : 0;
    return { ...state, menu: { word, items, selected: kept }, dismissed };
  }

  function command(state: EditorState, key: KeyPress): Step | EditorState {
    const { menu } = state;
    switch (match(keymap, key)) {
      case 'submit':
        return menu === undefined ? submit(state) : accept(state, menu);
      case 'newline':
        return insert(state, '\n');
      case 'previous':
        return menu === undefined ? previous(state) : choose(state, menu, -1);
      case 'next':
        return menu === undefined ? next(state) : choose(state, menu, 1);
      case 'complete':
        return menu === undefined ? state : accept(state, menu);
      case 'dismiss':
        return { ...state, menu: undefined, dismissed: menu?.word };
      case 'cancel':
        return { state, event: { type: 'cancel' } };
      default:
        return typed(state, key);
    }
  }

  function onKey(state: EditorState, key: KeyPress): Step {
    // Inside a bracketed paste every key is text — Enter included — until the paste ends.
    if (state.paste !== undefined) {
      if (key.name !== 'paste-end') return { state: { ...state, paste: state.paste + key.sequence } };
      return { state: settle(insert({ ...state, paste: undefined }, state.paste.replaceAll(/\r\n?/g, '\n'))) };
    }
    if (key.name === 'paste-start') return { state: { ...state, paste: '' } };
    const result = command(state, key);
    if ('state' in result) return result;
    return { state: settle(result) };
  }

  function render(state: EditorState): Frame {
    const rows = state.text.split('\n').map((row, index) => (index === 0 ? prompt : indent) + row);
    const before = state.text.slice(0, state.cursor).split('\n');
    const row = before.length - 1;
    const { menu } = state;
    const listed = menu === undefined ? [] : menu.items.map((item, index) => `${index === menu.selected ? '❯' : ' '} ${item}`);
    return { lines: [...rows, ...listed], cursor: { row, column: indent.length + width(before[row] as string) } };
  }

  return { initial: settle(fresh(options.history ?? [], options.text ?? '')), onKey, render };
}

/**
 * The editor's entries when there is no terminal to edit on: one per line of input, ending
 * when the input does. A pipe, a file and `/dev/null` all end — so this never waits for a key
 * that cannot come (controlroom R7).
 */
export async function* submissions(input: NodeJS.ReadableStream): AsyncGenerator<string, void, undefined> {
  // readline's own iterator, which buffers: a pipe delivers many lines in one chunk, and a
  // reader that listens for one `line` event at a time drops the ones that arrive between.
  yield* createInterface({ input, crlfDelay: Number.POSITIVE_INFINITY });
}
