/**
 * The gate's decision (spec R5, R6), apart from where the message and the log come from.
 *
 * `off` passes without reading. `observe` passes and logs what `enforce` would have done, which
 * is how the false-block rate is measured before anyone turns `enforce` on. `enforce` blocks, but
 * never three times running in one session: after two blocks the next run passes and is logged as
 * a bypass, so an agent is never stuck behind its own gate.
 */
import { type Verdict } from './receipt.js';

export const MODES = ['off', 'observe', 'enforce'] as const;
export type Mode = (typeof MODES)[number];

/** Blocks in one session after which the next run passes, logged. */
export const ESCAPE_AFTER = 2;

export interface LogEntry {
  readonly at: string;
  readonly session: string;
  readonly mode: Mode;
  readonly ok: boolean;
  readonly blocked: boolean;
  readonly bypass: boolean;
  readonly reason: string;
}

export interface Decision {
  readonly blocked: boolean;
  readonly bypass: boolean;
}

/** The blocks in `session` since its last run that was not blocked. */
export const recentBlocks = (log: readonly LogEntry[], session: string): number => {
  const mine = log.filter((entry) => entry.session === session);
  const last = mine.findLastIndex((entry) => !entry.blocked);
  return mine.length - last - 1;
};

export const decide = (mode: Mode, verdict: Verdict, log: readonly LogEntry[], session: string): Decision => {
  if (mode !== 'enforce' || verdict.ok) return { blocked: false, bypass: false };
  const bypass = recentBlocks(log, session) >= ESCAPE_AFTER;
  return { blocked: !bypass, bypass };
};

/** The session a block counts against: the agent's session id when the environment names one, else the branch. */
export const sessionOf = (env: Readonly<Record<string, string | undefined>>, branch: string): string => env['PROVEDONE_SESSION'] ?? env['CLAUDE_CODE_SESSION_ID'] ?? env['CLAUDE_SESSION_ID'] ?? `branch:${branch}`;
