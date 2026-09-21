/**
 * A7 — the graded pass rate per host, as `burgee migrate` reports it.
 *
 * These are `compat-oracle`'s own numbers: the incumbent's test suite, vendored and run
 * against burgee's front-end, which is what "drop-in" means here and the only claim in the
 * package that is measured rather than argued.
 *
 * **They live here as a data module rather than as a literal in the report**, and
 * `compat-baseline-lock.test.ts` holds this file equal to
 * `packages/compat-oracle/baseline/<host>.json` — the same files the compat page renders.
 * Changing a number here without the measurement moving fails that lock, which is the
 * whole point: a number typed into a report template is a number that goes stale silently,
 * and this repository has published four of those and caught them all late.
 *
 * It cannot be read from the oracle at run time. `compat-oracle` is `private: true` and is
 * never published, so a user who installs `burgee` has no baseline directory to read; a
 * copy with a lock on it is the strongest control available on the published side, and the
 * lock is what makes it a copy rather than a claim.
 */

/** One row of the baseline, in the shape `baseline/<host>.json` stores it. */
export interface Graded {
  /** Cases in the incumbent's own suite. */
  reference: number;
  /** Cases that pass against burgee's front-end. */
  passed: number;
  /** `passed / reference`, carried rather than recomputed so it is the oracle's own division. */
  rate: number;
}

/** The two hosts `migrate` rewrites, and nothing else — a row here without a mapping would claim a path that does not exist. */
export const GRADED: Readonly<Record<string, Graded>> = {
  commander: { reference: 1360, passed: 1360, rate: 1 },
  yargs: { reference: 804, passed: 804, rate: 1 },
};
