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
import { type Schema, violations } from './shape.js';
import { type Support, supports } from './supports.js';
import { render } from './template.js';

/** What a caller hands a capability. Flat and string-valued, and therefore describable. */
export type Fields = Readonly<Record<string, string | undefined>>;

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

/**
 * Thrown rather than returned: a malformed capability is a programming error at start-up.
 *
 * It carries a `code` from the family's one vocabulary, so that the same defect reported
 * through `register()` and through `plugin.validate()` reads the same. See
 * {@link CapabilityErrorCode} for where that vocabulary lives and why this file spells its
 * two members out rather than importing them.
 */
export class CapabilityError extends Error {
  constructor(
    readonly code: CapabilityErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CapabilityError';
  }
}

/**
 * Add a capability, or replace one by name — replacing is deliberate, so a caller whose
 * terminal we mis-detect can correct the guess without patching the package.
 *
 * **This is the only way into the registry**, which is what makes one validator enough:
 * `emit()` reads nothing else, the built-ins come through here, and `attach()` in
 * `plugin.ts` hands its contributions to this same call. A capability whose `when` is not an
 * object is refused here, and that refusal — not a guard further down — is the reason
 * `supports()` is never asked about it.
 */
export function register(capability: Capability): void {
  // Against the capability shape rather than against `check`: this argument *is* one
  // capability, so the document-level deprecation has nothing to say about it, and a
  // built-in registering through the same call must not be told it is writing 0.2 JSON.
  for (const problem of capabilityProblems(capability)) throw new CapabilityError(problem.code, problem.line);
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
 * The codes this module can raise. Both are members of `plugin.ts`'s `PluginErrorCode`, which
 * is this package's copy of the family vocabulary, and
 * `scripts/plugin-error-vocabulary-lock.test.ts` holds them to it — it reads every `'E_…'`
 * literal a host ships and fails on one that is not in that host's own union, and on a union
 * that is not a subset of flagstaff's.
 *
 * Written out rather than imported from `plugin.ts` for a mechanical reason: `capability.js`
 * must never reach `plugin.js` (the root entry's deny-list in `weight.test.ts`), and under
 * `verbatimModuleSyntax` an inline `import { type … }` leaves a side-effect import behind
 * that would make it do exactly that.
 */
export type CapabilityErrorCode = 'E_PLUGIN_SCHEMA' | 'E_NO_STATIC_PROJECTION';

/** One thing wrong: the line a reader is shown, and the family code a thrower reports it as. */
export interface Problem {
  code: CapabilityErrorCode;
  line: string;
}

const NEEDS_A_NAME = 'a capability needs a name';

/**
 * Why a missing field matters, where "is required" would not say it — `fallback` above all,
 * which is the one people leave out and the one rule 6 has no opt-out for. Keyed by the
 * field, so the list still comes from the schema's own `required` and this only supplies the
 * sentence. A field added there and not here gets `… is required`, which is true if terse.
 */
const WHY: Record<string, string | undefined> = {
  name: NEEDS_A_NAME,
  fallback: 'fallback must be a template, even if it is empty — rule 6 has no opt-out',
  when: 'when must say when the terminal understands this',
  osc: "osc must name the code, or 'BEL'",
};

/**
 * Everything wrong with one capability, in the order a reader would fix it. `at` is where it
 * sits in the document — `capabilities.link` — and replaces its own name in the message,
 * because the key is what the reader has to go and edit.
 *
 * Two passes, and the order is the order an author fixes them in: the five fields have to be
 * *there*, and then what is there has to be the shape the schema declares. Both read
 * `schema.json`; neither restates it.
 */
export function capabilityProblems(candidate: object, at?: string): Problem[] {
  const problems: Problem[] = [];
  // `object` on purpose: `check` exists to be pointed at a parsed JSON file whose shape
  // nobody has verified yet, which is the whole reason a plugin is data. Read as a bag of
  // unknowns — the cast asserts nothing about it, and `shape.ts` is what decides the shape.
  const record = candidate as Record<string, unknown>;
  const label = at ?? (typeof record['name'] === 'string' && record['name'] !== '' ? record['name'] : '<unnamed>');

  for (const field of CAPABILITY.required) {
    if (record[field] === undefined) {
      // A missing `fallback` is the family's `E_NO_STATIC_PROJECTION` — the same defect
      // flagstaff raises for a component with no static form, wearing OSC.
      problems.push({
        code: field === 'fallback' ? 'E_NO_STATIC_PROJECTION' : 'E_PLUGIN_SCHEMA',
        line: field === 'name' && at === undefined ? NEEDS_A_NAME : `${label}: ${WHY[field] ?? `${field} is required`}`,
      });
    }
  }
  /**
   * And then the shape. This used to be two hand-written lines — `encode` non-empty and
   * `fallback` a string — which are precisely `minLength` and `type`, two of the keywords
   * `shape.ts` now reads out of the file instead of repeating. `when: 'not an object'`,
   * `osc: { … }` and an undeclared key all validated clean until this call existed; see
   * `shape.test.ts` for the measurement and `shape.ts` for what is and is not enforced.
   */
  for (const line of violations(CAPABILITY as Schema, record, label)) problems.push({ code: 'E_PLUGIN_SCHEMA', line });
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
      ...capabilityProblems(record).map(({ line }) => line),
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
        ? capabilityProblems(value as object, `capabilities.${key}`).map(({ line }) => line)
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

/**
 * The support guess lives in `supports.ts` and is re-exported here, unchanged, because this
 * is where every caller has always reached it. It moved so that `paratext/link` can ask
 * "does this terminal do OSC 8" without loading `schema.json` — see that module's header.
 */
export { type Support, supports };
