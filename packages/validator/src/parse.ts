import { issues } from './issues.js';
import { isMembers, items, noKind, note, type Notes, rebuilt, same } from './own.js';
import { type Filler, type Issue, type IssueOptions, type Node, type Out, type Pass, type Schema } from './schema.js';

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

/**
 * The whole of what coercion reads as a number (parity.md decision 12): a JSON number, RFC 8259 §6.
 * So no empty string, no spaces, no leading plus or zero, no hex, no `Infinity`, and nothing that is
 * not a string. The five libraries agree on exactly these and on nothing wider.
 */
const JSON_NUMBER = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/u;

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

const array = (schema: Node, value: unknown, pass: Pass): unknown =>
  Array.isArray(value) ? items(value, value.length, () => schema.item as Node, pass) : value;

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

const picked = (schema: Node, value: unknown, pass: Pass): unknown => {
  // A tag that picks no case fails `check`, so what is made of the value then does not matter.
  const chosen = isMembers(value) ? (schema.cases as ReadonlyMap<unknown, Node>).get(value[schema.tag as string]) : undefined;
  return chosen === undefined ? value : fill(chosen, value, pass);
};

/** One for each of the kinds `issues` reads itself, as `issues` has them: every other kind's node carries its own. */
const FILLERS: ReadonlyMap<unknown, Filler> = new Map<unknown, Filler>([
  ['string', same],
  ['number', number],
  ['boolean', boolean],
  ['literal', same],
  ['enum', same],
  ['array', array],
  ['object', object],
  ['discriminated', picked],
]);

/**
 * What the kind makes of the value, or, where `undefined` arrived and the schema has a default, of
 * that default: it stands for the input that was not there, so a transform runs on it too.
 */
function fill(schema: Node, value: unknown, pass: Pass): unknown {
  const make = schema.own?.fill ?? FILLERS.get(schema.kind);
  if (make === undefined) throw new TypeError(`parse ${noKind(schema.kind)}`);
  return make(schema, value === undefined ? schema.default : value, pass);
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
  const pass: Pass = { late: false, copy: options.copy === true, met: false, fill };
  const filled = fill(schema, value, pass);
  if (!schema.check(schema, filled)) return { ok: false, issues: issues(schema, filled, options) };
  // A schema with no transform in it is walked once.
  if (!pass.met) return { ok: true, value: filled as Out<T, O> };
  pass.late = true;
  return { ok: true, value: fill(schema, filled, pass) as Out<T, O> };
};

export { parse, type Parsed, type ParseOptions };
