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
import { hideCursor as hide, showCursor as show, type OutputStream } from './cursor.js';
import {
  createRegistry,
  type ExitHandler,
  type ExitInfo,
  type Phase,
  type Registry,
  type RegistryOptions,
} from './registry.js';

/** The half of `process` this needs, so the wiring can be tested without one. */
export interface ProcessLike {
  /*
   * Deliberately as wide as Node's own overloads. Narrowing the listener to the exact
   * argument tuple would make `process` itself unassignable and force every caller — this
   * module included — through a cast, which is a worse trade than one permissive signature.
   */
  on(event: string, listener: (...args: never[]) => void): unknown;
  removeListener(event: string, listener: (...args: never[]) => void): unknown;
  listenerCount(event: string): number;
  exit(code?: number): never;
  stderr: OutputStream;
}

/**
 * Node's `process`, seen through the narrow shape above.
 *
 * Read off `globalThis` rather than declared, which is what `roundel/chalk.ts` does for the
 * same reason: `declare const` is a type-level promise with no runtime binding, so it
 * compiled, type-checked, shipped at 0.1.0, and threw
 * `ReferenceError: globalProcess is not defined` for anyone calling `onExit()` the way the
 * README does. Every test injected a process, so none of them could see it.
 *
 * `undefined` here is a real state — a runtime with no `process` at all — and `install()`
 * says so instead of failing with a name nobody wrote.
 */
const globalProcess = (globalThis as { process?: ProcessLike }).process;

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

export { createRegistry, DEFAULT_DEADLINE, DEFAULT_PHASE, PHASES } from './registry.js';
export type { ExitHandler, ExitInfo, OutputStream, Phase, Registry, RegistryOptions };

export { HIDE_CURSOR, SHOW_CURSOR } from './cursor.js';
