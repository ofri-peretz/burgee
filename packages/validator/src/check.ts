import { type Node, type Schema } from './schema.js';

/**
 * The first pass (spec.md R6): yes or no, and nothing allocated on a yes. No `eval` (R3).
 * `issues` is the second pass and runs only after a no.
 *
 * One function per kind, called from one `switch`: each stays small enough to inline, and every
 * call site sees one kind.
 */

const isString = (schema: Node, value: unknown): boolean =>
  typeof value === 'string' &&
  value.length >= schema.min &&
  value.length <= schema.max &&
  (schema.pattern === null || schema.pattern.test(value));

// The default bounds are the largest finite numbers, so `NaN` and the infinities fail the comparisons.
const isNumber = (schema: Node, value: unknown): boolean =>
  typeof value === 'number' && value >= schema.min && value <= schema.max && (!schema.int || Number.isInteger(value));

const isRecord = (value: unknown): value is Record<string, unknown> =>
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
  if (!isRecord(value)) return false;
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
  if (!isRecord(value)) return false;
  const tag = value[schema.tag as string];
  const cases = schema.cases as Readonly<Record<string, Node>>;
  // eslint-disable-next-line conventions/consistent-existence-index-check -- Own cases only: a tag of "toString" must not pick an inherited function
  return typeof tag === 'string' && Object.hasOwn(cases, tag) && run(cases[tag] as Node, value);
};

function run(schema: Node, value: unknown): boolean {
  switch (schema.kind) {
    case 'string': {
      return isString(schema, value);
    }
    case 'number': {
      return isNumber(schema, value);
    }
    case 'boolean': {
      return typeof value === 'boolean';
    }
    case 'literal': {
      return value === schema.value;
    }
    case 'enum': {
      return (schema.values as ReadonlySet<unknown>).has(value);
    }
    case 'array': {
      return isArray(schema, value);
    }
    case 'object': {
      return isObject(schema, value);
    }
    case 'discriminated': {
      return isCase(schema, value);
    }
  }
}

/** Whether `value` is what the schema describes. A type guard, so a passing check narrows. */
export const check = <T>(schema: Schema<T>, value: unknown): value is T => run(schema, value);
