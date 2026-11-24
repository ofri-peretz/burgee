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
    const key = keys[index] as string;
    const member = value[key];
    // An optional key may be `undefined`; a required one may not; an exact one may only be absent.
    if (member === undefined ? field.optional !== true && (field.optional === false || key in value) : !run(field, member)) return false;
  }
  return true;
};

const isCase = (schema: Node, value: unknown): boolean => {
  if (!isPlain(value)) return false;
  // A map, so a tag is found by its value and its type: 1 is not "1", and "toString" is no case.
  const chosen = (schema.cases as ReadonlyMap<unknown, Node>).get(value[schema.tag as string]);
  return chosen !== undefined && run(chosen, value);
};

/**
 * An array of exactly the schema's items (parity.md decision 12: a tuple is closed), or of those
 * and then any number that match the schema in `item`.
 */
const isTuple = (schema: Node, value: unknown): boolean => {
  const fields = schema.fields as readonly Node[];
  const rest = schema.item;
  if (!Array.isArray(value) || (rest === null ? value.length !== fields.length : value.length < fields.length)) return false;
  for (let index = 0; index < value.length; index++) if (!run((fields[index] ?? rest) as Node, value[index])) return false;
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

/** What the schema accepts, and of that what its rule allows. The rule is asked only about a value the schema accepted. */
const isRefined = (schema: Node, value: unknown): boolean => run(schema.item as Node, value) && ((schema.rule as Rule).test as Test)(value) === true;

/**
 * A transform describes what goes in: `check` asks the schema it wraps, and never runs the map.
 * The same holds of every schema that only adds something for `parse` or for `issues` to what it
 * wraps: a pipe's second schema, a function run before validation, a message, a rule that is awaited.
 */
const isMapped = (schema: Node, value: unknown): boolean => run(schema.item as Node, value);

/** `NaN` and no other number: the one a number schema refuses. `Number.isNaN` asks nothing of a value that is not a number. */
const isNan = (_: Node, value: unknown): boolean => Number.isNaN(value);

/** A `Map` whose every key is what the schema in `key` describes, and every value what the one in `item` does. */
const isMap = (schema: Node, value: unknown): boolean => {
  if (!(value instanceof Map)) return false;
  const key = schema.key as Node;
  const item = schema.item as Node;
  for (const [name, member] of value) if (!run(key, name) || !run(item, member)) return false;
  return true;
};

/** A `Set` of a size inside the bounds, whose every member is what the schema in `item` describes. */
const isSet = (schema: Node, value: unknown): boolean => {
  if (!(value instanceof Set) || value.size < schema.min || value.size > schema.max) return false;
  const item = schema.item as Node;
  for (const member of value) if (!run(item, member)) return false;
  return true;
};

/** The number of keys an object has, read as a record's keys are read: `for … in`, which allocates nothing. */
const keyCount = (value: object): number => {
  let count = 0;
  for (const _ in value) count += 1;
  return count;
};

/** An object the wrapped schema accepts, with a number of keys inside the bounds. */
const isCounted = (schema: Node, value: unknown): boolean => {
  if (!isPlain(value) || !run(schema.item as Node, value)) return false;
  const count = keyCount(value);
  return count >= schema.min && count <= schema.max;
};

/** One step of a template's reading: a UTF-16 unit from `low` to `high`, or, when `kind` is 1, a way on to two other steps, each so many steps from this one. */
type Step = readonly [kind: number, low: number, high: number];

/**
 * The places a reading can stand at once every place in `from` is followed through its splits:
 * each once, `seen` holding the round a place was last reached in. A list and no recursion, so a
 * template of ten thousand alternatives is read on the same stack as one of two.
 */
const spread = (steps: readonly Step[], from: number[], seen: number[], round: number): number[] => {
  // Stryker disable next-line ArrayDeclaration: equivalent, a place that is no number names no step, and is never the end
  const out: number[] = [];
  while (from.length > 0) {
    const place = from.pop() as number;
    if (seen[place] === round) continue;
    // eslint-disable-next-line secure-coding/detect-object-injection -- `place` is a number the steps made, an index into an array of numbers
    seen[place] = round;
    const step = steps[place];
    if (step?.[0] === 1) from.push(place + step[1], place + step[2]);
    else out.push(place);
  }
  return out;
};

/**
 * A string a template describes. The template is read as a machine with no memory but the set of
 * places it may stand at (Thompson's construction, 1968), one UTF-16 unit of the string at a time:
 * the time is the length of the string times the size of the template, whatever the string. A
 * regular expression made from the same template backtracks where two holes of open length follow
 * each other, and this never does.
 */
const isTemplate = (schema: Node, value: unknown): boolean => {
  if (typeof value !== 'string') return false;
  const { steps } = schema.value as { readonly steps: readonly Step[] };
  // Stryker disable next-line ArrayDeclaration: equivalent, a member that is no round is never the round a place was reached in
  const seen: number[] = [];
  let now = spread(steps, [0], seen, 0);
  for (let index = 0; index < value.length; index++) {
    // eslint-disable-next-line conventions/prefer-code-point -- a unit, not a code point: the steps are UTF-16 units, so a pair is read as two
    const unit = value.charCodeAt(index);
    // Stryker disable next-line ArrayDeclaration: equivalent, a place that is no number names no step, and is never the end
    const next: number[] = [];
    for (const place of now) {
      const step = steps[place];
      if (step !== undefined && unit >= step[1] && unit <= step[2]) next.push(place + 1);
    }
    // Stryker disable next-line ArithmeticOperator: equivalent, the rounds would meet only at the second unit, and a template comes back to its start only through a string hole, which takes the first unit and so reaches every place of the start again in between
    now = spread(steps, next, seen, index + 1);
  }
  // The place past the last step is the end of the template.
  return now.includes(steps.length);
};

/** A string the wrapped schema accepts that starts with the text in `value`, ends with it, or has it somewhere inside. */
const isStarting = (schema: Node, value: unknown): boolean => typeof value === 'string' && value.startsWith(schema.value as string) && run(schema.item as Node, value);

const isEnding = (schema: Node, value: unknown): boolean => typeof value === 'string' && value.endsWith(schema.value as string) && run(schema.item as Node, value);

const isHolding = (schema: Node, value: unknown): boolean => typeof value === 'string' && value.includes(schema.value as string) && run(schema.item as Node, value);

/** How many of the items a schema accepts. */
const matching = (schema: Node, items: readonly unknown[]): number => {
  let count = 0;
  for (let index = 0; index < items.length; index++) if (run(schema, items[index])) count += 1;
  return count;
};

/** An array the wrapped schema accepts, of whose items the schema in `key` accepts a number inside the bounds: JSON Schema's `contains`, `minContains` and `maxContains`. */
const isContaining = (schema: Node, value: unknown): boolean => {
  if (!Array.isArray(value) || !run(schema.item as Node, value)) return false;
  const count = matching(schema.key as Node, value);
  return count >= schema.min && count <= schema.max;
};

/** Whether two arrays have the same items in the same order. */
const sameItems = (left: readonly unknown[], right: readonly unknown[], inside: readonly unknown[]): boolean =>
  left.length === right.length && left.every((item, index) => sameValue(item, right[index], inside));

/** A record of keys: an object made by `{}` or with no prototype. Any other object is one thing, and is only itself. */
const isBare = (value: object): value is Record<string, unknown> => {
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === null || proto === Object.prototype;
};

/** Whether two records have the same own keys, in any order, with the same values. */
const sameMembers = (left: Record<string, unknown>, right: Record<string, unknown>, inside: readonly unknown[]): boolean => {
  const keys = Object.keys(left);
  // eslint-disable-next-line conventions/consistent-existence-index-check -- own keys only, as `uniqueItems` compares JSON objects: an inherited key is no member
  return keys.length === Object.keys(right).length && keys.every((key) => Object.hasOwn(right, key) && sameValue(left[key], right[key], inside));
};

/** Whether two objects that are not one object are the same value: two arrays, two dates or two records. */
const sameObject = (left: object, right: object, inside: readonly unknown[]): boolean => {
  // A value that holds itself is met again on the way down: it is the same as nothing but itself, which was asked first.
  if (inside.includes(left)) return false;
  if (Array.isArray(left)) return Array.isArray(right) && sameItems(left, right, [...inside, left]);
  if (left instanceof Date) return right instanceof Date && Object.is(left.getTime(), right.getTime());
  return isBare(left) && !Array.isArray(right) && isBare(right) && sameMembers(left, right, [...inside, left]);
};

/**
 * Whether two values are the same value, as JSON Schema's `uniqueItems` asks it (draft 2020-12
 * §4.2.2): numbers by their mathematical value, arrays item by item, objects key by key in any
 * order. Outside JSON: `NaN` is the same as `NaN` and `-0` as `0`, as a `Set` has them; two dates
 * are the same when they are the same time; a `Map`, a `Set`, a function, a symbol or an instance
 * of a class is the same as itself alone; and `1n` is not `1`.
 */
/** Whether a value is an object of any kind: what `sameObject` can be asked about. */
const isAnObject = (value: unknown): value is object => typeof value === 'object' && value !== null;

function sameValue(left: unknown, right: unknown, inside: readonly unknown[]): boolean {
  if (left === right || Object.is(left, right)) return true;
  return isAnObject(left) && isAnObject(right) && sameObject(left, right, inside);
}

/**
 * The index of the first item that is the same value as an earlier one, or -1. A value that is no
 * object is looked up in a set, so an array of strings and numbers is read in time proportional to
 * its length. An object is compared with every object before it: for an array of `k` objects that
 * is `k × (k - 1) / 2` comparisons at worst, each as deep as the objects are alike.
 */
const repeated = (items: readonly unknown[]): number => {
  const plain = new Set<unknown>();
  // Stryker disable next-line ArrayDeclaration: equivalent, no item is the same value as a string that is not among the items
  const objects: object[] = [];
  for (let index = 0; index < items.length; index++) {
    const item: unknown = items[index];
    // Stryker disable next-line LogicalOperator,ConditionalExpression: equivalent, the set is the fast path; `sameValue` gives a value that is no object the same answer, slower
    if (typeof item !== 'object' || item === null) {
      if (plain.has(item)) return index;
      plain.add(item);
    } else {
      // Stryker disable next-line ArrayDeclaration: equivalent, a string is never the object being compared
      if (objects.some((earlier) => sameValue(item, earlier, []))) return index;
      objects.push(item);
    }
  }
  return -1;
};

/** An array the wrapped schema accepts, with no two items the same value: JSON Schema's `uniqueItems`. */
const isUnique = (schema: Node, value: unknown): boolean => Array.isArray(value) && run(schema.item as Node, value) && repeated(value) === -1;

/** A value the schema in `key` refuses. */
const isNot = (schema: Node, value: unknown): boolean => !run(schema.key as Node, value);

/** A value exactly one member accepts: the second to accept it settles the answer. */
const isOne = (schema: Node, value: unknown): boolean => {
  const members = schema.fields as readonly Node[];
  let count = 0;
  for (let index = 0; index < members.length; index++) {
    if (!run(members[index] as Node, value)) continue;
    count += 1;
    // Stryker disable next-line ConditionalExpression: equivalent, the count only grows, and the last line refuses any count but one; this stops at the second
    if (count > 1) return false;
  }
  return count === 1;
};

/** Whether `value` is what the schema describes. A type guard, so a passing check narrows. */
const check = <T>(schema: Schema<T, unknown>, value: unknown): value is T => schema.check(schema, value);

export {
  check,
  isAnything,
  isArray,
  isBigint,
  isBoolean,
  isCase,
  isClosed,
  isContaining,
  isCounted,
  isCustom,
  isDate,
  isEnding,
  isEvery,
  isHolding,
  isInstance,
  isLater,
  isLiteral,
  isMap,
  isMapped,
  isMember,
  isMultiple,
  isNan,
  isNot,
  isNothing,
  isNullable,
  isNullish,
  isNumber,
  isObject,
  isOne,
  isRecord,
  isRefined,
  isSet,
  isStarting,
  isString,
  isTemplate,
  isTuple,
  isTypeOf,
  isUnion,
  isUnique,
  keyCount,
  matches,
  matching,
  points,
  repeated,
  type Step,
};
