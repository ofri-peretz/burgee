/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * `closeout/signal-exit/signals` — the signals `signal-exit` treats as fatal, for this platform.
 *
 * Read from the ambient `process.platform` at load, because that is when `signal-exit`'s own
 * `./signals` reads it and its suite snapshots the list once per faked platform. The list
 * itself is `signal-list.ts`'s, shared with the ES entry.
 *
 * CommonJS (`.cts`) for the same reason as `signal-exit.cts`: the suite re-evaluates this file
 * under each faked platform, and an ES module is evaluated once per process. Re-evaluating it
 * calls `signalsOn()` again, which reads the platform of that moment.
 */
import list = require('./signal-list.js');

const signals: string[] = list.signalsOn();

export = { signals };
