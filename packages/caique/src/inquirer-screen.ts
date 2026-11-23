/**
 * Everything between a rendered string and the bytes a terminal receives: the escape
 * sequences, the muteable output stream, and the screen manager that erases what it drew
 * last time before it draws again.
 *
 * ## Why the escape sequences are written out here
 *
 * `@inquirer/core` takes them from `@inquirer/ansi`, and the suite imports `cursorShow`,
 * `cursorLeft` and `eraseLines` from that package to assert against our output — so these
 * are not ours to choose. The one case that compares a raw frame byte for byte (`allow
 * cleaning the prompt after completion`) is what proves they are right.
 *
 * The cursor-visibility sequence comes from `closeout`, which owns it across the family. The
 * rest are CSI, and come from `paratext/csi`, the family's byte-exact port of `ansi-escapes`.
 * `@inquirer/ansi` differs from `ansi-escapes` in one respect that matters: it writes nothing
 * for a zero-row move, where `ansi-escapes` writes `ESC[0A` — which a terminal reads as one
 * row. So `cursorUp` and `cursorDown` below guard zero before they call paratext.
 *
 * ## Why there is a stream class here
 *
 * The incumbent wraps a caller's output in `mute-stream` so `readline` can write its own
 * terminal setup and then be silenced, leaving the screen manager as the only thing that
 * draws. That is a real behaviour rather than a dependency detail — muting is what stops
 * readline echoing a password — and caique reaches nothing outside this repository, so the
 * twenty lines of it live here. It is an old-style `Stream` on purpose: `create-prompt`
 * branches on whether the *input* has `readableFlowing`, and a caller who passes a classic
 * stream must get the synchronous first render the incumbent gives them.
 */
import { Stream } from 'node:stream';
import { stripVTControlCharacters } from 'node:util';

import { SHOW_CURSOR } from 'closeout/cursor';
import { visibleWidth, wrap } from 'linegauge/wrap';
import { cursorDown as down, cursorLeft as csiLeft, cursorTo as to, cursorUp as up, eraseLines as erase } from 'paratext/csi';

import { processRuntime } from './runtime.js';

/** Move the cursor to the first column. */
export const cursorLeft = csiLeft;

/**
 * Show the cursor — taken from `closeout`, not spelled again here.
 *
 * `inline-implementation-lock.test.ts` is what insists on that, and it is right to: this
 * package already carried a hand-written copy of `?25l`/`?25h` once, and removing it found
 * that caique never restored the cursor on a signal at all. A third copy for a façade would
 * be the same defect wearing a compatibility badge.
 */
export const cursorShow = SHOW_CURSOR;

/** Move the cursor up `rows` rows. Zero is no sequence at all, not a zero-length move. */
export const cursorUp = (rows = 1): string => (rows > 0 ? up(rows) : '');

/** Move the cursor down `rows` rows. Zero, likewise, is nothing. */
export const cursorDown = (rows = 1): string => (rows > 0 ? down(rows) : '');

/** Move the cursor to column `x` (zero-based), or to `(x, y)` when a row is given. A `NaN` row is no row. */
export const cursorTo = (x: number, y?: number): string =>
  to(
    x,
    // Stryker disable next-line ConditionalExpression: `Number.isNaN(undefined)` is false too, so the type test only narrows the type
    typeof y === 'number' &&
      !Number.isNaN(y)
      ? y
      : undefined,
  );

/** Erase `lines` lines, ending on the first column of the topmost one. None for zero or fewer. */
// Stryker disable next-line EqualityOperator: `ansi-escapes` erases nothing for zero lines either; the guard is for the negative counts
export const eraseLines = (lines: number): string => (lines > 0 ? erase(lines) : '');

const DEFAULT_WIDTH = 80;

/** `parseInt`'s radix. Named because a bare 10 beside a width reads as a width. */
const DECIMAL = 10;

/**
 * A writable stream that can be told to stop writing, and to start again.
 *
 * Declared as the four members the screen manager actually touches rather than as
 * `NodeJS.WritableStream`: `end()`'s full overload set is three signatures wide and none of
 * them is what a muted stream means by ending.
 */
export interface Muteable {
  write: (chunk: string | Uint8Array) => boolean;
  mute: () => void;
  unmute: () => void;
  columns?: number | undefined;
  rows?: number | undefined;
}

/**
 * The incumbent's `mute-stream`, reduced to what a prompt uses.
 *
 * Classic `Stream`, emitting `data`, so `pipe()` reaches the caller's real output and so
 * `'readableFlowing' in stream` is false — which is the test `create-prompt` uses to decide
 * whether stale buffered input needs a tick to drain before the first render.
 *
 * `columns` and `rows` read through to whatever it is piped to: a terminal's size belongs
 * to the terminal, and a test double that declares ten thousand columns must be believed.
 */
export class MuteStream extends Stream implements Muteable {
  muted = false;
  writable = true;
  readable = true;
  #dest: (NodeJS.WritableStream & { columns?: number; rows?: number; isTTY?: boolean }) | undefined;

  get columns(): number | undefined {
    return this.#dest?.columns;
  }

  get rows(): number | undefined {
    return this.#dest?.rows;
  }

  get isTTY(): boolean {
    return this.#dest?.isTTY ?? false;
  }

  mute(): void {
    this.muted = true;
  }

  unmute(): void {
    this.muted = false;
  }

  override pipe<T extends NodeJS.WritableStream>(dest: T, options?: { end?: boolean }): T {
    this.#dest = dest as T & { columns?: number; rows?: number; isTTY?: boolean };
    return super.pipe(dest, options) as T;
  }

  write(chunk: string | Uint8Array): boolean {
    if (this.muted) return true;
    this.emit('data', chunk);
    return true;
  }

  end(chunk?: string | Uint8Array): this {
    if (chunk !== undefined && !this.muted) this.emit('data', chunk);
    this.emit('end');
    return this;
  }
}

/**
 * The width to wrap at: what the output says, then `COLUMNS`, then eighty.
 *
 * `cli-width`'s order, minus the `tty.getWindowSize` fallback it keeps for a stream that
 * reports no `columns` at all — a stream that knows its width reports it, and one that does
 * not is not necessarily the process's own terminal.
 */
export function outputWidth(output: { columns?: number | undefined } | undefined): number {
  const declared = output?.columns;
  if (
    // Stryker disable next-line ConditionalExpression: `undefined > 0` is false, so the type test only narrows the type
    typeof declared === 'number' &&
    declared > 0
  )
    return declared;
  // Stryker disable next-line StringLiteral: any text that is not a number parses to NaN, as the empty string does
  const fromEnv = Number.parseInt(processRuntime().env['COLUMNS'] ?? '', DECIMAL);
  return Number.isNaN(fromEnv) || fromEnv <= 0 ? DEFAULT_WIDTH : fromEnv;
}

/**
 * Hard-wrap every line at `width`, keeping escape sequences intact and trailing whitespace
 * off. `linegauge/wrap` is this repository's port of `wrap-ansi`, graded against it.
 */
export function breakLines(content: string, width: number): string {
  return wrapContent(content, width).text;
}

/**
 * `breakLines`, and the geometry of the final logical line: `lastRow` is its last physical row
 * and `finalLineRows` how many rows it spans, which is where the cursor goes back to.
 * `lastRow` keeps its trailing spaces: readline counts them in the cursor position, so a line
 * that ends exactly at the edge would otherwise read one column short (@inquirer/core 12.1.1).
 */
export function wrapContent(content: string, width: number): { text: string; lastRow: string; finalLineRows: number } {
  // A tab is written as a tab, as the incumbent's wrapper leaves it, not spread into spaces the way
  // `wrap` does: a Tab typed into an answer is in readline's line, and the screen shows that line.
  // It rides through `wrap` as a NUL, which is as wide as nothing and which no prompt draws.
  const wrappedLines = content.split('\n').map((line) =>
    wrap(line.replaceAll('\t', '\0'), width, { trim: false, wordWrap: false })
      .replaceAll('\0', '\t')
      .split('\n'),
  );
  // `split` always returns at least one element, here and on each wrapped line, so the last of each exists.
  const finalLine = wrappedLines.at(-1) as string[];
  return {
    text: wrappedLines
      .flat()
      .map((row) => row.trimEnd())
      .join('\n'),
    lastRow: finalLine.at(-1) as string,
    finalLineRows: finalLine.length,
  };
}

const height = (content: string): number => content.split('\n').length;

const lastLine = (content: string): string => content.slice(content.lastIndexOf('\n') + 1);

/** The readline interface the screen manager drives, narrowed to what it touches. */
export interface ScreenReadline {
  line: string;
  output: Muteable;
  setPrompt: (prompt: string) => void;
  getCursorPos: () => { rows: number; cols: number };
  close: () => void;
}

/**
 * Draws a prompt and erases what it drew last time.
 *
 * The arithmetic is the incumbent's, and it has to be: `getScreen({ raw: true })` compares a
 * whole frame against `eraseLines(1) + cursorLeft + cursorShow`, so an extra `cursorTo` or a
 * missing newline is a failing case rather than a cosmetic difference.
 */
export class ScreenManager {
  #height = 0;
  #extraLinesUnderPrompt = 0;
  #cursorPos: { rows: number; cols: number };
  readonly #rl: ScreenReadline;

  constructor(rl: ScreenReadline) {
    this.#rl = rl;
    this.#cursorPos = rl.getCursorPos();
  }

  /** Unmute, write, mute again — the only path that puts bytes on the caller's output. */
  #write(content: string): void {
    this.#rl.output.unmute();
    this.#rl.output.write(content);
    this.#rl.output.mute();
  }

  /** Draw `content`, with `bottomContent` below the cursor line. */
  render(content: string, bottomContent = ''): void {
    const promptLine = lastLine(content);
    const rawPromptLine = stripVTControlCharacters(promptLine);

    // readline owns backspace, and it needs to know how much of the last line is *prompt*
    // rather than typed input. `rl.line`'s content cannot be trusted (a password prompt
    // holds a secret there) but its length can.
    let prompt = rawPromptLine;
    if (this.#rl.line.length > 0) prompt = prompt.slice(0, -this.#rl.line.length);
    this.#rl.setPrompt(prompt);
    this.#cursorPos = this.#rl.getCursorPos();

    const width = outputWidth(this.#rl.output);
    const wrapped = wrapContent(content, width);
    const wrappedBottom = breakLines(bottomContent, width);
    // Measured in columns, so a line of wide characters reaches the edge when it fills it, not
    // when its code units happen to count to the width (@inquirer/core 12.1.1). At or past the
    // edge rather than exactly on it, so a one-column terminal, where every row is full, still
    // gets its extra line.
    const atRightEdge = visibleWidth(wrapped.lastRow) >= width;

    // Exactly at the right edge, the cursor would otherwise land at the start of the line
    // it has just filled. One more newline puts it where a person expects it. An empty or
    // escape-only prompt line still gets one before the bottom content, as `0 % width` did.
    const body = atRightEdge || rawPromptLine.length === 0 ? `${wrapped.text}\n` : wrapped.text;

    let output = body + (wrappedBottom ? `\n${wrappedBottom}` : '');
    const promptLineUpDiff = wrapped.finalLineRows - 1 + Number(atRightEdge) - this.#cursorPos.rows;
    const bottomContentHeight = promptLineUpDiff + (wrappedBottom ? height(wrappedBottom) : 0);
    // Stryker disable next-line EqualityOperator,ConditionalExpression: `cursorUp` writes nothing for zero rows or fewer, so the guard only skips a no-op
    if (bottomContentHeight > 0) output += cursorUp(bottomContentHeight);
    output += cursorTo(this.#cursorPos.cols);

    this.#write(cursorDown(this.#extraLinesUnderPrompt) + eraseLines(this.#height) + output);
    this.#extraLinesUnderPrompt = bottomContentHeight;
    this.#height = height(output);
  }

  /** Re-issue the horizontal move when readline has moved the cursor under a muted stream. */
  checkCursorPos(): void {
    const cursorPos = this.#rl.getCursorPos();
    if (cursorPos.cols !== this.#cursorPos.cols) {
      this.#write(cursorTo(cursorPos.cols));
      this.#cursorPos = cursorPos;
    }
  }

  /** Settle: leave the answer on screen, or erase it, and give the cursor back either way. */
  done({ clearContent }: { clearContent: boolean }): void {
    this.#rl.setPrompt('');
    let output = cursorDown(this.#extraLinesUnderPrompt);
    output += clearContent ? eraseLines(this.#height) : '\n';
    output += cursorLeft;
    output += cursorShow;
    this.#write(output);
    this.#rl.close();
  }
}
