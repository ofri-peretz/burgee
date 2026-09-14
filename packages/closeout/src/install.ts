/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * The signal wiring: a registry attached to a process (design R7).
 *
 * Separated from `index.ts` on 2026-09-14, when the drop-in façades arrived. `index.ts` is
 * the package entry and re-exports everything here unchanged, so nothing a caller imports
 * moved. What moved is where a *sibling module* imports it from: `restore-cursor.ts` and
 * `exit-hook.ts` both need `onExit`, and reaching for it through the package's own entry is
 * a barrel import — the shape that makes a tree-shaker give up and that this repository's
 * lint refuses. The design named this file for this job before it existed; it is only now
 * that two files needed it.
 */
import { ambientProcess, type ProcessLike } from './ambient.js';
import { hideCursor as hide, showCursor as show, type OutputStream } from './cursor.js';
import { createRegistry, type ExitHandler, type Phase, type Registry, type RegistryOptions } from './registry.js';

/**
 * Resolved once, at import: the process a caller gets when it passes none.
 *
 * `install({ process })` is the seam every test uses; this is the default behind it, and
 * `install()` reports a runtime with no process as a `TypeError` naming that option rather
 * than as a `ReferenceError` naming a variable the caller never wrote.
 */
const globalProcess = ambientProcess();

/**
 * The signals a CLI is expected to survive politely.
 *
 * SIGINT is Ctrl-C. SIGTERM is what an orchestrator sends before it loses patience. SIGHUP
 * is the terminal closing out from under you, which is the one people forget and the one
 * that most often strands a lock file.
 */
export const SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const;

/** POSIX: a signal's exit code is 128 plus its number. SIGINT is 2, so 130. */
const SIGNAL_EXIT_CODE: Record<string, number> = { SIGINT: 130, SIGTERM: 143, SIGHUP: 129 };
const UNKNOWN_SIGNAL_EXIT = 1;

export interface InstallOptions extends RegistryOptions {
  /** Defaults to the real `process`. */
  process?: ProcessLike;
}

export interface Closeout {
  /** Register a handler in a phase (default `release`). Returns the function that unregisters it. */
  onExit(handler: ExitHandler, phase?: Phase): () => void;
  /** Hide the cursor and register its restore; the returned function shows it again. */
  hideCursor(stream: OutputStream): () => void;
  /** Show the cursor now. Idempotent, and a no-op on a non-TTY. */
  showCursor(stream: OutputStream): void;
  /** The registry, for a caller that wants to drive shutdown itself. */
  readonly registry: Registry;
}

/**
 * Wire a registry to a process.
 *
 * Exposed rather than kept internal because a test — or a program that owns its own
 * lifecycle, like a runner hosting other programs — needs to install this against
 * something that is not the global process.
 */
export function install(options: InstallOptions = {}): Closeout {
  const { process: proc = globalProcess, ...registryOptions } = options;
  if (proc === undefined) {
    throw new TypeError('closeout needs a process to listen on, and this runtime has no global `process`. Pass one: install({ process })');
  }
  const registry = createRegistry(registryOptions);

  /*
   * `'exit'` cannot await. Node is already tearing down by the time it fires, so a promise
   * returned from a handler would never settle — `runSync` invokes and abandons it, which
   * is the honest behaviour, and the reason an async handler needs one of the signal paths
   * to be worth anything.
   */
  proc.on('exit', ((code: number) => {
    registry.runSync({ code, signal: null });
  }) as (...args: never[]) => void);

  for (const signal of SIGNALS) {
    const handler = ((): void => {
      /*
       * Await the handlers, then leave — unless the program said it wanted this signal.
       *
       * Re-raising would be more faithful to POSIX, but it re-enters this listener; exiting
       * explicitly is what a caller who owns `main` actually wants, and `runSync` on
       * `'exit'` is already idempotent against the second pass.
       *
       * **Stand down first, then count.** A program that installed its own handler for this
       * signal asked to own it, and a library that ran some cleanup does not get to overrule
       * that: it may want to finish a request and exit 7, or ignore Ctrl-C entirely. Our own
       * listener has to come off before the count, or it would always see one and we would
       * always exit. This is the contract `flagstaff`'s spinner suite pins — a hidden cursor
       * comes back on SIGINT *and* the program's handler still decides what happens next.
       *
       * Both arms leave. `run` is written not to reject, and if that ever stops being true
       * the process must still exit — a shutdown that hangs because its own error handling
       * threw is the failure this package exists to prevent.
       */
      const leave = (): void => {
        proc.removeListener(signal, handler);
        if (proc.listenerCount(signal) === 0) proc.exit(SIGNAL_EXIT_CODE[signal] ?? UNKNOWN_SIGNAL_EXIT);
      };
      registry.run({ code: null, signal }).then(leave, leave);
    }) as (...args: never[]) => void;
    proc.on(signal, handler);
  }

  return {
    onExit: (handler, phase) => registry.add(handler, phase),
    /*
     * The restore goes in the `restore` phase, not wherever the caller happened to draw.
     *
     * This is the line that makes the guarantee real. Before it, the cursor's restore sat
     * at whatever position in one flat set the first `hideCursor()` call gave it — usually
     * early, because a renderer hides the cursor the moment it starts drawing — and every
     * handler registered afterwards ran *after* the terminal had already been handed back.
     */
    hideCursor: (stream) => hide(stream, (handler) => registry.add(handler, 'restore')),
    showCursor: show,
    registry,
  };
}

/**
 * The process-wide instance, installed on first use.
 *
 * Lazy on purpose: importing this package must not attach four listeners to a process that
 * may never need them. A library that imports `closeout` for its types pays nothing.
 */
let shared: Closeout | undefined;
const sharedCloseout = (): Closeout => (shared ??= install());

/** Register a handler that runs exactly once, on every path out of the program. */
export function onExit(handler: ExitHandler, phase?: Phase): () => void {
  return sharedCloseout().onExit(handler, phase);
}

/** Hide the cursor and register its restore; the returned function shows it again. */
export function hideCursor(stream: OutputStream): () => void {
  return sharedCloseout().hideCursor(stream);
}

/** Show the cursor. Idempotent, and a no-op on a non-TTY. */
export function showCursor(stream: OutputStream): void {
  show(stream);
}
