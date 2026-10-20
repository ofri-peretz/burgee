/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * `closeout/signal-exit` — the drop-in path for `signal-exit` 4 (design R6, Y3).
 *
 * Graded by `signal-exit`'s own suite in `compat-oracle`. The machine is `signal-exit-core.ts`;
 * this file is the door `require()` reaches, and `signal-exit.ts` the one `import` reaches.
 * Unlike `closeout/exit-hook`, this
 * façade does not run through `registry.ts`, and that is a finding rather than a shortcut:
 * `signal-exit`'s contract is not "run these handlers once" but a set of facts about the
 * process, and the suite asserts each one by spawning a child and reading how it died.
 *
 * - **A fatal signal still kills.** When the only listeners for a signal are this module's,
 *   the handlers run and the signal is re-raised, so the parent sees `signal: 'SIGHUP'`, not
 *   an exit code. A handler returning `true` claims the signal and the process lives on.
 * - **Every exit path is seen**, including `process.exit()` and `process.reallyExit()`, which
 *   is why `emit` and `reallyExit` are wrapped while loaded and restored on `unload()`.
 * - **One emitter per process**, published under `Symbol.for('signal-exit emitter')`. That is
 *   the key `signal-exit` itself uses, so a program with this façade and a transitive copy of
 *   the real package runs every handler once, in registration order, and re-raises once.
 * - **No process, no-op.** A runtime without a usable `process` gets functions that do
 *   nothing and an unsubscribe that works, captured at load as upstream captures it.
 *
 * ## Why this one file is CommonJS
 *
 * The package is ESM; this entry is `.cts`, compiled to `.cjs`. The suite requires it, deletes
 * it from `require.cache`, changes `globalThis.process` and requires it again, expecting a
 * fresh evaluation that sees the new process (`no-process.js`, `signals.js`). An ES module is
 * evaluated once per process however the cache is edited — measured on Node 24.13, the second
 * `require()` returns the first instance — so an ESM façade fails four cases for a reason
 * that is about module semantics, not behaviour. `signal-exit` ships CommonJS; so does this.
 */
import ambient = require('./ambient.js');
import core = require('./signal-exit-core.js');
import signalList = require('./signal-exit-signals.cjs');

const { signals } = signalList;

// Captured at load, as upstream does: `process-deleted-after-load.js` deletes the global
// after this line and still expects its handler to run. Read through `ambient.ts`, the
// package's one door to the process (R7) — a `require()` of an ES module, which a CommonJS
// file may do on every Node this package supports, and cheap to re-run: `ambientProcess()` and
// `signalExit()` are functions, so a re-evaluation of this file wires whatever `process` is by
// then.
const active = core.signalExit(ambient.ambientProcess(), signals);

// An object of names, because that is the form Node's CommonJS lexer reads as named exports:
// `import { onExit } from 'closeout/signal-exit'` works from ESM as well. `onExit` calls
// the handler once however the process ends and returns its remover; `load` attaches the
// signal listeners and exit wrappers now rather than at the first `onExit`; `unload` detaches
// them, leaving registered handlers registered but not run.
const { onExit: onExitExport, load: loadExport, unload: unloadExport } = active;
export = { onExit: onExitExport, load: loadExport, unload: unloadExport, signals };
