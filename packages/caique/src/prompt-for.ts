/**
 * R1 — `promptFor`: a command's missing option or positional, asked for when a person is there
 * and refused, naming how to pass it, when nobody is.
 *
 * `resolvePrompts()` is the pass; this is the place it sits. A host hands its handler a context —
 * the values parsed so far, the environment, whether a person may be asked, whether `--json` was
 * typed — and `promptFor` wraps the handler so that, before it runs, every declared prompt with
 * no value from any source is resolved through `decide()`: a terminal and a person ask; no
 * terminal, `CI`, an agent, `--json` or an `--mcp` tool call (which is a `--json` run) refuse with
 * a `USAGE` failure naming the flag or the positional. The handler then runs on the answered
 * values, and never sees a missing one.
 *
 * Two spellings, one result (R1):
 *
 * - `promptFor(command, 'name', { kind: 'text', message: 'Who?' })` — attaches the spec to the
 *   option or positional called `name`, and wraps the handler;
 * - `promptFor(command)` — the schema spelling: the command already declares `prompt:` on its
 *   options or arguments, and only the wrapping is added.
 *
 * **Structural, so no package requires another.** What this reads of a command is `options`,
 * `arguments` and `run`; of a context, `options`, `args`, `positionals`, `env`, `interactive`,
 * `json` and `onExit`. burgee's `Command` and `RunContext` satisfy both, and nothing here imports
 * burgee: the refusal is an `Error` with `code: 'USAGE' | 'CANCELLED'` and a `fix`, which burgee
 * reads by name (P2, P3, D-120) and leaves with exit 2 or 4.
 *
 * **The terminal is opened only to ask**, and closed when the asking is done: a run whose values
 * were all given never touches stdin. While it is open, the host's exit path (`ctx.onExit`, E5)
 * owns closing it, so a signal that ends the run mid-question still hands the terminal back out of
 * raw mode (R4) before the process goes.
 */
import { interactive } from 'roundel/terminal';

import { type Io } from './ask.js';
import { type PromptableOption, type Resolved, type ResolveFailure, resolvePrompts } from './binding.js';
import { type Flags } from './decide.js';
import { promptStreams } from './runtime.js';
import { type PromptSpec } from './spec.js';
import { createIo } from './terminal.js';

/** What `promptFor` reads of a host's run context. burgee's `RunContext` satisfies it. */
export interface PromptContext {
  options: Record<string, unknown>;
  /** The declared positionals by name. */
  args: Record<string, unknown>;
  /** The positionals as typed; an answered one is written in at its declared place. */
  positionals: string[];
  env: Record<string, string | undefined>;
  /** Whether a person may be asked: a terminal on stdin, no `CI`, no agent (N12) — the host's answer. */
  interactive: boolean;
  /** The run was asked for `--json`, which an `--mcp` tool call always is (R6): nobody is there to type. */
  json?: boolean;
  /** The host's exit path (E5): what closes the terminal if the run is ended mid-question. */
  onExit?: (handler: () => void, label?: string) => () => void;
}

/** An option as `promptFor` reads it. burgee's `OptionSpec` satisfies it; the rest of a host's spec is carried as it is. */
export interface PromptableSpec {
  required?: boolean;
  prompt?: PromptSpec;
  [field: string]: unknown;
}

/** A positional as `promptFor` reads it. burgee's `ArgumentSpec` satisfies it. */
export interface PromptableArgument extends PromptableSpec {
  name: string;
}

/**
 * A command as `promptFor` reads it. burgee's `Command` satisfies it. `run` takes the host's own
 * context, whatever it is called; {@link promptFor} checks that it carries a {@link PromptContext}.
 */
export interface PromptableCommand {
  options?: Record<string, PromptableSpec>;
  arguments?: readonly PromptableArgument[];
  run?: (ctx: never) => unknown;
}

/** The context a command's handler takes. */
type ContextOf<T> = T extends { run?: (ctx: infer C) => unknown } ? C : never;

/** Nothing extra when the handler's context carries what `promptFor` reads; an unsatisfiable field naming it otherwise. */
type CarriesContext<T> = [ContextOf<T>] extends [PromptContext] ? unknown : { 'promptFor: the handler’s context must carry': PromptContext };

/** A refusal a handler throws: burgee reads `code` by name, prints `message` and `fix` (P2, P3). */
export class PromptRefusal extends Error {
  readonly code: ResolveFailure['code'];
  readonly fix: string | undefined;
  /** The option or positional it stopped at, by its declared name. */
  readonly option: string;

  constructor(failure: ResolveFailure) {
    super(failure.message);
    this.name = 'PromptRefusal';
    this.code = failure.code;
    this.fix = failure.fix;
    this.option = failure.option;
  }
}

export interface PromptForOptions {
  /** Where to ask; the process's stdin and stderr when omitted, opened only if a question is asked. */
  io?: Io;
}

/** `dryRun` → `--dry-run`: how a host that keys options camelCase spells the flag (burgee S5). */
const flagFor = (key: string): string => `--${key.replace(/[A-Z]/gu, (c) => `-${c.toLowerCase()}`)}`;

/**
 * The real terminal, opened on the first write — `ask()` writes the question before it reads —
 * and registered with the host's exit path while it is open. `close` is safe to call whether or
 * not it was ever opened, and twice.
 */
const NOTHING_HELD = (): void => undefined;

function lazyTerminal(onExit: PromptContext['onExit']): Io & { close: () => void } {
  let open: (Io & { close: () => void }) | undefined;
  let release = NOTHING_HELD;
  const real = (): Io & { close: () => void } => {
    if (open === undefined) {
      const io = createIo(promptStreams());
      open = io;
      release = onExit?.(() => io.close(), 'caique: give the terminal back') ?? release;
    }
    return open;
  };
  return {
    reader: {
      line: async (opts) => {
        const line = await real().reader.line(opts);
        // Ctrl+C or Ctrl+D: nothing was typed, so no newline was either, and the refusal that
        // follows would start on the question's line.
        if (line === undefined) real().writer.write('\n');
        return line;
      },
    },
    writer: {
      write: (text) => {
        real().writer.write(text);
      },
    },
    close: () => {
      open?.close();
      release();
    },
  };
}

/**
 * Whether stdin is a terminal, as `decide()` reads it — the host's `interactive` answer, which is
 * the one that decides. When the host says nobody may be asked and the environment alone says why
 * (`CI`, an agent), stdin may still be a terminal, and the refusal should say "nobody is there"
 * rather than "there is no terminal". Never `true` otherwise: a host that handed its handler a
 * pipe has said there is no terminal, whatever the process's own stdin is.
 */
function terminalOn(ctx: PromptContext): boolean {
  return ctx.interactive || (promptStreams().input.isTTY === true && !interactive({ env: ctx.env, isTTY: { stdin: true } }));
}

/** The run's flags, as the context says them: `--json` from the host, `--yes` and `--interactive` if the command declares them. */
function flagsOf(ctx: PromptContext): Flags {
  const interactive = ctx.options['interactive'];
  return { json: ctx.json === true, yes: ctx.options['yes'] === true, interactive: interactive === true, interactiveAll: interactive === 'all' };
}

/** Attach `spec` to the option or positional called `name`; refuse a name the command does not declare. */
function attach<T extends PromptableCommand>(command: T, name: string, spec: PromptSpec): T {
  const option = Object.entries(command.options ?? {}).find(([key]) => key === name)?.[1];
  if (option !== undefined) return { ...command, options: { ...command.options, [name]: { ...option, prompt: spec } } } as T;
  const positionals = command.arguments ?? [];
  if (positionals.some((a) => a.name === name)) {
    return { ...command, arguments: positionals.map((a) => (a.name === name ? { ...a, prompt: spec } : a)) } as T;
  }
  throw new Error(`caique: promptFor names "${name}", which is neither an option nor a positional of this command; declare it first — a prompt cannot exist without one`);
}

/** What a prompt serialises to: nothing, so the key is left out of the JSON it is in. */
const UNPUBLISHED = (): undefined => undefined;

/**
 * Every declared prompt, made invisible to `JSON.stringify` — and so to burgee's `--schema`, which
 * publishes a command's options and arguments as declared. A prompt is a question for a person at
 * a terminal; whoever reads `--schema` is a program, which is never asked (R6) and is told the
 * flag by the refusal. `toJSON` is not enumerable, so the declaration still compares and spreads
 * as it was written.
 */
const hide = <S extends PromptableSpec>(spec: S): S => (spec.prompt === undefined ? spec : { ...spec, prompt: Object.defineProperty({ ...spec.prompt }, 'toJSON', { value: UNPUBLISHED }) });

function unpublished<T extends PromptableCommand>(command: T): T {
  return {
    ...command,
    ...(command.options === undefined ? {} : { options: Object.fromEntries(Object.entries(command.options).map(([key, spec]) => [key, hide(spec)])) }),
    ...(command.arguments === undefined ? {} : { arguments: command.arguments.map(hide) }),
  };
}

/**
 * Wrap a command so that its declared prompts are resolved before its handler runs (R1, R2, R6).
 *
 * With `name` and `spec`, the spec is attached to that option or positional first; without them,
 * the command's own `prompt:` declarations are used. Calling it again on the result adds a prompt:
 * the outer pass asks for both, and the inner one finds both answered. A command with no handler
 * is returned with its prompts declared and nothing wrapped.
 */
export function promptFor<T extends PromptableCommand>(command: T & CarriesContext<T>, name?: string, spec?: PromptSpec, opts: PromptForOptions = {}): T {
  const declared: T = unpublished(name === undefined || spec === undefined ? command : attach(command, name, spec));
  const inner = declared.run;
  if (inner === undefined) return declared;

  // Every option and positional, in declaration order; `resolvePrompts` passes over one with no prompt.
  const options: Record<string, PromptableOption> = Object.fromEntries(Object.entries(declared.options ?? {}).map(([key, option]) => [key, { ...option, flag: flagFor(key) }]));
  // A positional is required unless it says otherwise, as burgee reads an argument (`<name>`).
  const args: Record<string, PromptableOption> = Object.fromEntries(declared.arguments?.map((a) => [a.name, { ...a, required: a.required !== false, flag: `<${a.name}>` }]) ?? []);

  const run = async (ctx: PromptContext): Promise<unknown> => {
    const runtime = { env: ctx.env, isTTY: { stdin: terminalOn(ctx) } };
    const flags = flagsOf(ctx);
    // Opened on the first question, if one is asked and no `io` was handed in: closing it is free otherwise.
    const terminal = lazyTerminal(ctx.onExit);
    const io = opts.io ?? terminal;
    let named: Resolved;
    let positional: Resolved;
    try {
      named = await resolvePrompts({ options, values: ctx.options, runtime, flags, io });
      positional = named.failure === undefined ? await resolvePrompts({ options: args, values: ctx.args, runtime, flags, io }) : named;
    } finally {
      // Closed before the handler runs, not after it: a handler that ran with stdin still raw
      // would have a Ctrl+C pressed during its work read as a byte by a question already
      // answered (`.sdlc/intents/caique/interrupt.qnt`, `rawOnlyWhileAsking`).
      terminal.close();
    }
    const failure = named.failure ?? positional.failure;
    if (failure !== undefined) throw new PromptRefusal(failure);
    const positionals = [...ctx.positionals];
    // An answered positional takes its declared place, so a handler reading `positionals` sees it
    // too: the words typed are the declared ones from the first, so the next missing one is next.
    for (const [at, a] of Object.keys(args).entries()) {
      const answer = positional.values[a];
      if (at === positionals.length && answer !== undefined) positionals.push(String(answer));
    }
    return await inner({ ...ctx, options: named.values, args: positional.values, positionals } as never);
  };
  return { ...declared, run } as T;
}
