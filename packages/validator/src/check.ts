import { type Node, type Rule, type Schema, type Test } from './schema.js';

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

/** Whether a string is what a format names: its pattern, or else its test. */
const matches = (rule: Rule, value: string): boolean =>
  rule.pattern === null ? (rule.test as Test)(value) === true : rule.pattern.test(value);

const isString = (schema: Node, value: unknown): boolean =>
  typeof value === 'string' &&
  longEnough(value, schema.min) &&
  shortEnough(value, schema.max) &&
  (schema.pattern === null || schema.pattern.test(value)) &&
  (schema.rule === null || matches(schema.rule, value));

/**
 * Whether `value` is a multiple of `step`. The remainder is exact, so for a whole `step` it must be
 * zero. A fraction such as 0.1 has no exact double, and neither has 0.3, so there a value counts as a
 * multiple when it is within one rounding error of one: `|value| × Number.EPSILON`, which is the
 * most the two doubles can be off by together. So 0.3 and 0.1 + 0.2 are multiples of 0.1, as they are in the
 * decimal text of a JSON document, and 0.35 is not.
 *
 * Probed 2026-11-13 on 0.3, 0.1 + 0.2, 0.7, 0.35, 1.1 and 123456789.3 against 0.1: zod 4.6.7 answers as
 * this does on all six. valibot 1.5.0 and typebox 0.34.52 test the bare remainder and refuse all six;
 * ajv 8.20.0 refuses 0.3, 0.1 + 0.2 and 0.7 and accepts 1.1; arktype 2.2.9 refuses a divisor that is a fraction.
 */
const isMultiple = (value: number, step: number): boolean => {
  const rest = Math.abs(value % step);
  return rest === 0 || (!Number.isInteger(step) && Math.min(rest, step - rest) <= Math.abs(value) * Number.EPSILON);
};

// The default bounds are the largest finite numbers, so `NaN` and the infinities fail the comparisons.
const isNumber = (schema: Node, value: unknown): boolean =>
  typeof value === 'number' &&
  value >= schema.min &&
  value <= schema.max &&
  value > schema.above &&
  value < schema.below &&
  (!schema.int || Number.isInteger(value)) &&
  (schema.step === 0 || isMultiple(value, schema.step));

const isAnything = (): boolean => true;

const isNothing = (): boolean => false;

const isLiteral = (schema: Node, value: unknown): boolean => value === schema.value;

const isMember = (schema: Node, value: unknown): boolean => (schema.values as ReadonlySet<unknown>).has(value);

const isBoolean = (_: Node, value: unknown): boolean => typeof value === 'boolean';

// A bigint and a number compare by value, so a bound may be either: one nobody set is an infinity.
const isBigint = (schema: Node, value: unknown): boolean => {
  const [min, max] = schema.value as readonly [bigint | number, bigint | number];
  return typeof value === 'bigint' && value >= min && value <= max;
};

/** A `Date` whose time is a number: all four libraries with a date kind refuse `new Date(NaN)`. */
const isDate = (_: Node, value: unknown): boolean => value instanceof Date && !Number.isNaN(value.getTime());

const isTypeOf = (schema: Node, value: unknown): boolean => typeof value === schema.value;

const isInstance = (schema: Node, value: unknown): boolean => value instanceof (schema.value as abstract new () => unknown);

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
  // A map, so a tag is found by its value and its type: 1 is not "1", and "toString" is no case.
  const chosen = (schema.cases as ReadonlyMap<unknown, Node>).get(value[schema.tag as string]);
  return chosen !== undefined && run(chosen, value);
};

/** An array of exactly the schema's items (parity.md decision 12: a tuple is closed). */
const isTuple = (schema: Node, value: unknown): boolean => {
  const fields = schema.fields as readonly Node[];
  if (!Array.isArray(value) || value.length !== fields.length) return false;
  for (let index = 0; index < fields.length; index++) if (!run(fields[index] as Node, value[index])) return false;
  return true;
};

/**
 * `for … in`, here and in `isClosed`, because it allocates nothing. It also reads the enumerable
 * keys of the prototype, which is the reading parity.md decision 3 gives a named field.
 */
const isRecord = (schema: Node, value: unknown): boolean => {
  if (!isPlain(value)) return false;
  const item = schema.item as Node;
  const { key } = schema;
  for (const name in value) if ((key !== null && !run(key, name)) || !run(item, value[name])) return false;
  return true;
};

/** An object whose unnamed keys are refused, or must each match the schema in `item`. */
const isClosed = (schema: Node, value: unknown): boolean => {
  if (!isObject(schema, value)) return false;
  const named = schema.values as ReadonlySet<unknown>;
  const rest = schema.item;
  const members = value as Record<string, unknown>;
  for (const name in members) if (!named.has(name) && (rest === null || !run(rest, members[name]))) return false;
  return true;
};

const isNullable = (schema: Node, value: unknown): boolean => value === null || run(schema.item as Node, value);

const isNullish = (schema: Node, value: unknown): boolean =>
  value === null || value === undefined || run(schema.item as Node, value);

/** Whether any member of a union or an intersection answers `verdict` for the value. */
const anyAnswers = (schema: Node, value: unknown, verdict: boolean): boolean => {
  const members = schema.fields as readonly Node[];
  for (let index = 0; index < members.length; index++) if (run(members[index] as Node, value) === verdict) return true;
  return false;
};

const isUnion = (schema: Node, value: unknown): boolean => anyAnswers(schema, value, true);

const isEvery = (schema: Node, value: unknown): boolean => !anyAnswers(schema, value, false);

const isLater = (schema: Node, value: unknown): boolean => run((schema.get as () => Node)(), value);

const isCustom = (schema: Node, value: unknown): boolean => ((schema.rule as Rule).test as Test)(value) === true;

/** Whether `value` is what the schema describes. A type guard, so a passing check narrows. */
const check = <T>(schema: Schema<T>, value: unknown): value is T => schema.check(schema, value);

export {
  check,
  isAnything,
  isArray,
  isBigint,
  isBoolean,
  isCase,
  isClosed,
  isCustom,
  isDate,
  isEvery,
  isInstance,
  isLater,
  isLiteral,
  isMember,
  isMultiple,
  isNothing,
  isNullable,
  isNullish,
  isNumber,
  isObject,
  isRecord,
  isString,
  isTuple,
  isTypeOf,
  isUnion,
  matches,
  points,
};
