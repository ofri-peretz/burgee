/**
 * An HTTP operation's security requirement, compared (contractdiff-bench R1, edit
 * `security-requirement-added`: a caller that sent no credentials, or other ones, is turned
 * away). OpenAPI lists alternatives; a caller holding what one alternative asks for gets in.
 * The operation's own `security` overrides the document's, and an empty list, or none at all,
 * lets anyone in.
 */
import { type Contract, type Operation } from './core/model.js';
import { pointerGet } from './core/resolve.js';
import { isDict } from './diff-normalise.js';

/** One alternative: each scheme it asks for, with the scopes it asks for on it. */
type Alternative = ReadonlyMap<string, ReadonlySet<string>>;

/** The formats whose operations live under `paths` and carry OpenAPI's `security`. */
const HTTP: ReadonlySet<string> = new Set(['openapi', 'swagger2']);

const nodeAt = (document: unknown, pointer: string): unknown => {
  // Stryker disable next-line BlockStatement: equivalent, an empty handler returns the same undefined
  try { return pointerGet(document, pointer); } catch { return undefined; }
};

/** The security list that applies to `operation`, as written: its own, else the document's. */
export const securityOf = (contract: Contract, operation: Operation): unknown[] => {
  const own = Object(nodeAt(contract.document, operation.source)).security as unknown;
  const declared = Array.isArray(own) ? own : (Object(contract.document).security as unknown);
  return Array.isArray(declared) ? declared : [];
};

const alternativesOf = (security: readonly unknown[]): Alternative[] =>
  (security.length === 0 ? [{}] : security).map((alternative) =>
    new Map(Object.entries(isDict(alternative) ? alternative : {}).map(([scheme, scopes]) => [scheme, new Set(Array.isArray(scopes) ? scopes.map(String) : [])])),
  );

/** Whether a caller holding what `held` asks for satisfies `asked`: every scheme, with every scope. */
const satisfies = (held: Alternative, asked: Alternative): boolean =>
  [...asked].every(([scheme, scopes]) => {
    const have = held.get(scheme);
    return have !== undefined && [...scopes].every((scope) => have.has(scope));
  });

/** Whether some caller `from` let in is turned away by `to`. */
const turnsAway = (from: readonly Alternative[], to: readonly Alternative[]): boolean => from.some((held) => !to.some((asked) => satisfies(held, asked)));

export interface SecurityChange {
  readonly rule: 'security-narrowed' | 'security-widened';
  readonly before: unknown[];
  readonly after: unknown[];
  readonly effect: 'narrows' | 'widens';
}

/** How the security an operation asks for changed, if it did; `undefined` outside HTTP. */
export const compareSecurity = (a: Contract, b: Contract, old: Operation, nu: Operation): SecurityChange | undefined => {
  if (!HTTP.has(a.format) || !HTTP.has(b.format)) return undefined;
  const [before, after] = [securityOf(a, old), securityOf(b, nu)];
  const [was, is] = [alternativesOf(before), alternativesOf(after)];
  if (turnsAway(was, is)) return { rule: 'security-narrowed', before, after, effect: 'narrows' };
  if (turnsAway(is, was)) return { rule: 'security-widened', before, after, effect: 'widens' };
  return undefined;
};
