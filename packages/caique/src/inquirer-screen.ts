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
 * The cursor-visibility sequence is the exception and comes from `closeout`, which owns it
 * across the family. The rest are CSI, which `paratext` states as out of scope, so there is
 * no family subpath to take them from and they are stated here.
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
import { wrap } from 'linegauge/wrap';

import { processRuntime } from './runtime.js';

const ESC = '[';

/** Move the cursor to the first column. */
export const cursorLeft = `${ESC}G`;

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
export const cursorUp = (rows = 1): string => (rows > 0 ? `${ESC}${String(rows)}A` : '');

/** Move the cursor down `rows` rows. */
export const cursorDown = (rows = 1): string => (rows > 0 ? `${ESC}${String(rows)}B` : '');

/** Move the cursor to column `x` (zero-based), or to `(x, y)` when a row is given. */
export const cursorTo = (x: number, y?: number): string => (typeof y === 'number' && !Number.isNaN(y) ? `${ESC}${String(y + 1)};${String(x + 1)}H` : `${ESC}${String(x + 1)}G`);

const eraseLine = `${ESC}2K`;

/** Erase `lines` lines, ending on the first column of the topmost one. */
export const eraseLines = (lines: number): string => (lines > 0 ? (eraseLine + cursorUp(1)).repeat(lines - 1) + eraseLine + cursorLeft : '');

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
  if (typeof declared === 'number' && declared > 0) return declared;
  const fromEnv = Number.parseInt(processRuntime().env['COLUMNS'] ?? '', DECIMAL);
  return Number.isNaN(fromEnv) || fromEnv <= 0 ? DEFAULT_WIDTH : fromEnv;
}

/**
 * Hard-wrap every line at `width`, keeping escape sequences intact and trailing whitespace
 * off. `linegauge/wrap` is this repository's port of `wrap-ansi`, graded against it.
 */
export function breakLines(content: string, width: number): string {
  return content
    .split('\n')
    .flatMap((line) =>
      wrap(line, width, { trim: false, wordWrap: false })
        .split('\n')
        .map((row) => row.trimEnd()),
    )
    .join('\n');
}

const height = (content: string): number => content.split('\n').length;

const lastLine = (content: string): string => content.split('\n').pop() ?? '';

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
    const wrapped = breakLines(content, width);
    const wrappedBottom = breakLines(bottomContent, width);

    // Exactly at the right edge, the cursor would otherwise land at the start of the line
    // it has just filled. One more newline puts it where a person expects it.
    const body = rawPromptLine.length % width === 0 ? `${wrapped}\n` : wrapped;

    let output = body + (wrappedBottom ? `\n${wrappedBottom}` : '');
    const promptLineUpDiff = Math.floor(rawPromptLine.length / width) - this.#cursorPos.rows;
    const bottomContentHeight = promptLineUpDiff + (wrappedBottom ? height(wrappedBottom) : 0);
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
