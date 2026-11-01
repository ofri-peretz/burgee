/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * How a function's cost grows with its input, for the locks that say "linear, not quadratic".
 *
 * A wall-clock bound on one input cannot say that. It holds a constant factor too, so anything
 * that slows every operation by the same amount turns it red on linear code: the weekly mutation
 * run's dry run (oxmutate wraps every expression in a mutant switch) failed a linear parse at its
 * 400 ms bound on 2026-10-29. The ratio of two sizes cancels the constant. An input
 * {@link FACTOR} times larger costs a linear function 8 times as much, a quadratic one 64 and a
 * cubic one 512, so a ratio under {@link LINEAR} separates them whatever the machine, the load or
 * the instrumentation.
 *
 * Three things keep the ratio from being noise, each learned from a red CI run on linear code
 * (PR #1373: 8.84x at 4x apart on ubuntu, 22.6x on macOS from a 1.2 ms baseline):
 *
 * 1. The smaller size is grown at run time until its run takes {@link TARGET_MS}, first by `n` up
 *    to the caller's memory ceiling, then by repeating the call. A millisecond is the timer and
 *    the JIT; twenty is the function. Calibrating on time also keeps the case's cost about the
 *    same on a laptop, a CI runner and under instrumentation, which just settles on a smaller n.
 * 2. Each size is compared by its fastest of {@link RUNS} runs. A preemption or a collection only
 *    ever adds time, so the fastest run is the estimate noise cannot inflate — the lesson
 *    `yargs/cliui.test.ts` in burgee wrote up first.
 * 3. The sizes sit 8x apart and the ceiling is 24: 3x over linear and 2.7x under quadratic,
 *    where 4x apart with a ceiling of 8 left only 2x either way.
 *
 * Test scaffolding: `__fixtures__` is outside coverage, mutation and the build.
 */

/** How much larger the second input is than the first. */
export const FACTOR = 8;

/** The ceiling on the ratio: linear is 8, quadratic 64, cubic 512. */
export const LINEAR = 24;

/** How long the smaller size's run is grown to take before anything is compared. */
const TARGET_MS = 20;

/** Timed runs per size; the fastest of each is compared. */
const RUNS = 5;

/**
 * Timed rounds stop once this much time has gone on them, after the first. Linear code never
 * reaches it (about 1 s for five rounds); a quadratic path does, and then fails in seconds rather
 * than at the test's timeout.
 */
const BUDGET_MS = 2_000;

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
  /** Calls per timed sample. */
  reps: number;
  /** Fastest ms at `n`. */
  small: number;
  /** Fastest ms at `FACTOR * n`. */
  large: number;
  /** `large / small`. */
  ratio: number;
  /** Timed rounds run, out of {@link RUNS}. */
  rounds: number;
}

function timed(run: () => unknown, reps: number): number {
  const started = performance.now();
  for (let i = 0; i < reps; i += 1) run();
  return performance.now() - started;
}

/**
 * Times `run` on `input(n)` and `input(FACTOR * n)`. `n` starts at `sizes.from` and doubles, up to
 * `sizes.max`, until the smaller run takes {@link TARGET_MS}; past `max` the call repeats instead.
 * Each size then runs once untimed, and the two are timed in turns, so both share whatever
 * contention the host has. Inputs are built before any clock starts.
 */
export function growth<T>(input: (n: number) => T, run: (x: T) => unknown, sizes: Sizes): Growth {
  let n = sizes.from;
  let reps = 1;
  let small = input(n);
  run(small);
  const sample = (x: T): number => timed(() => run(x), reps);
  let took = Math.min(sample(small), sample(small));
  while (took < TARGET_MS) {
    if (2 * n <= sizes.max) {
      n *= 2;
      small = input(n);
      run(small);
    } else if (2 * reps <= MAX_REPS) {
      reps *= 2;
    } else {
      break;
    }
    took = Math.min(sample(small), sample(small));
  }
  const large = input(FACTOR * n);
  const started = performance.now();
  run(large);
  const smalls: number[] = [];
  const larges: number[] = [];
  for (let i = 0; i < RUNS; i += 1) {
    smalls.push(sample(small));
    larges.push(sample(large));
    if (performance.now() - started > BUDGET_MS) break;
  }
  const s = Math.min(...smalls);
  const l = Math.min(...larges);
  return { n, reps, small: s, large: l, ratio: l / s, rounds: smalls.length };
}

/** The failure message: the sizes, both timings and the ratio, so a red run says what it measured. */
export function said(g: Growth): string {
  const calls = g.reps === 1 ? '' : ` x${String(g.reps)} calls`;
  return `${FACTOR}x the input (n=${String(g.n)}${calls}) took ${g.ratio.toFixed(2)}x the time (${g.small.toFixed(1)} ms -> ${g.large.toFixed(1)} ms, fastest of ${String(g.rounds)}); linear is ${FACTOR}, quadratic ${FACTOR ** 2}, the ceiling ${LINEAR}`;
}
