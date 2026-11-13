import { keyCount } from './check.js';
import { type Filler, type Issue, type Node, type Own, type Pass, type Reader, type Rule, type Test, type Walk } from './schema.js';

/**
 * What a kind brings for `issues` and for `parse` (parity.md, "a bundle carries only the kinds its
 * schemas use"): one frozen pair per kind, put on the node by the kind's builder. `issues` and
 * `parse` read the eight kinds of the design's first step themselves and ask the node for every
 * other, so they do not grow with the number of kinds.
 *
 * Nothing here imports `issues` or `parse`: a reader reaches them through the walk it is handed.
 * So a program that only ever calls `check` carries, of a kind it builds, the few lines below for
 * it and no more. Each pair is marked free of side effects, since freezing is a call a bundler
 * cannot see through; own.test.ts holds the marks.
 */

type Members = Record<string, unknown>;

const isMembers = (value: unknown): value is Members => typeof value === 'object' && value !== null && !Array.isArray(value);

/** A key as a JSON Pointer reference token (RFC 6901 §3). */
const token = (key: string | number): string => `/${String(key).replaceAll('~', '~0').replaceAll('/', '~1')}`;

/** A value a schema names, for a message, as it is written in code: "1", 1 and 1n read differently. */
const named = (value: unknown): string => {
  if (typeof value === 'string') return JSON.stringify(value);
  return typeof value === 'bigint' ? `${String(value)}n` : String(value);
};

/** Whether a walk that stops at the first issue has it. */
const full = (walk: Walk): boolean => walk.first && walk.found.length > 0;

/**
 * The message that refuses a node whose kind the reader has nothing for: a node is data, and may
 * have been built by hand. A kind is looked up among a reader's own kinds only, so one named
 * `constructor` finds nothing; and it is printed only when it is a string, since printing an object
 * runs its `toString`.
 */
const noKind = (kind: unknown): string =>
  `cannot read a node of the kind ${typeof kind === 'string' ? JSON.stringify(kind) : `that is a value of the type ${typeof kind}`}: no builder makes it. fix: build the schema with the builders`;

const same: Filler = (_, value) => value;

/**
 * What a schema makes of a member of the value, with the member's key noted for as long as it
 * takes: `pass.at` is where the walk is, which is what a pipe's second schema and a rule that is
 * awaited report their issues under.
 */
const under = (pass: Pass, key: unknown, schema: Node, value: unknown): unknown => {
  pass.at.push(key);
  const out = pass.fill(schema, value, pass);
  pass.at.pop();
  return out;
};

/** The items an array's schemas produce: `value` itself when none changed. `of` gives the schema at an index. */
const items = (value: readonly unknown[], count: number, of: (index: number) => Node, pass: Pass): unknown => {
  let out: unknown[] | null = pass.copy ? [...value] : null;
  for (let index = 0; index < count; index++) {
    const before: unknown = value[index];
    const after = under(pass, index, of(index), before);
    if (Object.is(after, before)) continue;
    out ??= [...value];
    out[index] = after;
  }
  return out ?? value;
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
  const after = under(notes.pass, key, schema, before);
  if (!Object.is(after, before)) notes.changed.set(key, after);
};

const nothing: Reader = () => {
  // Every value is what `unknown` describes.
};

const UNKNOWN: Own = /* @__PURE__ */ Object.freeze({ issues: nothing, fill: same });

const never: Reader = (walk, _, got, path) => {
  walk.add(walk, { path, keyword: 'never', expected: 'no value', got, fix: 'remove it' });
};

const NEVER: Own = /* @__PURE__ */ Object.freeze({ issues: never, fill: same });

const record: Reader = (walk, schema, got, path) => {
  if (!isMembers(got)) {
    walk.add(walk, { path, keyword: 'type', expected: 'an object', got, fix: 'send an object' });
    return;
  }
  const { key } = schema;
  for (const name in got) {
    const at = path + token(name);
    if (key !== null && !key.check(key, name) && !full(walk)) {
      walk.add(walk, { path: at, keyword: 'key', expected: 'a key the record allows', got: name, fix: 'rename the key, or remove it' });
    }
    walk.visit(walk, schema.item as Node, got[name], at);
  }
};

const recordFill: Filler = (schema, value, pass) => {
  if (!isMembers(value)) return value;
  const notes: Notes = { changed: new Map(), pass };
  for (const key of Object.keys(value)) note(notes, key, schema.item as Node, value[key]);
  return notes.changed.size === 0 && !pass.copy ? value : rebuilt(value, notes.changed, null);
};

const RECORD: Own = /* @__PURE__ */ Object.freeze({ issues: record, fill: recordFill });

const tuple: Reader = (walk, schema, got, path) => {
  if (!Array.isArray(got)) {
    walk.add(walk, { path, keyword: 'type', expected: 'an array', got, fix: 'send an array' });
    return;
  }
  const fields = schema.fields as readonly Node[];
  const rest = schema.item;
  const count = String(fields.length);
  if (rest === null && got.length !== fields.length) walk.add(walk, { path, keyword: 'length', expected: `exactly ${count} items`, got, fix: `send ${count}` });
  else if (got.length < fields.length) walk.add(walk, { path, keyword: 'length', expected: `at least ${count} items`, got, fix: `send ${count} or more` });
  for (const [index, element] of got.entries()) {
    const field = fields[index] ?? rest;
    if (field !== null) walk.visit(walk, field, element, path + token(index));
  }
};

// Only as many items as the tuple has and the value has, unless it has a schema for the rest: a tuple of the wrong length fails as it arrived.
const tupleFill: Filler = (schema, value, pass) => {
  const fields = schema.fields as readonly Node[];
  const rest = schema.item;
  if (!Array.isArray(value)) return value;
  return items(value, rest === null ? Math.min(value.length, fields.length) : value.length, (index) => (fields[index] ?? rest) as Node, pass);
};

const TUPLE: Own = /* @__PURE__ */ Object.freeze({ issues: tuple, fill: tupleFill });

const nullable: Reader = (walk, schema, got, path) => {
  if (got !== null) walk.visit(walk, schema.item as Node, got, path);
};

/** `nullable` adds nothing of its own, and `null` is no schema's to change: what it wraps never saw it. */
const nullableFill: Filler = (schema, value, pass) => (value === null ? value : pass.fill(schema.item as Node, value, pass));

const NULLABLE: Own = /* @__PURE__ */ Object.freeze({ issues: nullable, fill: nullableFill });

const nullish: Reader = (walk, schema, got, path) => {
  if (got !== null && got !== undefined) walk.visit(walk, schema.item as Node, got, path);
};

/** The same, and `undefined` is only a default's to change: after `check` what it wraps never saw that either. */
const nullishFill: Filler = (schema, value, pass) => (value === null || (value === undefined && pass.late) ? value : pass.fill(schema.item as Node, value, pass));

const NULLISH: Own = /* @__PURE__ */ Object.freeze({ issues: nullish, fill: nullishFill });

/**
 * One issue for the whole union, since no single member is the one that was meant. Its `fix:` line
 * says where each member first fails, which is what tells a caller which one it was nearest to.
 */
const union: Reader = (walk, schema, got, path) => {
  const members = schema.fields as readonly Node[];
  const misses: string[] = [];
  for (const [index, member] of members.entries()) {
    // Stryker disable next-line BooleanLiteral: equivalent, only the member's first issue is read; stopping there saves finding the rest
    const inner: Walk = { ...walk, found: [], first: true, message: undefined };
    walk.visit(inner, member, got, path);
    const [miss] = inner.found;
    if (miss === undefined) return;
    misses.push(`member ${String(index)} fails ${miss.keyword} at "${miss.path}"`);
  }
  const count = String(members.length);
  walk.add(walk, { path, keyword: 'union', expected: `a value one of ${count} members accepts`, got, fix: ['satisfy one of them', ...misses].join('; ') });
};

/**
 * The first member whose own output it then accepts decides: the order of a union's members is the
 * order of trying. After `check` the value is already that output, so the first member to accept it
 * as it stands is the one whose transforms run.
 */
const first: Filler = (schema, value, pass) => {
  for (const member of schema.fields as readonly Node[]) {
    if (pass.late) {
      if (member.check(member, value)) return pass.fill(member, value, pass);
      continue;
    }
    const out = pass.fill(member, value, pass);
    if (member.check(member, out)) return out;
  }
  return value;
};

const UNION: Own = /* @__PURE__ */ Object.freeze({ issues: union, fill: first });

const every: Reader = (walk, schema, got, path) => {
  for (const member of schema.fields as readonly Node[]) walk.visit(walk, member, got, path);
};

/** No own key of the original is kept: the copy is made of the changes alone. */
const NONE: ReadonlySet<unknown> = /* @__PURE__ */ new Set();

/**
 * Every member reads the input, not what the member before it produced, so one member that strips
 * does not take away what the next one needs. Objects are then merged one level deep: a key any
 * member kept is kept, and a member that changed a key's value wins over one that left it alone.
 * For anything else the last member to change the value decides.
 */
const merged: Filler = (schema, value, pass) => {
  const outs = (schema.fields as readonly Node[]).map((member) => pass.fill(member, value, pass));
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

const EVERY: Own = /* @__PURE__ */ Object.freeze({ issues: every, fill: merged });

const later: Reader = (walk, schema, got, path) => {
  walk.visit(walk, (schema.get as () => Node)(), got, path);
};

const laterFill: Filler = (schema, value, pass) => pass.fill((schema.get as () => Node)(), value, pass);

const LATER: Own = /* @__PURE__ */ Object.freeze({ issues: later, fill: laterFill });

const custom: Reader = (walk, schema, got, path) => {
  const { name, test } = schema.rule as Rule;
  if ((test as Test)(got) !== true) walk.add(walk, { path, keyword: 'custom', expected: name, got, fix: `send a value that is ${name}` });
};

const CUSTOM: Own = /* @__PURE__ */ Object.freeze({ issues: custom, fill: same });

const bigint: Reader = (walk, schema, got, path) => {
  const [min, max] = schema.value as readonly [bigint | number, bigint | number];
  if (typeof got !== 'bigint') walk.add(walk, { path, keyword: 'type', expected: 'a bigint', got, fix: 'send a bigint' });
  else if (got < min) walk.add(walk, { path, keyword: 'min', expected: `a bigint of at least ${named(min)}`, got, fix: `send ${named(min)} or more` });
  else if (got > max) walk.add(walk, { path, keyword: 'max', expected: `a bigint of at most ${named(max)}`, got, fix: `send ${named(max)} or less` });
};

const BIGINT: Own = /* @__PURE__ */ Object.freeze({ issues: bigint, fill: same });

const date: Reader = (walk, _, got, path) => {
  if (!(got instanceof Date)) walk.add(walk, { path, keyword: 'type', expected: 'a Date', got, fix: 'send a Date' });
  else if (Number.isNaN(got.getTime())) walk.add(walk, { path, keyword: 'date', expected: 'a Date that is a time, not `new Date(NaN)`', got, fix: 'send a Date made from a real time' });
};

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

/** A date read from a string, where the schema asks and the text is an RFC 3339 date or date-time on a day the calendar has. */
const dateFill: Filler = (schema, value) => {
  if (!schema.coerce || typeof value !== 'string' || !RFC3339.test(value)) return value;
  const day = value.slice(0, DATE_LENGTH);
  const midnight = new Date(`${day}T00:00:00Z`);
  // The engine rolls a day the month does not have into the next month; then the day it gives back is not the day written.
  if (Number.isNaN(midnight.getTime()) || midnight.toISOString().slice(0, DATE_LENGTH) !== day) return value;
  return new Date(value);
};

const DATE: Own = /* @__PURE__ */ Object.freeze({ issues: date, fill: dateFill });

const typed: Reader = (walk, schema, got, path) => {
  const name = String(schema.value);
  if (typeof got !== schema.value) walk.add(walk, { path, keyword: 'type', expected: `a ${name}`, got, fix: `send a ${name}` });
};

const TYPE: Own = /* @__PURE__ */ Object.freeze({ issues: typed, fill: same });

const instance: Reader = (walk, schema, got, path) => {
  const type = schema.value as abstract new () => unknown;
  if (!(got instanceof type)) walk.add(walk, { path, keyword: 'instance', expected: `an instance of ${type.name}`, got, fix: `send one made by ${type.name}` });
};

const INSTANCE: Own = /* @__PURE__ */ Object.freeze({ issues: instance, fill: same });

/** Whether an issue found inside a refined value is one that keeps its rule from running: at the value itself, or at or under a key the rule reads. */
const blocks = (issue: Issue, path: string, uses: ReadonlySet<unknown>): boolean => {
  const under = issue.path.slice(path.length);
  // What is left is empty, or starts with the reference token of a key of the value: "/a" in "/a/0/b".
  const end = under.indexOf('/', 1);
  const head = end === -1 ? under : under.slice(0, end);
  return head === '' || new Set([...uses].map((name) => token(name as string))).has(head);
};

/**
 * The wrapped schema's issues, and then the rule's own. The rule is asked only about what it can
 * rely on: a value with no issue at all, or, when it names the keys it reads, one with no issue at
 * those keys. So a rule across two fields still speaks when a third is wrong.
 */
const refined: Reader = (walk, schema, got, path) => {
  const before = walk.found.length;
  walk.visit(walk, schema.item as Node, got, path);
  const inside = walk.found.slice(before);
  const uses = schema.values;
  if (full(walk) || (inside.length > 0 && (uses === null || inside.some((issue) => blocks(issue, path, uses))))) return;
  const { name, test } = schema.rule as Rule;
  if ((test as Test)(got) === true) return;
  walk.add(walk, { path: path + (schema.keys as readonly string[]).map(token).join(''), keyword: 'refine', expected: name, got, fix: 'change the value so that the rule holds' });
};

/** What a refinement or, before `check`, a transform wraps is filled as if it stood alone. */
const inner: Filler = (schema, value, pass) => pass.fill(schema.item as Node, value, pass);

const REFINED: Own = /* @__PURE__ */ Object.freeze({ issues: refined, fill: inner });

const mapped: Reader = (walk, schema, got, path) => {
  walk.visit(walk, schema.item as Node, got, path);
};

/**
 * A transform's map runs after `check`, on what the schema it wraps then produces. Before it, the
 * walk only notes that there is one. Once a pipe inside has failed, what the schema produced is not
 * what the map was promised, and the map is not run: the parse has failed already. A failure
 * elsewhere, beside this schema and not inside it, takes nothing from what this map was promised.
 */
const mappedFill: Filler = (schema, value, pass) => {
  const before = pass.failed.length;
  const out = inner(schema, value, pass);
  if (pass.late) return pass.failed.length > before ? out : (schema.value as (value: unknown) => unknown)(out);
  pass.met = true;
  return out;
};

const MAPPED: Own = /* @__PURE__ */ Object.freeze({ issues: mapped, fill: mappedFill });


const nan: Reader = (walk, _, got, path) => {
  if (!Number.isNaN(got)) walk.add(walk, { path, keyword: 'type', expected: 'NaN', got, fix: 'send NaN' });
};

const NAN: Own = /* @__PURE__ */ Object.freeze({ issues: nan, fill: same });

/** Where an entry of a `Map` is reported: under its key when that is a string or a number, and otherwise under its place in the order the map gives its entries. */
const entryKey = (name: unknown, index: number): string | number => (typeof name === 'string' || typeof name === 'number' ? name : index);

const map: Reader = (walk, schema, got, path) => {
  if (!(got instanceof Map)) {
    walk.add(walk, { path, keyword: 'type', expected: 'a Map', got, fix: 'send a Map' });
    return;
  }
  let index = 0;
  for (const [name, member] of got) {
    const at = path + token(entryKey(name, index));
    walk.visit(walk, schema.key as Node, name, at);
    walk.visit(walk, schema.item as Node, member, at);
    index += 1;
  }
};

/** A new `Map` when a key or a value changed, or a copy was asked for; the entries keep their order. */
const mapFill: Filler = (schema, value, pass) => {
  if (!(value instanceof Map)) return value;
  const out = new Map<unknown, unknown>();
  let changed = pass.copy;
  let index = 0;
  for (const [name, member] of value) {
    const at = entryKey(name, index);
    const key = under(pass, at, schema.key as Node, name);
    const item = under(pass, at, schema.item as Node, member);
    if (!Object.is(key, name) || !Object.is(item, member)) changed = true;
    out.set(key, item);
    index += 1;
  }
  return changed ? out : value;
};

const MAP: Own = /* @__PURE__ */ Object.freeze({ issues: map, fill: mapFill });

const set: Reader = (walk, schema, got, path) => {
  if (!(got instanceof Set)) {
    walk.add(walk, { path, keyword: 'type', expected: 'a Set', got, fix: 'send a Set' });
    return;
  }
  const [min, max] = [String(schema.min), String(schema.max)];
  if (got.size < schema.min) walk.add(walk, { path, keyword: 'min', expected: `at least ${min} members`, got, fix: `send ${min} or more` });
  else if (got.size > schema.max) walk.add(walk, { path, keyword: 'max', expected: `at most ${max} members`, got, fix: `send ${max} or fewer` });
  let index = 0;
  for (const member of got) {
    walk.visit(walk, schema.item as Node, member, path + token(index));
    index += 1;
  }
};

/** A new `Set` when a member changed, or a copy was asked for. Two members that become the same value become one. */
const setFill: Filler = (schema, value, pass) => {
  if (!(value instanceof Set)) return value;
  const out = new Set<unknown>();
  let changed = pass.copy;
  let index = 0;
  for (const member of value) {
    const item = under(pass, index, schema.item as Node, member);
    if (!Object.is(item, member)) changed = true;
    out.add(item);
    index += 1;
  }
  return changed ? out : value;
};

const SET: Own = /* @__PURE__ */ Object.freeze({ issues: set, fill: setFill });

/** The wrapped schema's issues, and then the count of keys: asked only of an object, and only when nothing has yet stopped the walk. */
const counted: Reader = (walk, schema, got, path) => {
  const before = walk.found.length;
  walk.visit(walk, schema.item as Node, got, path);
  if (full(walk)) return;
  if (!isMembers(got)) {
    // What the wrapped schema refused it has already named; an object is asked for only where it let something else through.
    if (walk.found.length === before) walk.add(walk, { path, keyword: 'type', expected: 'an object', got, fix: 'send an object' });
    return;
  }
  const count = keyCount(got);
  const [min, max] = [String(schema.min), String(schema.max)];
  if (count < schema.min) walk.add(walk, { path, keyword: 'minProperties', expected: `at least ${min} keys`, got, fix: `send ${min} or more` });
  else if (count > schema.max) walk.add(walk, { path, keyword: 'maxProperties', expected: `at most ${max} keys`, got, fix: `send ${max} or fewer` });
};

const COUNTED: Own = /* @__PURE__ */ Object.freeze({ issues: counted, fill: inner });

/** The keywords a schema reports one key below itself, about that key: of an object, a record or a discriminated union. */
const ABOUT_A_KEY: ReadonlySet<string> = /* @__PURE__ */ new Set(['required', 'unknown', 'undefined', 'key', 'tag']);

/**
 * Whether an issue is the wrapped schema's own, and so one its message is for: reported where the
 * schema stands, or one key below under a keyword that is about the key itself. What a schema
 * inside it reports is that schema's own.
 */
const isOwn = (issue: Issue, path: string): boolean =>
  // Every issue found under the wrapped schema is at its path or below it: what is left of the path is empty, or starts a key.
  issue.path === path || (ABOUT_A_KEY.has(issue.keyword) && !issue.path.slice(path.length).includes('/', 1));

/**
 * The wrapped schema's issues, each of its own with the message the schema was given for it: one
 * message for all of them, or one a keyword. The words are the caller's, whole: no `fix:` line is
 * added to them. They are put in last, so they stand whatever a per-call message hook said.
 */
const worded: Reader = (walk, schema, got, path) => {
  const before = walk.found.length;
  walk.visit(walk, schema.item as Node, got, path);
  const words = schema.value as string | ReadonlyMap<string, string>;
  for (let index = before; index < walk.found.length; index++) {
    const issue = walk.found[index] as Issue;
    const message = typeof words === 'string' ? words : words.get(issue.keyword);
    if (message !== undefined && isOwn(issue, path)) walk.found.splice(index, 1, { ...issue, message });
  }
};

const WORDED: Own = /* @__PURE__ */ Object.freeze({ issues: worded, fill: inner });

/**
 * A function of the caller's, run on what arrived before anything is validated: a coercion of
 * their own. It runs once, on the first walk; after `check` the value is already what it made.
 */
const before: Filler = (schema, value, pass) => pass.fill(schema.item as Node, pass.late ? value : (schema.value as (value: unknown) => unknown)(value), pass);

const BEFORE: Own = /* @__PURE__ */ Object.freeze({ issues: mapped, fill: before });

/**
 * A pipe's first schema is filled as if it stood alone; then, after `check`, what it produced is
 * parsed by the second, whole: filled, checked and mapped. Where the second refuses it the parse
 * fails with the second's issues, each under the place the pipe stands at.
 */
const piped: Filler = (schema, value, pass) => {
  const before = pass.failed.length;
  const out = inner(schema, value, pass);
  if (!pass.late) {
    pass.met = true;
    return out;
  }
  // What the first schema made is not sound where a pipe inside it failed; and a call that asked for the first issue has it.
  if (pass.failed.length > before || (pass.options.first === true && before > 0)) return out;
  const result = pass.parse(schema.key as Node, out, pass.options);
  if (result.ok) return result.value;
  const prefix = pass.at.map((key) => token(key as string | number)).join('');
  for (const issue of result.issues) pass.failed.push({ ...issue, path: prefix + issue.path });
  return out;
};

const PIPED: Own = /* @__PURE__ */ Object.freeze({ issues: mapped, fill: piped });

export {
  BEFORE,
  BIGINT,
  COUNTED,
  CUSTOM,
  DATE,
  EVERY,
  full,
  INSTANCE,
  isMembers,
  items,
  LATER,
  MAP,
  MAPPED,
  type Members,
  named,
  NAN,
  NEVER,
  noKind,
  note,
  type Notes,
  NULLABLE,
  NULLISH,
  PIPED,
  rebuilt,
  RECORD,
  REFINED,
  same,
  SET,
  token,
  TUPLE,
  TYPE,
  under,
  UNION,
  UNKNOWN,
  WORDED,
};
