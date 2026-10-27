/**
 * The contract between instrumented code and the runner. The native core emits calls to
 * `oxmAct(id)` and `oxmCov(...ids)` that read and write this namespace on `globalThis`
 * (`native/src/instrument.rs`, `NAMESPACE`). Changing a field here without changing the emitter
 * breaks every instrumented file.
 */
export const NAMESPACE = '__oxmutate__';

/**
 * Coverage key prefix for hits that happen while a test file is being collected (imports): the
 * runner writes `file:<path>` keys, and the coordinator reads them back as static mutants' loaders.
 */
export const FILE_KEY = 'file:';

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

// ── The process seam ────────────────────────────────────────────────────────────────────────────
// The one file in the package that names the process (burgee's `process-reference-lock.test.ts`):
// the coordinator, the servers, the runner and the CLI read it here, so a test can see every
// place the package touches it. `env` is the live object: a write here is a write to the process.
export const env = process.env;
export const argv = process.argv;
export const cwd = (): string => process.cwd();
export const stderr = process.stderr;
export const exit = (code: number): never => process.exit(code);
export const setExitCode = (code: number): void => {
  process.exitCode = code;
};
