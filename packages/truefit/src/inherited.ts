import { isClosed, isObject } from './check.js';
import { type Check, type Node } from './schema.js';

/**
 * Internal, and not part of the package's API: how a shape reads a key Object.prototype also has
 * (#1620). Read as `value[key]`, `{}` held `__proto__`, `toString`, `constructor` and the rest
 * through its prototype, so a required one passed on any object. Such a key counts only as an own
 * key. Any other key is read as before, so a getter a class puts on its prototype still counts.
 *
 * Only a shape that names one of them pays for it: `object` picks `isOwnObject` or `isOwnClosed` for
 * it when it is built. Checked per key on every shape, the guard cost 28% of `check`'s throughput
 * on an order schema (7.43M against 5.36M validations a second, 2026-11-18); `isObject` is untouched.
 */
const INHERITED: ReadonlySet<string> = new Set(Object.getOwnPropertyNames(Object.prototype));

/** Whether a shape with these keys reads them as own keys. */
const inheritsAny = (keys: readonly string[]): boolean => keys.some((key) => INHERITED.has(key));

/** The member a shape names, as the value holds it. */
// eslint-disable-next-line conventions/consistent-existence-index-check -- on purpose: own only for Object.prototype's names, inherited for any other key
const memberOf = (value: Record<string, unknown>, key: string): unknown => (INHERITED.has(key) && !Object.hasOwn(value, key) ? undefined : value[key]);

/** Whether the value has the key at all, `undefined` or not. */
// eslint-disable-next-line conventions/consistent-existence-index-check -- on purpose: own only for Object.prototype's names, inherited for any other key
const holds = (value: Record<string, unknown>, key: string): boolean => (INHERITED.has(key) ? Object.hasOwn(value, key) : key in value);

const isMembers = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** `isObject` for a shape that names one of Object.prototype's keys. */
const isOwnObject = (schema: Node, value: unknown): boolean => {
  if (!isMembers(value)) return false;
  const keys = schema.keys as readonly string[];
  const fields = schema.fields as readonly Node[];
  for (let index = 0; index < keys.length; index++) {
    const field = fields[index] as Node;
    const key = keys[index] as string;
    const member = memberOf(value, key);
    if (member === undefined ? field.optional !== true && (field.optional === false || holds(value, key)) : !field.check(field, member)) return false;
  }
  return true;
};

/** `isClosed` for such a shape: its keys as `isOwnObject` reads them, then no other key, or each other key held to `item`. */
const isOwnClosed = (schema: Node, value: unknown): boolean => {
  if (!isOwnObject(schema, value)) return false;
  const named = schema.values as ReadonlySet<unknown>;
  const rest = schema.item;
  const members = value as Record<string, unknown>;
  for (const name in members) if (!named.has(name) && (rest === null || !rest.check(rest, members[name]))) return false;
  return true;
};

/** The check an object node with these keys gets: closed (strict, or with a schema for the rest) or not. */
const objectCheck = (keys: readonly string[], closed: boolean): Check => {
  if (closed) return inheritsAny(keys) ? isOwnClosed : isClosed;
  return inheritsAny(keys) ? isOwnObject : isObject;
};

/** Whether `issues` and `parse` must read this object node's keys as own keys. */
// Stryker disable next-line ConditionalExpression: equivalent, reading every node's keys as own keys reads any key not Object.prototype's exactly as `value[key]` and `in` do; only the speed differs
const readsOwn = (schema: Node): boolean => schema.check === isOwnObject || schema.check === isOwnClosed;

export { holds, isOwnClosed, memberOf, objectCheck, readsOwn };
