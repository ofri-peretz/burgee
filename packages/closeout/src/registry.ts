/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * The part of shutdown that has nothing to do with a process: a set of handlers, run
 * exactly once, inside a deadline.
 *
 * Kept separate from the signal wiring so it can be tested without spawning anything. The
 * bugs worth testing here are all in this half — a handler that runs twice because two
 * signals arrived, a handler that throws and takes the rest down with it, a handler that
 * never settles and hangs the exit — and none of them need a real SIGINT to reproduce.
 */

export interface ExitInfo {
  /** The exit code, when the process is exiting normally. */
  code: number | null;
  /** The signal that ended it, when one did. */
  signal: string | null;
}

export type ExitHandler = (info: ExitInfo) => void | Promise<void>;

export interface RegistryOptions {
  /**
   * How long shutdown may take before it stops waiting, in milliseconds.
   *
   * A deadline is not a nicety. A handler that awaits something that never resolves — a
   * socket that will not close, a lock nobody releases — turns Ctrl-C into a process the
   * user has to kill twice, and the second one is SIGKILL with no cleanup at all. Better
   * to abandon a slow handler than to strand the person at the keyboard.
   */
  deadline?: number;
  /** Where a handler's own failure is reported. Defaults to stderr. */
  onError?: (error: unknown) => void;
}

export interface Registry {
  /** Register a handler. Returns the function that unregisters it. */
  add(handler: ExitHandler): () => void;
  /** Run every handler, once, inside the deadline. Later calls are no-ops. */
  run(info: ExitInfo): Promise<void>;
  /** Run every handler synchronously; a returned promise is abandoned, not awaited. */
  runSync(info: ExitInfo): void;
  /** How many handlers are registered — for a caller that wants to know if any are. */
  readonly size: number;
  /** Whether shutdown has already happened. */
  readonly settled: boolean;
}

/** Two seconds: long enough to flush a file, short enough that nobody reaches for the keyboard. */
export const DEFAULT_DEADLINE = 2000;

const reportToStderr = (error: unknown): void => {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`closeout: a handler failed during shutdown\n${message}\n`);
};

/*
 * One handler's failure must not cancel the others. Shutdown is the worst possible place
 * for an exception to short-circuit a loop: the handlers that would have restored the
 * terminal are usually the ones registered last.
 */
function invoke(handler: ExitHandler, info: ExitInfo, onError: (error: unknown) => void): void | Promise<void> {
  try {
    return handler(info);
  } catch (error) {
    onError(error);
    return undefined;
  }
}

export function createRegistry(options: RegistryOptions = {}): Registry {
  const { deadline = DEFAULT_DEADLINE, onError = reportToStderr } = options;
  const handlers = new Set<ExitHandler>();
  let settled = false;

  return {
    add(handler) {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },

    async run(info) {
      if (settled) return;
      settled = true;
      const pending: Promise<void>[] = [];
      for (const handler of handlers) {
        const result = invoke(handler, info, onError);
        if (result instanceof Promise) pending.push(result.catch(onError));
      }
      if (pending.length === 0) return;

      /*
       * `allSettled`, not `all`: a rejected handler has already been reported by `invoke`
       * or the `.catch` above, and one rejection must not skip the wait for the others.
       */
      let timer: ReturnType<typeof setTimeout> | undefined;
      const expiry = new Promise<void>((resolve) => {
        timer = setTimeout(resolve, deadline);
        // Do not hold the loop open on account of the deadline itself.
        timer.unref?.();
      });
      await Promise.race([Promise.allSettled(pending).then(() => undefined), expiry]);
      if (timer !== undefined) clearTimeout(timer);
    },

    runSync(info) {
      if (settled) return;
      settled = true;
      for (const handler of handlers) invoke(handler, info, onError);
    },

    get size() {
      return handlers.size;
    },

    get settled() {
      return settled;
    },
  };
}
