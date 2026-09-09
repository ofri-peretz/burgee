/**
 * The one shape every axis emits (B5), and the two things that can be done to it:
 * gate it deterministically, and point a control band at it.
 *
 * Four axes measure four different kinds of thing — a distribution of spawn times, a
 * pass count, a byte count, a token count — and they all land here, because a band
 * collector that needs to know which axis produced a number is a collector that has to
 * be edited every time an axis is added (B5, design R5).
 */

export type AxisName = 'agent' | 'perf' | 'compat' | 'weight';

/**
 * `measured` — the axis ran and its numbers are in this document.
 * `skipped`  — the axis was asked for and could not run (no credential, no input file).
 * `not-run`  — the axis was not selected by `--axis`.
 *
 * The distinction is load-bearing: a reader must be able to tell "we measured nothing"
 * from "we measured and it was zero", and a band must never be fed by either of the
 * latter two. See `assertHonest`.
 */
export type AxisStatus = 'measured' | 'skipped' | 'not-run';

/** A deterministic per-PR gate on one number. Absent means the number is reported only. */
export interface Gate {
  /** Fail when the value is above this. */
  max?: number;
  /** Fail when the value is below this. */
  min?: number;
  /** Why this is the ceiling or floor, in a sentence a stranger can argue with. */
  why: string;
}

/**
 * One measurement. `median` and `p95` over `samples` observations; for a deterministic
 * measurement (a byte count, a pass rate) `samples` is 1 and the two are equal, which is
 * stated rather than hidden — a p95 of one sample is that sample.
 */
export interface BenchRecord {
  axis: AxisName;
  /** What was measured: a CLI variant, a host, an entry point, a ratio of two of those. */
  variant: string;
  metric: string;
  unit: string;
  samples: number;
  median: number;
  p95: number;
  gate?: Gate;
  /** How this number was produced, so the table can be read without the source. */
  note?: string;
  /** Anything reproducing the number needs: resolved paths, versions, raw counts. */
  detail?: Readonly<Record<string, string | number | boolean>>;
}

export interface GateFailure {
  record: BenchRecord;
  bound: 'max' | 'min';
  limit: number;
  actual: number;
}

/**
 * Every record that violates its own gate. Pure, so `ratchet.test.ts` can feed it a
 * synthetic record one step worse than the gate and prove the gate fires — a budget that
 * has never failed is not a budget (design, Verification).
 */
export function gateFailures(records: readonly BenchRecord[]): GateFailure[] {
  const out: GateFailure[] = [];
  for (const record of records) {
    const gate = record.gate;
    if (gate === undefined) continue;
    // The gated statistic is the median: p95 of a spawn distribution moves with whatever
    // else the machine was doing, and gating on it is how #27 produced two red PRs that
    // had touched nothing. The p95 is reported beside it and watched by the band.
    const actual = record.median;
    if (gate.max !== undefined && actual > gate.max) out.push({ record, bound: 'max', limit: gate.max, actual });
    if (gate.min !== undefined && actual < gate.min) out.push({ record, bound: 'min', limit: gate.min, actual });
  }
  return out;
}

export function describeFailure(f: GateFailure): string {
  const { record, bound, limit, actual } = f;
  const cmp = bound === 'max' ? 'above its ceiling' : 'below its floor';
  return `${record.variant} ${record.metric}: ${actual} ${record.unit} is ${cmp} of ${limit} — ${record.gate?.why ?? ''}`;
}
