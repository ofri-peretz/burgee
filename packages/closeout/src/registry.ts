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

/**
 * The order shutdown happens in, as **data** rather than as registration order.
 *
 * Registration order is the wrong ordering for a shutdown, and it is the ordering every
 * incumbent gives you. The handler that hands the terminal back is registered by whichever
 * renderer hid the cursor, at whatever moment it first drew — so anything registered a line
 * later runs *after* the cursor is back and raw mode is off, which is to say it cleans up
 * nothing it was registered to clean up. An ordering that depends on import order is not an
 * ordering; it is a coincidence that happens to hold until someone moves an import.
 *
 * Three phases, and the names are the sequence:
 *
 *   - `flush` — get the data out: write the file, drain the log, post the last event.
 *   - `release` — let go: locks, sockets, children, temp directories. The default.
 *   - `restore` — hand the terminal back: cursor shown, raw mode off. Last, always.
 *
 * Phases run **in sequence** — an async handler in `flush` is awaited before `release`
 * begins — and handlers within one phase run together, in registration order. The
 * sequencing is the half that makes the guarantee worth stating: sorting the calls but
 * starting them all at once would put a plugin's `await` after the cursor was already back,
 * which is the bug with the ordering merely rearranged.
 */
export const PHASES = ['flush', 'release', 'restore'] as const;

/** One of {@link PHASES}. */
export type Phase = (typeof PHASES)[number];

/**
 * Where a handler goes when its author did not say.
 *
 * `release` rather than `flush`: an unphased handler is far more often closing something
 * than writing something, and either way it lands before `restore` — the property every
 * caller of this package is relying on whether or not they know the word.
 */
export const DEFAULT_PHASE: Phase = 'release';

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
  /**
   * Register a handler in a phase. Returns the function that unregisters it.
   *
   * The phase defaults to {@link DEFAULT_PHASE}, so a caller that never heard of phases
   * keeps the behaviour it had: unphased handlers share one phase and run in registration
   * order within it — ahead of `restore`, which is the part that was not true before.
   */
  add(handler: ExitHandler, phase?: Phase): () => void;
  /** Run every handler, once, phase by phase, inside the deadline. Later calls are no-ops. */
  run(info: ExitInfo): Promise<void>;
  /** Run every handler synchronously, in phase order; a returned promise is abandoned. */
  runSync(info: ExitInfo): void;
  /** How many handlers are registered — for a caller that wants to know if any are. */
  readonly size: number;
  /** How many are registered in one phase. */
  count(phase: Phase): number;
  /** Whether shutdown has already happened. */
  readonly settled: boolean;
}

/** Two seconds: long enough to flush a file, short enough that nobody reaches for the keyboard. */
export const DEFAULT_DEADLINE = 2000;

/*
 * `console.error`, not `process.stderr`: process belongs to the Runtime seam, and a
 * registry built by hand — the layer is usable on its own — still has to report a failed
 * handler somewhere. Callers that own a stream pass `onError`.
 */
const reportToStderr = (error: unknown): void => {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error(`closeout: a handler failed during shutdown\n${message}`);
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

/**
 * Invoke every handler in one phase, returning the promises worth waiting for.
 *
 * Invoking is separated from waiting because the two happen on different terms: every phase
 * is always invoked, and only some of them are ever awaited (see `run`).
 */
function invokePhase(handlers: Iterable<ExitHandler>, info: ExitInfo, onError: (error: unknown) => void): Promise<void>[] {
  const pending: Promise<void>[] = [];
  for (const handler of handlers) {
    const result = invoke(handler, info, onError);
    if (result instanceof Promise) pending.push(result.catch(onError));
  }
  return pending;
}

/** The one clock the whole shutdown runs against. */
interface Deadline {
  /** Whether the time is already up. Read between phases. */
  readonly expired: boolean;
  /** Resolves when it is. Never rejects. */
  readonly reached: Promise<void>;
  cancel(): void;
}

function startDeadline(ms: number): Deadline {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const self = {
    expired: false,
    reached: new Promise<void>((resolve) => {
      timer = setTimeout(() => {
        self.expired = true;
        resolve();
      }, ms);
      // Do not hold the loop open on account of the deadline itself.
      timer.unref?.();
    }),
    cancel(): void {
      if (timer !== undefined) clearTimeout(timer);
    },
  };
  return self;
}

export function createRegistry(options: RegistryOptions = {}): Registry {
  const { deadline = DEFAULT_DEADLINE, onError = reportToStderr } = options;
  /*
   * One insertion-ordered set per phase, built from PHASES itself — so the iteration order
   * below *is* the declared order by construction, and a fourth phase is one edit in one
   * place rather than a list to keep in step with a loop.
   */
  const handlers = new Map<Phase, Set<ExitHandler>>(PHASES.map((phase) => [phase, new Set<ExitHandler>()]));
  const bucket = (phase: Phase): Set<ExitHandler> => handlers.get(phase) ?? new Set<ExitHandler>();
  let settled = false;

  return {
    add(handler, phase = DEFAULT_PHASE) {
      const into = bucket(phase);
      into.add(handler);
      return () => {
        into.delete(handler);
      };
    },

    async run(info) {
      if (settled) return;
      settled = true;

      /*
       * One clock for the whole shutdown, started before the first phase — not one per
       * phase, which would let three slow phases add up to three deadlines and give back
       * the hang the number exists to bound.
       */
      const clock = startDeadline(deadline);

      try {
        for (const phase of PHASES) {
          const pending = invokePhase(bucket(phase), info, onError);

          /*
           * Past the deadline the later phases are still **invoked**; they are only no
           * longer awaited. Skipping them would let a handler that hung in `flush` decide
           * that the cursor stays hidden — the exact failure this package exists to remove,
           * arrived at through the machinery meant to prevent it.
           */
          if (pending.length === 0 || clock.expired) continue;

          /*
           * `allSettled`, not `all`: a rejected handler has already been reported by
           * `invoke` or the `.catch` above, and one rejection must not skip the wait for
           * the others.
           */
          // eslint-disable-next-line reliability/no-await-in-loop -- sequencing the phases IS the guarantee: `Promise.all` over all three would start `restore` while `flush` was still awaiting, which is the bug phases exist to remove
          await Promise.race([Promise.allSettled(pending).then(() => undefined), clock.reached]);
        }
      } finally {
        clock.cancel();
      }
    },

    runSync(info) {
      if (settled) return;
      settled = true;
      for (const phase of PHASES) {
        for (const handler of bucket(phase)) invoke(handler, info, onError);
      }
    },

    get size() {
      let total = 0;
      for (const set of handlers.values()) total += set.size;
      return total;
    },

    count(phase) {
      return bucket(phase).size;
    },

    get settled() {
      return settled;
    },
  };
}
