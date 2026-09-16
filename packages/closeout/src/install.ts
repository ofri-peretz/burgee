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
import { createRegistry, type ExitHandler, type HandlerSpec, type Registry, type RegistryOptions } from './registry.js';

/**
 * Resolved once, at import: the process a caller gets when it passes none.
 *
 * `install({ process })` is the seam every test uses; this is the default behind it, and
 * `install()` reports a runtime with no process as a `TypeError` naming that option rather
 * than as a `ReferenceError` naming a variable the caller never wrote.
 */
const globalProcess = ambientProcess();

/**
 * The signals a CLI is expected to survive politely (design R1).
 *
 * SIGINT is Ctrl-C. SIGTERM is what an orchestrator sends before it loses patience. SIGHUP
 * is the terminal closing out from under you, which is the one people forget and the one
 * that most often strands a lock file. SIGQUIT is Ctrl-\\, which a shell sends expecting a
 * core dump and which otherwise leaves every lock this package exists to release.
 *
 * SIGBREAK is Windows' Ctrl-Break and exists nowhere else; listening for it on POSIX costs
 * one listener that can never fire, which is a better trade than a `platform` read inside
 * the one package whose whole design is that it does not read the process.
 *
 * **SIGKILL is deliberately absent, and cannot be added.** It is not deliverable to a
 * listener by design; a package that claimed it would be claiming something no program can
 * do. The README says so in those words rather than leaving a reader to infer a guarantee.
 */
export const SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGQUIT', 'SIGBREAK'] as const;

/**
 * 128 plus the signal's number — the status a shell reports for a signalled child.
 *
 * **The fallback, not the answer.** A signal is re-raised (see {@link raiseAfter}) so the
 * process really dies of it; these codes are what closeout leaves with on the runtimes that
 * cannot raise a given signal at themselves, where a number a parent can read beats a
 * process that will not go.
 */
const SIGNAL_EXIT_CODE: Record<string, number> = { SIGINT: 130, SIGTERM: 143, SIGHUP: 129, SIGQUIT: 131, SIGBREAK: 149 };
const UNKNOWN_SIGNAL_EXIT = 1;
/** What a program leaves with when it dies of something it threw. Node's own answer. */
const THROWN_EXIT_CODE = 1;

export interface InstallOptions extends RegistryOptions {
  /** Defaults to the real `process`. */
  process?: ProcessLike;
}

export interface Closeout {
  /**
   * Register a handler. Returns the function that unregisters it.
   *
   * The second argument is a phase (default `release`), or `{ phase, label }` when the
   * handler wants a name in the deadline's report that is better than an arrow's empty one.
   */
  onExit(handler: ExitHandler, spec?: HandlerSpec): () => void;
  /** Hide the cursor and register its restore; the returned function shows it again. */
  hideCursor(stream: OutputStream): () => void;
  /** Show the cursor now. Idempotent, and a no-op on a non-TTY. */
  showCursor(stream: OutputStream): void;
  /** The registry, for a caller that wants to drive shutdown itself. */
  readonly registry: Registry;
}

/**
 * Come off this event, and say whether anyone else is still listening for it.
 *
 * **Stand down first, then count.** A program that installed its own listener for this
 * event asked to own it, and a library that ran some cleanup does not get to overrule
 * that: it may want to finish a request and exit 7, or ignore Ctrl-C entirely. Our own
 * listener has to come off before the count, or it would always see one and we would
 * always act. This is the contract `flagstaff`'s spinner suite pins — a hidden cursor
 * comes back on SIGINT *and* the program's handler still decides what happens next.
 *
 * It is also the half that makes {@link raiseAfter} safe, and the reason the re-entrancy
 * this package used to fear was never really the obstacle: a signal re-raised at a process
 * that no longer has a listener for it is delivered to node's default action, not back
 * into the listener that raised it.
 *
 * `false` means somebody else is still there and it is now their decision.
 */
const standDown = (proc: ProcessLike, event: string, listener: (...args: never[]) => void): boolean => {
  proc.removeListener(event, listener);
  return proc.listenerCount(event) === 0;
};

/**
 * Leave with a code, unless the program said it wanted this trigger.
 *
 * This is the crash path — `uncaughtException` and `unhandledRejection` — where there is no
 * signal to re-raise and exiting 1 is what node itself would have done.
 *
 * **The code is decided before the handlers run, and nothing they do can change it**
 * (design R10). `code` is captured at the trigger, so a handler that takes 200 ms and sets
 * `process.exitCode = 0` on its way past cannot turn a `process.exit(3)` into a success.
 * The deadline path leaves by the same line for the same reason: a breach exits with the
 * code the program was already leaving with, never with a code invented by the fact that
 * something hung.
 */
const leaveAfter = (proc: ProcessLike, event: string, listener: (...args: never[]) => void, code: number): void => {
  if (standDown(proc, event, listener)) proc.exit(code);
};

/**
 * Die of the signal, unless the program said it wanted it.
 *
 * **A signalled process must not exit with a code.** `process.exit(130)` and a real SIGINT
 * are two different events to everything upstream of this program: `WIFSIGNALED` is true
 * for one and false for the other, so a shell knows to print `^C` and re-raise into its own
 * job control, `make` stops a parallel build instead of continuing, a CI runner marks a job
 * cancelled rather than failed, and a supervisor decides whether to restart. 128 + n is the
 * number a *shell* reports afterwards; it was never the process's own exit status, and a
 * library that manufactures it is telling the parent something untrue about how its child
 * died.
 *
 * This file used to argue the opposite — that re-raising "re-enters this listener" and that
 * exiting is "what a caller who owns `main` actually wants". The first half is answered by
 * {@link standDown}: the listener is already gone by the time we raise. The second is
 * answered by the incumbent. `signal-exit` is closeout's declared incumbent for this
 * surface (`compat-oracle/src/demand.ts`) and its signal path is `this.unload()` — remove
 * the handlers — followed by `process.kill(process.pid, sig)`. closeout already had the
 * hard half and stopped one line early.
 *
 * **The `catch` is the platform read this package refuses to make.** Some signals cannot be
 * raised at yourself everywhere: SIGHUP is `ENOSYS` on Windows and SIGBREAK is not a signal
 * anywhere else. `signal-exit` handles this by branching on `process.platform` and
 * substituting SIGINT for SIGHUP; closeout does not read the platform (design R7), so it
 * tries the honest thing and falls back to POSIX's code when the runtime refuses — which is
 * also a better answer than dying of a signal nobody sent.
 *
 * The `exit` after the `try` is unreachable on every path where the raise does its job: a
 * self-directed signal at default disposition terminates the process inside the `kill`
 * call. It is there for the paths where it does not — a signal inherited as `SIG_IGN`, a
 * runtime whose `kill` is a no-op — because "shutdown cannot hang" is the claim this
 * package is named for, and a re-raise that quietly did nothing would break it.
 */
const raiseAfter = (proc: ProcessLike, signal: string, listener: (...args: never[]) => void, code: number): void => {
  if (!standDown(proc, signal, listener)) return;
  try {
    proc.kill(proc.pid, signal);
  } catch {
    // The runtime refused it. Leaving with POSIX's number is the handling — not a silent
    // swallow and not a message either: a process on its way out of a signal it cannot
    // raise has nowhere useful to say so, and a warning on every closed console window on
    // Windows would be worse than the fact it reported.
    proc.exit(code);
  }
  // Reached only when `kill` returned *without* terminating us — a signal inherited as
  // `SIG_IGN`, a runtime whose `kill` is a no-op. On every path where the raise does its
  // job the process is already gone by this line.
  proc.exit(code);
};

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
    /*
     * At most one raise per signal, however many times the signal arrives.
     *
     * Two Ctrl-Cs inside one tick enter this listener twice before either has had a turn to
     * remove it, and `registry.run` makes the second shutdown a no-op but has nothing to say
     * about the leaving. Under `proc.exit()` that did not matter, because the first call
     * never returned; a re-raise on a runtime that cannot deliver the signal *does* return,
     * and would then raise a second time. The flag is what the old code got for free from
     * `exit()` being terminal.
     */
    let leaving = false;
    const handler = ((): void => {
      /*
       * Both arms leave. `run` is written not to reject, and if that ever stops being true
       * the process must still go — a shutdown that hangs because its own error handling
       * threw is the failure this package exists to prevent.
       */
      const leave = (): void => {
        if (leaving) return;
        leaving = true;
        raiseAfter(proc, signal, handler, SIGNAL_EXIT_CODE[signal] ?? UNKNOWN_SIGNAL_EXIT);
      };
      registry.run({ code: null, signal, path: 'signal' }).then(leave, leave);
    }) as (...args: never[]) => void;
    proc.on(signal, handler);
  }

  /*
   * `'beforeExit'` is the one trigger with time to spare: the loop has emptied but the
   * process is still alive, so an asynchronous handler genuinely gets to finish. Nothing is
   * exited here — the program was leaving on its own, and forcing a code would overwrite
   * whatever it had set (R10). Node re-fires `'beforeExit'` if work was queued; the
   * run-once state machine makes the second one a no-op without a flag of its own.
   */
  proc.on('beforeExit', ((code: number) => {
    void registry.run({ code, signal: null, path: 'beforeExit' });
  }) as (...args: never[]) => void);

  /*
   * A throw and a rejected promise are the two paths where cleanup matters most and where
   * every incumbent in this layer has nothing: `signal-exit` does not listen for either, so
   * a CLI that crashes mid-render leaves the cursor hidden.
   *
   * The error goes into the report rather than being swallowed — `{ path: 'uncaught', error }`
   * is what a handler reads to decide whether to keep the temp directory for a bug report —
   * and then the program leaves the way Node would have: the error on stderr, exit 1. The
   * listener-count guard is what keeps that from being a hijack: a program with its own
   * `uncaughtException` handler keeps deciding, and only gets the cleanup for free.
   */
  const crash = (event: 'uncaughtException' | 'unhandledRejection', path: 'uncaught' | 'rejection'): void => {
    const listener = ((error: unknown): void => {
      const leave = (): void => {
        if (proc.listenerCount(event) === 1) console.error(error);
        leaveAfter(proc, event, listener, THROWN_EXIT_CODE);
      };
      registry.run({ code: THROWN_EXIT_CODE, signal: null, path, error }).then(leave, leave);
    }) as (...args: never[]) => void;
    proc.on(event, listener);
  };
  crash('uncaughtException', 'uncaught');
  crash('unhandledRejection', 'rejection');

  return {
    onExit: (handler, spec) => registry.add(handler, spec),
    /*
     * The restore goes in the `restore` phase, not wherever the caller happened to draw.
     *
     * This is the line that makes the guarantee real. Before it, the cursor's restore sat
     * at whatever position in one flat set the first `hideCursor()` call gave it — usually
     * early, because a renderer hides the cursor the moment it starts drawing — and every
     * handler registered afterwards ran *after* the terminal had already been handed back.
     */
    hideCursor: (stream) => hide(stream, (handler) => registry.add(handler, { phase: 'restore', label: 'closeout:restore-cursor' })),
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
export function onExit(handler: ExitHandler, spec?: HandlerSpec): () => void {
  return sharedCloseout().onExit(handler, spec);
}

/** Hide the cursor and register its restore; the returned function shows it again. */
export function hideCursor(stream: OutputStream): () => void {
  return sharedCloseout().hideCursor(stream);
}

/** Show the cursor. Idempotent, and a no-op on a non-TTY. */
export function showCursor(stream: OutputStream): void {
  show(stream);
}
