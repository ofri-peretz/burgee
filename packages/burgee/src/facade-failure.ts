/**
 * What the commander and yargs façades make of any failure a handler raises (D-140).
 *
 * Kept out of `errors.ts` so the engine, which has its own table for this (`describeFailure`),
 * does not carry a second one.
 */
import { AuthError, UsageError } from './errors.js';
import { ExitCode } from './exit-code.js';

/** The classes that name their own code, as the engine's `CLASSIFIED` table lists its own (E7). */
const CLASSES: readonly (readonly [new (...args: never[]) => Error, readonly [ExitCode, HandlerFailure['error']['code']]])[] = [
  [AuthError, [ExitCode.AUTH, 'auth']],
  [UsageError, [ExitCode.USAGE, 'usage']],
];

/** A handler's failure as a façade reports it: the E1 code, the envelope's word for it, and the E3 fields. */
export interface HandlerFailure {
  exit: ExitCode;
  error: { code: 'usage' | 'auth' | 'runtime'; message: string; hint?: string; fix?: string };
}

/**
 * Anything a handler threw or rejected with — an `Error`, a subclass that names its code, or a
 * value that is not an Error at all — as one failure. Never a stack: the envelope is for a
 * caller that branches on `code`, and the prose line carries the message.
 */
export function handlerFailure(cause: unknown): HandlerFailure {
  const message = cause instanceof Error ? cause.message : String(cause);
  const [exit, code] = CLASSES.find(([Class]) => cause instanceof Class)?.[1] ?? [ExitCode.RUNTIME, 'runtime'];
  const { hint, fix } = (cause ?? {}) as { hint?: unknown; fix?: unknown };
  return { exit, error: { code, message, ...(typeof hint === 'string' ? { hint } : {}), ...(typeof fix === 'string' ? { fix } : {}) } };
}
