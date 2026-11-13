import { isMultiple, matches, points } from './check.js';
import { type Kind, type Node, type Rule, type Schema, type Test } from './schema.js';

export interface Issue {
  /** JSON Pointer to the value that failed; `''` is the root. */
  readonly path: string;
  /**
   * What failed: `type`, `min`, `max`, `gt`, `lt`, `integer`, `multipleOf`, `pattern`, `format`,
   * `literal`, `enum`, `required`, `unknown`, `key`, `length`, `tag`, `union`, `never`, `custom`.
   */
  readonly keyword: string;
  /** What was expected and what arrived, ending in a `fix:` line. */
  readonly message: string;
}

export interface IssueOptions {
  /** Stop at the first issue. */
  readonly first?: boolean;
}

/** Where the walk is, and where it writes. */
interface Walk {
  readonly found: Issue[];
  readonly first: boolean;
}

/** One failed expectation at one place. */
interface Miss {
  readonly path: string;
  readonly keyword: string;
  readonly expected: string;
  readonly got: unknown;
  readonly fix: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

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
  // `JSON.stringify` has no text for `undefined` or a symbol and throws on a bigint, so it is asked only about a number.
  const text = typeof value === 'number' ? JSON.stringify(value) : String(value);
  const cut = text.slice(0, SHOWN);
  const more = text.length > SHOWN ? ` and ${String(text.length - SHOWN)} more characters` : '';
  return `${typeof value} ${typeof value === 'string' ? JSON.stringify(cut) : cut}${more}`;
};

const token = (key: string | number): string => `/${String(key).replaceAll('~', '~0').replaceAll('/', '~1')}`;

const add = (walk: Walk, miss: Miss): void => {
  walk.found.push({ path: miss.path, keyword: miss.keyword, message: `expected ${miss.expected}, got ${received(miss.got)}. fix: ${miss.fix}` });
};

const full = (walk: Walk): boolean => walk.first && walk.found.length > 0;

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

const nothing = (): void => {
  // Every value is what `unknown` describes.
};

const never = (walk: Walk, _: Node, got: unknown, path: string): void => {
  add(walk, { path, keyword: 'never', expected: 'no value', got, fix: 'remove it' });
};

const literal = (walk: Walk, schema: Node, got: unknown, path: string): void => {
  const value = JSON.stringify(schema.value);
  if (got !== schema.value) add(walk, { path, keyword: 'literal', expected: value, got, fix: `send ${value}` });
};

const member = (walk: Walk, schema: Node, got: unknown, path: string): void => {
  const values = schema.values as ReadonlySet<unknown>;
  if (values.has(got)) return;
  const names = [...values].map((value) => JSON.stringify(value)).join(', ');
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
    else if (!field.optional && !full(walk)) {
      add(walk, { path: path + token(key), keyword: 'required', expected: 'a value', got: value, fix: `add "${key}"` });
    }
  }
  extras(walk, schema, got, path);
};

const record = (walk: Walk, schema: Node, got: unknown, path: string): void => {
  if (!isRecord(got)) {
    add(walk, { path, keyword: 'type', expected: 'an object', got, fix: 'send an object' });
    return;
  }
  const { key } = schema;
  for (const name in got) {
    const at = path + token(name);
    if (key !== null && !key.check(key, name) && !full(walk)) {
      add(walk, { path: at, keyword: 'key', expected: 'a key the record allows', got: name, fix: 'rename the key, or remove it' });
    }
    visit(walk, schema.item as Node, got[name], at);
  }
};

const tuple = (walk: Walk, schema: Node, got: unknown, path: string): void => {
  if (!Array.isArray(got)) {
    add(walk, { path, keyword: 'type', expected: 'an array', got, fix: 'send an array' });
    return;
  }
  const fields = schema.fields as readonly Node[];
  const count = String(fields.length);
  if (got.length !== fields.length) add(walk, { path, keyword: 'length', expected: `exactly ${count} items`, got, fix: `send ${count}` });
  for (const [index, field] of fields.entries()) if (index < got.length) visit(walk, field, got[index], path + token(index));
};

const pick = (walk: Walk, schema: Node, got: unknown, path: string): void => {
  const cases = schema.cases as Readonly<Record<string, Node>>;
  const tag = isRecord(got) ? got[schema.tag as string] : undefined;
  // eslint-disable-next-line conventions/consistent-existence-index-check -- Own cases only: a tag of "toString" must not pick an inherited function
  if (typeof tag === 'string' && Object.hasOwn(cases, tag)) {
    visit(walk, cases[tag] as Node, got, path);
    return;
  }
  const names = Object.keys(cases)
    .map((name) => JSON.stringify(name))
    .join(', ');
  add(walk, { path: path + token(schema.tag as string), keyword: 'tag', expected: `one of ${names}`, got: tag, fix: 'send one of them' });
};

const nullable = (walk: Walk, schema: Node, got: unknown, path: string): void => {
  if (got !== null) visit(walk, schema.item as Node, got, path);
};

const nullish = (walk: Walk, schema: Node, got: unknown, path: string): void => {
  if (got !== null && got !== undefined) visit(walk, schema.item as Node, got, path);
};

/**
 * One issue for the whole union, since no single member is the one that was meant. Its `fix:` line
 * says where each member first fails, which is what tells a caller which one it was nearest to.
 */
const union = (walk: Walk, schema: Node, got: unknown, path: string): void => {
  const members = schema.fields as readonly Node[];
  const misses: string[] = [];
  for (const [index, member] of members.entries()) {
    // Stryker disable next-line BooleanLiteral: equivalent, only the member's first issue is read; stopping there saves finding the rest
    const inner: Walk = { found: [], first: true };
    visit(inner, member, got, path);
    const [miss] = inner.found;
    if (miss === undefined) return;
    misses.push(`member ${String(index)} fails ${miss.keyword} at "${miss.path}"`);
  }
  const count = String(members.length);
  add(walk, { path, keyword: 'union', expected: `a value one of ${count} members accepts`, got, fix: ['satisfy one of them', ...misses].join('; ') });
};

const every = (walk: Walk, schema: Node, got: unknown, path: string): void => {
  for (const member of schema.fields as readonly Node[]) visit(walk, member, got, path);
};

const later = (walk: Walk, schema: Node, got: unknown, path: string): void => {
  visit(walk, (schema.get as () => Node)(), got, path);
};

const custom = (walk: Walk, schema: Node, got: unknown, path: string): void => {
  const { name, test } = schema.rule as Rule;
  if ((test as Test)(got) !== true) add(walk, { path, keyword: 'custom', expected: name, got, fix: `send a value that is ${name}` });
};

/** One reader per kind. A table and not a `switch`: the kinds are data, and only a program that imports `issues` carries it. */
const READERS: Readonly<Record<Kind, (walk: Walk, schema: Node, got: unknown, path: string) => void>> = {
  string,
  number,
  boolean,
  literal,
  enum: member,
  array,
  object,
  discriminated: pick,
  unknown: nothing,
  never,
  record,
  tuple,
  nullable,
  nullish,
  union,
  intersection: every,
  lazy: later,
  custom,
};

function visit(walk: Walk, schema: Node, got: unknown, path: string): void {
  if (!full(walk)) READERS[schema.kind](walk, schema, got, path);
}

/**
 * The second pass (spec.md R6, R7): every reason `value` is not what the schema describes. Empty
 * exactly when `check` says yes.
 */
export const issues = <T>(schema: Schema<T>, value: unknown, options: IssueOptions = {}): Issue[] => {
  const walk: Walk = { found: [], first: options.first === true };
  visit(walk, schema, value, '');
  return walk.found;
};
