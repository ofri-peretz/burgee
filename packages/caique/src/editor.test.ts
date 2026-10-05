/**
 * `caique/editor` (controlroom R20): the line editor as a component, driven by key presses.
 *
 * Every case types real bytes through `caique/keys`' `decode` — the decoder a person's keyboard
 * goes through — and folds them through `onKey`. Nothing here opens a stream, because nothing
 * in the editor does: that it can be tested this way is the property the host relies on.
 */
import { PassThrough } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { EDITOR_KEYS, editor, type EditorEvent, type EditorOptions, type EditorState, submissions } from './editor.js';
import { bindings, decode, type KeyPress } from './keys.js';

const ESC = '\u001B';
const UP = `${ESC}[A`;
const DOWN = `${ESC}[B`;
const LEFT = `${ESC}[D`;
const HOME = `${ESC}[H`;
const ENTER = '\r';
const ALT_ENTER = `${ESC}\r`;
const CTRL_J = '\n';
const TAB = '\t';
const BACKSPACE = '\u007F';
const PASTE_START = `${ESC}[200~`;
const PASTE_END = `${ESC}[201~`;

/** Type `chunks`, each one a read from a terminal, and keep what the editor said. */
function type(chunks: string[], options: EditorOptions = {}, from?: EditorState) {
  const ed = editor(options);
  let state = from ?? ed.initial;
  const events: EditorEvent[] = [];
  for (const chunk of chunks) {
    for (const key of decode(chunk)) {
      const step = ed.onKey(state, key);
      state = step.state;
      if (step.event !== undefined) events.push(step.event);
    }
  }
  return { state, events, frame: ed.render(state), ed };
}

const submitted = (events: EditorEvent[]): string[] => events.flatMap((e) => (e.type === 'submit' ? [e.text] : []));

describe('typing, through the line editor caique/clack shares', () => {
  it('types text, moves, deletes and submits on Enter', () => {
    const { events, state } = type(['helo', LEFT, 'l', HOME, `${ESC}[3~`, ENTER]);
    expect(submitted(events)).toEqual(['ello']);
    expect(state.text).toBe('');
  });

  it('backspace and Ctrl-U edit what is before the cursor', () => {
    expect(type(['abc', BACKSPACE]).state.text).toBe('ab');
    expect(type(['abc', LEFT, '\u0015']).state.text).toBe('c');
  });

  it('a key that is neither text nor a command changes nothing', () => {
    const before = type(['ab']);
    const after = type([`${ESC}[5~`, `${ESC}[13;2u`], {}, before.state);
    expect(after.state).toEqual(before.state);
  });
});

describe('multi-line entry', () => {
  it('Alt+Enter and Ctrl+J insert a newline; Enter submits the whole entry', () => {
    const { events } = type(['one', ALT_ENTER, 'two', CTRL_J, 'three', ENTER]);
    expect(submitted(events)).toEqual(['one\ntwo\nthree']);
  });

  it('Up and Down move between rows before they reach the history', () => {
    const { state } = type(['earlier', ENTER, 'ab', CTRL_J, 'cd', UP, 'X']);
    expect(state.text).toBe('abX\ncd');
    const down = type([DOWN, 'Y'], {}, state);
    expect(down.state.text).toBe('abX\ncdY');
  });

  it('renders every row under the prompt, and puts the cursor where it is', () => {
    const { frame } = type(['ab', CTRL_J, 'c'], { prompt: '> ' });
    expect(frame).toEqual({ lines: ['> ab', '  c'], cursor: { row: 1, column: 3 } });
  });

  it('measures the cursor column in display cells, not characters', () => {
    expect(type(['日本'], { prompt: '> ' }).frame.cursor).toEqual({ row: 0, column: 6 });
  });
});

describe('history', () => {
  const history = ['first', 'second'];

  it('Up recalls older entries, Down comes back to the draft that was being written', () => {
    const ed = type(['dra', 'ft'], { history });
    expect(type([UP], { history }, ed.state).state.text).toBe('second');
    expect(type([UP, UP], { history }, ed.state).state.text).toBe('first');
    expect(type([UP, UP, UP], { history }, ed.state).state.text).toBe('first');
    expect(type([UP, UP, DOWN], { history }, ed.state).state.text).toBe('second');
    expect(type([UP, UP, DOWN, DOWN], { history }, ed.state).state.text).toBe('draft');
    expect(type([UP, DOWN, DOWN], { history }, ed.state).state.text).toBe('draft');
  });

  it('a submitted entry joins the history, unless it is empty or repeats the last', () => {
    const { state, events } = type(['a', ENTER, 'a', ENTER, ENTER, 'b', ENTER]);
    expect(submitted(events)).toEqual(['a', 'a', '', 'b']);
    expect(state.history).toEqual(['a', 'b']);
    expect(type([UP], {}, state).state.text).toBe('b');
  });

  it('opens on the text and history it is given', () => {
    const { state, frame } = type([], { text: 'hi', history: ['x'] });
    expect(state).toMatchObject({ text: 'hi', cursor: 2, at: 1 });
    expect(frame.lines).toEqual(['hi']);
  });
});

describe('bracketed paste', () => {
  it('is text, Enter included: a pasted newline does not submit', () => {
    const { state, events } = type([`${PASTE_START}line one\r\nline two\rthree${PASTE_END}`]);
    expect(events).toEqual([]);
    expect(state.text).toBe('line one\nline two\nthree');
    expect(state.paste).toBeUndefined();
  });

  it('a paste split across reads is still one paste, and lands at the cursor', () => {
    const { state } = type(['[]', LEFT, PASTE_START, 'a\tb', '\u0003', PASTE_END]);
    expect(state.text).toBe('[a\tb\u0003]');
  });
});

describe('the completion menu the program feeds', () => {
  const commands = ['/commit', '/compact', '/config'];
  const complete = (word: string): string[] => (word.startsWith('/') ? commands.filter((c) => c.startsWith(word)) : []);

  it('asks for the word before the cursor, and offers what comes back', () => {
    const asked: string[] = [];
    const { state, frame } = type(['fix /com'], { complete: (t) => (asked.push(t), complete(t)) });
    expect(asked.at(-1)).toBe('/com');
    expect(state.menu).toEqual({ word: '/com', items: ['/commit', '/compact'], selected: 0 });
    expect(frame.lines).toEqual(['fix /com', '❯ /commit', '  /compact']);
  });

  it('Up and Down move the selection, wrapping; Tab puts it in place of the word', () => {
    expect(type(['/com', DOWN, TAB], { complete }).state.text).toBe('/compact');
    expect(type(['/com', UP, TAB], { complete }).state.text).toBe('/compact');
    expect(type(['/com', DOWN, DOWN, TAB], { complete }).state.text).toBe('/commit');
  });

  it('Enter accepts a completion rather than submitting the half-typed word', () => {
    const { state, events } = type(['/conf', ENTER], { complete });
    expect(events).toEqual([]);
    expect(state.text).toBe('/config');
    expect(submitted(type([ENTER], { complete }, state).events)).toEqual(['/config']);
  });

  it('keeps the selection while the word is the same, and starts again at the top for a new one', () => {
    const { state } = type(['/co', DOWN, DOWN], { complete });
    expect(state.menu?.selected).toBe(2);
    expect(type(['m'], { complete }, state).state.menu).toEqual({ word: '/com', items: ['/commit', '/compact'], selected: 0 });
  });

  it('a list that shrinks under the same word keeps the selection on the list', () => {
    const files = ['@fa', '@fb', '@fc'];
    const live = (word: string): string[] => files.filter((f) => f.startsWith(word));
    const { state } = type(['@f', UP], { complete: live });
    expect(state.menu?.selected).toBe(2);
    files.pop();
    expect(type([`${ESC}[6~`], { complete: live }, state).state.menu).toEqual({ word: '@f', items: ['@fa', '@fb'], selected: 1 });
  });

  it('offers nothing for a word that is already complete, so Enter submits it', () => {
    expect(type(['/commit'], { complete }).state.menu).toBeUndefined();
  });

  it('Escape closes the menu until the word changes', () => {
    const closed = type(['/com', ESC], { complete });
    expect(closed.state.menu).toBeUndefined();
    const tabbed = type([TAB, `${ESC}[6~`], { complete }, closed.state).state;
    expect(tabbed.text).toBe('/com');
    expect(tabbed.menu).toBeUndefined();
    expect(type(['m'], { complete }, closed.state).state.menu?.word).toBe('/comm');
  });

  it('no menu when the program offers nothing, when the word is empty, or with no completer', () => {
    expect(type(['hello'], { complete }).state.menu).toBeUndefined();
    expect(type(['/com '], { complete }).state.menu).toBeUndefined();
    expect(type(['/com']).state.menu).toBeUndefined();
    expect(type([ESC]).state).toEqual(editor().initial);
  });

  it('Tab with no menu does nothing', () => {
    expect(type(['ab', TAB], { complete }).state.text).toBe('ab');
  });
});

describe('the keymap is data', () => {
  it('Ctrl-C cancels, and says so', () => {
    expect(type(['ab', '\u0003']).events).toEqual([{ type: 'cancel' }]);
  });

  it('a host can rebind it, and a key it does not bind is typed', () => {
    const keymap = { 'ctrl+s': 'submit', enter: 'newline' } as const;
    const { events } = type(['a', ENTER, 'b', '\u0013'], { keymap });
    expect(submitted(events)).toEqual(['a\nb']);
  });

  it('lists every key it binds, so a hint line cannot name another', () => {
    expect(bindings(EDITOR_KEYS).map((b) => b.key)).toEqual(['enter', 'meta+enter', 'ctrl+j', 'up', 'down', 'tab', 'escape', 'ctrl+c']);
  });

  it('never reads a key itself: a step is a pure function of the state and the key', () => {
    const ed = editor();
    const key = decode('x')[0] as KeyPress;
    expect(ed.onKey(ed.initial, key)).toEqual(ed.onKey(ed.initial, key));
    expect(ed.initial.text).toBe('');
  });
});

describe('off a terminal: lines, never a wait (controlroom R7)', () => {
  it('each line of a pipe is an entry, every one of them, and the entries end when the pipe does', async () => {
    // All three lines arrive in one chunk, before anything reads: none may be dropped.
    const input = new PassThrough();
    input.end('fix the bug\r\n/commit\nlast line without a newline');
    const got: string[] = [];
    for await (const entry of submissions(input)) got.push(entry);
    expect(got).toEqual(['fix the bug', '/commit', 'last line without a newline']);
  });

  it('an empty input ends at once', async () => {
    const input = new PassThrough();
    input.end();
    const got: string[] = [];
    for await (const entry of submissions(input)) got.push(entry);
    expect(got).toEqual([]);
  });
});
