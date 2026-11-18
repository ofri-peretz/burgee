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

export type Verdict = 'breaking' | 'non-breaking' | 'unknown';

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
