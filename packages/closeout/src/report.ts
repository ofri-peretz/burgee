/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * One record for every way a program can end, and its projections (design R2, Y5, Y6).
 *
 * A handler is handed the same object whatever door the process left by — `{ path, signal,
 * code, error }` — and the two renderings a caller is likely to want are *projections of
 * that object*, not second descriptions of the event. That is the whole of Y5: a structured
 * result is projected, never re-derived, so a `--json` line and an agent event cannot
 * disagree with what the handler was told.
 *
 * Both projections are pure functions of the record. No clock, no process, no I/O — which
 * is what makes them testable without a shutdown and safe to call *during* one, when the
 * one thing a program cannot afford is a projection that throws.
 */

/**
 * Which door the process left by.
 *
 * `signal` covers all of them rather than naming each: the signal's own name is in
 * `signal`, and a consumer switching on the path wants the *class* of exit — "somebody
 * asked us to stop" is one case whether it arrived as SIGINT or SIGHUP.
 */
export type ExitPath = 'exit' | 'beforeExit' | 'signal' | 'uncaught' | 'rejection';

/** Every path, in the order `install()` wires them. Exported so a matrix can iterate it. */
export const EXIT_PATHS = ['exit', 'beforeExit', 'signal', 'uncaught', 'rejection'] as const;

/** What a handler is handed. The same record `--json` and an agent event project from. */
export interface ExitReport {
  /** Which door: a normal exit, an emptied loop, a signal, a throw, a rejected promise. */
  path: ExitPath;
  /** The signal that ended it, when one did. */
  signal: string | null;
  /** The code the process is leaving with, when it is leaving by a code. */
  code: number | null;
  /** What was thrown or rejected, on the two paths that have one. `null` on the others. */
  error: unknown;
}

/**
 * What shutdown *was*, once it has run: the record plus what the deadline found.
 *
 * `unfinished` is the sentence this package exists to be able to say. It is empty on every
 * ordinary shutdown, and on a breach it names each handler that had not returned — by the
 * label its caller gave it, or by the function's own `name`.
 */
export interface ShutdownReport extends ExitReport {
  /** Whether the deadline expired before the handlers were done. */
  timedOut: boolean;
  /**
   * The handlers that had not returned when shutdown stopped waiting — by the label their
   * caller gave them, or by the function's own `name`.
   *
   * Empty on an ordinary shutdown. Non-empty in two cases, and they are different: the
   * deadline fired (`timedOut`), or the trigger was `'exit'`, where Node gives no time at
   * all and an asynchronous handler never had a turn to lose. The second is why this is
   * not simply "what the deadline caught".
   */
  unfinished: readonly string[];
}

/** What a trigger supplies. The path is inferred from the signal when it is not stated. */
export interface ExitInfo {
  code: number | null;
  signal: string | null;
  path?: ExitPath;
  error?: unknown;
}

/**
 * Fill a trigger out into the record handlers see.
 *
 * The inference is deliberately one line and deliberately narrow: a caller that supplies a
 * signal and no path meant `'signal'`, and anything else without a path is the ordinary
 * exit. Everything richer than that is stated by the caller, because guessing between
 * `uncaught` and `rejection` from the shape of an error is exactly the kind of cleverness
 * that reports the wrong path at three in the morning.
 */
export function toReport(info: ExitInfo): ExitReport {
  return {
    path: info.path ?? (info.signal === null ? 'exit' : 'signal'),
    signal: info.signal,
    code: info.code,
    error: info.error ?? null,
  };
}

/**
 * An error as a string, without assuming it is an `Error`.
 *
 * A rejection carries whatever was rejected with — a string, a number, `undefined` — and a
 * projection that reads `.message` off it produces `undefined` in the field that was
 * supposed to say what went wrong.
 */
function errorText(error: unknown): string | null {
  if (error === null || error === undefined) return null;
  if (error instanceof Error) return error.stack ?? `${error.name}: ${error.message}`;
  return String(error);
}

/**
 * The `--json` rendering: one line, machine-first, `error` flattened to text.
 *
 * `JSON.stringify` of the record itself would emit `"error": {}` for every `Error` — they
 * have no enumerable own properties — which is a line that looks like a report and carries
 * nothing. That is why this is a projection rather than a stringify.
 */
export function reportToJson(report: ShutdownReport): string {
  return JSON.stringify({
    path: report.path,
    signal: report.signal,
    code: report.code,
    error: errorText(report.error),
    timedOut: report.timedOut,
    unfinished: [...report.unfinished],
  });
}

/** The shape an agent event carries: the same values, under the family's event key (Y6). */
export interface ExitEvent {
  type: 'closeout.shutdown';
  path: ExitPath;
  signal: string | null;
  code: number | null;
  error: string | null;
  timedOut: boolean;
  unfinished: string[];
}

/** The agent rendering. Same values, one key added, still a projection of the one record. */
export function reportToEvent(report: ShutdownReport): ExitEvent {
  return {
    type: 'closeout.shutdown',
    path: report.path,
    signal: report.signal,
    code: report.code,
    error: errorText(report.error),
    timedOut: report.timedOut,
    unfinished: [...report.unfinished],
  };
}

/**
 * The line the deadline prints when it fires.
 *
 * Kept here beside the projections rather than in the registry because it *is* a rendering
 * of the record, and because the sentence is the product: a hang that used to be silence
 * becomes a named handler a reader can go and look at.
 */
export function timeoutMessage(report: ShutdownReport, deadline: number): string {
  const names = report.unfinished.length === 0 ? 'none — the handlers had all returned' : report.unfinished.join(', ');
  return `closeout: shutdown deadline of ${deadline}ms expired; exiting anyway. Handlers that had not returned: ${names}`;
}
