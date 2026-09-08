/**
 * What a prompt *is*, before anything draws one (R1).
 *
 * A `PromptSpec` hangs off an option, not off a call site, and that is the whole
 * inversion: the option is the thing that exists in the manifest, in `--help`, in the MCP
 * tool schema and on the command line, and the prompt is one more projection of it. A
 * program written this way can be answered by a flag, by an environment variable, by a
 * config file or by a person, and nothing in it has to know which happened.
 *
 * Nothing here imports a runtime, a stream or a terminal. This file is data.
 */

/** The six kinds a prompt can be. Anything more is a wizard, which is out of scope. */
export type PromptKind = 'text' | 'confirm' | 'select' | 'multiselect' | 'password' | 'path';

/** One choice in a `select` or `multiselect`. `value` is what the option receives. */
export interface Choice {
  value: string;
  label?: string;
  hint?: string;
}

export interface PromptSpec {
  kind: PromptKind;
  /** What a person is asked. Also what an agent reads in the refusal when it cannot be asked. */
  message: string;
  /** Offered as the answer if the person just presses return. */
  initial?: string | boolean | string[];
  /** Required for `select` and `multiselect`; meaningless for the rest. */
  choices?: Choice[];
  /** Returns a message when the answer is unacceptable, or nothing when it is fine. */
  validate?: (value: string) => string | undefined;
}

/** A prompt spec bound to the option it answers. */
export interface BoundPrompt extends PromptSpec {
  /** The option's long name, without dashes — `output-dir`, not `--output-dir`. */
  option: string;
}

/** `--output-dir`, which is what a refusal has to say to be actionable. */
export function flagOf(option: string): string {
  return `--${option}`;
}

/**
 * A `select` without choices, or a `confirm` with them, is a spec that cannot be drawn.
 * Caught here rather than in the widget, so a program with a malformed prompt fails on the
 * first run instead of the first time someone reaches that option.
 */
export function problemWith(spec: PromptSpec): string | undefined {
  const needsChoices = spec.kind === 'select' || spec.kind === 'multiselect';
  if (needsChoices && (spec.choices === undefined || spec.choices.length === 0)) return `a ${spec.kind} prompt needs a non-empty \`choices\` array`;
  if (!needsChoices && spec.choices !== undefined) return `a ${spec.kind} prompt has no use for \`choices\``;
  if (spec.message.trim() === '') return 'a prompt needs a message: it is what a person is asked, and what an agent is told when it cannot be';
  return undefined;
}
