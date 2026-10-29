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
 * 400 ms bound on 2026-10-29. The ratio of two sizes cancels the constant. Quadrupling the input
 * quadruples a linear cost, multiplies a quadratic one by 16 and a cubic one by 64, so a ratio
 * under {@link LINEAR} separates them whatever the machine, the load or the instrumentation.
 *
 * Test scaffolding: `__fixtures__` is outside coverage, mutation and the build.
 */

/** How much larger the second input is than the first. */
export const FACTOR = 4;

/** The ceiling on the ratio: linear is 4, quadratic 16, and 8 is the geometric middle of the two. */
export const LINEAR = 8;

/** Timed runs per size; the median of each is compared, so one preempted run cannot decide it. */
const RUNS = 3;

export interface Growth {
  /** Median ms at `n`. */
  small: number;
  /** Median ms at `FACTOR * n`. */
  large: number;
  /** `large / small`. */
  ratio: number;
}

function median(xs: number[]): number {
  return xs.toSorted((a, b) => a - b)[Math.floor(xs.length / 2)] as number;
}

function time(run: () => unknown): number {
  const started = performance.now();
  run();
  return performance.now() - started;
}

/**
 * Times `run` on `input(n)` and `input(FACTOR * n)`, {@link RUNS} times each, interleaved so the
 * two sizes share whatever contention the host has, after one untimed run of each so neither
 * pays for compilation or a lazily built table. Inputs are built before any clock starts.
 *
 * Pick `n` so the small run takes well over the timer's resolution, a millisecond or more, and so
 * the case stays cheap under the mutation run: its instrumentation multiplied a tight scan loop's
 * cost about 75x (burgee's `meow` trims, 2026-10-29), and every mutant in the code reruns it.
 */
export function growth<T>(input: (n: number) => T, run: (x: T) => unknown, n: number): Growth {
  const small = input(n);
  const large = input(FACTOR * n);
  run(small);
  run(large);
  const smalls: number[] = [];
  const larges: number[] = [];
  for (let i = 0; i < RUNS; i += 1) {
    smalls.push(time(() => run(small)));
    larges.push(time(() => run(large)));
  }
  const s = median(smalls);
  const l = median(larges);
  return { small: s, large: l, ratio: l / s };
}

/** The failure message: both medians and the ratio, so a red run says what it measured. */
export function said(g: Growth): string {
  return `${FACTOR}x the input took ${g.ratio.toFixed(2)}x the time (${g.small.toFixed(1)} ms -> ${g.large.toFixed(1)} ms); linear is ${FACTOR}, quadratic ${FACTOR ** 2}`;
}
