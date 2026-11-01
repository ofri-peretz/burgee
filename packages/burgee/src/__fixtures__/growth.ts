/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * How a function's cost grows with its input, for the locks that say "linear, not quadratic".
 *
 * A wall-clock bound on one input cannot say that: it holds a constant factor too, and the weekly
 * mutation run's instrumentation failed a linear parse at its 400 ms bound (2026-10-29). So the
 * function is timed at `n` and at {@link FACTOR}`n`, and its growth is divided by the growth of a
 * linear reference — a character scan of the same two inputs, timed in the same rounds. Whatever
 * the host does to both — a slow or shared runner, a cold cache at the larger size, a collector
 * under pressure — cancels in that quotient. A linear function reads about 1, a quadratic one
 * about {@link FACTOR} (8), a cubic one 64; the ceiling {@link LINEAR} (3) sits between.
 *
 * CI taught each of the rest (PR #1373, #1404): a ratio taken from a 1-5 ms baseline is the timer's,
 * one round is one sample, and inputs of hundreds of thousands of characters measure the collector
 * more than the code. So each timed call is small (the smaller size is grown at run time only until
 * its fastest run takes {@link TARGET_MS}, then the call repeats rather than the input grows), each
 * size is compared by its fastest of {@link RUNS} runs (interference only ever adds time), and a
 * case is held to {@link CASE_MS}: past it, {@link growth} throws instead of measuring on.
 *
 * Test scaffolding: `__fixtures__` is outside coverage, mutation and the build.
 */

/** How much larger the second input is than the first. */
export const FACTOR = 8;

/** The ceiling on the function's growth over the reference's: linear 1, quadratic 8, cubic 64. */
export const LINEAR = 3;

/** The owner's limit for one test case (2026-11-01); a case's `timeout`, and `growth`'s own. */
export const CASE_MS = 5_000;

/** How long the smaller size's fastest run is grown to take: over the timer's noise, and cheap. */
const TARGET_MS = 4;

/** Timed rounds; the fastest of each size is compared. */
const RUNS = 5;

/** Rounds that always run, so the fastest-of is never a single sample. */
const MIN_ROUNDS = 3;

/** Timed rounds stop once this much time has gone on them, after {@link MIN_ROUNDS}. */
const BUDGET_MS = 250;

/** The most times one timed sample repeats the call, for a function too fast at the memory ceiling. */
const MAX_REPS = 4_096;

export interface Sizes {
  /** The first `n` tried: small enough to be cheap under instrumentation. */
  from: number;
  /** The largest `n` the input may be built at; `FACTOR * max` is built too. */
  max: number;
}

export interface Growth {
  /** The smaller size calibration settled on. */
  n: number;
  /** Calls per timed sample of the function. */
  reps: number;
  /** Fastest ms at `n`, and at `FACTOR * n`. */
  small: number;
  large: number;
  /** `large / small` for the function, and for the reference scan of the same inputs. */
  ratio: number;
  reference: number;
  /** `ratio / reference`: about 1 for linear code. */
  normalized: number;
  /** Timed rounds run, out of {@link RUNS}. */
  rounds: number;
}

/** The linear reference: one pass over the characters, no allocation. */
function scan(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h + (s.codePointAt(i) as number)) | 0;
  return h;
}

function timed(run: () => unknown, reps: number): number {
  const started = performance.now();
  for (let i = 0; i < reps; i += 1) run();
  return performance.now() - started;
}

/**
 * How many times larger a run that took `took` ms must get to reach {@link TARGET_MS}, assuming it
 * is linear: at least 2, so calibration always moves, and at most 8, so a quadratic run that is
 * scaled as if it were linear overshoots by 64x at worst rather than without bound.
 */
function step(took: number): number {
  return Math.min(8, Math.max(2, Math.ceil(TARGET_MS / Math.max(took, 0.01))));
}

/** Scales `reps` until `run`'s fastest of two samples takes {@link TARGET_MS}, or the cap. */
function repsFor(run: () => unknown): number {
  let reps = 1;
  for (let took = timed(run, reps); took < TARGET_MS && reps < MAX_REPS; took = Math.min(timed(run, reps), timed(run, reps))) {
    reps = Math.min(MAX_REPS, reps * step(took));
  }
  return reps;
}

/**
 * Times `run` and the reference scan on `input(n)` and `input(FACTOR * n)`. `n` starts at
 * `sizes.from` and grows, up to `sizes.max`, until the smaller run takes {@link TARGET_MS}; past
 * `max` the call repeats instead. Each size runs once untimed first, the four are timed in turns,
 * and inputs are built before any clock starts. When the timed fastest of the smaller size is under
 * the floor, it grows and measures again; when the caps stop it under the floor, or the case passes
 * {@link CASE_MS}, it throws rather than compare noise.
 */
export function growth(input: (n: number) => string, run: (s: string) => unknown, sizes: Sizes): Growth {
  const began = performance.now();
  const over = (): void => {
    const ms = performance.now() - began;
    if (ms > CASE_MS) throw new Error(`growth: the case has run ${ms.toFixed(0)} ms, over its ${String(CASE_MS)} ms limit`);
  };
  let n = sizes.from;
  let reps = 1;
  let small = input(n);
  run(small);
  const grow = (took: number): void => {
    const by = step(took);
    if (n < sizes.max) {
      n = Math.min(sizes.max, n * by);
      small = input(n);
      run(small);
    } else if (reps < MAX_REPS) {
      reps = Math.min(MAX_REPS, reps * by);
    } else {
      throw new Error(
        `growth: the smaller size is still under ${String(TARGET_MS)} ms at n=${String(n)} x${String(reps)} calls, the most \`max\` and MAX_REPS allow; a ratio from there would be the timer's. Raise \`max\`.`,
      );
    }
    over();
  };
  const fastest = (): number => Math.min(timed(() => run(small), reps), timed(() => run(small), reps));
  for (;;) {
    for (let took = fastest(); took < TARGET_MS; took = fastest()) grow(took);
    const large = input(FACTOR * n);
    const scanReps = repsFor(() => scan(small));
    run(large);
    scan(large);
    const started = performance.now();
    const t: [number[], number[], number[], number[]] = [[], [], [], []];
    for (let i = 0; i < RUNS; i += 1) {
      t[0].push(timed(() => run(small), reps));
      t[1].push(timed(() => run(large), reps));
      t[2].push(timed(() => scan(small), scanReps));
      t[3].push(timed(() => scan(large), scanReps));
      over();
      if (i + 1 >= MIN_ROUNDS && performance.now() - started > BUDGET_MS) break;
    }
    const [s, l, rs, rl] = t.map((xs) => Math.min(...xs)) as [number, number, number, number];
    if (s >= TARGET_MS) {
      const ratio = l / s;
      const reference = rl / rs;
      return { n, reps, small: s, large: l, ratio, reference, normalized: ratio / reference, rounds: t[0].length };
    }
    grow(s);
  }
}

/** The failure message: the sizes, both timings and both ratios, so a red run says what it measured. */
export function said(g: Growth): string {
  const calls = g.reps === 1 ? '' : ` x${String(g.reps)} calls`;
  return `${FACTOR}x the input (n=${String(g.n)}${calls}) took ${g.ratio.toFixed(2)}x the time (${g.small.toFixed(1)} -> ${g.large.toFixed(1)} ms, fastest of ${String(g.rounds)}), against ${g.reference.toFixed(2)}x for a linear scan of the same input: ${g.normalized.toFixed(2)} normalised; linear is 1, quadratic ${FACTOR}, the ceiling ${LINEAR}`;
}
