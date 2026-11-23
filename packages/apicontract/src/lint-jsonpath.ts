/**
 * The JSONPath subset a carried Spectral rule's `given` may use (apicontract-lint spec.md R9): root
 * `$`, child `.key` and `['key']`, a key list `[get,put]`, wildcard `*`, recursive descent `..`, and
 * the simple filters `[?(@.x == 'y')]` and `[?(@.x)]`. Anything else is outside the subset: `parse`
 * says so, and the rule is reported as not carried rather than run on a guess.
 *
 * A match is a value in the document and its JSON Pointer, so a finding points where it can be fixed.
 */

/** One step of a path: the members it moves to from each node. */
export type Step =
  | { readonly kind: 'keys'; readonly keys: readonly string[] }
  | { readonly kind: 'wildcard' }
  | { readonly kind: 'descend' }
  | { readonly kind: 'filter'; readonly field: readonly string[]; readonly equals?: string | number | boolean };

export interface Match {
  readonly pointer: string;
  readonly value: unknown;
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const token = (key: string): string => key.replaceAll('~', '~0').replaceAll('/', '~1');

/** A member's name, as `.name` writes it: anything up to the next `.` or `[`. */
const NAME = /^[^.[\]]+/u;
/** One member name in a filter's `@.a.b`. */
const MEMBER = /^[\w$-]+$/u;
/** A key in a bracket: quoted, or bare. */
const KEY = /^\s*(?:'([^']*)'|"([^"]*)"|([\w$-]+))\s*$/u;

/** A filter's literal: a quoted string, a number, `true` or `false`. */
const literalOf = (text: string): string | number | boolean | undefined => {
  const quoted = /^'([^']*)'$|^"([^"]*)"$/u.exec(text);
  if (quoted !== null) return quoted[1] ?? quoted[2];
  if (text === 'true' || text === 'false') return text === 'true';
  return /^-?\d+(?:\.\d+)?$/u.test(text) ? Number(text) : undefined;
};

/** A filter, `?(@.a.b)` or `?(@.a.b == literal)`, or `undefined` when `inside` is not one in the subset. */
const filterOf = (inside: string, path: string): Step | undefined => {
  if (!inside.startsWith('?(@.') || !inside.endsWith(')')) return undefined;
  const [left, right, ...more] = inside.slice('?(@.'.length, -1).split('==');
  const field = (left as string).trim().split('.');
  if (more.length > 0 || !field.every((name) => MEMBER.test(name))) return undefined;
  if (right === undefined) return { kind: 'filter', field };
  const equals = literalOf(right.trim());
  if (equals === undefined) throw new Error(`${path}: the filter compares with \`${right.trim()}\`, which is not a string, number or boolean`);
  return { kind: 'filter', field, equals };
};

/** What is inside one `[…]`: a filter, a wildcard, or a list of keys. */
const bracketOf = (inside: string, path: string): Step => {
  if (inside.trim() === '*') return { kind: 'wildcard' };
  const filter = filterOf(inside.trim(), path);
  if (filter !== undefined) return filter;
  const keys = inside.split(',').map((part) => KEY.exec(part));
  if (keys.some((key) => key === null)) throw new Error(`${path}: \`[${inside}]\` is outside the subset (keys, \`*\`, \`?(@.x)\` and \`?(@.x == 'y')\`)`);
  return { kind: 'keys', keys: keys.map((key) => (key as RegExpExecArray).slice(1).find((part) => part !== undefined) as string) };
};

/** The next step at the start of `rest`, and what is left after it. */
const stepAt = (rest: string, path: string): [Step, string] => {
  // `..name` and `..*` read as descend-then-step; `..[…]` keeps its bracket.
  if (rest.startsWith('..')) return [{ kind: 'descend' }, rest.startsWith('..[') ? rest.slice(2) : rest.slice(1)];
  if (rest.startsWith('[')) {
    const end = rest.indexOf(']');
    // Stryker disable next-line EqualityOperator,NumericLiteral: equivalent, `rest` starts with `[`, so a `]` is never at 0
    if (end < 0) throw new Error(`${path}: a \`[\` is never closed`);
    return [bracketOf(rest.slice(1, end), path), rest.slice(end + 1)];
  }
  const key = rest.startsWith('.') ? NAME.exec(rest.slice(1))?.[0] : undefined;
  if (key === undefined || /[~^@()?]/u.test(key)) throw new Error(`${path}: \`${rest}\` is outside the subset`);
  return [key === '*' ? { kind: 'wildcard' } : { kind: 'keys', keys: [key] }, rest.slice(1 + key.length)];
};

/** The steps of a path, or an error naming what is outside the subset. */
export const parse = (path: string): Step[] => {
  if (!path.startsWith('$')) throw new Error(`${path}: a path starts at the root, \`$\``);
  const steps: Step[] = [];
  let rest = path.slice(1);
  while (rest.length > 0) {
    const [step, after] = stepAt(rest, path);
    steps.push(step);
    rest = after;
  }
  return steps;
};

/** A node's own members, each with its pointer. */
const childrenOf = (match: Match): Match[] =>
  isObject(match.value) ? Object.entries(match.value).map(([key, value]) => ({ pointer: `${match.pointer}/${token(key)}`, value })) : [];

/** A node and everything under it, depth first. */
const descendantsOf = (match: Match): Match[] => [match, ...childrenOf(match).flatMap((child) => descendantsOf(child))];

/** A member of a value down a list of keys. */
const memberAt = (value: unknown, field: readonly string[]): unknown => field.reduce<unknown>((at, key) => (isObject(at) ? at[key] : undefined), value);

const stepOn = (step: Step, match: Match): Match[] => {
  switch (step.kind) {
    case 'keys': {
      const members = new Map(childrenOf(match).map((child) => [child.pointer, child]));
      return step.keys.flatMap((key) => members.get(`${match.pointer}/${token(key)}`) ?? []);
    }
    case 'wildcard': {
      return childrenOf(match);
    }
    case 'descend': {
      return descendantsOf(match);
    }
    case 'filter': {
      return childrenOf(match).filter((child) => {
        const member = memberAt(child.value, step.field);
        return step.equals === undefined ? member !== undefined && member !== null && member !== false : member === step.equals;
      });
    }
  }
};

/** Every value a path selects in a document, in document order, each once. */
export const query = (document: unknown, steps: readonly Step[]): Match[] => {
  const matches = steps.reduce<Match[]>((at, step) => at.flatMap((match) => stepOn(step, match)), [{ pointer: '#', value: document }]);
  const seen = new Set<string>();
  return matches.filter((match) => !seen.has(match.pointer) && Boolean(seen.add(match.pointer)));
};
