import { isMultiple, matches, points } from './check.js';
import { full, isMembers as isRecord, named, noKind, token } from './own.js';
import { type Issue, type IssueOptions, type Miss, type Node, type Reader, type Schema, type Walk } from './schema.js';

/** The most characters of a received value that a message quotes. */
const SHOWN = 80;

/**
 * What arrived, for a message. Safe for every value: an object is never walked (it may be cyclic),
 * a function is never printed (its text is its source), and a long text is cut.
 */
const received = (value: unknown): string => {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  if (isRecord(value)) return 'an object';
  if (typeof value === 'function') return 'a function';
  // `String`, not `JSON.stringify`, which has no text for `undefined` or a symbol, throws on a bigint and calls `NaN` null.
  const text = String(value);
  const cut = text.slice(0, SHOWN);
  const more = text.length > SHOWN ? ` and ${String(text.length - SHOWN)} more characters` : '';
  return `${typeof value} ${typeof value === 'string' ? JSON.stringify(cut) : cut}${more}`;
};

const add = (walk: Walk, miss: Miss): void => {
  walk.found.push({ path: miss.path, keyword: miss.keyword, message: walk.message?.(miss) ?? `expected ${miss.expected}, got ${received(miss.got)}. fix: ${miss.fix}` });
};

/** A length outside the schema's bounds: `count` code points of a string, or items of an array. */
const size = (walk: Walk, schema: Node, at: { path: string; got: unknown; count: number; unit: string }): void => {
  const { path, got, count, unit } = at;
  if (count < schema.min) {
    add(walk, { path, keyword: 'min', expected: `at least ${String(schema.min)} ${unit}`, got, fix: `send ${String(schema.min)} or more` });
  } else if (count > schema.max) {
    add(walk, { path, keyword: 'max', expected: `at most ${String(schema.max)} ${unit}`, got, fix: `send ${String(schema.max)} or fewer` });
  }
};

const string = (walk: Walk, schema: Node, got: unknown, path: string): void => {
  if (typeof got !== 'string') {
    add(walk, { path, keyword: 'type', expected: 'a string', got, fix: 'send a string' });
    return;
  }
  const count = points(got);
  if (count < schema.min || count > schema.max) size(walk, schema, { path, got, count, unit: 'characters' });
  else if (schema.pattern !== null && !schema.pattern.test(got)) {
    add(walk, { path, keyword: 'pattern', expected: `a string matching ${String(schema.pattern)}`, got, fix: 'send a value the pattern accepts' });
  } else if (schema.rule !== null && !matches(schema.rule, got)) {
    add(walk, { path, keyword: 'format', expected: `a string in the format ${schema.rule.name}`, got, fix: `send one in the format ${schema.rule.name}` });
  }
};

/** A number outside an exclusive bound, with a fraction where none is allowed, or off the step. */
const numberMore = (walk: Walk, schema: Node, got: number, path: string): void => {
  const [above, below, step] = [String(schema.above), String(schema.below), String(schema.step)];
  if (got <= schema.above) add(walk, { path, keyword: 'gt', expected: `a number above ${above}`, got, fix: `send more than ${above}` });
  else if (got >= schema.below) add(walk, { path, keyword: 'lt', expected: `a number below ${below}`, got, fix: `send less than ${below}` });
  else if (schema.int && !Number.isInteger(got)) add(walk, { path, keyword: 'integer', expected: 'a whole number', got, fix: 'drop the fraction' });
  else if (schema.step !== 0 && !isMultiple(got, schema.step)) {
    add(walk, { path, keyword: 'multipleOf', expected: `a multiple of ${step}`, got, fix: `send a multiple of ${step}` });
  }
};

const number = (walk: Walk, schema: Node, got: unknown, path: string): void => {
  if (typeof got !== 'number' || Number.isNaN(got)) add(walk, { path, keyword: 'type', expected: 'a number', got, fix: 'send a finite number' });
  else if (got < schema.min) {
    add(walk, { path, keyword: 'min', expected: `a number of at least ${String(schema.min)}`, got, fix: `send ${String(schema.min)} or more` });
  } else if (got > schema.max) {
    add(walk, { path, keyword: 'max', expected: `a number of at most ${String(schema.max)}`, got, fix: `send ${String(schema.max)} or less` });
  } else numberMore(walk, schema, got, path);
};

const boolean = (walk: Walk, _: Node, got: unknown, path: string): void => {
  if (typeof got !== 'boolean') add(walk, { path, keyword: 'type', expected: 'true or false', got, fix: 'send a boolean' });
};

const literal = (walk: Walk, schema: Node, got: unknown, path: string): void => {
  const value = named(schema.value);
  if (got !== schema.value) add(walk, { path, keyword: 'literal', expected: value, got, fix: `send ${value}` });
};

const member = (walk: Walk, schema: Node, got: unknown, path: string): void => {
  const values = schema.values as ReadonlySet<unknown>;
  if (values.has(got)) return;
  const names = [...values].map(named).join(', ');
  add(walk, { path, keyword: 'enum', expected: `one of ${names}`, got, fix: 'send one of them' });
};

const array = (walk: Walk, schema: Node, got: unknown, path: string): void => {
  if (!Array.isArray(got)) {
    add(walk, { path, keyword: 'type', expected: 'an array', got, fix: 'send an array' });
    return;
  }
  size(walk, schema, { path, got, count: got.length, unit: 'items' });
  for (const [index, element] of got.entries()) visit(walk, schema.item as Node, element, path + token(index));
};

/** The keys an object's shape does not name: refused when it is strict, or held to the schema for them. */
const extras = (walk: Walk, schema: Node, got: Record<string, unknown>, path: string): void => {
  if (schema.unknown !== 'strict' && schema.item === null) return;
  const named = schema.values as ReadonlySet<unknown>;
  for (const key in got) {
    if (named.has(key)) continue;
    if (schema.item !== null) visit(walk, schema.item, got[key], path + token(key));
    else if (!full(walk)) add(walk, { path: path + token(key), keyword: 'unknown', expected: 'no such key', got: got[key], fix: `remove "${key}"` });
  }
};

const object = (walk: Walk, schema: Node, got: unknown, path: string): void => {
  if (!isRecord(got)) {
    add(walk, { path, keyword: 'type', expected: 'an object', got, fix: 'send an object' });
    return;
  }
  const fields = schema.fields as readonly Node[];
  for (const [index, key] of (schema.keys as readonly string[]).entries()) {
    const field = fields[index] as Node;
    const value = got[key];
    if (value !== undefined) visit(walk, field, value, path + token(key));
    // As `check` asks it: an optional key may be `undefined`, a required one may not, and any other is exact.
    else if (field.optional === true || full(walk)) continue;
    else if (field.optional === false) add(walk, { path: path + token(key), keyword: 'required', expected: 'a value', got: value, fix: `add "${key}"` });
    else if (key in got) add(walk, { path: path + token(key), keyword: 'undefined', expected: 'a value, or no key at all', got: value, fix: `remove "${key}", or give it a value` });
  }
  extras(walk, schema, got, path);
};

const pick = (walk: Walk, schema: Node, got: unknown, path: string): void => {
  const cases = schema.cases as ReadonlyMap<unknown, Node>;
  const tag = isRecord(got) ? got[schema.tag as string] : undefined;
  const chosen = cases.get(tag);
  if (chosen !== undefined) {
    visit(walk, chosen, got, path);
    return;
  }
  const names = [...cases.keys()].map(named).join(', ');
  add(walk, { path: path + token(schema.tag as string), keyword: 'tag', expected: `one of ${names}`, got: tag, fix: 'send one of them' });
};

/**
 * One reader for each of the eight kinds of the design's first step, the ones nearly every schema
 * is made of. Every other kind's node carries its own (own.ts), so this table does not grow. A
 * `Map`, so that a hand-built node of the kind `constructor` finds no reader here, not the one
 * every object inherits.
 */
const READERS: ReadonlyMap<unknown, Reader> = new Map<unknown, Reader>([
  ['string', string],
  ['number', number],
  ['boolean', boolean],
  ['literal', literal],
  ['enum', member],
  ['array', array],
  ['object', object],
  ['discriminated', pick],
]);

function visit(walk: Walk, schema: Node, got: unknown, path: string): void {
  if (full(walk)) return;
  const read = schema.own?.issues ?? READERS.get(schema.kind);
  if (read === undefined) throw new TypeError(`issues ${noKind(schema.kind)}`);
  read(walk, schema, got, path);
}

/**
 * The second pass (spec.md R6, R7): every reason `value` is not what the schema describes. Empty
 * exactly when `check` says yes.
 */
export const issues = <T>(schema: Schema<T, unknown>, value: unknown, options: IssueOptions = {}): Issue[] => {
  const walk: Walk = { found: [], first: options.first === true, message: options.message, visit, add };
  visit(walk, schema, value, '');
  return walk.found;
};
