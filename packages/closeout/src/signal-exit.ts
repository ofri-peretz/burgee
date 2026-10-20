/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * `closeout/signal-exit` for `import` — the ES door of the `signal-exit` drop-in.
 *
 * The same four names as the CommonJS door, `signal-exit.cts`, over the same machine,
 * `signal-exit-core.ts`, and the same per-process emitter. It exists so that a bundle which
 * imports `onExit` carries no CommonJS interop: through the CommonJS door the B4 row read
 * 3,634 B against `signal-exit`'s 2,856 B (`.sdlc/intents/closeout-at-incumbent-weight/`).
 * `signal-exit` ships the same two builds, `dist/mjs` and `dist/cjs`, for the same reason.
 *
 * Evaluated once per process, as every ES module is. The suite that re-evaluates the module
 * under a changed `process` does it through `require()`, which reaches the CommonJS door.
 */
import { ambientProcess } from './ambient.js';
import { signalExit } from './signal-exit-core.js';
import { signalsOn } from './signal-list.js';

/** The fatal signals for this platform, read at load as the CommonJS door reads them. */
export const signals: string[] = signalsOn();

/** `onExit(handler, options?)`, `load()` and `unload()`, wired to the process found at load. */
export const { onExit, load, unload } = signalExit(ambientProcess(), signals);
