/**
 * A capability is data plus two pure functions, and that is the whole extension surface.
 *
 * Every OSC sequence answers the same three questions — *can this terminal do it*, *what
 * bytes say it*, and *what do we print when it cannot* — so the package is a registry of
 * things that answer them, not a list of hard-coded functions. The built-ins register
 * through this exact API: `link` and `image` are not special, which is the only way to know
 * a third party can reach everything they can (flagstaff U4).
 *
 * Terminals invent OSC codes faster than any package ships releases — Kitty, iTerm, WezTerm
 * and Ghostty each have their own — so the useful question is not "which does paratext
 * support" but "can someone add theirs without waiting for us". They can, in about fifteen
 * lines, and without forking.
 *
 * **The input is one flat record for every capability, not a generic.** That is deliberate:
 * PRINCIPLES rule 7 wants a plugin to be an object inspectable without execution and
 * validated against one published schema, and a generic input type has no schema. It also
 * keeps the registry free of the casts a heterogeneous generic map would need — the same
 * reason `flagstaff/plugin.ts` holds concrete contribution types rather than parameterised
 * ones.
 */
import { type Runtime } from './runtime.js';

/** What a caller hands a capability. Flat, string-valued, and therefore describable. */
export type Fields = Readonly<Record<string, string | undefined>>;

export interface Capability {
  /** How callers name it: `link`, `image`, `clipboard`, or anything a third party invents. */
  readonly name: string;
  /**
   * Whether this terminal understands the sequence. Undetectable is the normal case — no
   * terminal answers "do you do OSC 1337" — so this reads the environment and is allowed to
   * be a guess. It must never throw.
   */
  supports(runtime: Runtime): boolean;
  /** The bytes, for a terminal that does understand. */
  encode(fields: Fields): string;
  /**
   * What to print when it does not — PRINCIPLES rule 6, and the reason this package exists.
   * An image becomes its caption, a notification a printed line, a hyperlink `text (url)`.
   * A capability without one is refused at `register`, because a sequence a terminal cannot
   * read is not a feature, it is `]1337;File=inline=1;…` across a user's screen.
   */
  fallback(fields: Fields): string;
}

const registry = new Map<string, Capability>();

/** Thrown rather than returned: a malformed capability is a programming error at start-up. */
export class CapabilityError extends Error {}

/**
 * Add a capability, or replace one by name — replacing is deliberate, so a caller whose
 * terminal we mis-detect can correct the guess without patching the package.
 */
export function register(capability: Capability): void {
  if (typeof capability.name !== 'string' || capability.name === '') throw new CapabilityError('a capability needs a name');
  for (const method of ['supports', 'encode', 'fallback'] as const) {
    if (typeof capability[method] !== 'function') throw new CapabilityError(`${capability.name}: ${method} must be a function`);
  }
  registry.set(capability.name, capability);
}

/** Every registered name, sorted — so `--json` and a `check` command can enumerate them. */
export const capabilities = (): string[] => [...registry.keys()].toSorted();

/** One capability by name, for callers that want to ask before they emit. */
export const capability = (name: string): Capability | undefined => registry.get(name);

/** Registration is global, so tests and hosts need a way back. */
export const reset = (): void => registry.clear();

/**
 * Emit `name` for `fields`: the sequence when the terminal understands it, the static
 * projection when it does not, and for an unknown name the projection a caller can still
 * read — never a throw, because output is not the place to discover a typo at three in the
 * morning.
 */
export function emit(runtime: Runtime, name: string, fields: Fields = {}): string {
  const found = registry.get(name);
  if (found === undefined) return fields['text'] ?? fields['caption'] ?? '';
  return found.supports(runtime) ? found.encode(fields) : found.fallback(fields);
}
