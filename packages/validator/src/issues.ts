import { type Node, type Schema } from './schema.js';

export interface Issue {
  /** JSON Pointer to the value that failed; `''` is the root. */
  readonly path: string;
  /** What failed: `type`, `min`, `max`, `pattern`, `integer`, `literal`, `enum`, `required`, `tag`. */
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

const received = (value: unknown): string => {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  return isRecord(value) ? 'an object' : `${typeof value} ${JSON.stringify(value) ?? String(value)}`;
};

const token = (key: string | number): string => `/${String(key).replaceAll('~', '~0').replaceAll('/', '~1')}`;

const add = (walk: Walk, miss: Miss): void => {
  walk.found.push({ path: miss.path, keyword: miss.keyword, message: `expected ${miss.expected}, got ${received(miss.got)}. fix: ${miss.fix}` });
};

const full = (walk: Walk): boolean => walk.first && walk.found.length > 0;

/** A length outside the schema's bounds, in characters or items. */
const size = (walk: Walk, schema: Node, at: { path: string; got: { length: number }; unit: string }): void => {
  const { path, got, unit } = at;
  if (got.length < schema.min) {
    add(walk, { path, keyword: 'min', expected: `at least ${String(schema.min)} ${unit}`, got, fix: `send ${String(schema.min)} or more` });
  } else if (got.length > schema.max) {
    add(walk, { path, keyword: 'max', expected: `at most ${String(schema.max)} ${unit}`, got, fix: `send ${String(schema.max)} or fewer` });
  }
};

const string = (walk: Walk, schema: Node, got: unknown, path: string): void => {
  if (typeof got !== 'string') add(walk, { path, keyword: 'type', expected: 'a string', got, fix: 'send a string' });
  else if (got.length < schema.min || got.length > schema.max) size(walk, schema, { path, got, unit: 'characters' });
  else if (schema.pattern !== null && !schema.pattern.test(got)) {
    add(walk, { path, keyword: 'pattern', expected: `a string matching ${String(schema.pattern)}`, got, fix: 'send a value the pattern accepts' });
  }
};

const number = (walk: Walk, schema: Node, got: unknown, path: string): void => {
  if (typeof got !== 'number' || Number.isNaN(got)) add(walk, { path, keyword: 'type', expected: 'a number', got, fix: 'send a finite number' });
  else if (got < schema.min) {
    add(walk, { path, keyword: 'min', expected: `a number of at least ${String(schema.min)}`, got, fix: `send ${String(schema.min)} or more` });
  } else if (got > schema.max) {
    add(walk, { path, keyword: 'max', expected: `a number of at most ${String(schema.max)}`, got, fix: `send ${String(schema.max)} or less` });
  } else if (schema.int && !Number.isInteger(got)) {
    add(walk, { path, keyword: 'integer', expected: 'a whole number', got, fix: 'drop the fraction' });
  }
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
  size(walk, schema, { path, got, unit: 'items' });
  for (const [index, element] of got.entries()) visit(walk, schema.item as Node, element, path + token(index));
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

function visit(walk: Walk, schema: Node, got: unknown, path: string): void {
  if (full(walk)) return;
  switch (schema.kind) {
    case 'string': {
      string(walk, schema, got, path);
      return;
    }
    case 'number': {
      number(walk, schema, got, path);
      return;
    }
    case 'boolean': {
      if (typeof got !== 'boolean') add(walk, { path, keyword: 'type', expected: 'true or false', got, fix: 'send a boolean' });
      return;
    }
    case 'literal': {
      literal(walk, schema, got, path);
      return;
    }
    case 'enum': {
      member(walk, schema, got, path);
      return;
    }
    case 'array': {
      array(walk, schema, got, path);
      return;
    }
    case 'object': {
      object(walk, schema, got, path);
      return;
    }
    case 'discriminated': {
      pick(walk, schema, got, path);
    }
  }
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
