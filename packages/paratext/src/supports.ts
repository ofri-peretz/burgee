/**
 * The support guess, in a module of its own so that a narrow subpath can ask the question
 * without loading the registry that answers it for everybody.
 *
 * It used to live in `capability.ts`, which imports `schema.json` — 6,531 B of plugin
 * contract, correct for a host validating a plugin and absurd for a caller asking whether
 * this terminal does OSC 8. `capability.ts` re-exports both names unchanged.
 *
 * Everything here is a **guess**, and the type says so: no terminal answers "do you do OSC
 * 1337", which is the fact the whole package is shaped around.
 */
import { type Runtime } from './runtime.js';

/**
 * When a terminal is believed to understand a sequence. Every clause is optional and all of
 * them must hold; `termProgram` and `envAny` are ORs within themselves.
 */
export interface Support {
  /** Refuse a pipe. Almost always true: a file that receives OSC gets control bytes in it. */
  readonly tty?: boolean;
  /** Any one of these `TERM_PROGRAM` values. */
  readonly termProgram?: readonly string[];
  /** Any one of these environment variables merely being set, as VTE announces itself. */
  readonly envAny?: readonly string[];
  /** An exact `TERM`, for the terminals that identify that way. */
  readonly term?: string;
}

/**
 * Whether this runtime is believed to understand `capability`.
 *
 * Takes the `when` clause structurally rather than a whole `Capability`, so this module owes
 * `capability.ts` nothing at all and the subpath graph stays a leaf. A `Capability` satisfies
 * the parameter, which is every existing caller.
 */
export function supports(runtime: Runtime, capability: { readonly when: Support }): boolean {
  /**
   * Belt, not braces. `register()` refuses a `when` that is not an object, and that refusal
   * is what keeps one out of the registry `emit()` reads — this line closes nothing on its
   * own. It is here because this function is exported, takes its `when` structurally, and a
   * caller may hand it an object it parsed itself: destructuring a string yields four
   * `undefined` clauses and therefore `true`, and the fail-safe answer to "can this terminal
   * do it" is always *no* (rule 6). See `shape.test.ts`.
   */
  const declared: unknown = capability.when;
  if (typeof declared !== 'object' || declared === null) return false;
  const { tty, termProgram, envAny, term } = declared as Support;
  if (tty === true && !runtime.isTTY.stdout) return false;
  if (runtime.env['TERM'] === 'dumb') return false;
  if (term !== undefined && runtime.env['TERM'] !== term) return false;
  if (termProgram !== undefined || envAny !== undefined) {
    const byProgram = termProgram?.includes(runtime.env['TERM_PROGRAM'] ?? '') ?? false;
    const byEnv = envAny?.some((name) => runtime.env[name] !== undefined) ?? false;
    if (!byProgram && !byEnv) return false;
  }
  return true;
}
