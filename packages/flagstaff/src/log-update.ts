/**
 * `flagstaff/log-update` — log-update 8's public API, ported and graded by log-update's
 * own suite through `compat-oracle` (R6, U11). Its dependency tree comes with it: the
 * wrapping (wrap-ansi) is `wrap.ts`, the width (string-width) is `width.ts`, the cursor
 * control (cli-cursor → restore-cursor → signal-exit → onetime) is `cursor.ts`, shared
 * with `flagstaff/ora` because both incumbents port the same chain, and the handful of
 * sequences ansi-escapes contributes are the ten lines below.
 *
 * What it does that a naive re-render does not: it diffs the previous frame against the
 * next and rewrites only the rows that changed. A five-row frame whose last row is a
 * counter costs one row of output per tick, not five — which is what keeps a scrollback
 * readable and a slow terminal from flickering.
 *
 * There is no `slice-ansi` here, and that is not a shortcut. `wrap()` closes every style
 * at a row break and reopens it after, so a wrapped frame's rows are already
 * self-contained; clipping to the terminal's height is then dropping leading rows, which
 * needs no ANSI state tracking at all. log-update reaches the same place through
 * `sliceAnsi`'s column arithmetic and a correction loop; its own suite renders both
 * through a real terminal emulator and cannot tell them apart.
 */
import process from 'node:process';

import { HIDE_CURSOR, restoreCursorOnExit, SHOW_CURSOR } from './cursor.js';
import { wrap } from './wrap.js';

const CSI = '\u001B[';
const SYNCHRONIZED_OUTPUT_ENABLE = `${CSI}?2026h`;
const SYNCHRONIZED_OUTPUT_DISABLE = `${CSI}?2026l`;
const CURSOR_LEFT = `${CSI}G`;
const ERASE_LINE = `${CSI}2K`;
const ERASE_END_LINE = `${CSI}K`;

const DEFAULT_WIDTH = 80;
const DEFAULT_HEIGHT = 24;

const cursorUp = (count = 1): string => `${CSI}${count}A`;
const cursorDown = (count = 1): string => `${CSI}${count}B`;
/** Erase `count` rows upward and leave the cursor at the start of the first of them. */
const eraseLines = (count: number): string => {
  let sequence = '';
  for (let index = 0; index < count; index += 1) sequence += ERASE_LINE + (index < count - 1 ? cursorUp() : '');
  return count > 0 ? sequence + CURSOR_LEFT : sequence;
};

/**
 * cli-cursor's `hide()`/`show()`, which is what log-update calls: the cursor belongs to the
 * process's terminal, not to whichever stream the caller passed in, so both go to
 * `process.stderr` regardless — as they do upstream, and as `flagstaff/ora` does. The
 * restore-on-death is `cursor.ts`, shared with the ora façade.
 */
function hideCursor(): void {
  if (process.stderr.isTTY !== true) return;
  restoreCursorOnExit();
  process.stderr.write(HIDE_CURSOR);
}

function showCursor(): void {
  if (process.stderr.isTTY !== true) return;
  process.stderr.write(SHOW_CURSOR);
}

/** What log-update writes to: `process.stdout` by default, anything stream-shaped in a test. */
export interface LogUpdateStream {
  write(chunk: string): unknown;
  columns?: number;
  rows?: number;
  isTTY?: boolean;
}

export interface LogUpdateOptions {
  /** Leave the cursor visible while a frame is up. Default false. */
  showCursor?: boolean;
  /** Columns to assume when the stream reports none. Default 80. */
  defaultWidth?: number;
  /** Rows to assume when the stream reports none. Default 24. */
  defaultHeight?: number;
}

export interface LogUpdate {
  (...text: unknown[]): void;
  /** Erase the current frame, leaving nothing behind. */
  clear(): void;
  /** Give up the rows: the frame stays on screen and the next render starts fresh. */
  done(): void;
  /** Replace the frame with text that stays, unclipped, and start fresh after it. */
  persist(...text: unknown[]): void;
}

const countLines = (text: string): number => text.split('\n').length;

interface Frame {
  wrapped: string;
  lines: string[];
  wasClipped: boolean;
}

/**
 * Keep only the last `terminalHeight` rows. `wrap()` has already made each row carry its
 * own styles, so this is a slice of an array — see the note at the top of the file.
 */
function fitToHeight(wrapped: string, terminalHeight: number): { text: string; wasClipped: boolean } {
  // Zero height: no output at all, deliberately.
  if (terminalHeight === 0) return { text: '', wasClipped: wrapped !== '' };

  const lines = wrapped.split('\n');
  const toRemove = Math.max(0, lines.length - terminalHeight);
  if (toRemove === 0) return { text: wrapped, wasClipped: false };
  return { text: lines.slice(toRemove).join('\n'), wasClipped: true };
}

/** The rows that differ, as a common prefix and a common suffix around them. */
function diffFrames(previousLines: string[], nextLines: string[]): { start: number; endPrevious: number; endNext: number } {
  let start = 0;
  while (start < previousLines.length && start < nextLines.length && previousLines[start] === nextLines[start]) start += 1;

  let endPrevious = previousLines.length - 1;
  let endNext = nextLines.length - 1;
  while (endPrevious >= start && endNext >= start && previousLines[endPrevious] === nextLines[endNext]) {
    endPrevious -= 1;
    endNext -= 1;
  }

  return { start, endPrevious, endNext };
}

interface Patch {
  previousCount: number;
  start: number;
  endPrevious: number;
  endNext: number;
  nextLines: string[];
  endsWithNewline: boolean;
}

/** Move the cursor from the trailing blank row to the first row that changed. */
function moveToRow(from: number, to: number): string {
  const delta = to - from;
  if (delta > 0) return cursorDown(delta);
  if (delta < 0) return cursorUp(-delta);
  return '';
}

/** One escape sequence that turns the previous frame into the next one. */
function buildPatch({ previousCount, start, endPrevious, endNext, nextLines, endsWithNewline }: Patch): string {
  let sequence = moveToRow(previousCount - 1, start) + CURSOR_LEFT;

  // Clear the changed block of the previous frame.
  const linesToClear = Math.max(0, endPrevious - start + 1);
  for (let index = 0; index < linesToClear; index += 1) sequence += ERASE_LINE + (index < linesToClear - 1 ? cursorDown() : '');
  if (linesToClear > 1) sequence += cursorUp(linesToClear - 1);
  sequence += CURSOR_LEFT;

  // Write the new changed block.
  const wrote = nextLines.slice(start, endNext + 1);
  let writtenLineBreaks = 0;
  if (wrote.length > 0) {
    const chunk = wrote.join('\n');
    const trailingNewline = endsWithNewline && endNext < nextLines.length - 1 && !chunk.endsWith('\n');
    sequence += chunk;
    writtenLineBreaks = countLines(chunk) - 1;
    // Nothing of the old row may survive past the end of the new one.
    sequence += ERASE_END_LINE;
    if (trailingNewline) {
      sequence += '\n';
      writtenLineBreaks += 1;
    }
  }

  // Back to the trailing blank row, where the next call expects to start.
  return sequence + moveToRow(start + writtenLineBreaks, nextLines.length - 1);
}

/** A renderer bound to one stream. `logUpdate` is this over `process.stdout`. */
export function createLogUpdate(stream: LogUpdateStream, { showCursor: keepCursor = false, defaultWidth, defaultHeight }: LogUpdateOptions = {}): LogUpdate {
  const widthOf = (): number => stream.columns ?? defaultWidth ?? DEFAULT_WIDTH;
  const heightOf = (): number => stream.rows ?? defaultHeight ?? DEFAULT_HEIGHT;

  let previousLineCount = 0;
  let previousWidth = widthOf();
  let previousOutput = '';
  const useSynchronizedOutput = stream.isTTY === true;

  const write = (output: string): void => {
    if (output === '') return;
    // One atomic update, so a terminal that supports it never paints a half-drawn frame.
    stream.write(useSynchronizedOutput ? SYNCHRONIZED_OUTPUT_ENABLE + output + SYNCHRONIZED_OUTPUT_DISABLE : output);
  };

  /** Normalise, wrap and height-clip into a concrete frame; `lines.length === 0` is empty. */
  const computeFrame = (text: unknown, columns: number, clipToHeight = true): Frame => {
    const textString = String(text);
    const raw = textString.endsWith('\n') ? textString : `${textString}\n`;
    const wrapped = wrap(raw, columns, { trim: false, hard: true, wordWrap: false });
    const { text: frameText, wasClipped } = clipToHeight ? fitToHeight(wrapped, heightOf()) : { text: wrapped, wasClipped: false };
    return { wrapped: frameText, lines: frameText === '' ? [] : frameText.split('\n'), wasClipped };
  };

  const reset = (): void => {
    previousOutput = '';
    previousWidth = widthOf();
    previousLineCount = 0;
  };

  const remember = (frame: Frame, columns: number): void => {
    previousOutput = frame.wrapped;
    previousWidth = columns;
    previousLineCount = frame.lines.length;
  };

  const render = (...args: unknown[]): void => {
    if (!keepCursor) hideCursor();

    const columns = widthOf();
    const frame = computeFrame(args.join(' '), columns);
    const { wrapped, lines, wasClipped } = frame;

    // Nothing would be written — a terminal reporting no rows at all — so erase what is
    // there and remember that the frame is empty.
    if (lines.length === 0) {
      if (previousLineCount > 0) write(eraseLines(previousLineCount));
      remember(frame, columns);
      return;
    }

    // Unchanged, at the same width: the whole point of the diff.
    if (wrapped === previousOutput && previousWidth === columns) return;

    // First frame: write it.
    if (previousLineCount === 0) {
      write(wrapped);
      remember(frame, columns);
      return;
    }

    // A width change or a clip invalidates the diff — the rows no longer line up.
    if (previousWidth !== columns || wasClipped) {
      write(eraseLines(previousLineCount) + wrapped);
      remember(frame, columns);
      return;
    }

    const previousLines = previousOutput === '' ? [] : previousOutput.split('\n');
    let { start, endPrevious, endNext } = diffFrames(previousLines, lines);

    // Rows inserted or removed shift the suffix, so it has to be rewritten where it lands.
    if (previousLines.length !== lines.length) {
      endPrevious = previousLines.length - 1;
      endNext = lines.length - 1;
    }

    // Nothing changed, trailing blank row included.
    if (start === lines.length && previousLineCount === lines.length) return;

    // No common prefix: a full erase is both simpler and shorter than a patch.
    if (start === 0) {
      write(eraseLines(previousLineCount) + wrapped);
      remember(frame, columns);
      return;
    }

    write(buildPatch({ previousCount: previousLineCount, start, endPrevious, endNext, nextLines: lines, endsWithNewline: wrapped.endsWith('\n') }));
    remember(frame, columns);
  };

  render.clear = (): void => {
    write(eraseLines(previousLineCount));
    reset();
  };

  render.done = (): void => {
    reset();
    if (!keepCursor) showCursor();
  };

  render.persist = (...args: unknown[]): void => {
    const erasePrevious = previousLineCount > 0 ? eraseLines(previousLineCount) : '';
    const columns = widthOf();
    const { wrapped } = computeFrame(args.join(' '), columns, false);
    write(erasePrevious + wrapped);
    reset();
  };

  return render;
}

const logUpdate: LogUpdate = createLogUpdate(process.stdout as unknown as LogUpdateStream);

export const logUpdateStderr: LogUpdate = createLogUpdate(process.stderr as unknown as LogUpdateStream);

export default logUpdate;
