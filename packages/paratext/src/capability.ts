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
  // Against the capability shape rather than against `check`: this argument *is* one
  // capability, so the document-level deprecation has nothing to say about it, and a
  // built-in registering through the same call must not be told it is writing 0.2 JSON.
  for (const problem of capabilityProblems(capability)) throw new CapabilityError(problem);
  registry.set(capability.name, capability);
}

/**
 * The capability shape, which since 0.3 is one `$defs` entry of the family plugin schema —
 * the same file roundel and flagstaff ship, byte for byte. `schema.required` used to be a
 * capability's required fields; the root's are a *plugin's*, so everything that reads the
 * shape reads it from here and there is still exactly one copy of the list.
 */
const CAPABILITY = schema.$defs.capability;

/**
 * The prefix on a line `check` returns that does **not** refuse the document.
 *
 * A capability written as the whole document is the shape paratext had before the family
 * schema absorbed it. It still validates for one minor release (PLAN D2) and 1.0 removes it,
 * so the two kinds of line travel back together and this is how a caller tells them apart:
 * `refusals()` is what blocks, everything else is what to fix before 1.0.
 */
export const DEPRECATED = 'deprecated: ';

/** Whether a line `check` produced is a warning rather than a refusal. */
export const isDeprecation = (line: string): boolean => line.startsWith(DEPRECATED);

/** The lines that refuse the document — what `register` throws on, and what a CLI exits on. */
export const refusals = (lines: readonly string[]): string[] => lines.filter((line) => !isDeprecation(line));

/**
 * Everything wrong with one capability, in the order a reader would fix it. `at` is where it
 * sits in the document — `capabilities.link` — and replaces its own name in the message,
 * because the key is what the reader has to go and edit.
 */
function capabilityProblems(candidate: object, at?: string): string[] {
  const problems: string[] = [];
  // `object` on purpose: `check` exists to be pointed at a parsed JSON file whose shape
  // nobody has verified yet, which is the whole reason a plugin is data. Re-building it from
  // its own entries indexes it by name without asserting anything about it.
  const record: Record<string, unknown> = Object.fromEntries(Object.entries(candidate));
  const named = typeof record?.['name'] === 'string' && record['name'] !== '';
  const label = at ?? (named ? String(record['name']) : '<unnamed>');

  // The required list comes from the published schema rather than from a second copy of it
  // here, so a field added there cannot be forgotten here. `schemaFields` locks the reverse.
  // A missing field says why it matters where the reason is not obvious: `fallback` is the
  // one people leave out, and "is required" would not tell them what they are giving up.
  const WHY: Record<string, string> = {
    name: at === undefined ? 'a capability needs a name' : `${at}: a capability needs a name`,
    fallback: `${label}: fallback must be a template, even if it is empty — rule 6 has no opt-out`,
    when: `${label}: when must say when the terminal understands this`,
    osc: `${label}: osc must name the code, or 'BEL'`,
  };
  for (const field of CAPABILITY.required) {
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

/**
 * Everything wrong with a plugin document — the `check` rule 7 asks for, usable before
 * registering and by a command that validates a file.
 *
 * Two shapes are accepted, which is `$defs/capabilityDocument`'s `oneOf` in the schema:
 *
 *   1. the family shape, capabilities by name under `capabilities`, the key every other host
 *      reads its own section from;
 *   2. one capability written as the whole document — what paratext's own schema was before
 *      the family schema absorbed it.
 *
 * (2) still validates, because a document that was correct yesterday is not made wrong by our
 * housekeeping, and it comes back with a `deprecated:` line saying it goes at 1.0. A caller
 * that wants only the blocking lines filters with `refusals()`.
 */
export function check(candidate: object): string[] {
  const record: Record<string, unknown> = Object.fromEntries(Object.entries(candidate));
  const section = record['capabilities'];
  if (section === undefined) {
    const named = typeof record['name'] === 'string' && record['name'] !== '' ? String(record['name']) : '<unnamed>';
    return [
      `${DEPRECATED}${named}: a capability written as the whole document is the shape paratext had before the family schema absorbed it — move it under \`capabilities\`, keyed by its name; 1.0 stops accepting this`,
      ...capabilityProblems(record),
    ];
  }
  if (typeof section !== 'object' || section === null || Array.isArray(section)) {
    return ['capabilities: must be an object of capabilities by name'];
  }
  // The family branch requires a name of the *plugin*, not of a capability: it is what a host
  // prefixes with when two plugins contribute the same key.
  const problems = typeof record['name'] === 'string' && record['name'] !== '' ? [] : ['a plugin needs a name'];
  return [
    ...problems,
    ...Object.entries(section).flatMap(([key, value]) =>
      typeof value === 'object' && value !== null && !Array.isArray(value)
        ? capabilityProblems(value as object, `capabilities.${key}`)
        : [`capabilities.${key}: must be an object`],
    ),
  ];
}

/** The fields the published schema declares for a capability, so a lock can hold the type to it. */
export const schemaFields = (): string[] => Object.keys(CAPABILITY.properties).toSorted();

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
