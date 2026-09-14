/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * closeout — close everything out.
 *
 * Exit handlers that run **exactly once on every path**, terminal restore, and a bounded
 * deadline so shutdown cannot hang.
 *
 * "Every path" is the hard part and the reason this is a package. A program leaves by
 * several doors — returning from main, `process.exit`, SIGINT, SIGTERM, SIGHUP — and a
 * handler registered on `'exit'` alone misses most of them, which is why a Ctrl-C so often
 * leaves a hidden cursor or a half-written file behind. Registering on all of them is
 * easy; registering on all of them and running the handlers exactly once when two fire
 * together is where the bugs live.
 *
 * Zero dependencies; Node builtins only.
 */

import { type ProcessLike } from './ambient.js';
import { HIDE_CURSOR, SHOW_CURSOR, type OutputStream } from './cursor.js';
import { hideCursor, install, onExit, showCursor, SIGNALS, type Closeout, type InstallOptions } from './install.js';
import {
  createRegistry,
  DEFAULT_DEADLINE,
  DEFAULT_PHASE,
  PHASES,
  type ExitHandler,
  type ExitInfo,
  type Phase,
  type Registry,
  type RegistryOptions,
} from './registry.js';

/*
 * Imported and re-exported in one statement rather than four `export … from` lines: the
 * entry's whole job is to be the package's single public surface, and four re-export
 * statements are four places for one to be forgotten when a module moves.
 */
export {
  createRegistry,
  DEFAULT_DEADLINE,
  DEFAULT_PHASE,
  hideCursor,
  HIDE_CURSOR,
  install,
  onExit,
  PHASES,
  SHOW_CURSOR,
  showCursor,
  SIGNALS,
  type Closeout,
  type ExitHandler,
  type ExitInfo,
  type InstallOptions,
  type OutputStream,
  type Phase,
  type ProcessLike,
  type Registry,
  type RegistryOptions,
};
