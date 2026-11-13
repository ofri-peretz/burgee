import { type Issue, type IssueOptions, issues } from './issues.js';
import { type Kind, type Node, type Out, type Schema } from './schema.js';

/**
 * The parse path: the value a schema's defaults, stripping and coercion produce, then `check` on
 * that value, then the schema's transforms on what `check` accepted. `check` itself stays a guard
 * that reads and never writes.
 *
 * It returns the input itself when nothing changed, and a copy only of what did (parity.md decision
 * 10): the caller's object is never written to.
 */

type Parsed<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly issues: Issue[] };

interface ParseOptions extends IssueOptions {
  /**
   * Hand out a new object or array for every one the schema describes, changed or not, as zod and
   * valibot always do. Without it the input itself comes back wherever nothing changed. What an
   * `unknown` schema lets through is never copied: nothing describes it.
   */
  readonly copy?: boolean;
}

/** One walk over a value. `parse` makes two: one before `check`, and one after it when there is a transform to run. */
interface Pass {
  /** The walk after `check`: every value is one its schema accepted, and transforms run. */
  late: boolean;
  /** Every object and array the schema describes is rebuilt, changed or not. */
  readonly copy: boolean;
  /** Set by the first walk when it meets a transform: what makes the second worth making. */
  met: boolean;
}

type Members = Record<string, unknown>;

const isMembers = (value: unknown): value is Members => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The whole of what coercion reads as a number (parity.md decision 12): a JSON number, RFC 8259 §6.
 * So no empty string, no spaces, no leading plus or zero, no hex, no `Infinity`, and nothing that is
 * not a string. The five libraries agree on exactly these and on nothing wider.
 */
const JSON_NUMBER = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/u;

/**
 * The shape of what coercion reads as a date (parity.md decision 12): an RFC 3339 `full-date`, or a
 * `date-time` with its `T`, its seconds and its offset (§5.6). So no bare time, no missing zone, no
 * space for the `T`, no `+0200`, no locale form such as `01/02/2020`, no number and no null: the
 * four libraries that coerce dates agree on the two forms here and split on every one of those.
 * `T` and `Z` are upper case, which RFC 3339 prefers and ECMAScript's own date-time format
 * requires: a lower-case one is read by some engines and not by others.
 *
 * The shape leaves the month and the day to `Date`, which is asked afterwards whether the day it
 * arrived at is the day that was written: `2020-02-30` is read by the engine as the first of March.
 */
const RFC3339 = /^\d{4}-\d\d-\d\d(?:T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d))?$/u;

/** The length of a full-date: `2020-01-01`. */
const DATE_LENGTH = 10;

/** No own key of the original is kept: the copy is made of the changes alone. */
const NONE: ReadonlySet<unknown> = new Set();

const same = (_: Node, value: unknown): unknown => value;

/** A number read from a string, where the schema asks and the text is a JSON number that a double can hold. */
const number = (schema: Node, value: unknown): unknown => {
  if (!schema.coerce || typeof value !== 'string' || !JSON_NUMBER.test(value)) return value;
  const read = Number(value);
  return Number.isFinite(read) ? read : value;
};

/**
 * A boolean read from a string, where the schema asks: `true` and `false`, JSON's two (RFC 8259
 * §3), exactly. Not `1`, `yes`, `on`, `TRUE` or the empty string, on which the libraries split, and
 * never by truthiness, which makes the string `false` true.
 */
const boolean = (schema: Node, value: unknown): unknown => {
  if (!schema.coerce || (value !== 'true' && value !== 'false')) return value;
  return value === 'true';
};

/** A date read from a string, where the schema asks and the text is an RFC 3339 date or date-time on a day the calendar has. */
const date = (schema: Node, value: unknown): unknown => {
  if (!schema.coerce || typeof value !== 'string' || !RFC3339.test(value)) return value;
  const day = value.slice(0, DATE_LENGTH);
  const midnight = new Date(`${day}T00:00:00Z`);
  // The engine rolls a day the month does not have into the next month; then the day it gives back is not the day written.
  if (Number.isNaN(midnight.getTime()) || midnight.toISOString().slice(0, DATE_LENGTH) !== day) return value;
  return new Date(value);
};

/** The items an array's schemas produce: `value` itself when none changed. `of` gives the schema at an index. */
const items = (value: readonly unknown[], count: number, of: (index: number) => Node, pass: Pass): unknown => {
  let out: unknown[] | null = pass.copy ? [...value] : null;
  for (let index = 0; index < count; index++) {
    const before: unknown = value[index];
    const after = fill(of(index), before, pass);
    if (Object.is(after, before)) continue;
    out ??= [...value];
    out[index] = after;
  }
  return out ?? value;
};

const array = (schema: Node, value: unknown, pass: Pass): unknown =>
  Array.isArray(value) ? items(value, value.length, () => schema.item as Node, pass) : value;

// Only as many items as the tuple has and the value has, unless it has a schema for the rest: a tuple of the wrong length fails as it arrived.
const tuple = (schema: Node, value: unknown, pass: Pass): unknown => {
  const fields = schema.fields as readonly Node[];
  const rest = schema.item;
  if (!Array.isArray(value)) return value;
  return items(value, rest === null ? Math.min(value.length, fields.length) : value.length, (index) => (fields[index] ?? rest) as Node, pass);
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

/** Where a member's change is noted, and the walk it is made on. */
interface Notes {
  readonly changed: Map<string, unknown>;
  readonly pass: Pass;
}

/** Notes under `key` what a schema makes of a member, when that is not the member itself. */
const note = (notes: Notes, key: string, schema: Node, before: unknown): void => {
  const after = fill(schema, before, notes.pass);
  if (!Object.is(after, before)) notes.changed.set(key, after);
};

const object = (schema: Node, value: unknown, pass: Pass): unknown => {
  if (!isMembers(value)) return value;
  const fields = schema.fields as readonly Node[];
  const notes: Notes = { changed: new Map(), pass };
  for (const [index, key] of (schema.keys as readonly string[]).entries()) {
    const member = value[key];
    // After `check`, a named key that is `undefined` is one its schema never saw: the key was allowed to be absent. No transform is owed it.
    if (!pass.late || member !== undefined) note(notes, key, fields[index] as Node, member);
  }
  // An object that keeps unnamed keys as they are has no set of its own keys, and nothing to do with the others.
  const { item, values } = schema;
  const others = Object.keys(value).filter((key) => values?.has(key) === false);
  if (item !== null) for (const key of others) note(notes, key, item, value[key]);
  const strip = schema.unknown === 'strip' && others.length > 0;
  if (notes.changed.size === 0 && !strip && !pass.copy) return value;
  return rebuilt(value, notes.changed, strip ? values : null);
};

const record = (schema: Node, value: unknown, pass: Pass): unknown => {
  if (!isMembers(value)) return value;
  const notes: Notes = { changed: new Map(), pass };
  for (const key of Object.keys(value)) note(notes, key, schema.item as Node, value[key]);
  return notes.changed.size === 0 && !pass.copy ? value : rebuilt(value, notes.changed, null);
};

/** `nullable` adds nothing of its own, and `null` is no schema's to change: what it wraps never saw it. */
const nullable = (schema: Node, value: unknown, pass: Pass): unknown => (value === null ? value : fill(schema.item as Node, value, pass));

/** The same, and `undefined` is only a default's to change: after `check` what it wraps never saw that either. */
const nullish = (schema: Node, value: unknown, pass: Pass): unknown =>
  value === null || (value === undefined && pass.late) ? value : fill(schema.item as Node, value, pass);

const picked = (schema: Node, value: unknown, pass: Pass): unknown => {
  // A tag that picks no case fails `check`, so what is made of the value then does not matter.
  const chosen = isMembers(value) ? (schema.cases as ReadonlyMap<unknown, Node>).get(value[schema.tag as string]) : undefined;
  return chosen === undefined ? value : fill(chosen, value, pass);
};

/**
 * The first member whose own output it then accepts decides: the order of a union's members is the
 * order of trying. After `check` the value is already that output, so the first member to accept it
 * as it stands is the one whose transforms run.
 */
const first = (schema: Node, value: unknown, pass: Pass): unknown => {
  for (const member of schema.fields as readonly Node[]) {
    if (pass.late) {
      if (member.check(member, value)) return fill(member, value, pass);
      continue;
    }
    const out = fill(member, value, pass);
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
const merged = (schema: Node, value: unknown, pass: Pass): unknown => {
  const outs = (schema.fields as readonly Node[]).map((member) => fill(member, value, pass));
  const moved = outs.filter((out) => !Object.is(out, value));
  if (moved.length === 0) return value;
  if (!isMembers(value)) return moved.at(-1);
  const changed = new Map<string, unknown>();
  for (const out of outs) {
    // What a schema makes of an object is that object or a copy of it, unless a transform made something else of it: that is kept whole.
    if (!isMembers(out)) return out;
    for (const [key, after] of Object.entries(out)) if (!changed.has(key) || !Object.is(after, value[key])) changed.set(key, after);
  }
  return rebuilt(value, changed, NONE);
};

const later = (schema: Node, value: unknown, pass: Pass): unknown => fill((schema.get as () => Node)(), value, pass);

/** What a refinement or, before `check`, a transform wraps is filled as if it stood alone. */
const inner = (schema: Node, value: unknown, pass: Pass): unknown => fill(schema.item as Node, value, pass);

/** A transform's map runs after `check`, on what the schema it wraps then produces. Before it, the walk only notes that there is one. */
const mapped = (schema: Node, value: unknown, pass: Pass): unknown => {
  const out = inner(schema, value, pass);
  if (pass.late) return (schema.value as (value: unknown) => unknown)(out);
  pass.met = true;
  return out;
};

/** One per kind, as `issues` has: only a program that imports `parse` carries the table. */
const FILLERS: Readonly<Record<Kind, (schema: Node, value: unknown, pass: Pass) => unknown>> = {
  string: same,
  number,
  boolean,
  literal: same,
  enum: same,
  array,
  object,
  discriminated: picked,
  unknown: same,
  never: same,
  record,
  tuple,
  nullable,
  nullish,
  union: first,
  intersection: merged,
  lazy: later,
  custom: same,
  bigint: same,
  date,
  type: same,
  instance: same,
  refine: inner,
  transform: mapped,
};

/**
 * What the kind makes of the value, or, where `undefined` arrived and the schema has a default, of
 * that default: it stands for the input that was not there, so a transform runs on it too.
 */
function fill(schema: Node, value: unknown, pass: Pass): unknown {
  return FILLERS[schema.kind](schema, value === undefined ? schema.default : value, pass);
}

/**
 * The value the schema produces from `value`, or every reason there is none. `value` is the input
 * itself unless a default, a stripped key, a coercion or a transform changed something, or `copy`
 * was asked for.
 *
 * `check` and the input type describe the input. A schema that coerces therefore parses a value
 * `check` refuses: `parse(number({ coerce: true }), '42')` is 42, and `check` of '42' is false. A
 * transform runs last, and only on a value the whole schema accepted.
 */
const parse = <T, O>(schema: Schema<T, O>, value: unknown, options: ParseOptions = {}): Parsed<Out<T, O>> => {
  const pass: Pass = { late: false, copy: options.copy === true, met: false };
  const filled = fill(schema, value, pass);
  if (!schema.check(schema, filled)) return { ok: false, issues: issues(schema, filled, options) };
  // A schema with no transform in it is walked once.
  if (!pass.met) return { ok: true, value: filled as Out<T, O> };
  pass.late = true;
  return { ok: true, value: fill(schema, filled, pass) as Out<T, O> };
};

export { parse, type Parsed, type ParseOptions };
