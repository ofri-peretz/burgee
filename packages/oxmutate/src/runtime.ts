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
/** Set for a dry run that tracks which tests read each static value (`static.readers`). */
export const TRACK_READS_ENV = '__OXMUTATE_TRACK_READS__';

export interface Namespace {
  activeMutant?: string | undefined;
  /** Several static mutants armed for one re-collection (runner.ts, `static.group`): the switch of each is taken. */
  activeGroup?: Record<string, true> | undefined;
  /** Set during the dry run: hits are attributed to this test. */
  currentTestId?: string | undefined;
  /** While a mutant is active: how often its switch was taken, and the cap that stops a loop. */
  hitCount?: number | undefined;
  hitLimit?: number | undefined;
  mutantCoverage?: { static: Record<string, number>; perTest: Record<string, Record<string, number>> };
  /** `trackReads`: the tracked static values read with no test current (`static`) and per test or file collection (`oxmRead`). */
  readCoverage?: { static: Record<string, number>; perTest: Record<string, Record<string, number>> };
  /** Set from `__OXMUTATE_TRACK_READS__` when the module first loads: `oxmTrack` returns a reporting Proxy. */
  trackReads?: boolean;
}

// ── The process seam ────────────────────────────────────────────────────────────────────────────
// The one file in the package that names the process (burgee's `process-reference-lock.test.ts`):
// the coordinator, the servers, the runner and the CLI read it here, so a test can see every
// place the package touches it. `env` is the live object: a write here is a write to the process.
export const env = process.env;
export const argv = process.argv;
export const pid = process.pid;
export const cwd = (): string => process.cwd();
export const stderr = process.stderr;
export const exit = (code: number): never => process.exit(code);
export const platform = process.platform;
export const nodeMajor = process.versions.node.slice(0, process.versions.node.indexOf('.'));
/**
 * Servers lead their own process group where the OS has them, so a kill takes the processes their
 * tests spawned with them: a SIGKILLed server's children were re-parented to launchd and lived on
 * (compat-oracle's uvu runners, 8 in one 12-minute warm phase, 2026-11-15).
 */
export const serverGroups = process.platform !== 'win32';
/** SIGKILL a process group by its leader's pid; false when there is none (it is already gone). */
export const killGroup = (leader: number): boolean => {
  try {
    return process.kill(-leader, 'SIGKILL');
  } catch {
    return false;
  }
};
/** The signals an interrupted run is stopped by, and the exit code each gives (128 + its number). */
export const INTERRUPTS = { SIGINT: 130, SIGTERM: 143, SIGHUP: 129 } as const;
export type Interrupt = keyof typeof INTERRUPTS;
/** Listens for an interrupt; while one listens, the signal no longer ends the process by itself. */
export const onSignal = (signal: Interrupt, listener: () => void): void => {
  process.on(signal, listener);
};
export const offSignal = (signal: Interrupt, listener: () => void): void => {
  process.off(signal, listener);
};
