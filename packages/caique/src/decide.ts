/**
 * Whether to prompt at all (R2, R3, R6) — the one decision this package exists to get
 * right, and the only one that has to be correct before a single character is drawn.
 *
 * **An agent asked to type is an agent that hangs.** Every prompt library assumes a person
 * is there; when one is not, the process waits on a stdin that will never produce a line,
 * and the caller sees a timeout with no output and no clue. That is the failure this
 * function refuses to allow: with no terminal, a missing value is an *error naming the
 * flag*, immediately, in words the caller can act on.
 *
 * It is pure — a value, a runtime slice and the flags in, a verdict out — so the whole
 * truth table is a unit test rather than a PTY. `decide.test.ts` walks all of it.
 */
import { flagOf, type PromptSpec } from './spec.js';

/** The slice of a runtime this needs. burgee's satisfies it; so does a literal in a test. */
export interface Runtime {
  env: Record<string, string | undefined>;
  isTTY: { stdin: boolean };
}

/** What the run was asked for, as the engine knows it — never sniffed from the process. */
export interface Flags {
  /** `--json`: a machine is reading stdout, so no one is here to type (R6). */
  json?: boolean;
  /** `--yes`: every `confirm` is already answered true (R3). */
  yes?: boolean;
  /** `--interactive`: prompt for what is missing even where we would not have (R3). */
  interactive?: boolean;
  /** `--interactive=all`: prompt for every promptable option, not only the required ones. */
  interactiveAll?: boolean;
}

export interface Decision {
  action: 'skip' | 'prompt' | 'answer' | 'error';
  /** For `answer`: what to use without asking. Today only `--yes` produces one. */
  value?: boolean;
  /** For `error`: an E1 code the caller maps to its own error type. */
  code?: 'USAGE';
  message?: string;
  /** For `error`: the one sentence that turns a refusal into a next step. */
  fix?: string;
}

const SKIP: Decision = { action: 'skip' };
const PROMPT: Decision = { action: 'prompt' };

/** Present and not empty — the same convention roundel's policy applies to every switch. */
const set = (value: string | undefined): boolean => value !== undefined && value !== '';

/** A value from any source at all: a flag, an env var, a config file, a default. */
function alreadyAnswered(value: unknown): boolean {
  // `false` and `0` and `''` are answers. Only "nothing was supplied" is not.
  return value !== undefined && value !== null;
}

export interface DecideInput {
  /** Whatever the option resolved to before prompting, from any source. */
  value: unknown;
  spec: PromptSpec;
  /** The option's long name, for the flag a refusal names. */
  option: string;
  runtime: Runtime;
  flags?: Flags;
  /** Whether the option must have a value for the command to run. */
  required?: boolean;
}

/**
 * The rule, in order, and the order is the argument:
 *
 *  1. A value from any source wins. Prompting for something already answered is how a
 *     script that sets an env var still ends up waiting for input.
 *  2. `--json` never prompts. It means "a machine is reading this", and there is no
 *     answer a machine can type.
 *  3. `--yes` answers a `confirm`, and only a `confirm` — it is not a licence to invent
 *     a path or a password.
 *  4. No terminal on stdin, or `CI` set, means nobody is there: refuse, naming the flag.
 *  5. `--interactive` reaches past 4 only when there *is* a terminal; it is an override
 *     for "you would not have asked", never for "there is no one to ask".
 *  6. Otherwise, if it is required or `--interactive` was asked for, prompt.
 */
export function decide({ value, spec, option, runtime, flags = {}, required = false }: DecideInput): Decision {
  if (alreadyAnswered(value)) return SKIP;

  const flag = flagOf(option);
  const interactive = flags.interactive === true || flags.interactiveAll === true;

  if (flags.json === true) {
    return {
      action: 'error',
      code: 'USAGE',
      message: `${flag} is required under --json`,
      fix: `pass ${flag}; --json means no one is here to answer "${spec.message}"`,
    };
  }

  if (flags.yes === true && spec.kind === 'confirm') return { action: 'answer', value: true };

  const nobodyThere = !runtime.isTTY.stdin || set(runtime.env['CI']);
  if (nobodyThere) {
    // `--interactive` cannot conjure a person. Saying so is the difference between a
    // useful refusal and a flag that looks like it did nothing.
    const because = interactive ? ' (--interactive needs a terminal on stdin)' : '';
    return {
      action: 'error',
      code: 'USAGE',
      message: `${flag} is required when there is no terminal${because}`,
      fix: `pass ${flag}; it would have been asked as "${spec.message}"`,
    };
  }

  if (required || interactive) return PROMPT;
  return SKIP;
}
