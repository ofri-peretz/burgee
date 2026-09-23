/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * `closeout/restore-cursor` — the drop-in path for `restore-cursor` (design R6, Y3).
 *
 * `restore-cursor` is 107.5 M/wk to show a cursor again, and it costs three packages to do
 * it: `restore-cursor` → `onetime` → `mimic-fn`, with `signal-exit` alongside. Every one of
 * those is a thing closeout already owns — the once-only wrapper, the exit registration, the
 * phase that guarantees the terminal is handed back *last*. This file is the shape that lets
 * `import restoreCursor from 'closeout/restore-cursor'` replace it, and it is graded by
 * `restore-cursor`'s own suite in `compat-oracle` rather than by anything written here.
 *
 * ## Two things the incumbent's suite decides that a reading of the README would not
 *
 * **1. The stream is chosen, and stderr wins.** `restore-cursor`'s four graded cases spawn a
 * child with `process.stdout.isTTY` and `process.stderr.isTTY` forced to each of the four
 * combinations and assert *which* of the two the escape sequence came out on: stderr if it
 * is a TTY, otherwise stdout if it is, otherwise nowhere at all. So the stream is a property
 * of the process, not an argument — which is why this file needs `ambientProcess()` and
 * `closeout.hideCursor(stream)` could not have served.
 *
 * **2. The TTY test happens when you call, and the write happens whatever `isTTY` says
 * later.** The fixture sets `isTTY`, calls `restoreCursor()`, then *deletes* `isTTY` and
 * falls off the end of the program — so the decision is taken at call time and the byte goes
 * out at exit regardless of what the flag says by then. `closeout.showCursor()` re-reads
 * `isTTY` at the moment it writes and would therefore write nothing at all, so the three
 * cases that expect the escape fail and only the one expecting silence passes. A façade built on
 * it scores 3 / 6 — measured 2026-09-14 by making exactly that edit — and a 3 / 6 reads
 * like a near miss when it is a wrong contract. The stream preference is worth the same
 * treatment: preferring stdout over stderr scores 5 / 6, one case away from silence.
 */
import { ambientProcess } from './ambient.js';
import { SHOW_CURSOR, type OutputStream } from './cursor.js';
import { onExit } from './install.js';

/**
 * The stream a restore belongs on, decided the way the incumbent decides it.
 *
 * stderr first: a program's *rendering* goes to stderr so that its data can be piped, which
 * is why every cursor-owning package in this layer — `cli-cursor`, `ora`, `log-update` —
 * restores stderr's cursor whatever stream it was drawing to.
 */
function terminal(): OutputStream | undefined {
  const proc = ambientProcess();
  if (proc === undefined) return undefined;
  if (proc.stderr.isTTY === true) return proc.stderr;
  return proc.stdout?.isTTY === true ? proc.stdout : undefined;
}

/**
 * Registered at most once per process, which is what `onetime` buys upstream.
 *
 * A module-level flag rather than a wrapper: the thing that must not happen twice is the
 * *registration*, not the call, and two registrations would write the sequence twice. Both
 * are harmless on a terminal — the escape is idempotent — and neither is harmless in a test
 * that asserts the exact bytes, which is precisely what the graded suite does.
 */
let registered = false;

/**
 * Arrange for the cursor to be shown again however this process ends.
 *
 * A no-op when neither stream is a terminal: writing escape sequences into a pipe corrupts
 * the output the pipe exists to carry, and the incumbent's fourth case asserts exactly that
 * nothing is written.
 *
 * The handler goes in the `restore` phase, which is closeout's answer to upstream's
 * `{ alwaysLast: true }` and a stronger one: `alwaysLast` is a two-bucket sort over
 * registration order, while a phase is a named position that every other handler — including
 * a plugin's (`plugin.ts`) — is ordered against by declaration rather than by import order.
 */
// `import restoreCursor from 'closeout/restore-cursor'` is the drop-in, so the entry has to
// be a default — the incumbent's is.
// eslint-disable-next-line import-next/no-default-export -- the incumbent's entry is a default export and Y3 is the whole point of this file
export default function restoreCursor(): void {
  if (registered) return;
  const stream = terminal();
  if (stream === undefined) return;
  registered = true;
  /*
   * The captured stream, written unconditionally — see the header. Re-testing `isTTY` here
   * is the bug the incumbent's own fixtures catch, because they delete it before exiting.
   */
  onExit(() => {
    stream.write(SHOW_CURSOR);
  }, 'restore');
}
