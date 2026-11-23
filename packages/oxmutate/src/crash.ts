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

/** What a verdict says of a crash: `crashed` is set only on a RuntimeError that the mutant's own run (not a lost one) ended in. */
export interface Crashable {
  status: string;
  crashed?: boolean | undefined;
}

/** Did this run end with its worker going down? */
export const crashedRun = (v: Crashable | undefined): boolean => v?.status === 'RuntimeError' && v.crashed === true;

/**
 * A mutant whose worker went down is run once more, alone in a fresh worker, before it is a
 * RuntimeError: the crash may have been a neighbour's (memory pressure on a busy machine). The verdict
 * is the lone run's own, a crash included. A lone run that produced no verdict at all (it was lost, not
 * crashed) leaves the first crash standing.
 */
export function afterLoneRun<T extends Crashable>(crashed: T, lone: T | undefined): T {
  if (lone === undefined) return crashed;
  if (lone.status === 'RuntimeError' && lone.crashed !== true) return crashed;
  return lone;
}
