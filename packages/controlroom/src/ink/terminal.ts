/**
 * ink's write protocol, and the one file under `src/ink/` that writes to a stream.
 *
 * ink's suite grades what reaches `stdout` byte for byte and write for write: a synchronized
 * update is its own `write('\u001B[?2026h')` call, a frame is `eraseLines(previous) + frame`
 * in one call, `debug` mode writes the whole frame and nothing else. flagstaff's
 * `frameWriter` (R3) is the family's repaint for a frame that it owns — rows diffed inside one
 * synchronized block — and that is a different set of bytes, so a drop-in painting through it
 * fails the suite that defines the contract (D-20261005-controlroom-ink-writes). This file is
 * therefore the drop-in's single stream boundary, as `runtime.ts` is the core's: every write
 * is a call here, and every sequence is the family's — the cursor, erase, screen and kitty
 * sequences from `paratext/csi`, the cursor's show and hide, bracketed paste and the cursor's
 * restore-on-exit from `closeout` — so controlroom still spells none of its own (constraint 5).
 */
import { DISABLE_BRACKETED_PASTE, ENABLE_BRACKETED_PASTE, HIDE_CURSOR, SHOW_CURSOR } from 'closeout/cursor';
import restoreCursor from 'closeout/restore-cursor';
import { width as stringWidth } from 'linegauge';
import {
  beginSynchronizedOutput,
  cursorDown,
  cursorMove,
  cursorNextLine,
  cursorTo,
  cursorUp,
  endSynchronizedOutput,
  enterAlternativeScreen,
  eraseDown,
  eraseEndLine,
  eraseLines,
  exitAlternativeScreen,
  kittyKeyboardPop,
  kittyKeyboardPush,
  kittyKeyboardQuery,
} from 'paratext/csi';

import { sgrCodes, stripSgr } from './ansi.js';

/** What ink writes to: a Node stream, or a test's spy with the same `write`. */
export interface InkStream {
  write(chunk: string, callback?: () => void): unknown;
  isTTY?: boolean;
  columns?: number;
  rows?: number;
  on?(event: string, listener: (...args: unknown[]) => void): unknown;
  off?(event: string, listener: (...args: unknown[]) => void): unknown;
  destroyed?: boolean;
  writableEnded?: boolean;
  writable?: boolean;
}

export const bsu = beginSynchronizedOutput;
export const esu = endSynchronizedOutput;
export { eraseLines };

/** The full-clear path: home, then erase down — never CSI 2J or 3J, which take the scrollback. */
export const homeAndEraseDown = cursorTo(0, 0) + eraseDown;
export const hideCursorEscape = HIDE_CURSOR;
export const showCursorEscape = SHOW_CURSOR;

/** ink's `shouldSynchronize`: a terminal, and an interactive run. */
export const shouldSynchronize = (stream: InkStream, interactive: boolean): boolean => stream.isTTY === true && interactive;

export function write(stream: InkStream, data: string, callback?: () => void): void {
  if (callback === undefined) stream.write(data);
  else stream.write(data, callback);
}

/** A write to a stream that may already be gone at shutdown. */
export function writeBestEffort(stream: InkStream, data: string): void {
  try {
    stream.write(data);
  } catch {
    // The stream is closed; there is nobody left to tell.
  }
}

export const enterAlternateScreen = (stream: InkStream): void => {
  writeBestEffort(stream, enterAlternativeScreen);
  writeBestEffort(stream, HIDE_CURSOR);
};
export const leaveAlternateScreen = (stream: InkStream): void => {
  writeBestEffort(stream, exitAlternativeScreen);
  writeBestEffort(stream, SHOW_CURSOR);
};
export const alternateScreenEnter = enterAlternativeScreen;
export const alternateScreenLeave = exitAlternativeScreen;
export const kittyPush = (stream: InkStream, flags: number): void => void stream.write(kittyKeyboardPush(flags));
export const kittyPushSequence = kittyKeyboardPush;
export const kittyPop = (stream: InkStream): void => writeBestEffort(stream, kittyKeyboardPop);
export const kittyQuery = (stream: InkStream): void => void stream.write(kittyKeyboardQuery);
export const bracketedPasteOn = (stream: InkStream): void => void stream.write(ENABLE_BRACKETED_PASTE);
export const bracketedPasteOff = (stream: InkStream): void => void stream.write(DISABLE_BRACKETED_PASTE);

// ── The cursor (cli-cursor's contract) ──────────────────────────────────────────────────

export function hideCursorOn(stream: InkStream): void {
  if (stream.isTTY !== true) return;
  restoreCursor();
  stream.write(HIDE_CURSOR);
}

export function showCursorOn(stream: InkStream): void {
  if (stream.isTTY !== true) return;
  stream.write(SHOW_CURSOR);
}

export interface CursorPosition {
  x: number;
  y: number;
}

export const cursorPositionChanged = (a: CursorPosition | undefined, b: CursorPosition | undefined): boolean => a?.x !== b?.x || a?.y !== b?.y;

/** From the row the renderer left the cursor on up to `position`, and show it. */
export function buildCursorSuffix(bottomLine: number, position: CursorPosition | undefined): string {
  if (position === undefined) return '';
  const up = bottomLine - position.y;
  return (up > 0 ? cursorUp(up) : '') + cursorTo(position.x) + SHOW_CURSOR;
}

/** From `previous` back to the bottom of the output, before anything that assumes it is there. */
export function buildReturnToBottom(previousLineCount: number, previous: CursorPosition | undefined): string {
  if (previous === undefined) return '';
  const down = previousLineCount - 1 - previous.y;
  return (down > 0 ? cursorDown(down) : '') + cursorTo(0);
}

export function buildCursorOnlySequence(input: { cursorWasShown: boolean; previousLineCount: number; previousCursorPosition: CursorPosition | undefined; cursorPosition: CursorPosition | undefined }): string {
  const hide = input.cursorWasShown ? HIDE_CURSOR : '';
  return hide + buildReturnToBottom(input.previousLineCount, input.previousCursorPosition) + buildCursorSuffix(input.previousLineCount - 1, input.cursorPosition);
}

export const buildReturnToBottomPrefix = (shown: boolean, previousLineCount: number, previous: CursorPosition | undefined): string => (shown ? HIDE_CURSOR + buildReturnToBottom(previousLineCount, previous) : '');

/** Erase the previous frame; with a cursor shown, from its top row found relative to the cursor. */
export function buildEraseFrame(previousLineCount: number, previous: CursorPosition | undefined): string {
  if (previous === undefined) return eraseLines(previousLineCount);
  const rowsBelowTop = Math.min(previous.y, previousLineCount - 1);
  return HIDE_CURSOR + cursorMove(0, -rowsBelowTop) + cursorTo(0) + eraseDown;
}

/** Walk up from a cursor shown inside the frame to its top row, and erase down from there. */
export const eraseFromCursor = (y: number): string => (y > 0 ? cursorUp(y) : '') + cursorTo(0) + eraseDown;

// ── line-update: a changed line, leaving its identical styled prefix on screen ──────────

const lineSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const CONTROL = /\p{Control}/u;
const PRINTABLE_ASCII = /^[ -~]*$/u;

/** ink's `lineUpdate`: from the first changed column when that is safe, else the whole line. */
export function lineUpdate(previous: string, next: string, columns: number | undefined): string {
  const full = cursorTo(0) + eraseEndLine + next;
  if (columns === undefined || Number.isNaN(columns) || columns < 1) return full;
  let common = 0;
  while (common < previous.length && common < next.length && previous[common] === next[common]) common += 1;
  if (common === 0) return full;
  const previousText = stripSgr(previous);
  const nextText = stripSgr(next);
  if (CONTROL.test(previousText) || CONTROL.test(nextText)) return full;
  const codes = sgrCodes(next);
  let textLimit = common;
  for (const { index, value } of codes) {
    if (index >= common) break;
    // A difference inside an SGR sequence repaints from before that sequence.
    textLimit -= Math.min(value.length, common - index);
  }
  let textLength = 0;
  let column = 0;
  if (PRINTABLE_ASCII.test(previousText) && PRINTABLE_ASCII.test(nextText)) {
    textLength = textLimit;
    column = textLimit;
  } else {
    const previousSegments = lineSegmenter.segment(previousText)[Symbol.iterator]();
    for (const { segment, index } of lineSegmenter.segment(nextText)) {
      if (index + segment.length > textLimit || (previousSegments.next().value as { segment: string } | undefined)?.segment !== segment) break;
      textLength = index + segment.length;
    }
    column = stringWidth(nextText.slice(0, textLength));
  }
  // CHA clamps at the last cell, so a wrap-pending cursor after a full-width prefix cannot be reproduced.
  if (column === 0 || column >= columns || column + stringWidth(previousText.slice(textLength)) > columns || column + stringWidth(nextText.slice(textLength)) > columns) return full;
  let offset = textLength;
  let styles = '';
  for (const { index, value } of codes) {
    if (index > offset || index + value.length > common) break;
    offset += value.length;
    styles += value;
  }
  const partial = cursorTo(column) + eraseEndLine + styles + next.slice(offset);
  return partial.length < full.length ? partial : full;
}

// ── log-update, as ink forks it ─────────────────────────────────────────────────────────

export interface LogUpdate {
  (text: string): boolean;
  clear(): void;
  done(): void;
  reset(): void;
  sync(text: string): void;
  setCursorPosition(position: CursorPosition | undefined): void;
  isCursorDirty(): boolean;
  willRender(text: string): boolean;
  getCursorPosition(): CursorPosition | undefined;
}

const visibleLineCount = (lines: string[], text: string): number => (text.endsWith('\n') ? lines.length - 1 : lines.length);

interface Shared {
  hidden: boolean;
  position: CursorPosition | undefined;
  dirty: boolean;
  previousPosition: CursorPosition | undefined;
  shown: boolean;
  previousOutput: string;
}

/** The parts both writers share: the cursor intent and the bookkeeping around it. */
function common(stream: InkStream, keepCursor: boolean, state: Shared, lineCount: () => number, forget: () => void): Omit<LogUpdate, never> {
  const active = (): CursorPosition | undefined => (state.dirty ? state.position : undefined);
  const changes = (text: string, cursor: CursorPosition | undefined): boolean => text !== state.previousOutput || cursorPositionChanged(cursor, state.previousPosition);
  const render = (() => false) as unknown as LogUpdate;
  render.clear = () => {
    stream.write(buildEraseFrame(lineCount(), state.previousPosition));
    state.previousOutput = '';
    forget();
    state.previousPosition = undefined;
    state.shown = false;
  };
  render.done = () => {
    if (state.previousPosition !== undefined) stream.write(buildReturnToBottom(lineCount(), state.previousPosition));
    state.previousOutput = '';
    forget();
    state.previousPosition = undefined;
    state.shown = false;
    if (keepCursor) return;
    showCursorOn(stream);
    state.hidden = false;
  };
  render.reset = () => {
    state.previousOutput = '';
    forget();
    state.previousPosition = undefined;
    state.shown = false;
  };
  render.setCursorPosition = (next) => {
    state.position = next;
    state.dirty = true;
  };
  render.isCursorDirty = () => state.dirty;
  render.willRender = (text) => changes(text, active());
  render.getCursorPosition = () => state.previousPosition;
  return Object.assign(render, { active, changes }) as LogUpdate & { active: typeof active; changes: typeof changes };
}

function createStandard(stream: InkStream, keepCursor: boolean): LogUpdate {
  let previousLineCount = 0;
  const state: Shared = { hidden: false, position: undefined, dirty: false, previousPosition: undefined, shown: false, previousOutput: '' };
  const base = common(stream, keepCursor, state, () => previousLineCount, () => (previousLineCount = 0)) as LogUpdate & { active: () => CursorPosition | undefined; changes: (t: string, c: CursorPosition | undefined) => boolean };
  const render = ((text: string): boolean => {
    if (!keepCursor && !state.hidden) {
      hideCursorOn(stream);
      state.hidden = true;
    }
    const cursor = base.active();
    state.dirty = false;
    const cursorChanged = cursorPositionChanged(cursor, state.previousPosition);
    if (!base.changes(text, cursor)) return false;
    const lines = text.split('\n');
    const suffix = buildCursorSuffix(lines.length - 1, cursor);
    if (text === state.previousOutput && cursorChanged) {
      stream.write(buildCursorOnlySequence({ cursorWasShown: state.shown, previousLineCount, previousCursorPosition: state.previousPosition, cursorPosition: cursor }));
    } else {
      state.previousOutput = text;
      stream.write(buildReturnToBottomPrefix(state.shown, previousLineCount, state.previousPosition) + eraseLines(previousLineCount) + text + suffix);
      previousLineCount = lines.length;
    }
    state.previousPosition = cursor === undefined ? undefined : { ...cursor };
    state.shown = cursor !== undefined;
    return true;
  }) as LogUpdate;
  Object.assign(render, { clear: base.clear, done: base.done, reset: base.reset, setCursorPosition: base.setCursorPosition, isCursorDirty: base.isCursorDirty, willRender: base.willRender, getCursorPosition: base.getCursorPosition });
  render.sync = (text: string) => {
    const cursor = state.dirty ? state.position : undefined;
    state.dirty = false;
    const lines = text.split('\n');
    state.previousOutput = text;
    previousLineCount = lines.length;
    if (cursor === undefined && state.shown) stream.write(HIDE_CURSOR);
    if (cursor !== undefined) stream.write(buildCursorSuffix(lines.length - 1, cursor));
    state.previousPosition = cursor === undefined ? undefined : { ...cursor };
    state.shown = cursor !== undefined;
  };
  return render;
}

function createIncremental(stream: InkStream, keepCursor: boolean): LogUpdate {
  let previousLines: string[] = [];
  let previousColumns = stream.columns;
  const state: Shared = { hidden: false, position: undefined, dirty: false, previousPosition: undefined, shown: false, previousOutput: '' };
  const base = common(stream, keepCursor, state, () => previousLines.length, () => (previousLines = [])) as LogUpdate & { active: () => CursorPosition | undefined; changes: (t: string, c: CursorPosition | undefined) => boolean };
  const render = ((text: string): boolean => {
    if (!keepCursor && !state.hidden) {
      hideCursorOn(stream);
      state.hidden = true;
    }
    const cursor = base.active();
    state.dirty = false;
    const cursorChanged = cursorPositionChanged(cursor, state.previousPosition);
    if (!base.changes(text, cursor)) return false;
    const columnsUnchanged = previousColumns === stream.columns;
    previousColumns = stream.columns;
    const nextLines = text.split('\n');
    const visible = visibleLineCount(nextLines, text);
    const previousVisible = visibleLineCount(previousLines, state.previousOutput);
    const settle = (): void => {
      state.shown = cursor !== undefined;
      state.previousPosition = cursor === undefined ? undefined : { ...cursor };
    };
    if (text === state.previousOutput && cursorChanged) {
      stream.write(buildCursorOnlySequence({ cursorWasShown: state.shown, previousLineCount: previousLines.length, previousCursorPosition: state.previousPosition, cursorPosition: cursor }));
      settle();
      return true;
    }
    const prefix = buildReturnToBottomPrefix(state.shown, previousLines.length, state.previousPosition);
    if (text === '\n' || state.previousOutput.length === 0) {
      stream.write(prefix + eraseLines(previousLines.length) + text + buildCursorSuffix(nextLines.length - 1, cursor));
      settle();
      state.previousOutput = text;
      previousLines = nextLines;
      return true;
    }
    const trailing = text.endsWith('\n');
    let buffer = prefix;
    if (visible < previousVisible) buffer += eraseLines(previousVisible - visible + (state.previousOutput.endsWith('\n') ? 1 : 0)) + cursorUp(visible);
    else if (previousLines.length > 1) buffer += cursorUp(previousLines.length - 1);
    for (let i = 0; i < visible; i += 1) {
      const last = i === visible - 1;
      if (i < previousVisible && nextLines[i] === previousLines[i]) {
        if (!last || trailing) buffer += cursorNextLine;
        continue;
      }
      const nextLine = nextLines[i]!;
      const changed = columnsUnchanged && nextLines.length === previousLines.length ? lineUpdate(previousLines[i]!, nextLine, stream.columns) : cursorTo(0) + eraseEndLine + nextLine;
      buffer += changed + (last && !trailing ? '' : '\n');
    }
    stream.write(buffer + buildCursorSuffix(nextLines.length - 1, cursor));
    settle();
    state.previousOutput = text;
    previousLines = nextLines;
    return true;
  }) as LogUpdate;
  Object.assign(render, { clear: base.clear, done: base.done, reset: base.reset, setCursorPosition: base.setCursorPosition, isCursorDirty: base.isCursorDirty, willRender: base.willRender, getCursorPosition: base.getCursorPosition });
  render.sync = (text: string) => {
    const cursor = state.dirty ? state.position : undefined;
    state.dirty = false;
    previousColumns = stream.columns;
    const lines = text.split('\n');
    state.previousOutput = text;
    previousLines = lines;
    if (cursor === undefined && state.shown) stream.write(HIDE_CURSOR);
    if (cursor !== undefined) stream.write(buildCursorSuffix(lines.length - 1, cursor));
    state.previousPosition = cursor === undefined ? undefined : { ...cursor };
    state.shown = cursor !== undefined;
  };
  return render;
}

/** The live frame's writer: erase the previous frame's rows and write the next, or — with `incremental` — rewrite only what changed. */
export function createLogUpdate(stream: InkStream, { showCursor: keepCursor = false, incremental = false }: { showCursor?: boolean; incremental?: boolean } = {}): LogUpdate {
  return incremental ? createIncremental(stream, keepCursor) : createStandard(stream, keepCursor);
}

/** ink's `log-update` module object, which its suite imports by path. */
export const logUpdate = { create: createLogUpdate };
