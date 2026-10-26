/**
 * The contract between instrumented code and the runner. The native core emits calls to
 * `oxmAct(id)` and `oxmCov(...ids)` that read and write this namespace on `globalThis`
 * (`native/src/instrument.rs`, `NAMESPACE`). Changing a field here without changing the emitter
 * breaks every instrumented file.
 */
export const NAMESPACE = '__oxmutate__';

/** Arms one mutant from process start, for static mutants and isolated re-runs. */
export const ACTIVE_MUTANT_ENV = '__OXMUTATE_ACTIVE_MUTANT__';

export interface Namespace {
  activeMutant?: string | undefined;
  /** Set during the dry run: hits are attributed to this test. */
  currentTestId?: string | undefined;
  /** While a mutant is active: how often its switch was taken, and the cap that stops a loop. */
  hitCount?: number | undefined;
  hitLimit?: number | undefined;
  mutantCoverage?: { static: Record<string, number>; perTest: Record<string, Record<string, number>> };
}
