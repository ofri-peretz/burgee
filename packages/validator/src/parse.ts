import { type Issue, type IssueOptions, issues } from './issues.js';
import { type Kind, type Node, type Out, type Schema } from './schema.js';

/**
 * The parse path: the value a schema's defaults, stripping and coercion produce, then `check` on
 * that value. `check` itself stays a guard that reads and never writes.
 *
 * It returns the input itself when nothing changed, and a copy only of what did (parity.md decision
 * 10): the caller's object is never written to.
 */

type Parsed<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly issues: Issue[] };

type Members = Record<string, unknown>;

const isMembers = (value: unknown): value is Members => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The whole of what coercion reads as a number (parity.md decision 12): a JSON number, RFC 8259 §6.
 * So no empty string, no spaces, no leading plus or zero, no hex, no `Infinity`, and nothing that is
 * not a string. The five libraries agree on exactly these and on nothing wider.
 */
const JSON_NUMBER = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/u;

/** No own key of the original is kept: the copy is made of the changes alone. */
const NONE: ReadonlySet<unknown> = new Set();

const same = (_: Node, value: unknown): unknown => value;

/** A number read from a string, where the schema asks and the text is a JSON number that a double can hold. */
const number = (schema: Node, value: unknown): unknown => {
  if (!schema.coerce || typeof value !== 'string' || !JSON_NUMBER.test(value)) return value;
  const read = Number(value);
  return Number.isFinite(read) ? read : value;
};

/** The items an array's schemas produce: `value` itself when none changed. `of` gives the schema at an index. */
const items = (value: readonly unknown[], count: number, of: (index: number) => Node): unknown => {
  let out: unknown[] | null = null;
  for (let index = 0; index < count; index++) {
    const before: unknown = value[index];
    const after = fill(of(index), before);
    if (Object.is(after, before)) continue;
    out ??= [...value];
    out[index] = after;
  }
  return out ?? value;
};

const array = (schema: Node, value: unknown): unknown =>
  Array.isArray(value) ? items(value, value.length, () => schema.item as Node) : value;

// Only as many items as the tuple has and the value has, unless it has a schema for the rest: a tuple of the wrong length fails as it arrived.
const tuple = (schema: Node, value: unknown): unknown => {
  const fields = schema.fields as readonly Node[];
  const rest = schema.item;
  if (!Array.isArray(value)) return value;
  return items(value, rest === null ? Math.min(value.length, fields.length) : value.length, (index) => (fields[index] ?? rest) as Node);
};

/**
 * A copy of an object with some members replaced and, when `only` is given, no own key outside it.
 * Built from entries, so a key named `__proto__` is a member like any other, and given the
 * original's prototype, so what the original inherits the copy inherits.
 */
const rebuilt = (value: Members, changed: ReadonlyMap<string, unknown>, only: ReadonlySet<unknown> | null): Members => {
  const kept = Object.entries(value).filter(([key]) => only === null || only.has(key));
  return Object.setPrototypeOf(Object.fromEntries([...kept, ...changed]), Object.getPrototypeOf(value) as object | null) as Members;
};

/** Notes under `key` what a schema makes of a member, when that is not the member itself. */
const note = (changed: Map<string, unknown>, key: string, schema: Node, before: unknown): void => {
  const after = fill(schema, before);
  if (!Object.is(after, before)) changed.set(key, after);
};

const object = (schema: Node, value: unknown): unknown => {
  if (!isMembers(value)) return value;
  const fields = schema.fields as readonly Node[];
  const changed = new Map<string, unknown>();
  for (const [index, key] of (schema.keys as readonly string[]).entries()) note(changed, key, fields[index] as Node, value[key]);
  // An object that keeps unnamed keys as they are has no set of its own keys, and nothing to do with the others.
  const { item, values } = schema;
  const others = Object.keys(value).filter((key) => values?.has(key) === false);
  if (item !== null) for (const key of others) note(changed, key, item, value[key]);
  const strip = schema.unknown === 'strip' && others.length > 0;
  if (changed.size === 0 && !strip) return value;
  return rebuilt(value, changed, strip ? values : null);
};

const record = (schema: Node, value: unknown): unknown => {
  if (!isMembers(value)) return value;
  const changed = new Map<string, unknown>();
  for (const key of Object.keys(value)) note(changed, key, schema.item as Node, value[key]);
  return changed.size === 0 ? value : rebuilt(value, changed, null);
};

/** `nullable` and `nullish` add nothing of their own: `null` is no schema's to change, and `undefined` only a default's. */
const wrapped = (schema: Node, value: unknown): unknown => fill(schema.item as Node, value);

const picked = (schema: Node, value: unknown): unknown => {
  // A tag that picks no case fails `check`, so what is made of the value then does not matter.
  const chosen = isMembers(value) ? (schema.cases as ReadonlyMap<unknown, Node>).get(value[schema.tag as string]) : undefined;
  return chosen === undefined ? value : fill(chosen, value);
};

/** The first member whose own output it then accepts decides: the order of a union's members is the order of trying. */
const first = (schema: Node, value: unknown): unknown => {
  for (const member of schema.fields as readonly Node[]) {
    const out = fill(member, value);
    if (member.check(member, out)) return out;
  }
  return value;
};

/**
 * Every member reads the input, not what the member before it produced, so one member that strips
 * does not take away what the next one needs. Objects are then merged one level deep: a key any
 * member kept is kept, and a member that changed a key's value wins over one that left it alone.
 * For anything else the last member to change the value decides.
 */
const merged = (schema: Node, value: unknown): unknown => {
  const outs = (schema.fields as readonly Node[]).map((member) => fill(member, value));
  const moved = outs.filter((out) => !Object.is(out, value));
  if (moved.length === 0) return value;
  if (!isMembers(value)) return moved.at(-1);
  const changed = new Map<string, unknown>();
  for (const out of outs) {
    // What a schema makes of an object is that object or a copy of it.
    for (const [key, after] of Object.entries(out as Members)) if (!changed.has(key) || !Object.is(after, value[key])) changed.set(key, after);
  }
  return rebuilt(value, changed, NONE);
};

const later = (schema: Node, value: unknown): unknown => fill((schema.get as () => Node)(), value);

/** One per kind, as `issues` has: only a program that imports `parse` carries the table. */
const FILLERS: Readonly<Record<Kind, (schema: Node, value: unknown) => unknown>> = {
  string: same,
  number,
  boolean: same,
  literal: same,
  enum: same,
  array,
  object,
  discriminated: picked,
  unknown: same,
  never: same,
  record,
  tuple,
  nullable: wrapped,
  nullish: wrapped,
  union: first,
  intersection: merged,
  lazy: later,
  custom: same,
  bigint: same,
  date: same,
  type: same,
  instance: same,
};

/** The default where `undefined` arrived and the schema has one; otherwise what the kind makes of the value. */
function fill(schema: Node, value: unknown): unknown {
  return value === undefined && schema.default !== undefined ? schema.default : FILLERS[schema.kind](schema, value);
}

/**
 * The value the schema produces from `value`, or every reason there is none. `value` is the input
 * itself unless a default, a stripped key or a coercion changed something.
 *
 * `check` and the inferred type describe the input. A schema that coerces therefore parses a value
 * `check` refuses: `parse(number({ coerce: true }), '42')` is 42, and `check` of '42' is false.
 */
const parse = <T, O>(schema: Schema<T, O>, value: unknown, options: IssueOptions = {}): Parsed<Out<T, O>> => {
  const out = fill(schema, value);
  return schema.check(schema, out) ? { ok: true, value: out as Out<T, O> } : { ok: false, issues: issues(schema, out, options) };
};

export { parse, type Parsed };
