/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * The terminal state a program is obliged to hand back.
 *
 * Hiding the cursor is a global side effect on someone else's terminal. If the process
 * dies between the hide and the show — Ctrl-C during a prompt, a crash mid-spinner — the
 * cursor stays invisible in the user's shell until they type `reset`. Every renderer that
 * hides it therefore needs an exit handler, and writing that handler per renderer is how
 * three packages end up with three subtly different versions of it.
 *
 * `hideCursor` registers the restore at the same moment it hides, so the two cannot drift
 * apart. That pairing is the entire point of putting this here rather than in each caller.
 */

/** A restore for a stream that was never hidden. */
const noop = (): void => undefined;

const ESC = '\u001B';
const HIDE = `${ESC}[?25l`;
const SHOW = `${ESC}[?25h`;

/** The half of `NodeJS.WriteStream` this needs, so a test can pass a recorder. */
export interface OutputStream {
  write(chunk: string): unknown;
  isTTY?: boolean;
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
  stream.write(SHOW);
}

/**
 * Hide the cursor, and register its restore.
 *
 * Returns the function that shows it again. Calling that function unregisters the handler
 * too, so a program that cleans up normally leaves nothing behind for exit to do.
 */
export function hideCursor(stream: OutputStream, onExit: (handler: () => void) => () => void): () => void {
  if (stream.isTTY !== true) return noop;

  stream.write(HIDE);
  let shown = false;
  const show = (): void => {
    if (shown) return;
    shown = true;
    stream.write(SHOW);
  };
  const unregister = onExit(show);

  return () => {
    show();
    unregister();
  };
}
