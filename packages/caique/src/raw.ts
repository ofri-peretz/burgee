/**
 * The raw-mode renderer: arrow keys and a moving highlight for `select` and `multiselect`,
 * on a terminal that can take them.
 *
 * **It answers the same questions `ask()` does, and returns the same answers.** That is the
 * whole arrangement: line mode is the floor (R5), this sits on top, and a caller chooses
 * between them by asking whether the terminal is one. Anything this can do that line mode
 * cannot is decoration; anything line mode can do that this cannot would be a bug.
 *
 * **On the dependency the design named.** It said "spinner from flagstaff", and this does
 * not import flagstaff. A prompt has no spinner — it is waiting for a person, not for work
 * — and the repaint it needs is three escape sequences, written here. Importing flagstaff
 * to get them would make the one package that talks to a human the only one in the family
 * that requires a sibling, which is the rule `caique`'s own README states. If a prompt ever
 * needs to show progress *while* it waits, that is a caller composing `hoist()` around
 * `ask()`, not this file reaching for it.
 */
import { type Answer, type Asked, type Io } from './ask.js';
import { type Choice, type PromptSpec } from './spec.js';

const ESC = '\u001B';
const CSI = `${ESC}[`;
const HIDE_CURSOR = `${CSI}?25l`;
const SHOW_CURSOR = `${CSI}?25h`;
/** Column 1, up `n` lines, clear to the end of the screen — the only repaint this needs. */
const erase = (lines: number): string => `${CSI}1G${lines > 1 ? `${CSI}${lines - 1}A` : ''}${CSI}0J`;

/** A stream that can be put into raw mode and read a key at a time. */
export interface KeyStream {
  isTTY?: boolean;
  setRawMode?(raw: boolean): unknown;
  on(event: 'data', listener: (chunk: Buffer | string) => void): unknown;
  off(event: 'data', listener: (chunk: Buffer | string) => void): unknown;
  resume?(): unknown;
  pause?(): unknown;
}

export type Key = 'up' | 'down' | 'space' | 'enter' | 'cancel' | 'other';

/**
 * What a keypress means. Only the six that drive a list — everything else is `other`, and
 * a widget that does not know what to do with a key does nothing, which is what a person
 * expects from a key they pressed by accident.
 */
export function keyOf(data: string): Key {
  if (data === `${CSI}A` || data === 'k') return 'up';
  if (data === `${CSI}B` || data === 'j') return 'down';
  if (data === ' ') return 'space';
  if (data === '\r' || data === '\n') return 'enter';
  // Ctrl-C and Ctrl-D. In raw mode the terminal delivers these as bytes rather than
  // signals, so a widget that did not read them would leave a person unable to leave.
  if (data === '\u0003' || data === '\u0004' || data === ESC) return 'cancel';
  return 'other';
}

export interface RawIo extends Io {
  keys: KeyStream;
}

/** Whether this runtime can drive the raw renderer at all. */
export function canRender(keys: KeyStream): boolean {
  return keys.isTTY === true && typeof keys.setRawMode === 'function';
}

interface ListState {
  cursor: number;
  selected: Set<number>;
}

const MARK = { on: '◉', off: '◯' } as const;
const POINTER = '❯';
const CANCELLED: Asked = { ok: false, reason: 'cancelled' };

/** The `◉`/`◯` column, which only a multiselect has. Empty for a single select. */
function markFor(state: ListState, index: number, multi: boolean): string {
  if (!multi) return '';
  return `${state.selected.has(index) ? MARK.on : MARK.off} `;
}

/** One frame of the list. Exported so a test asserts the drawing rather than a screenshot. */
export function renderList(spec: PromptSpec, choices: Choice[], state: ListState, multi: boolean): string {
  const rows = choices.map((choice, index) => {
    const pointer = index === state.cursor ? POINTER : ' ';
    const hint = choice.hint === undefined ? '' : ` — ${choice.hint}`;
    return `${pointer} ${markFor(state, index, multi)}${choice.label ?? choice.value}${hint}`;
  });
  return [spec.message, ...rows].join('\n');
}

const clamp = (index: number, length: number): number => (index + length) % length;

/**
 * Apply a navigation key, and say whether anything changed — a key with no meaning here
 * changes nothing and repaints nothing, which is what a person expects from a key they
 * pressed by accident.
 */
function moved(key: Key, state: ListState, length: number, multi: boolean): boolean {
  if (key === 'up') {
    state.cursor = clamp(state.cursor - 1, length);
    return true;
  }
  if (key === 'down') {
    state.cursor = clamp(state.cursor + 1, length);
    return true;
  }
  if (key !== 'space' || !multi) return false;
  if (state.selected.has(state.cursor)) state.selected.delete(state.cursor);
  else state.selected.add(state.cursor);
  return true;
}

/** What enter answers with. List order, not press order: a set of choices has no sequence. */
function chosen(choices: Choice[], state: ListState, multi: boolean): Answer {
  if (!multi) return choices[state.cursor]?.value ?? '';
  return [...state.selected].sort((a, b) => a - b).map((index) => choices[index]?.value ?? '');
}

/**
 * Drive a list prompt with the arrow keys, repainting in place.
 *
 * Returns the same `Asked` shape `ask()` does, so a caller can swap the two without
 * knowing which ran — and cancels the same way, because `Ctrl-C` in raw mode is a byte and
 * not a signal, and a person who presses it means to leave.
 */
export async function askList(spec: PromptSpec, io: RawIo, multi = false): Promise<Asked> {
  const choices = spec.choices ?? [];
  const state: ListState = { cursor: 0, selected: new Set() };
  let painted = 0;

  const paint = (): void => {
    const frame = renderList(spec, choices, state, multi);
    io.writer.write((painted === 0 ? HIDE_CURSOR : erase(painted)) + frame);
    painted = frame.split('\n').length;
  };

  io.keys.setRawMode?.(true);
  io.keys.resume?.();
  paint();

  try {
    return await new Promise<Asked>((resolve) => {
      const onData = (chunk: Buffer | string): void => {
        const key = keyOf(String(chunk));
        if (key === 'cancel') {
          done(CANCELLED);
          return;
        }
        if (key === 'enter') {
          done({ ok: true, value: chosen(choices, state, multi) });
          return;
        }
        if (moved(key, state, choices.length, multi)) paint();
      };

      const done = (answer: Asked): void => {
        io.keys.off('data', onData);
        // Leave the answered question on screen, the cursor back, and the terminal as it
        // was found: a prompt that exits in raw mode leaves the shell unusable.
        io.writer.write(`${erase(painted)}${renderList(spec, choices, state, multi)}\n${SHOW_CURSOR}`);
        resolve(answer);
      };

      io.keys.on('data', onData);
    });
  } finally {
    io.keys.setRawMode?.(false);
    io.keys.pause?.();
  }
}
