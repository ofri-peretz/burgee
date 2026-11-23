/**
 * The seeded random source every property draws from (contract-properties constraints): a run is
 * replayed from its printed seed alone, on any machine, so the numbers are mulberry32's and never
 * `Math.random`'s.
 */

export interface Random {
  /** The seed this source started from, printed with every run. */
  readonly seed: number;
  /** A number in [0, 1). */
  readonly next: () => number;
  /** A whole number in [min, max], both included. */
  readonly int: (min: number, max: number) => number;
  /** One of `items`, which must not be empty. */
  readonly pick: <T>(items: readonly T[]) => T;
  /** True with probability `p`. */
  readonly chance: (p: number) => boolean;
}

/** 2^32: mulberry32 works on unsigned 32-bit integers. */
const SPAN = 4_294_967_296;
/** mulberry32's increment and shifts, as published. */
const STEP = 0x6d_2b_79_f5;
const SHIFT_A = 15;
const SHIFT_B = 7;
const SHIFT_C = 14;
const ODD = 61;

/** A source seeded with `seed` (any number; its low 32 bits are used). */
export const randomFrom = (seed: number): Random => {
  const start = seed >>> 0;
  let state = start;
  const next = (): number => {
    state = (state + STEP) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> SHIFT_A), t | 1);
    t ^= t + Math.imul(t ^ (t >>> SHIFT_B), t | ODD);
    return ((t ^ (t >>> SHIFT_C)) >>> 0) / SPAN;
  };
  const int = (min: number, max: number): number => min + Math.floor(next() * (max - min + 1));
  return {
    seed: start,
    next,
    int,
    pick: <T>(items: readonly T[]): T => items[int(0, items.length - 1)] as T,
    // Stryker disable next-line EqualityOperator: equivalent but on one exact float of 2^32 draws
    chance: (p: number) => next() < p,
  };
};
