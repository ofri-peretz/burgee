/**
 * Resolving a whole command's prompts in one pass (R2, R3) — the piece a framework calls
 * from its `preAction` hook, after the environment and config layers have had their turn.
 *
 * The design sketched this as `caique/burgee`, one binding per host. It is one binding for
 * all of them instead, and that is the better answer: what a host actually supplies is a
 * record of options, the values parsed so far, and a runtime. None of that needs burgee's
 * types, so nothing here imports them — which keeps the family's rule that no package
 * requires another, and means `burgee`, `burgee/commander` and `burgee/yargs` share one
 * implementation rather than three that drift.
 *
 * The order is the declaration order, because `--interactive` asks for several things at
 * once and a person answering them needs the sequence to match the help they just read.
 */
import { ask, type Asked, type Io } from './ask.js';
import { decide, type Decision, type Flags, type Runtime } from './decide.js';
import { type PromptSpec, problemWith } from './spec.js';

/** What a host tells us about one option. Structural: any framework's spec satisfies it. */
export interface PromptableOption {
  required?: boolean;
  prompt?: PromptSpec;
}

export interface ResolveInput<O extends PromptableOption = PromptableOption> {
  /** The command's options by name, in declaration order — a record preserves it. */
  options: Record<string, O>;
  /** What the values are after every other source has been consulted. */
  values: Record<string, unknown>;
  runtime: Runtime;
  flags?: Flags;
  io: Io;
}

export interface ResolveFailure {
  option: string;
  code: 'USAGE' | 'CANCELLED';
  message: string;
  fix?: string;
}

export interface Resolved {
  /** The values with every answered prompt written in. The input is not mutated. */
  values: Record<string, unknown>;
  /**
   * The first refusal, or nothing. First rather than all: the caller is about to exit, and
   * a person told about six missing flags one of which they will answer interactively has
   * been given a worse message than one told about the first.
   */
  failure?: ResolveFailure;
}

interface OneOption {
  option: string;
  prompt: PromptSpec;
  required: boolean;
  value: unknown;
  runtime: Runtime;
  flags: Flags | undefined;
}

/**
 * One option's verdict, before any terminal is consulted. A spec that cannot be drawn is
 * caught here rather than in the widget: better to say so than to draw an empty list and
 * wait, which is the hang this package exists to prevent.
 */
function verdictFor({ option, prompt, required, value, runtime, flags }: OneOption): Decision | ResolveFailure {
  const malformed = problemWith(prompt);
  if (malformed !== undefined) return { option, code: 'USAGE', message: `--${option} has a prompt that cannot be drawn: ${malformed}`, fix: 'fix the prompt spec where the option is declared' };

  const verdict = decide({ value, spec: prompt, option, runtime, ...(flags === undefined ? {} : { flags }), required });
  if (verdict.action === 'error') return { option, code: 'USAGE', message: verdict.message ?? '', ...(verdict.fix === undefined ? {} : { fix: verdict.fix }) };
  return verdict;
}

const isFailure = (v: Decision | ResolveFailure): v is ResolveFailure => !('action' in v);

/**
 * Walk the command's options in order, asking only what has to be asked.
 *
 * Stops at the first refusal: the caller is about to exit, and a person told about six
 * missing flags — one of which they would have answered interactively — has been given a
 * worse message than one told about the first.
 */
export async function resolvePrompts<O extends PromptableOption>({ options, values, runtime, flags, io }: ResolveInput<O>): Promise<Resolved> {
  const out: Record<string, unknown> = { ...values };

  for (const [option, spec] of Object.entries(options)) {
    const prompt = spec.prompt;
    if (prompt === undefined) continue;

    const verdict = verdictFor({ option, prompt, required: spec.required === true, value: out[option], runtime, flags });
    if (isFailure(verdict)) return { values: out, failure: verdict };
    if (verdict.action === 'skip') continue;
    if (verdict.action === 'answer') {
      out[option] = verdict.value;
      continue;
    }

    // Asked one at a time on purpose: a person answers in sequence, and asking the second
    // question before the first is answered would interleave two prompts on one terminal.
    // eslint-disable-next-line reliability/no-await-in-loop -- see above
    const answer: Asked = await ask(prompt, io);
    if (!answer.ok) {
      return { values: out, failure: { option, code: 'CANCELLED', message: `cancelled at --${option}`, fix: `pass --${option} to skip the question` } };
    }
    out[option] = answer.value;
  }

  return { values: out };
}
