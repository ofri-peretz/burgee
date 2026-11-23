/**
 * The words for a worker that went down under a mutant: how its process ended, and the reason a
 * RuntimeError carries. Pure, so a test can hold every branch (scheduler.ts, which runs the workers,
 * is tested in another process and cannot be mutated by the changed-lines gate).
 */

/** How a process ended, for a crash's reason: the signal that stopped it, else its exit code. */
export function exitReason(code: number | null, signal: NodeJS.Signals | null): string {
  if (signal) return `signal ${signal}`;
  return code === null ? 'no exit code' : `exit code ${String(code)}`;
}

/** A crash verdict's reason: the mutant's run took its worker down, and how the process ended when that is known. */
export const crashReason = (exit: string | undefined): string => `the worker crashed while this mutant ran${exit === undefined ? '' : ` (${exit})`}`;
