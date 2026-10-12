/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * `closeout/cli-cursor` — the drop-in path for `cli-cursor` 5 (`graded-override-targets` R4).
 *
 * cli-cursor's default export, `{ show, hide, toggle }`, graded by cli-cursor's own suite in
 * `compat-oracle`. It writes closeout's own sequences (`SHOW_CURSOR`, `HIDE_CURSOR`), and a
 * hide arranges the show-on-exit through `closeout/restore-cursor`, which is what cli-cursor
 * does through `restore-cursor` — the handler goes in closeout's `restore` phase, last.
 *
 * `closeout/cursor`'s `hideCursor(stream, onExit)` stays the family's API: it returns its own
 * undo and takes the registrar as an argument. This file is cli-cursor's shape over the same
 * vocabulary: a stream defaulting to `process.stderr`, read at each call, and one visibility
 * flag for the whole process that `toggle` reads.
 */
import { ambientProcess } from './ambient.js';
import { HIDE_CURSOR, SHOW_CURSOR, type OutputStream } from './cursor.js';
import restoreCursor from './restore-cursor.js';

/** Whether the last call that wrote anything hid the cursor — cli-cursor's `isHidden`. */
let isHidden = false;

const stderr = (): OutputStream | undefined => ambientProcess()?.stderr;

/** Show the cursor on `stream` (default: `process.stderr`). Nothing on a stream that is not a terminal. */
function show(stream: OutputStream | undefined = stderr()): void {
  if (stream?.isTTY !== true) return;
  isHidden = false;
  stream.write(SHOW_CURSOR);
}

/** Hide the cursor on `stream` (default: `process.stderr`), and make sure it is shown again at exit. */
function hide(stream: OutputStream | undefined = stderr()): void {
  if (stream?.isTTY !== true) return;
  restoreCursor();
  isHidden = true;
  stream.write(HIDE_CURSOR);
}

/** Show the cursor if it is hidden and hide it if not; `force` sets what "hidden" is first. */
function toggle(force?: boolean, stream?: OutputStream): void {
  if (force !== undefined) isHidden = force;
  if (isHidden) show(stream);
  else hide(stream);
}

const cliCursor = { show, hide, toggle };

// `import cliCursor from 'closeout/cli-cursor'` is the drop-in, so the entry has to be a
// default — the incumbent's is.
// eslint-disable-next-line import-next/no-default-export -- the incumbent's entry is a default export, and it is the whole point of this file
export default cliCursor;
