/**
 * A capability is one plain object, and that is the whole extension surface.
 *
 * Every OSC sequence answers the same three questions — *can this terminal do it*, *what
 * bytes say it*, and *what do we print when it cannot* — so the package is a registry of
 * objects that answer them, not a list of hard-coded functions. The built-ins register
 * through this exact API: `link` and `image` are not special, which is the only way to know
 * a third party can reach everything they can (flagstaff U4).
 *
 * **Nothing here is a function.** PRINCIPLES rule 7 asks for a plugin that is inspectable
 * without execution and validated against one published schema, and measures it by whether
 * an agent given the schema and one example ships a passing plugin in one turn. A function
 * cannot travel through JSON, so support is a declaration and the two outputs are templates
 * (see `template.ts`). A capability can therefore be written in a config file, generated,
 * diffed, and checked without running anybody's code.
 *
 * Terminals invent OSC codes faster than any package ships releases — Kitty, iTerm, WezTerm
 * and Ghostty each have their own — so the useful question is not "which does paratext
 * support" but "can someone add theirs without waiting for us".
 */
import { type Runtime } from './runtime.js';
import schema from './schema.json' with { type: 'json' };
import { render } from './template.js';

/** What a caller hands a capability. Flat and string-valued, and therefore describable. */
export type Fields = Readonly<Record<string, string | undefined>>;

/**
 * When a terminal is believed to understand the sequence. Every clause is optional and all
 * of them must hold; `termProgram` and `envAny` are ORs within themselves.
 *
 * These are guesses and the type says so. No terminal answers "do you do OSC 1337", so a
 * caller who knows better re-registers the capability with a `when` that fits their world —
 * which is the point of holding this as data rather than burying it in a predicate.
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

export interface Capability {
  /** How callers name it: `link`, `image`, `clipboard`, or anything a third party invents. */
  readonly name: string;
  /** The OSC code, or `BEL`. Documentation for a reader, and a key for `check`. */
  readonly osc: number | 'BEL';
  readonly when: Support;
  /** The bytes, as a template, for a terminal that does understand. */
  readonly encode: string;
  /**
   * What to print when it does not — PRINCIPLES rule 6, and the reason this package exists.
   * An image becomes its caption, a notification a printed line, a hyperlink `text (url)`.
   * A capability without one is refused at `register`, because a sequence a terminal cannot
   * read is not a feature, it is `]1337;File=inline=1;…` across a user's screen. An empty
   * string is a legitimate projection — a window title has nothing to say in a log — but it
   * has to be written down rather than left out.
   */
  readonly fallback: string;
}

const registry = new Map<string, Capability>();

/** Thrown rather than returned: a malformed capability is a programming error at start-up. */
export class CapabilityError extends Error {}

/** Whether this runtime is believed to understand `capability`. */
export function supports(runtime: Runtime, capability: Capability): boolean {
  const { tty, termProgram, envAny, term } = capability.when;
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

/**
 * Add a capability, or replace one by name — replacing is deliberate, so a caller whose
 * terminal we mis-detect can correct the guess without patching the package.
 */
export function register(capability: Capability): void {
  for (const problem of check(capability)) throw new CapabilityError(problem);
  registry.set(capability.name, capability);
}

/**
 * Everything wrong with a capability, in the order a reader would fix it — the `check` rule 7
 * asks for, usable before registering and by a command that validates a file.
 */
export function check(candidate: object): string[] {
  const problems: string[] = [];
  // `object` on purpose: `check` exists to be pointed at a parsed JSON file whose shape
  // nobody has verified yet, which is the whole reason a plugin is data. Re-building it from
  // its own entries indexes it by name without asserting anything about it.
  const record: Record<string, unknown> = Object.fromEntries(Object.entries(candidate));
  const named = typeof record?.['name'] === 'string' && record['name'] !== '';
  const label = named ? String(record['name']) : '<unnamed>';

  // The required list comes from the published schema rather than from a second copy of it
  // here, so a field added there cannot be forgotten here. `schemaFields` locks the reverse.
  // A missing field says why it matters where the reason is not obvious: `fallback` is the
  // one people leave out, and "is required" would not tell them what they are giving up.
  const WHY: Record<string, string> = {
    name: 'a capability needs a name',
    fallback: `${label}: fallback must be a template, even if it is empty — rule 6 has no opt-out`,
    when: `${label}: when must say when the terminal understands this`,
    osc: `${label}: osc must name the code, or 'BEL'`,
  };
  for (const field of schema.required) {
    if (record?.[field] === undefined) problems.push(WHY[field] ?? `${label}: ${field} is required`);
  }
  if (typeof record?.['encode'] === 'string' && record['encode'] === '') problems.push(`${label}: encode must be a non-empty template`);
  // Not `!fallback`: '' is a real answer — a window title has nothing to say in a log — and
  // the distinction between empty and absent is the whole of rule 6 here.
  if (record?.['fallback'] !== undefined && typeof record['fallback'] !== 'string') {
    problems.push(`${label}: fallback must be a template, even if it is empty — rule 6 has no opt-out`);
  }
  return problems;
}

/** The fields the published schema declares, so a lock can hold the type to it. */
export const schemaFields = (): string[] => Object.keys(schema.properties).toSorted();

/** Every registered name, sorted — so `--json` and a check command can enumerate them. */
export const capabilities = (): string[] => [...registry.keys()].toSorted();

/** One capability by name, for callers that want to inspect before they emit. */
export const capability = (name: string): Capability | undefined => registry.get(name);

/** Registration is global, so tests and hosts need a way back. */
export const reset = (): void => registry.clear();

/**
 * Emit `name` for `fields`: the sequence when the terminal understands it, the static
 * projection when it does not, and for an unknown name whatever text the caller supplied —
 * never a throw, because output is not the place to discover a typo at three in the morning.
 */
export function emit(runtime: Runtime, name: string, fields: Fields = {}): string {
  const found = registry.get(name);
  if (found === undefined) return fields['text'] ?? fields['caption'] ?? '';
  return render(supports(runtime, found) ? found.encode : found.fallback, fields);
}
