/**
 * Stryker's range directives: a `disable` comment naming mutators (or `all`) and a reason turns them
 * off from the next line on, until a `restore` comment naming them (either spelled with `Stryker` or
 * `oxmutate`). The `next-line` form is config.ts's `disables`. Before this, oxmutate read only the
 * `next-line` form and graded every mutant inside a range as if no directive were there: 116 such
 * mutants in compat-oracle's `hosts.ts` alone (.sdlc/intents/oxmutate/sc8-profile.md).
 *
 * Read by line, as written. Stryker reads a directive only as the leading comment of the next AST
 * node, so a `restore` that closes an object (`// Stryker restore all` above its `}`) is invisible to
 * it, and its `disable` then runs to the end of the file. oxmutate does not reproduce that: the
 * directive means what it says.
 */
const HEAD = /\/\/\s*(?:Stryker|oxmutate)\s+(disable|restore)\s+(\S.*)/i;
/** `all`, or a comma list of mutator names. */
const LIST = /^(?:all|\w+(?:\s*,\s*\w+)*)$/i;

interface Rule {
  /** The directive's line (1-based): it covers mutants starting after it. */
  line: number;
  kind: 'disable' | 'restore';
  /** Lower-cased mutator names, or 'all'. */
  mutators: string[] | 'all';
  reason: string;
}

const covers = (r: Rule, mutator: string): boolean => r.mutators === 'all' || r.mutators.includes(mutator);

export interface Ranges {
  /** Why a mutant of `mutator` starting on `line` is off, or undefined when it is on. */
  reasonFor(line: number, mutator: string): string | undefined;
  errors: string[];
}

/** The range directives of a file. A `disable` without a reason is an error, as `next-line`'s is. */
export function rangeDisables(source: string, file: string): Ranges {
  const rules: Rule[] = [];
  const errors: string[] = [];
  source.split('\n').forEach((text, i) => {
    const m = HEAD.exec(text);
    if (!m) return;
    // `next-line` is not a list (the hyphen), so that form is left to config.ts here too.
    const body = m[2] as string;
    const colon = body.indexOf(':');
    const list = (colon === -1 ? body : body.slice(0, colon)).trim();
    if (!LIST.test(list)) return;
    const kind = (m[1] as string).toLowerCase() as Rule['kind'];
    const reason = colon === -1 ? '' : body.slice(colon + 1).trim();
    if (kind === 'disable' && !reason) {
      errors.push(`${file}:${String(i + 1)}: disable comment without a reason. fix: add ": <why these mutants cannot be killed>"`);
      return;
    }
    const mutators = list.toLowerCase() === 'all' ? 'all' : list.split(',').map((s) => s.trim().toLowerCase());
    rules.push({ line: i + 1, kind, mutators, reason });
  });
  return {
    errors,
    reasonFor(line, mutator) {
      const name = mutator.toLowerCase();
      // The latest directive before the line that names this mutator decides it.
      for (let k = rules.length - 1; k >= 0; k--) {
        const r = rules[k] as Rule;
        if (r.line >= line || !covers(r, name)) continue;
        return r.kind === 'disable' ? r.reason : undefined;
      }
      return undefined;
    },
  };
}
