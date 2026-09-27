/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * The terminal state a program is obliged to hand back — cursor, alternate screen, raw mode.
 *
 * Hiding the cursor is a global side effect on someone else's terminal. If the process
 * dies between the hide and the show — Ctrl-C during a prompt, a crash mid-spinner — the
 * cursor stays invisible in the user's shell until they type `reset`. The alternate screen
 * and raw mode are the same hazard, larger: a process that dies on the alternate screen
 * leaves the user looking at a frozen frame with their scrollback out of reach, and one that
 * dies in raw mode leaves a shell that echoes nothing and ignores Enter. Every renderer that
 * changes any of the three needs an exit handler, and writing that handler per renderer is
 * how three packages end up with three subtly different versions of it.
 *
 * Each call here makes the change **and** registers its undo, so the two cannot drift apart.
 * That pairing is the entire point of putting this here rather than in each caller (design R4).
 */

/** A restore for a stream that was never changed. */
const noop = (): void => undefined;

const ESC = '\u001B';
/**
 * The sequences this layer exists to undo, published because they are its vocabulary:
 * anything that hides a cursor owes a show on every exit path, and a caller writing them by
 * hand should be writing the same bytes we restore.
 */
export const HIDE_CURSOR = `${ESC}[?25l`;
export const SHOW_CURSOR = `${ESC}[?25h`;
/**
 * The alternate screen, DEC private mode 1049: entering saves the cursor and switches to a
 * blank buffer; leaving switches back and restores it, so the user's scrollback is as it was.
 */
export const ENTER_ALTERNATE_SCREEN = `${ESC}[?1049h`;
export const LEAVE_ALTERNATE_SCREEN = `${ESC}[?1049l`;

/** The half of `NodeJS.WriteStream` this needs, so a test can pass a recorder. */
export interface OutputStream {
  write(chunk: string): unknown;
  isTTY?: boolean;
}

/**
 * The half of `tty.ReadStream` raw mode needs. `setRawMode` is optional because a piped
 * `process.stdin` has none, and a caller should be able to pass `process.stdin` either way.
 */
export interface InputStream {
  isTTY?: boolean;
  /** Node's own record of the mode, read to learn whether somebody else turned it on. */
  isRaw?: boolean;
  setRawMode?(mode: boolean): unknown;
}

/** Where a pairing registers its undo — closeout's registry, or a caller's own. */
export type Registrar = (handler: () => void) => () => void;

/**
 * Register `undo`, and return the function that runs it early.
 *
 * The undo runs **at most once** whoever asks — the caller, the exit path, or both — and the
 * early call unregisters it too, so a program that cleans up normally leaves nothing behind
 * for exit to do. One function for all three pairings, because three copies of a once-flag
 * is how one of them ends up without it.
 */
function paired(undo: () => void, onExit: Registrar): () => void {
  let done = false;
  const run = (): void => {
    if (done) return;
    done = true;
    undo();
  };
  const unregister = onExit(run);
  return () => {
    run();
    unregister();
  };
}

/**
 * Show the cursor. Safe to call when it was never hidden, and safe to call twice — the
 * sequence is idempotent, which is what makes it usable from an exit path that may run
 * after a caller has already cleaned up.
 *
 * A non-TTY gets nothing: writing escape sequences into a pipe corrupts the output the
 * pipe exists to carry.
 */
export function showCursor(stream: OutputStream): void {
  if (stream.isTTY !== true) return;
  stream.write(SHOW_CURSOR);
}

/**
 * Hide the cursor, and register its restore.
 *
 * Returns the function that shows it again. Calling that function unregisters the handler
 * too, so a program that cleans up normally leaves nothing behind for exit to do.
 */
export function hideCursor(stream: OutputStream, onExit: Registrar): () => void {
  if (stream.isTTY !== true) return noop;
  stream.write(HIDE_CURSOR);
  return paired(() => stream.write(SHOW_CURSOR), onExit);
}

/**
 * Enter the alternate screen, and register leaving it.
 *
 * Returns the function that leaves it, with {@link hideCursor}'s contract: once only, and
 * calling it early unregisters the exit handler. A non-TTY gets nothing in either direction.
 */
export function alternateScreen(stream: OutputStream, onExit: Registrar): () => void {
  if (stream.isTTY !== true) return noop;
  stream.write(ENTER_ALTERNATE_SCREEN);
  return paired(() => stream.write(LEAVE_ALTERNATE_SCREEN), onExit);
}

/**
 * Turn raw mode on, and register turning it off.
 *
 * **Only a mode this call turned on is turned off.** If the input is already raw, somebody
 * else owns that state — a prompt library, the program itself — and switching it off at exit
 * would take it from them; the call changes nothing and returns a no-op. The same holds for
 * an input that is not a terminal or has no `setRawMode`: there is no mode to change.
 */
export function rawMode(input: InputStream, onExit: Registrar): () => void {
  if (input.isTTY !== true || input.setRawMode === undefined || input.isRaw === true) return noop;
  input.setRawMode(true);
  return paired(() => input.setRawMode?.(false), onExit);
}
