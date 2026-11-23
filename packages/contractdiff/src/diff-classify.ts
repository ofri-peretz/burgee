/**
 * Whether a change breaks anyone (apicontract-diff spec.md R2), by `compat.qnt`'s lattice.
 *
 * `compat.qnt` judges one payload: BACKWARD is "the new receiver accepts what the old sender
 * emitted", FORWARD is "the old receiver accepts what the new sender emits". A schema change that
 * `narrows` breaks BACKWARD and keeps FORWARD; one that `widens` does the opposite
 * (`widenReceiverIsBackward`, `widenSenderBreaksForward`).
 *
 * The API-level question names a party instead. `--side caller` under `--mode backward` asks
 * whether callers built on the old contract keep working against a server built on the new one;
 * `--mode forward` asks whether callers can move to the new contract before the server does;
 * `full` asks both. `--side server` swaps the parties. Which payload rule each question needs then
 * follows from who sends the payload: if the old party sends, it is BACKWARD; if the new one
 * does, FORWARD.
 */
import { type Direction } from './core/model.js';
import { type Change, serverReceives } from './diff-schema.js';

export const MODES = ['backward', 'forward', 'full'] as const;
export type Mode = (typeof MODES)[number];

export const SIDES = ['caller', 'server'] as const;
export type Side = (typeof SIDES)[number];

/**
 * `dangerous` (contractdiff-compat-depth R2) is a refinement of `non-breaking`: every value an old
 * peer sends or reads is still valid, but a reader that assumed more than the contract said may fail.
 */
export type Verdict = 'breaking' | 'non-breaking' | 'unknown' | 'dangerous';

/** `compat.qnt`'s two payload rules. */
export type PayloadRule = 'backward' | 'forward';

/**
 * The payload rules a payload in `direction` must keep for the question `mode` and `side` ask:
 * one rule for `backward` and `forward`, both for `full`.
 */
export const payloadRules = (direction: Direction, mode: Mode, side: Side): PayloadRule[] => {
  // Stryker disable next-line StringLiteral: equivalent, only `backward` is compared below and every other question is `forward`
  const questions: PayloadRule[] = mode === 'full' ? ['backward', 'forward'] : [mode];
  return questions.map((question) => {
    // `backward` keeps `side` on the old contract; `forward` moves it to the new one first.
    const callerIsOld = (question === 'backward') === (side === 'caller');
    const senderIsCaller = serverReceives(direction);
    return senderIsCaller === callerIsOld ? 'backward' : 'forward';
  });
};

/** Whether `rule` still holds after a change with this effect. */
const keeps = (rule: PayloadRule, effect: 'widens' | 'narrows'): boolean => (rule === 'backward' ? effect === 'widens' : effect === 'narrows');

/** The verdict on one change to a payload travelling in `direction`. */
export const classify = (change: Pick<Change, 'effect'>, direction: Direction, mode: Mode, side: Side): Verdict => {
  const { effect } = change;
  if (effect === 'unknown') return 'unknown';
  if (effect === 'neutral') return 'non-breaking';
  return payloadRules(direction, mode, side).every((rule) => keeps(rule, effect)) ? 'non-breaking' : 'breaking';
};

/** A changed default: a caller that leaves the value out now gets another one, in any direction. */
const DANGEROUS_ANYWHERE: ReadonlySet<string> = new Set(['default-changed']);

/**
 * Changes that only add values a reader on the client's side gets: a reader written as an
 * exhaustive switch, or that validated the old pattern or format, may reject them.
 */
const DANGEROUS_TO_READERS: ReadonlySet<string> = new Set(['enum-value-added', 'became-nullable', 'pattern-unset', 'format-unset']);

/** Whether a change is dangerous to a peer even when no value it handled stopped being valid. */
export const isDangerous = (rule: string, direction: Direction): boolean =>
  DANGEROUS_ANYWHERE.has(rule) || (DANGEROUS_TO_READERS.has(rule) && !serverReceives(direction));

/**
 * The verdict after the contract's own promises and the reader risks: a change under `x-frozen`
 * is `breaking` whatever it does (R4); a dangerous change that `classify` let through is
 * `dangerous`, or `breaking` when the run asks so (`--dangerous-breaking`, R2).
 */
export const refine = (change: Pick<Change, 'rule' | 'frozen'>, direction: Direction, verdict: Verdict, dangerousBreaking = false): Verdict => {
  if (change.frozen === true) return 'breaking';
  if (verdict !== 'non-breaking' || !isDangerous(change.rule, direction)) return verdict;
  return dangerousBreaking ? 'breaking' : 'dangerous';
};
