/**
 * Ink's write protocol, and the one file under `src/ink/` that writes to a stream.
 *
 * Ink's suite grades what reaches `stdout` byte for byte and write for write: a synchronized
 * update is its own `write('\u001B[?2026h')` call, a frame is `eraseLines(previous) + frame`
 * in one call, `debug` mode writes the whole frame and nothing else. flagstaff's
 * `frameWriter` (R3) is the family's repaint for a frame that it owns — rows diffed inside one
 * synchronized block — and that is a different set of bytes, so a drop-in painting through it
 * fails the suite that defines the contract (D-20261005-controlroom-ink-writes). This file is
 * therefore the drop-in's single stream boundary, as `runtime.ts` is the core's: every write
 * is a call here, and every sequence is the family's — the cursor and erase sequences from
 * `paratext/csi`, the cursor's show and hide and its restore-on-exit from `closeout` —
 * so controlroom still spells none of its own (constraint 5).
 */
import { HIDE_CURSOR, SHOW_CURSOR, showCursor } from 'closeout/cursor';
import restoreCursor from 'closeout/restore-cursor';
import { beginSynchronizedOutput, clearTerminal, cursorDown, cursorNextLine, cursorTo, cursorUp, endSynchronizedOutput, eraseEndLine, eraseLines } from 'paratext/csi';

/** What Ink writes to: a Node stream, or a test's spy with the same `write`. */
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
  writableLength?: number;
  _writableState?: unknown;
}

export const bsu = beginSynchronizedOutput;
export const esu = endSynchronizedOutput;
export { clearTerminal, eraseLines };

export function write(stream: InkStream, data: string, callback?: () => void): void {
  if (callback === undefined) stream.write(data);
  else stream.write(data, callback);
}

// ── The cursor (cli-cursor's contract) ──────────────────────────────────────────────────

export function hideCursorOn(stream: InkStream): void {
  if (stream.isTTY !== true) return;
  restoreCursor();
  stream.write(HIDE_CURSOR);
}

export function showCursorOn(stream: InkStream): void {
  showCursor(stream);
}

export interface CursorPosition {
  x: number;
  y: number;
}

const moved = (a: CursorPosition | undefined, b: CursorPosition | undefined): boolean => a?.x !== b?.x || a?.y !== b?.y;

function cursorSuffix(visibleLines: number, position: CursorPosition | undefined): string {
  if (position === undefined) return '';
  const up = visibleLines - position.y;
  return (up > 0 ? cursorUp(up) : '') + cursorTo(position.x) + SHOW_CURSOR;
}

function returnToBottom(previousLines: number, position: CursorPosition | undefined): string {
  if (position === undefined) return '';
  const down = previousLines - 1 - position.y;
  return (down > 0 ? cursorDown(down) : '') + cursorTo(0);
}

const returnPrefix = (shown: boolean, previousLines: number, position: CursorPosition | undefined): string => (shown ? HIDE_CURSOR + returnToBottom(previousLines, position) : '');

const visibleCount = (lines: string[], text: string): number => (text.endsWith('\n') ? lines.length - 1 : lines.length);

// ── log-update, as Ink forks it ─────────────────────────────────────────────────────────

export interface LogUpdate {
  (text: string): boolean;
  clear(): void;
  done(): void;
  sync(text: string): void;
  setCursorPosition(position: CursorPosition | undefined): void;
  isCursorDirty(): boolean;
  willRender(text: string): boolean;
}

/**
 * The live frame's writer: erase the previous frame's rows and write the next, or — with
 * `incremental` — rewrite only the rows that changed. Either way a frame identical to the
 * last, with the cursor where it was, writes nothing.
 */
export function createLogUpdate(stream: InkStream, { showCursor: keepCursor = false, incremental = false }: { showCursor?: boolean; incremental?: boolean } = {}): LogUpdate {
  let previousLines: string[] = [];
  let previousOutput = '';
  let hidden = false;
  let position: CursorPosition | undefined;
  let dirty = false;
  let previousPosition: CursorPosition | undefined;
  let shown = false;
  const active = (): CursorPosition | undefined => (dirty ? position : undefined);
  const changes = (text: string, cursor: CursorPosition | undefined): boolean => text !== previousOutput || moved(cursor, previousPosition);
  const settle = (text: string, lines: string[], cursor: CursorPosition | undefined): void => {
    previousOutput = text;
    previousLines = lines;
    previousPosition = cursor === undefined ? undefined : { ...cursor };
    shown = cursor !== undefined;
  };

  const render = ((text: string): boolean => {
    if (!keepCursor && !hidden) {
      hideCursorOn(stream);
      hidden = true;
    }
    const cursor = active();
    dirty = false;
    if (!changes(text, cursor)) return false;
    const lines = text.split('\n');
    const visible = visibleCount(lines, text);
    if (text === previousOutput) {
      stream.write(
        (shown ? HIDE_CURSOR : '') + returnToBottom(previousLines.length, previousPosition) + cursorSuffix(visible, cursor),
      );
      previousPosition = cursor === undefined ? undefined : { ...cursor };
      shown = cursor !== undefined;
      return true;
    }
    const prefix = returnPrefix(shown, previousLines.length, previousPosition);
    if (!incremental || text === '\n' || previousOutput.length === 0) {
      stream.write(prefix + eraseLines(previousLines.length) + text + cursorSuffix(visible, cursor));
      settle(text, lines, cursor);
      return true;
    }
    const previousVisible = visibleCount(previousLines, previousOutput);
    const trailing = text.endsWith('\n');
    let buffer = prefix;
    if (visible < previousVisible) buffer += eraseLines(previousVisible - visible + (previousOutput.endsWith('\n') ? 1 : 0)) + cursorUp(visible);
    else buffer += cursorUp(previousVisible - 1);
    for (let i = 0; i < visible; i += 1) {
      const last = i === visible - 1;
      if (lines[i] === previousLines[i]) {
        if (!last || trailing) buffer += cursorNextLine;
        continue;
      }
      buffer += cursorTo(0) + lines[i]! + eraseEndLine + (last && !trailing ? '' : '\n');
    }
    stream.write(buffer + cursorSuffix(visible, cursor));
    settle(text, lines, cursor);
    return true;
  }) as LogUpdate;

  render.clear = () => {
    stream.write(returnPrefix(shown, previousLines.length, previousPosition) + eraseLines(previousLines.length));
    previousOutput = '';
    previousLines = [];
    previousPosition = undefined;
    shown = false;
  };
  render.done = () => {
    previousOutput = '';
    previousLines = [];
    previousPosition = undefined;
    shown = false;
    if (!keepCursor) {
      showCursorOn(stream);
      hidden = false;
    }
  };
  render.sync = (text: string) => {
    const cursor = active();
    dirty = false;
    const lines = text.split('\n');
    if (cursor === undefined && shown) stream.write(HIDE_CURSOR);
    if (cursor !== undefined) stream.write(cursorSuffix(visibleCount(lines, text), cursor));
    settle(text, lines, cursor);
  };
  render.setCursorPosition = (next) => {
    position = next;
    dirty = true;
  };
  render.isCursorDirty = () => dirty;
  render.willRender = (text: string) => changes(text, active());
  return render;
}
