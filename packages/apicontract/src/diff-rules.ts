/**
 * Public rule ids for `diff` findings (apicontract-diff spec.md R6,
 * D-20261106-apicontract-diff-rule-ids): oasdiff's checker id where a change is one oasdiff names,
 * ours prefixed `ac-` otherwise. oasdiff's ids are HTTP-only, so a change to a publish, subscribe,
 * tool or argv payload always gets ours.
 *
 * The table reads left to right as ours, where it happens, oasdiff's. The ids are oasdiff's
 * `checker` rule ids as its documentation lists them; the corpus lane grades them case by case
 * on oasdiff's own fixtures (D1), and a row it disproves is corrected here.
 */
import { type Direction } from './core/model.js';

/** Where in an HTTP operation a change is, in oasdiff's words. `operation` is the operation itself. */
export type Locus = 'operation' | 'request-parameter' | 'request-body' | 'request-property' | 'response-body' | 'response-property';

const TABLE: readonly (readonly [rule: string, locus: Locus, oasdiff: string])[] = [
  ['operation-removed', 'operation', 'api-removed-without-deprecation'],
  ['operation-added', 'operation', 'endpoint-added'],
  ['parameter-removed', 'request-parameter', 'request-parameter-removed'],
  ['parameter-added', 'request-parameter', 'new-optional-request-parameter'],
  ['required-parameter-added', 'request-parameter', 'new-required-request-parameter'],
  ['parameter-became-required', 'request-parameter', 'request-parameter-became-required'],
  ['parameter-became-optional', 'request-parameter', 'request-parameter-became-optional'],
  ['request-body-became-required', 'request-body', 'request-body-became-required'],
  ['request-body-became-optional', 'request-body', 'request-body-became-optional'],
  ['request-body-media-type-removed', 'request-body', 'request-body-media-type-removed'],
  ['request-body-media-type-added', 'request-body', 'request-body-media-type-added'],
  ['response-status-removed', 'response-body', 'response-success-status-removed'],
  ['response-status-added', 'response-body', 'response-success-status-added'],
  ['response-media-type-removed', 'response-body', 'response-media-type-removed'],
  ['response-media-type-added', 'response-body', 'response-media-type-added'],
  ['type-narrowed', 'request-parameter', 'request-parameter-type-changed'],
  ['type-widened', 'request-parameter', 'request-parameter-type-changed'],
  ['type-narrowed', 'request-body', 'request-body-type-changed'],
  ['type-widened', 'request-body', 'request-body-type-changed'],
  ['type-narrowed', 'request-property', 'request-property-type-changed'],
  ['type-widened', 'request-property', 'request-property-type-changed'],
  ['type-narrowed', 'response-body', 'response-body-type-changed'],
  ['type-widened', 'response-body', 'response-body-type-changed'],
  ['type-narrowed', 'response-property', 'response-property-type-changed'],
  ['type-widened', 'response-property', 'response-property-type-changed'],
  ['became-nullable', 'request-property', 'request-property-became-nullable'],
  ['became-not-nullable', 'request-property', 'request-property-became-not-nullable'],
  ['became-nullable', 'response-property', 'response-property-became-nullable'],
  ['became-not-nullable', 'response-property', 'response-property-became-not-nullable'],
  ['enum-value-removed', 'request-parameter', 'request-parameter-enum-value-removed'],
  ['enum-value-added', 'request-parameter', 'request-parameter-enum-value-added'],
  ['enum-value-removed', 'request-property', 'request-property-enum-value-removed'],
  ['enum-value-added', 'request-property', 'request-property-enum-value-added'],
  ['enum-value-removed', 'response-property', 'response-property-enum-value-removed'],
  ['enum-value-added', 'response-property', 'response-property-enum-value-added'],
  ['property-added', 'request-property', 'new-optional-request-property'],
  ['required-property-added', 'request-property', 'new-required-request-property'],
  ['property-removed', 'request-property', 'request-property-removed'],
  ['required-property-removed', 'request-property', 'request-property-removed'],
  ['property-became-required', 'request-property', 'request-property-became-required'],
  ['property-became-optional', 'request-property', 'request-property-became-optional'],
  ['property-added', 'response-property', 'response-optional-property-added'],
  ['required-property-added', 'response-property', 'response-required-property-added'],
  ['property-removed', 'response-property', 'response-optional-property-removed'],
  ['required-property-removed', 'response-property', 'response-required-property-removed'],
  ['property-became-required', 'response-property', 'response-property-became-required'],
  ['property-became-optional', 'response-property', 'response-property-became-optional'],
  ['maxLength-decreased', 'request-parameter', 'request-parameter-max-length-decreased'],
  ['maxLength-decreased', 'request-property', 'request-property-max-length-decreased'],
  ['maxLength-increased', 'response-property', 'response-property-max-length-increased'],
  ['minLength-increased', 'request-parameter', 'request-parameter-min-length-increased'],
  ['minLength-increased', 'request-property', 'request-property-min-length-increased'],
  ['minLength-decreased', 'response-property', 'response-property-min-length-decreased'],
  ['maximum-decreased', 'request-parameter', 'request-parameter-max-decreased'],
  ['maximum-decreased', 'request-property', 'request-property-max-decreased'],
  ['maximum-increased', 'response-property', 'response-property-max-increased'],
  ['minimum-increased', 'request-parameter', 'request-parameter-min-increased'],
  ['minimum-increased', 'request-property', 'request-property-min-increased'],
  ['minimum-decreased', 'response-property', 'response-property-min-decreased'],
  ['maxItems-decreased', 'request-property', 'request-property-max-items-decreased'],
  ['minItems-increased', 'request-property', 'request-property-min-items-increased'],
  ['pattern-set', 'request-parameter', 'request-parameter-pattern-added'],
  ['pattern-unset', 'request-parameter', 'request-parameter-pattern-removed'],
  ['pattern-changed', 'request-parameter', 'request-parameter-pattern-changed'],
  ['pattern-set', 'request-property', 'request-property-pattern-added'],
  ['pattern-unset', 'request-property', 'request-property-pattern-removed'],
  ['pattern-changed', 'request-property', 'request-property-pattern-changed'],
  ['one-of-added', 'request-body', 'request-body-one-of-added'],
  ['one-of-removed', 'request-body', 'request-body-one-of-removed'],
  ['one-of-added', 'request-property', 'request-property-one-of-added'],
  ['one-of-removed', 'request-property', 'request-property-one-of-removed'],
  ['one-of-added', 'response-body', 'response-body-one-of-added'],
  ['one-of-removed', 'response-body', 'response-body-one-of-removed'],
  ['one-of-added', 'response-property', 'response-property-one-of-added'],
  ['one-of-removed', 'response-property', 'response-property-one-of-removed'],
  ['any-of-added', 'request-body', 'request-body-any-of-added'],
  ['any-of-removed', 'request-body', 'request-body-any-of-removed'],
  ['any-of-added', 'request-property', 'request-property-any-of-added'],
  ['any-of-removed', 'request-property', 'request-property-any-of-removed'],
  ['any-of-added', 'response-body', 'response-body-any-of-added'],
  ['any-of-removed', 'response-body', 'response-body-any-of-removed'],
  ['any-of-added', 'response-property', 'response-property-any-of-added'],
  ['any-of-removed', 'response-property', 'response-property-any-of-removed'],
  ['all-of-added', 'request-body', 'request-body-all-of-added'],
  ['all-of-removed', 'request-body', 'request-body-all-of-removed'],
  ['all-of-added', 'request-property', 'request-property-all-of-added'],
  ['all-of-removed', 'request-property', 'request-property-all-of-removed'],
  ['all-of-added', 'response-body', 'response-body-all-of-added'],
  ['all-of-removed', 'response-body', 'response-body-all-of-removed'],
  ['all-of-added', 'response-property', 'response-property-all-of-added'],
  ['all-of-removed', 'response-property', 'response-property-all-of-removed'],
];

const OASDIFF: ReadonlyMap<string, string> = new Map(TABLE.map(([rule, locus, id]) => [`${rule}@${locus}`, id]));

/** Every row, for a reader that wants the two schemes side by side (`--json` carries both per finding). */
export const RULES = TABLE;

/**
 * Where a change is: on the operation (no payload), in a parameter, or in a body at its root or
 * below it. `undefined` outside HTTP, where oasdiff has no ids.
 */
export const locusOf = (direction: Direction, payload: string | undefined, pointer: string): Locus | undefined => {
  if (direction !== 'request' && direction !== 'response') return undefined;
  if (payload === undefined) return 'operation';
  if (payload.startsWith('param:')) return 'request-parameter';
  return `${direction}-${pointer === '' ? 'body' : 'property'}`;
};

export interface RuleId {
  /** The id a finding is reported and suppressed by. */
  readonly id: string;
  /** Whose scheme `id` is in. */
  readonly scheme: 'oasdiff' | 'apicontract';
}

/** The public id of `rule` where it happened. */
export const ruleId = (rule: string, direction: Direction, payload: string | undefined, pointer: string): RuleId => {
  const locus = locusOf(direction, payload, pointer);
  const id = OASDIFF.get(`${rule}@${String(locus)}`);
  return id === undefined ? { id: `ac-${rule}`, scheme: 'apicontract' } : { id, scheme: 'oasdiff' };
};
