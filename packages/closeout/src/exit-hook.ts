/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * `closeout/exit-hook` — the drop-in path for `exit-hook` (design R6, Y3).
 *
 * Graded by `exit-hook`'s own 21-case suite in `compat-oracle`, which is the only reason any
 * of the decisions below are decisions rather than guesses. Eighteen of those cases spawn a
 * fixture and assert two things about the *process*: the code it left with, and the bytes
 * that made it out before it did. That is `closeout/intent.md` R10 ("`exitCode` is preserved
 * on every path") and R3 (a bounded shutdown) graded by somebody else's assertions, which is
 * worth more than either of our own.
 *
 * ## Why this file does not use the registry
 *
 * Until 2026-10-20 the shutdown below ran through `registry.ts`: sync hooks were its `flush`
 * phase, async hooks its `release` phase, and the bound was a registry deadline. That carried
 * the phase machine, the deadline and the report into every bundle that imported this path,
 * 4,819 B against exit-hook's own 1,645 B (`benchmarks/axes/weight.ts`, B4). A drop-in is
 * installed by somebody who wants the incumbent's behaviour and nothing else, so it is held to
 * the incumbent's weight (D-20261012-closeout-drop-ins-held-to-u5,
 * `.sdlc/intents/closeout-at-incumbent-weight/`). The phases, the deadline and the report
 * stay closeout's product, on `closeout` itself.
 *
 * What replaced the registry is the small machine `exit-hook` itself runs, and it is modelled
 * in `.sdlc/intents/closeout-at-incumbent-weight/lean.qnt`: one `called` flag that the first
 * trigger of any kind sets, the synchronous hooks first, the asynchronous ones only on a path
 * that can still await, and a timer at `max(wait)` that leaves whether they settled or not.
 *
 * **The bound is the incumbent's.** closeout's own default is 2 000 ms for the whole shutdown,
 * and imposing it here would fail the incumbent's own `asyncExitHook(fn, { wait: 2000 })` case.
 * `exit-hook`'s bound is per hook and the effective one is `max(wait)`, read when the shutdown
 * starts, when every `wait` is known. A drop-in that silently tightens a caller's timeout is
 * not a drop-in; a program that wants closeout's bound calls closeout's own API.
 *
 * The stdio flush is load-bearing rather than tidy: replacing the drain below with a bare exit
 * scores 18 / 21 and 15 / 21 on two consecutive runs (measured 2026-09-14), because
 * `process.exit()` truncates 20,000 queued lines that the suite counts.
 */
import { ambientProcess, type ProcessLike } from './ambient.js';

/** A hook takes the code the process is about to leave with. */
export type ExitHookCallback = (exitCode: number | string) => unknown;

export interface AsyncExitHookOptions {
  /**
   * How long this hook may take, in milliseconds. Required and positive — `exit-hook` throws
   * on a missing or non-numeric value and its `type enforcing` case asserts both.
   */
  wait: number;
}

/**
 * The real streams, seen wide enough to drain.
 *
 * `OutputStream` is two members because that is all the cursor layer needs. Flushing needs
 * the writability flags and the two-argument `write`, so the façade declares the shape it
 * needs rather than widening a type the rest of the package is happy with.
 */
interface DrainableStream {
  writable?: boolean;
  writableEnded?: boolean;
  destroyed?: boolean;
  once?(event: string, listener: (...args: never[]) => void): unknown;
  off?(event: string, listener: (...args: never[]) => void): unknown;
  write(chunk: string, callback?: () => void): unknown;
}

/** POSIX: a signal's exit code is 128 plus its number. */
const SIGNAL_BASE = 128;
const SIGINT_NUMBER = 2;
const SIGTERM_NUMBER = 15;
/**
 * The sentinel `exit-hook` passes for "no signal, use `process.exitCode`". Any value that is
 * not positive would do; it is spelled the way upstream spells it so the two can be diffed.
 */
const NO_SIGNAL = -SIGNAL_BASE;
/**
 * How long the stdio drain may take. Upstream's number, and it is graded: `flush timeout
 * prevents hanging when stdout is blocked` asserts the process leaves with 0 after at least
 * 900 ms, which only happens because this race is lost rather than won.
 */
const FLUSH_TIMEOUT_MS = 1000;

const syncHooks = new Set<ExitHookCallback>();
const asyncHooks = new Map<ExitHookCallback, number>();

let listening = false;
/** `exit-hook`'s `isCalled`: set by the first trigger of any kind, so nothing after it runs. */
let called = false;

/**
 * The process this façade is wired to, resolved once.
 *
 * `undefined` is a runtime with no `process`, where every export below is a no-op that still
 * returns a working unsubscribe — the same answer `install()` would give, minus the throw,
 * because `exit-hook`'s contract has no failure mode for it and a drop-in may not invent one.
 */
const proc: ProcessLike | undefined = ambientProcess();

/**
 * Drain one stream, or give up on it.
 *
 * Every branch resolves. A stream that is already ended, destroyed or not writable has
 * nothing to drain; a stream that errors mid-drain (a closed pipe — `closed-stdio.js` is the
 * case) has stopped being drainable, and treating that as a rejection would turn a clean exit
 * into an unhandled one.
 */
async function drain(stream: DrainableStream | undefined): Promise<void> {
  return new Promise<void>((resolve) => {
    if (stream?.writable !== true || stream.writableEnded === true || stream.destroyed === true) {
      resolve();
      return;
    }
    // One `done`, reached from three places — the error listener, the write callback and the
    // synchronous throw — because all three mean the same thing: stop listening, and stop
    // waiting on this stream.
    const done = (): void => {
      stream.off?.('error', done);
      resolve();
    };
    stream.once?.('error', done);
    try {
      // The empty write is the trick: its callback fires when everything queued ahead of it
      // has gone out, which is what "flushed" means for a pipe under backpressure.
      stream.write('', done);
    } catch {
      done();
    }
  });
}

/**
 * The notice upstream prints when a synchronous termination throws away asynchronous work.
 *
 * Word for word, because `main-async-notice` matches `/SYNCHRONOUS TERMINATION NOTICE/` and
 * because the sentence is the only warning a caller gets that `process.exit()` has just
 * discarded their flush. One literal rather than upstream's `[…].join(' ')`: the same string,
 * without the array in the bundle.
 */
const SYNC_NOTICE =
  'SYNCHRONOUS TERMINATION NOTICE: When explicitly exiting the process via process.exit or via a parent process, asynchronous tasks in your exitHooks will not run. Either remove these tasks, use gracefulExit() instead of process.exit(), or ensure your parent process sends a SIGINT to the process running this code.';

/**
 * Leave with `code`, unless the process is already leaving.
 *
 * `manual` is false only on the `'exit'` event, where calling `exit()` again would be
 * re-entrant. A string code (Node accepts one in `process.exitCode`) is coerced for `exit()`.
 */
function leave(manual: boolean, code: number | string): void {
  if (manual) proc?.exit(Number(code));
}

/**
 * One shutdown, run by the first trigger and by nothing after it.
 *
 * `signal` is the signal's number, or {@link NO_SIGNAL} for "use `process.exitCode`".
 *
 * **A synchronous trigger never calls an async hook.** Calling one would still run it up to
 * its first `await`, after printing a notice that says it "will not run": a hook that writes a
 * file before its first `await` would write it here and not under the incumbent.
 */
async function shutdown(manual: boolean, isSynchronous: boolean, signal: number): Promise<void> {
  if (called) return;
  called = true;
  if (isSynchronous && asyncHooks.size > 0) console.error(SYNC_NOTICE);
  // The code the process will leave with. A signal overrules `process.exitCode` — that is the
  // whole of `SIGINT causes process.exitCode to be ignored`, which sets it to 1 and still
  // expects 130. Written inline, as upstream writes it: a helper is bytes in every bundle.
  let code: number | string = 0;
  const set = proc?.exitCode;
  if (signal > 0) code = SIGNAL_BASE + signal;
  else if (typeof set === 'number' || typeof set === 'string') code = set;
  for (const hook of syncHooks) hook(code);
  if (isSynchronous) {
    leave(manual, code);
    return;
  }
  // `max(wait)`. The 0 is for a shutdown with no async hook: `Math.max()` alone is -Infinity,
  // which Node answers with a TimeoutNegativeWarning. A 0 ms timer is cleared on the next line
  // but one, in a microtask, before any timer can fire.
  const timer = setTimeout(() => leave(true, code), Math.max(0, ...asyncHooks.values()));
  await Promise.all([...asyncHooks.keys()].map(async (hook) => hook(code)));
  clearTimeout(timer);
  // Both standard streams drained, or one second, whichever comes first. The catch is for a
  // drain that throws before it can resolve: leaving is still owed. The timer is not unref'd,
  // as upstream's is not: the exit right after the race ends the process either way.
  const second = new Promise<void>((resolve) => {
    setTimeout(resolve, FLUSH_TIMEOUT_MS);
  });
  await Promise.race([Promise.all([drain(proc?.stdout as DrainableStream | undefined), drain(proc?.stderr as DrainableStream | undefined)]), second]).catch(() => undefined);
  leave(manual, code);
}

/**
 * Attach the process listeners, once, on the first registration.
 *
 * They are never detached. `exit-hook`'s `listener count` case asserts exactly that: one
 * `'exit'` listener after the first hook, and still one after every hook has unsubscribed.
 * Unsubscribing removes a *hook*, not the wiring. No per-event once-guard either: `called`
 * flips at the first trigger of any kind, so a second SIGINT, a re-fired `'beforeExit'` or an
 * `'exit'` behind a signal all run nothing.
 */
/*
 * Every trigger below starts `shutdown` and does not wait for it, and none catches it. That is
 * the incumbent's choice, kept: `exit-hook` binds its own `async exit()` the same way, so a hook
 * that throws reaches the process as the unhandled rejection it is, rather than being swallowed
 * by the drop-in that was asked to run it.
 */

/** PM2's cluster shutdown message, which `listen` wires to the same path as a signal. */
const onPm2Message = (message: unknown): void => {
  // eslint-disable-next-line maintainability/no-unhandled-promise, reliability/no-unhandled-promise -- the incumbent's unhandled rejection, kept (see above)
  if (message === 'shutdown') void shutdown(true, true, NO_SIGNAL);
};

function listen(): void {
  if (listening || proc === undefined) return;
  listening = true;
  // Paths that can await: there is still an event loop to come back to.
  proc.on('beforeExit', () => void shutdown(true, false, NO_SIGNAL));
  proc.on('SIGINT', () => void shutdown(true, false, SIGINT_NUMBER));
  proc.on('SIGTERM', () => void shutdown(true, false, SIGTERM_NUMBER));
  // The explicit exit. Synchronous hooks only, and no manual exit: we are already leaving.
  proc.on('exit', () => void shutdown(false, true, 0));
  // PM2's cluster shutdown message. `process.exit()` does not fire `beforeExit`, so without
  // this a pm2-managed process would skip every hook.
  proc.on('message', onPm2Message as (...args: never[]) => void);
}

/** `exit-hook`'s own refusal, on both kinds of hook. */
function mustBeFunction(onExit: unknown): void {
  if (typeof onExit !== 'function') throw new TypeError('onExit must be a function');
}

/**
 * Register a synchronous hook. Returns the function that unregisters it.
 *
 * Declared here and exported at the foot of the file: `exit-hook`'s default *is* its
 * `exitHook`, so an `import exitHook from 'closeout/exit-hook'` swap only works if ours is a
 * default too, and this repository's lint wants every export last and grouped.
 */
function exitHook(onExit: ExitHookCallback): () => void {
  mustBeFunction(onExit);
  syncHooks.add(onExit);
  listen();
  return () => void syncHooks.delete(onExit);
}

// exit-hook's own type names, so a typed program migrates by its import alone — `burgee migrate`
// checks every imported name against this module and would otherwise leave the import on exit-hook.
export type Options = AsyncExitHookOptions;

/**
 * Register an asynchronous hook, bounded by `wait`.
 *
 * `wait` is required and must be a positive number: `asyncExitHook(fn, {})` and
 * `asyncExitHook(fn, { wait: 'abc' })` both throw, and both are graded.
 */
export function asyncExitHook(onExit: ExitHookCallback, options: Partial<AsyncExitHookOptions> = {}): () => void {
  mustBeFunction(onExit);
  const { wait } = options;
  if (!(typeof wait === 'number' && wait > 0)) throw new TypeError('wait must be set to a positive numeric value');
  asyncHooks.set(onExit, wait);
  listen();
  return () => void asyncHooks.delete(onExit);
}

/**
 * Exit the way `process.exit()` cannot: asynchronous hooks get to run, and stdio is drained
 * before the process goes.
 *
 * The argument is the exit code, and it is named `signal` upstream. Kept as upstream names
 * it, because a drop-in whose parameter names disagree with the incumbent's `.d.ts` is a
 * drop-in that breaks the first person to use a named argument in their editor.
 */
export function gracefulExit(signal?: number): void {
  if (signal !== undefined && proc !== undefined) proc.exitCode = signal;
  // eslint-disable-next-line maintainability/no-unhandled-promise, reliability/no-unhandled-promise -- the incumbent's unhandled rejection, kept (see listen)
  void shutdown(true, false, NO_SIGNAL);
}

// `import exitHook from 'closeout/exit-hook'` is the drop-in, so the entry has to be a
// default. Named exports sit beside it for everything else.
// eslint-disable-next-line import-next/no-default-export -- the incumbent's entry is a default export and Y3 is the whole point of this file
export default exitHook;
