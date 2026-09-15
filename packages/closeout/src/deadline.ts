/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * The clock the whole shutdown runs against, and the one rule about what it may be set to
 * (design R3, Y10).
 *
 * Split out of `registry.ts` because the registry is the *order* and this is the *bound*,
 * and because the bound has a contract of its own that is easy to state and easy to test
 * without a single handler: it is finite, it is positive, and neither of those is
 * negotiable at any price a caller can pay.
 */

/**
 * Two seconds: long enough to flush a file, short enough that nobody reaches for the
 * keyboard.
 *
 * **Provisional, and the measurement that was supposed to settle it is recorded rather than
 * quietly re-run until it agreed.** `measure/deadline.mjs` runs the five cleanup shapes this
 * layer actually sees — flush a write stream, close a listening server, kill a child, remove
 * a temp directory of 100 files, restore the terminal — 100x each and prints each p99. Run
 * 2026-09-14 on darwin arm64, node 24.13:
 *
 *     flush a write stream   p99     67.1 ms
 *     close a server         p99      1.5 ms
 *     kill a child           p99      1.3 ms
 *     remove a temp dir      p99 17 818.5 ms
 *     restore the terminal   p99      0.2 ms
 *
 * Four of the five are inside 70 ms and the fifth is four orders of magnitude out, which is
 * not a fact about removing a directory: the machine was at **load average 19-22 across 14
 * cores**, the same condition that makes `exit-hook`'s four signal cases a race. Re-run
 * alone, the removal is p50 161 ms / p99 2 166 ms — still the shape that decides the answer,
 * and still measured through the load.
 *
 * So the default stays 2 000 ms and stays *stated as provisional*, because rounding a p99
 * that has another process's disk queue inside it would be a number with a decimal point
 * and no meaning. The honest reading of the run is that everything except filesystem
 * removal finishes inside 70 ms, and that the deadline is there for the shape that does not.
 * `closeout/intent.md`'s open question is not closed; what changed is that it now has a
 * repeatable instrument and one recorded run instead of an argument.
 */
export const DEFAULT_DEADLINE = 2000;

/**
 * A caller error, in the family's one vocabulary: a `code` that classifies it and a `fix`
 * that says what to do instead.
 *
 * `USAGE` rather than an `E_…` code: the `E_…` names belong to the plugin contract, where a
 * code travels between a plugin author and a host. This is a caller passing a number that
 * cannot mean what they wanted it to mean, which is the same class caique's binding reports
 * and the same class a CLI exits 2 for.
 */
export const DEADLINE_ERROR_CODE = 'USAGE';

export class DeadlineError extends TypeError {
  readonly code = DEADLINE_ERROR_CODE;
  /** What to do instead. Always present, always actionable — contract R8's shape. */
  readonly fix: string;

  constructor(message: string, fix: string) {
    super(message);
    this.name = 'DeadlineError';
    this.fix = fix;
  }
}

/**
 * Check a deadline at the moment it is registered, not at the moment it would have fired.
 *
 * **`Infinity` and `0` are both rejected, and they are the same mistake wearing two hats.**
 * `Infinity` is "wait forever", which is the unbounded shutdown this package exists to
 * remove. `0` reads like "do not wait", and what it actually buys is a shutdown where no
 * asynchronous handler ever gets a turn — every one of them abandoned mid-flight, which is
 * the *other* half of the same failure: work that silently did not happen. A caller who
 * genuinely wants either wants a different package, and being told so at `install()` is
 * worth far more than finding out during the one shutdown that mattered.
 *
 * Returns the number so a caller can use it in an expression, which is what makes it hard
 * to call and then ignore.
 */
export function assertDeadline(ms: number): number {
  if (typeof ms !== 'number' || Number.isNaN(ms)) {
    throw new DeadlineError(
      `closeout: a deadline must be a number of milliseconds; got ${String(ms)}`,
      'pass a finite positive number — the default is 2000',
    );
  }
  if (!Number.isFinite(ms)) {
    throw new DeadlineError(
      'closeout: a deadline of Infinity is the unbounded shutdown this package exists to remove',
      'pass a finite number of milliseconds, however large — 600000 is ten minutes and still ends',
    );
  }
  if (ms <= 0) {
    throw new DeadlineError(
      `closeout: a deadline of ${ms} leaves no time for any handler to run`,
      'pass a positive number of milliseconds; to skip the handlers, do not register them',
    );
  }
  return ms;
}

/** The one clock the whole shutdown runs against. */
export interface Deadline {
  /** Whether the time is already up. Read between phases. */
  readonly expired: boolean;
  /** Resolves when it is. Never rejects. */
  readonly reached: Promise<void>;
  cancel(): void;
}

/**
 * Start the clock.
 *
 * `unref` so the deadline itself never holds the loop open: a timer that keeps a process
 * alive in order to police how long the process takes to die would be its own bug.
 */
export function startDeadline(ms: number): Deadline {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const self = {
    expired: false,
    reached: new Promise<void>((resolve) => {
      timer = setTimeout(() => {
        self.expired = true;
        resolve();
      }, ms);
      timer.unref?.();
    }),
    cancel(): void {
      if (timer !== undefined) clearTimeout(timer);
    },
  };
  return self;
}
