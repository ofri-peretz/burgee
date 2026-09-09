/** Order statistics over a sample, with the convention stated once. */

/** Nearest-rank quantile: the value at ceil(q·n), which is always an observed sample. */
export function quantile(xs: readonly number[], q: number): number {
  if (xs.length === 0) throw new Error('quantile of an empty sample');
  const sorted = [...xs].toSorted((a, b) => a - b);
  const rank = Math.ceil(q * sorted.length);
  const index = Math.min(Math.max(rank, 1), sorted.length) - 1;
  return sorted[index] as number;
}

const HALF = 0.5;
const P95 = 0.95;

export const median = (xs: readonly number[]): number => quantile(xs, HALF);
export const p95 = (xs: readonly number[]): number => quantile(xs, P95);

const DECIMAL_BASE = 10;

/** Rounded to `places`, because a byte ratio printed to 15 decimals is noise, not precision. */
export function round(value: number, places: number): number {
  const scale = DECIMAL_BASE ** places;
  return Math.round(value * scale) / scale;
}
