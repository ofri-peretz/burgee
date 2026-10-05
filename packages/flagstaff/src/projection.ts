/**
 * The per-mode writers (R1). This is the only module in the package that emits a cursor
 * operation, and it does so only in `tty`; every other projection is text and a newline,
 * which is what R5 greps for. Streams and time come in as arguments — nothing here knows
 * `process` exists. The sequences are written by hand rather than through `node:readline`,
 * whose helpers want a `Writable` where the loop only has a `Writer`.
 *
 * The repaint itself is `frameWriter()`, exported as the family's one frame-writing seam
 * (controlroom R3, R15): a whole frame in, the rows that changed out, inside one
 * synchronized-output block. `ttyProjection` paints through it like any other caller, so a
 * compositor that puts several components in one frame writes the same bytes a hoisted
 * component does, and no other package spells a grid sequence.
 */
import { onExit } from 'closeout';
import { HIDE_CURSOR, SHOW_CURSOR } from 'closeout/cursor';
import { lineCount } from 'linegauge';

import { type Component } from './plugin.js';

export interface Writer {
  write(chunk: string): unknown;
  /**
   * How wide the terminal is, read at every paint so a resize is honoured. A frame wider than
   * this wraps on screen, and the rows it wraps onto have to be erased with the rest; a Node
   * TTY stream carries it, and a writer without it is taken to be `DEFAULT_COLUMNS` wide.
   */
  readonly columns?: number | undefined;
}

/** Time as the loop sees it: burgee's `Runtime.clock` satisfies it, so does `manualClock()`. */
export interface Clock {
  now(): number;
  schedule(fn: () => void, ms: number): () => void;
}

/** One hoisted component's lifecycle, as a mode sees it. */
export interface Projection<S> {
  open(state: S): void;
  change(state: S): void;
  close(state: S): void;
}

export const DEFAULT_INTERVAL = 80;
/** The width assumed when the writer does not say, which is ora's fallback too. */
const DEFAULT_COLUMNS = 80;
const CSI = '\u001B[';

/**
 * DEC mode 2026, synchronized output: a terminal that knows it holds the screen until the
 * frame is whole, so a repaint never shows half-erased; one that does not ignores a private
 * mode it does not know. Spelled here rather than imported from `paratext/csi`, which reaches
 * paratext's runtime seam for two constants this module writes in eight bytes each.
 */
const BEGIN_SYNC = `${CSI}?2026h`;
const END_SYNC = `${CSI}?2026l`;
/** DECSC and DECRC: the cursor kept across an in-place edit, so it ends where it began. */
const SAVE = '\u001B7';
const RESTORE = '\u001B8';

/**
 * The frame-writing seam (controlroom R3, R16). `paint` takes the whole frame, one string per
 * line, and writes only what changed since the last paint, wrapped in synchronized output;
 * a frame identical to the last writes nothing. `release` forgets the painted frame without
 * erasing it: what is on screen becomes scrollback, and the next paint starts at the cursor.
 *
 * Between paints the cursor rests at the end of the frame's last row, which is where the
 * hoisted projection has always left it. A frame taller than the terminal cannot be reached
 * above its top row; that is the terminal's limit, and a caller lays out within its height.
 */
export interface FrameWriter {
  paint(lines: readonly string[]): void;
  release(): void;
}

/** How wide the writer's terminal is, read at every paint so a resize is honoured. */
function columnsOf(out: Writer): number {
  const { columns } = out;
  return columns !== undefined && columns > 0 ? columns : DEFAULT_COLUMNS;
}

/** A frame as painted: its lines, and the rows each one took at the width it was painted at. */
interface Painted {
  lines: readonly string[];
  rows: readonly number[];
}

/**
 * The bytes that turn `was` into `now`, with the cursor at the end of the last row on both
 * sides. Leading lines that did not change are not touched; a changed line that is one row
 * before and after is rewritten in place; the first change that moves a row boundary — a line
 * that wraps differently, a line added or removed, a new width, or a change on the last line
 * — rewrites from there to the end of the screen.
 */
function diff(was: Painted, now: Painted, sameWidth: boolean): string {
  const { lines: before, rows: beforeRows } = was;
  const { lines: after, rows: afterRows } = now;
  let at = beforeRows.reduce((sum, n) => sum + n, 0) - 1;
  let out = '';
  const move = (row: number): void => {
    out += `${CSI}1G${row < at ? `${CSI}${at - row}A` : ''}${row > at ? `${CSI}${row - at}B` : ''}`;
    at = row;
  };
  const last = Math.min(before.length, after.length) - 1;
  let line = 0;
  let row = 0;
  for (; sameWidth && line < last; line += 1) {
    if (before[line] !== after[line]) {
      if (beforeRows[line] !== 1 || afterRows[line] !== 1) break;
      move(row);
      out += `${CSI}2K${after[line]}`;
    }
    row += beforeRows[line] as number;
  }
  // In-place edits only, and the last line as it was: the cursor goes back where it rested.
  if (sameWidth && line === last && before.length === after.length && before[line] === after[line]) return out === '' ? '' : `${SAVE}${out}${RESTORE}`;
  move(row);
  return `${out}${CSI}0J${after.slice(line).join('\n')}`;
}

/** The family's one frame writer over `out` — see `FrameWriter`. */
export function frameWriter(out: Writer): FrameWriter {
  let shown: Painted | undefined;
  let width = 0;
  return {
    paint(lines) {
      // No lines is one empty line: the frame still has a row for the cursor to rest on.
      const frame = lines.length === 0 ? [''] : [...lines];
      const columns = columnsOf(out);
      // Rows *painted*, not lines written: a line wider than the terminal wraps, and counting
      // it once left the rows it wrapped onto on screen after the next erase. `lineCount` is
      // the same measurement `flagstaff/ora` clears by.
      const now: Painted = { lines: frame, rows: frame.map((line) => lineCount(line, columns)) };
      const bytes = shown === undefined ? frame.join('\n') : diff(shown, now, columns === width);
      shown = now;
      width = columns;
      if (bytes !== '') out.write(`${BEGIN_SYNC}${bytes}${END_SYNC}`);
    },
    release() {
      shown = undefined;
    },
  };
}

/** A terminal: repaint in place on the clock, then leave the static line behind on close. */
class TtyProjection<S> implements Projection<S> {
  readonly #component: Component<S>;
  readonly #out: Writer;
  readonly #clock: Clock;
  readonly #interval: number;
  readonly #started: number;
  readonly #frame: FrameWriter;
  #current!: S;
  #cancel: () => void = () => undefined;
  // Set by `open()`. `hoist()` is the only caller, and it opens before anything else and
  // closes at most once, so `close()` never runs without a net standing.
  #dropCursorNet!: () => void;

  constructor(component: Component<S>, out: Writer, clock: Clock) {
    this.#component = component;
    this.#out = out;
    this.#clock = clock;
    this.#interval = component.interval ?? DEFAULT_INTERVAL;
    this.#started = clock.now();
    this.#frame = frameWriter(out);
  }

  open(state: S): void {
    this.#current = state;
    this.#out.write(HIDE_CURSOR);
    // `close()` puts the cursor back, and `close()` does not run when a signal ends the
    // process — Ctrl+C during a spin used to leave the user's terminal with no cursor at
    // all. The writer is captured in the handler so the restore lands on the Runtime's own
    // stream: this module does not know `process` exists, and must not learn (R1), so it
    // registers through closeout rather than reaching for a stream closeout would pick.
    // `restore` is the phase that runs last, after every handler a program registered.
    this.#dropCursorNet = onExit(() => void this.#out.write(SHOW_CURSOR), { phase: 'restore' });
    this.#paint();
    if (this.#component.frame !== undefined) this.#cancel = this.#clock.schedule(() => this.#repaint(), this.#interval);
  }

  change(state: S): void {
    this.#current = state;
    this.#paint();
  }

  close(state: S): void {
    this.#cancel();
    // The static projection is the last frame, and then it is scrollback: released, so a
    // later frame on the same stream starts below it rather than erasing it.
    this.#frame.paint(this.#component.static(state).split('\n'));
    this.#frame.release();
    this.#out.write(`\n${SHOW_CURSOR}`);
    // The frame put the cursor back itself, so the net comes down with it — otherwise it
    // would fire again at exit and write a second, pointless show.
    this.#dropCursorNet();
  }

  #paint(): void {
    const { frame } = this.#component;
    const text = frame === undefined ? this.#component.static(this.#current) : frame(this.#clock.now() - this.#started, this.#current);
    this.#frame.paint(text.split('\n'));
  }

  #repaint(): void {
    this.#paint();
    this.#cancel = this.#clock.schedule(() => this.#repaint(), this.#interval);
  }
}

export function ttyProjection<S>(component: Component<S>, out: Writer, clock: Clock): Projection<S> {
  return new TtyProjection(component, out, clock);
}

/**
 * A pipe, CI, or a screen reader: the static projection, once per change, and nothing else.
 *
 * "Once per change" is finer than "when the text differs". A component whose projection is
 * a list — `tasks`, whose static is every task that has settled — grows it a line at a
 * time, and printing the whole list on every change repeats every line already in the log:
 *
 *     ✔ install          ← install settled
 *     ✔ install          ← build settled, and install is printed again
 *     ✔ build
 *
 * So what is written is the lines *past the common prefix* with what was written last. A
 * component whose text replaces itself rather than growing shares no prefix and is printed
 * whole, which is the ordinary case; one that grows is appended to, which is what a log
 * wants. An empty projection writes nothing at all — a component with nothing to say yet
 * should not cost a blank line.
 */
export function staticProjection<S>(component: Component<S>, out: Writer): Projection<S> {
  let written: string[] = [];
  const emit = (state: S): void => {
    const text = component.static(state);
    if (text === '') return;
    const lines = text.split('\n');
    let shared = 0;
    while (shared < written.length && shared < lines.length && written[shared] === lines[shared]) shared += 1;
    // Every line already written is still on the reader's screen; only the rest is news.
    const fresh = lines.slice(shared);
    written = lines;
    if (fresh.length > 0) out.write(`${fresh.join('\n')}\n`);
  };
  return { open: emit, change: emit, close: emit };
}

/** `--json`: one NDJSON event per transition on stderr, so stdout stays the envelope's (R1). */
export function jsonProjection<S>(component: Component<S>, err: Writer): Projection<S> {
  const emit = (state: S): void => {
    err.write(`${JSON.stringify({ event: component.name, state })}\n`);
  };
  return { open: emit, change: emit, close: emit };
}

// Re-exported from where the restore lives, so the hide and the putting-back cannot drift.
export { HIDE_CURSOR, SHOW_CURSOR };
