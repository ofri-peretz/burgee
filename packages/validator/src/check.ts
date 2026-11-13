import { type Node, type Schema } from './schema.js';

/**
 * The first pass (spec.md R6): yes or no, and nothing allocated on a yes. No `eval` (R3).
 * `issues` is the second pass and runs only after a no.
 *
 * One function per kind, and each builder puts its kind's function on the node it returns
 * (parity.md, "a bundle carries only the kinds its schemas use"): nothing here names every kind,
 * so a bundler drops the functions of the kinds a program never builds. None captures anything.
 */

/** The last code point one UTF-16 unit can hold. */
const ONE_UNIT_LAST = 0xff_ff;

/** A code point that takes two UTF-16 units. */
const PAIR = /[\u{10000}-\u{10FFFF}]/u;

/**
 * The number of code points in a string, which is what a length bound counts (parity.md decision 4:
 * JSON Schema's `minLength` and `maxLength`, zod and ajv). A surrogate pair is one; a surrogate
 * with no partner is one.
 */
const points = (text: string): number => {
  // Stryker disable next-line ConditionalExpression: equivalent, with no pair the loop below takes nothing off the length; the test is one native scan in place of that loop (measured 2026-11-13: 3.74M against 4.02M orders a second when a 22-character bound is counted)
  if (!PAIR.test(text)) return text.length;
  let count = text.length;
  // Stryker disable next-line EqualityOperator: equivalent, there is no code point past the end, and `undefined` is not above anything
  for (let index = 0; index < text.length; index++) {
    // Only at the first unit of a pair is the code point too large for one unit.
    if ((text.codePointAt(index) as number) > ONE_UNIT_LAST) count -= 1;
  }
  return count;
};

/**
 * `min` code points or more. A string has at most as many code points as UTF-16 units and at least
 * half as many, so one with twice `min` units is long enough uncounted, and what is counted is
 * shorter than that.
 */
const longEnough = (value: string, min: number): boolean =>
  // Stryker disable next-line EqualityOperator,ConditionalExpression,NumericLiteral: equivalent, a mutant that survives here only sends more strings to the count below, which gives the same answer
  value.length >= min * 2 ||
  points(value) >= min;

/** `max` code points or fewer; counted only when there are more units than that. */
const shortEnough = (value: string, max: number): boolean =>
  // Stryker disable next-line EqualityOperator,ConditionalExpression: equivalent, a mutant that survives here only sends more strings to the count below, which gives the same answer
  value.length <= max ||
  points(value) <= max;

const isString = (schema: Node, value: unknown): boolean =>
  typeof value === 'string' &&
  longEnough(value, schema.min) &&
  shortEnough(value, schema.max) &&
  (schema.pattern === null || schema.pattern.test(value));

// The default bounds are the largest finite numbers, so `NaN` and the infinities fail the comparisons.
const isNumber = (schema: Node, value: unknown): boolean =>
  typeof value === 'number' && value >= schema.min && value <= schema.max && (!schema.int || Number.isInteger(value));

const isLiteral = (schema: Node, value: unknown): boolean => value === schema.value;

const isMember = (schema: Node, value: unknown): boolean => (schema.values as ReadonlySet<unknown>).has(value);

const isBoolean = (_: Node, value: unknown): boolean => typeof value === 'boolean';

/**
 * Calls the node's own check. The three commonest are called by name, so the engine can inline
 * them into the loop that asked: measured 2026-11-13 on the order schema, calling `schema.check`
 * alone costs 11% of the throughput (3.96M against 4.45M validations a second) and this costs 2%.
 * A bundle that builds an array or an object therefore carries these three; one that builds only
 * scalars does not carry this function at all.
 */
const run = (schema: Node, value: unknown): boolean => {
  const own = schema.check;
  // Stryker disable next-line ConditionalExpression: equivalent, the last line calls the same function; this line is only what lets the engine inline it
  if (own === isString) return isString(schema, value);
  // Stryker disable next-line ConditionalExpression: equivalent, the last line calls the same function; this line is only what lets the engine inline it
  if (own === isNumber) return isNumber(schema, value);
  // Stryker disable next-line ConditionalExpression: equivalent, the last line calls the same function; this line is only what lets the engine inline it
  if (own === isBoolean) return isBoolean(schema, value);
  return own(schema, value);
};

const isPlain = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isArray = (schema: Node, value: unknown): boolean => {
  if (!Array.isArray(value) || value.length < schema.min || value.length > schema.max) return false;
  const item = schema.item as Node;
  // Indexed on purpose, here and below. Measured 2026-11-13: iterating with `entries()` costs 17% of
  // the throughput on the bench schema (3.69M against 4.43M validations a second).
  for (let index = 0; index < value.length; index++) if (!run(item, value[index])) return false;
  return true;
};

const isObject = (schema: Node, value: unknown): boolean => {
  if (!isPlain(value)) return false;
  const keys = schema.keys as readonly string[];
  const fields = schema.fields as readonly Node[];
  for (let index = 0; index < keys.length; index++) {
    const field = fields[index] as Node;
    const member = value[keys[index] as string];
    if (member === undefined ? !field.optional : !run(field, member)) return false;
  }
  return true;
};

const isCase = (schema: Node, value: unknown): boolean => {
  if (!isPlain(value)) return false;
  const tag = value[schema.tag as string];
  const cases = schema.cases as Readonly<Record<string, Node>>;
  // eslint-disable-next-line conventions/consistent-existence-index-check -- Own cases only: a tag of "toString" must not pick an inherited function
  if (typeof tag !== 'string' || !Object.hasOwn(cases, tag)) return false;
  const chosen = cases[tag] as Node;
  return run(chosen, value);
};

/** Whether `value` is what the schema describes. A type guard, so a passing check narrows. */
const check = <T>(schema: Schema<T>, value: unknown): value is T => schema.check(schema, value);

export { check, isArray, isBoolean, isCase, isLiteral, isMember, isNumber, isObject, isString, points };
