/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * The part of shutdown that has nothing to do with a process: a set of handlers, run
 * exactly once, in phase order, inside a deadline — and a report of what was still running
 * when the deadline fired.
 *
 * Kept separate from the signal wiring so it can be tested without spawning anything. The
 * bugs worth testing here are all in this half — a handler that runs twice because two
 * signals arrived, a handler that throws and takes the rest down with it, a handler that
 * never settles and hangs the exit — and none of them need a real SIGINT to reproduce.
 */
import { assertDeadline, DEFAULT_DEADLINE, startDeadline } from './deadline.js';
import { timeoutMessage, toReport, type ExitInfo, type ExitReport, type ShutdownReport } from './report.js';

/** A handler is handed the one record: `{ path, signal, code, error }` (design R2). */
export type ExitHandler = (report: ExitReport) => void | Promise<void>;

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

/** How a handler is registered when a bare phase is not enough to say it. */
export interface HandlerOptions {
  /** Which phase it runs in. Defaults to {@link DEFAULT_PHASE}. */
  phase?: Phase;
  /**
   * What to call it in a report.
   *
   * Defaults to the function's own `name`, which is right for `onExit(releaseTheLock)` and
   * useless for `onExit(async () => …)` — and the anonymous arrow is the shape that hangs.
   * A label is the caller's chance to make the deadline's sentence name something they can
   * go and look at.
   */
  label?: string;
}

/** A phase, or the options object. The bare phase is the common case and stays spellable. */
export type HandlerSpec = Phase | HandlerOptions;

export interface RegistryOptions {
  /**
   * How long shutdown may take before it stops waiting, in milliseconds.
   *
   * A deadline is not a nicety. A handler that awaits something that never resolves — a
   * socket that will not close, a lock nobody releases — turns Ctrl-C into a process the
   * user has to kill twice, and the second one is SIGKILL with no cleanup at all. Better
   * to abandon a slow handler than to strand the person at the keyboard.
   *
   * `Infinity` and `0` are rejected here, at registration — see `deadline.ts`.
   */
  deadline?: number;
  /** Where a handler's own failure is reported. Defaults to stderr. */
  onError?: (error: unknown) => void;
  /**
   * Where a breached deadline is reported. Defaults to stderr, naming every handler that
   * had not returned. Takes the whole report, so a caller can project it as JSON or as an
   * agent event instead of a line of prose.
   */
  onTimeout?: (report: ShutdownReport) => void;
}

export interface Registry {
  /**
   * Register a handler in a phase. Returns the function that unregisters it.
   *
   * The phase defaults to {@link DEFAULT_PHASE}, so a caller that never heard of phases
   * keeps the behaviour it had: unphased handlers share one phase and run in registration
   * order within it — ahead of `restore`, which is the part that was not true before.
   */
  add(handler: ExitHandler, spec?: HandlerSpec): () => void;
  /** Run every handler, once, phase by phase, inside the deadline. Later calls are no-ops. */
  run(info: ExitInfo): Promise<ShutdownReport>;
  /** Run every handler synchronously, in phase order; a returned promise is abandoned. */
  runSync(info: ExitInfo): ShutdownReport;
  /** How many handlers are registered — for a caller that wants to know if any are. */
  readonly size: number;
  /** How many are registered in one phase. */
  count(phase: Phase): number;
  /** Whether shutdown has already happened. */
  readonly settled: boolean;
  /**
   * The report of the shutdown that happened, or `undefined` before one has.
   *
   * Readable after `runSync`, which cannot return a promise, and after a second trigger
   * that found the work already done — the path that would otherwise have nothing to say.
   */
  readonly report: ShutdownReport | undefined;
}

/*
 * `console.error`, not `process.stderr`: process belongs to the Runtime seam, and a
 * registry built by hand — the layer is usable on its own — still has to report a failed
 * handler somewhere. Callers that own a stream pass `onError`.
 */
const reportToStderr = (error: unknown): void => {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error(`closeout: a handler failed during shutdown\n${message}`);
};

/** One registered handler, and the name a report will call it by. */
interface Entry {
  run: ExitHandler;
  label: string;
}

/**
 * What to call a handler that gave no label.
 *
 * A named function names itself; an anonymous one is `'(anonymous)'` rather than an empty
 * string, because a report reading `handlers that had not returned: , ` is worse than one
 * that admits it does not know.
 */
const labelOf = (handler: ExitHandler, given: string | undefined): string => (given ?? '') || handler.name || '(anonymous)';

const specOf = (spec: HandlerSpec | undefined): HandlerOptions => (typeof spec === 'string' ? { phase: spec } : (spec ?? {}));

/** A handler that has been invoked, and whether it has come back. */
interface InFlight {
  label: string;
  settled: boolean;
}

/*
 * One handler's failure must not cancel the others. Shutdown is the worst possible place
 * for an exception to short-circuit a loop: the handlers that would have restored the
 * terminal are usually the ones registered last.
 */
function invoke(entry: Entry, report: ExitReport, onError: (error: unknown) => void): void | Promise<void> {
  try {
    return entry.run(report);
  } catch (error) {
    onError(error);
    return undefined;
  }
}

/**
 * Invoke every handler in one phase, recording which of them are still in flight.
 *
 * Invoking is separated from waiting because the two happen on different terms: every phase
 * is always invoked, and only some of them are ever awaited (see `run`). The in-flight
 * record is what lets the deadline name a handler rather than count them.
 */
function invokePhase(entries: Iterable<Entry>, report: ExitReport, onError: (error: unknown) => void, tracking: InFlight[]): Promise<void>[] {
  const pending: Promise<void>[] = [];
  for (const entry of entries) {
    const result = invoke(entry, report, onError);
    if (!(result instanceof Promise)) continue;
    const flight: InFlight = { label: entry.label, settled: false };
    tracking.push(flight);
    pending.push(
      result.then(
        () => {
          flight.settled = true;
        },
        (error: unknown) => {
          flight.settled = true;
          onError(error);
        },
      ),
    );
  }
  return pending;
}

/** The report a second trigger gets: the shutdown that already happened, not a new one. */
const alreadyRun = (finalReport: ShutdownReport | undefined, info: ExitInfo): ShutdownReport =>
  finalReport ?? { ...toReport(info), timedOut: false, unfinished: [] };

export function createRegistry(options: RegistryOptions = {}): Registry {
  const { onError = reportToStderr } = options;
  // Validated here, at registration — not when it would have fired, by which time the
  // caller who could have fixed it is not in the stack any more.
  const deadline = assertDeadline(options.deadline ?? DEFAULT_DEADLINE);
  // The registry decides *that* a breach is reported; `report.ts` decides what it says.
  const onTimeout = options.onTimeout ?? ((report: ShutdownReport): void => console.error(timeoutMessage(report, deadline)));
  /*
   * One insertion-ordered set per phase, built from PHASES itself — so the iteration order
   * below *is* the declared order by construction, and a fourth phase is one edit in one
   * place rather than a list to keep in step with a loop.
   */
  const handlers = new Map<Phase, Set<Entry>>(PHASES.map((phase) => [phase, new Set<Entry>()]));
  const bucket = (phase: Phase): Set<Entry> => handlers.get(phase) ?? new Set<Entry>();
  /** The two halves of "has this happened": started, and finished with a report to show. */
  const state: { started: boolean; finished: ShutdownReport | undefined } = { started: false, finished: undefined };

  return {
    add(handler, spec) {
      const { phase = DEFAULT_PHASE, label } = specOf(spec);
      const entry: Entry = { run: handler, label: labelOf(handler, label) };
      const into = bucket(phase);
      into.add(entry);
      return () => {
        into.delete(entry);
      };
    },

    async run(info) {
      if (state.started) return alreadyRun(state.finished, info);
      state.started = true;
      const report = toReport(info);

      /*
       * One clock for the whole shutdown, started before the first phase — not one per
       * phase, which would let three slow phases add up to three deadlines and give back
       * the hang the number exists to bound.
       */
      const clock = startDeadline(deadline);
      const tracking: InFlight[] = [];

      try {
        for (const phase of PHASES) {
          const pending = invokePhase(bucket(phase), report, onError, tracking);

          /*
           * Past the deadline the later phases are still **invoked**; they are only no
           * longer awaited. Skipping them would let a handler that hung in `flush` decide
           * that the cursor stays hidden — the exact failure this package exists to remove,
           * arrived at through the machinery meant to prevent it.
           */
          if (pending.length === 0 || clock.expired) continue;

          /*
           * `allSettled`, not `all`: a rejected handler has already been reported by
           * `invoke` or the handlers above, and one rejection must not skip the wait for
           * the others.
           */
          // eslint-disable-next-line reliability/no-await-in-loop -- sequencing the phases IS the guarantee: `Promise.all` over all three would start `restore` while `flush` was still awaiting, which is the bug phases exist to remove
          await Promise.race([Promise.allSettled(pending).then(() => undefined), clock.reached]);
        }
      } finally {
        clock.cancel();
      }

      const unfinished = tracking.filter((f) => !f.settled).map((f) => f.label);
      state.finished = { ...report, timedOut: clock.expired, unfinished };
      if (state.finished.timedOut) onTimeout(state.finished);
      return state.finished;
    },

    runSync(info) {
      if (state.started) return alreadyRun(state.finished, info);
      state.started = true;
      const report = toReport(info);
      /*
       * A promise returned on this path is abandoned, and saying so is the honest answer:
       * `'exit'` is the one trigger Node gives no time at all, so an asynchronous handler
       * there never had a turn to lose. It is reported as unfinished for exactly that
       * reason — the caller asked for work that could not happen, and a silent no-op is how
       * a half-written file gets blamed on the disk.
       */
      const tracking: InFlight[] = [];
      for (const phase of PHASES) invokePhase(bucket(phase), report, onError, tracking);
      const unfinished = tracking.map((f) => f.label);
      state.finished = { ...report, timedOut: false, unfinished };
      return state.finished;
    },

    get size() {
      let total = 0;
      for (const set of handlers.values()) total += set.size;
      return total;
    },

    count(phase) {
      return bucket(phase).size;
    },

    /*
     * Both of these read one variable, and they are deliberately not the same question.
     * `settled` flips when a shutdown *starts*, because that is what makes the second
     * trigger a no-op; `report` is filled in when one *finishes*, so between the two there
     * is a real window in which shutdown has happened and has no report yet. They are
     * written as one accessor over the pair so that the window is visible in the code
     * rather than implied by two getters that look interchangeable.
     */
    get settled() {
      return state.started;
    },

    get report() {
      return state.finished;
    },
  };
}

/*
 * The re-exports sit at the end, in one statement: `deadline.ts` and `report.ts` were split
 * out of this file, and a caller who had `DEFAULT_DEADLINE` or `ExitInfo` from here keeps it.
 */
export { DEFAULT_DEADLINE, type ExitInfo, type ExitReport, type ShutdownReport };
