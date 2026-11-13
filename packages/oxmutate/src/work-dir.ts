/**
 * Removing a run's work directory, without letting a failure there cost the run.
 *
 * The coordinator removes it in a `finally`, straight after telling its servers to close. A server
 * is given a moment to leave, and until it does its worker can still write a beat file into the
 * directory. A removal that met one threw ENOTEMPTY out of the `finally`, which replaced the run's
 * result: a 60-minute run of compat-oracle ended with that error and no report (2026-11-13).
 */
import { rmSync } from 'node:fs';

/** How often a removal is tried again when the directory is busy, and how long between tries. */
const RETRIES = 10;
const RETRY_DELAY_MS = 100;

type Remove = (dir: string, options: { recursive: true; force: true; maxRetries: number; retryDelay: number }) => void;

/**
 * Removes `dir`, trying again while something still writes into it. Returns what to tell the user
 * when it could not be removed, and never throws: the directory is scratch, the run is not.
 */
export function removeWorkDir(dir: string, remove: Remove = rmSync): string | undefined {
  try {
    remove(dir, { recursive: true, force: true, maxRetries: RETRIES, retryDelay: RETRY_DELAY_MS });
    return undefined;
  } catch (error) {
    return `oxmutate: the work directory ${dir} could not be removed (${error instanceof Error ? error.message : String(error)}). The run's results are not affected. fix: remove it by hand\n`;
  }
}
