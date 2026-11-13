import { type Kind, type Node, type Rule, type Schema } from './schema.js';

/**
 * The code emitter (spec.md R4): a node written out as straight-line JavaScript with no imports
 * and no runtime of ours. `apicontract gen validator` writes this text to a file; `./jit` runs it.
 *
 * It answers exactly what `check` answers (R2). Scalars are inlined at the place they are tested;
 * an array, an object or a union becomes one function, written once however often it is used.
 */

interface Emitter {
  /** `const` declarations, in the order they must appear. */
  readonly lines: string[];
  /** The function already written for a node. */
  readonly named: Map<Node, string>;
  /** The code-point counter's name, once a string bound has needed it. */
  points: string | null;
  /** The multiple test's name, once a number has needed it. */
  multiple: string | null;
  /** The functions the schema names. Text cannot hold one, so the text calls them as `h[0]`, `h[1]`, … */
  readonly hooks: unknown[];
}

const HEX = 16;
const UNIT = 4;

/**
 * The values JSON cannot write: it throws on a bigint, and calls a number that is not finite null,
 * which is another value. Each is its own text, made of digits and letters only.
 */
const unquoted = (value: unknown): string | null => {
  if (typeof value === 'bigint') return `${String(value)}n`;
  return typeof value === 'number' && !Number.isFinite(value) ? String(value) : null;
};

/**
 * A value as JavaScript source. `JSON.stringify` makes it a valid literal; the escapes after it
 * are for where the text may end up: `<`, `>` and `/` cannot close a `<script>` or open a comment
 * there, and the two Unicode line separators cannot end a line in an older parser.
 */
const literal = (value: unknown): string =>
  (unquoted(value) ?? String(JSON.stringify(value))).replaceAll(/[<>/\u2028\u2029]/gu, (unit) => `\\u${(unit.codePointAt(0) as number).toString(HEX).padStart(UNIT, '0')}`);

/** A bound as source. A node is data and may have been built by hand, so what is not a number is refused, not printed. */
const numeric = (value: unknown): string => {
  if (typeof value !== 'number') {
    throw new TypeError(`cannot emit the bound ${literal(String(value))}: it is not a number. fix: build the schema with the builders, or give the node numeric bounds`);
  }
  return String(value);
};

/** A pattern as source: rebuilt from its own source and flags as escaped strings, never pasted in as written. */
const pattern = (value: unknown): string => {
  if (!(value instanceof RegExp)) {
    throw new TypeError('cannot emit a pattern that is not a RegExp. fix: build the schema with `string({ pattern })`');
  }
  return `new RegExp(${literal(value.source)}, ${literal(value.flags)})`;
};

/** A bigint's bound as source; what is not a bigint is refused, as `numeric` refuses what is not a number. */
const big = (value: unknown): string => {
  if (typeof value !== 'bigint') {
    throw new TypeError(`cannot emit the bound ${literal(String(value))}: it is not a bigint. fix: build the schema with \`bigint({ min, max })\``);
  }
  return literal(value);
};

const isObject = (ref: string): string => `typeof ${ref} === "object" && ${ref} !== null && !Array.isArray(${ref})`;

const declare = (emitter: Emitter, prefix: string, source: string): string => {
  const name = `${prefix}${String(emitter.lines.length)}`;
  emitter.lines.push(`const ${name} = ${source};`);
  return name;
};

/**
 * The code-point counter, written once and only for a schema that needs it: the loop of `points`
 * in check.ts, as text.
 */
const POINTS = `(s) => {
  let n = s.length;
  for (let i = 0; i < s.length; i++) if (s.codePointAt(i) > 65535) n -= 1;
  return n;
}`;

const points = (emitter: Emitter): string => {
  emitter.points ??= declare(emitter, 'p', POINTS);
  return emitter.points;
};

/**
 * A string's tests. Length is in code points (parity.md decision 4), decided from `length` alone
 * wherever that is enough, exactly as `check` decides it: one unit or none needs no count.
 */
const string = (emitter: Emitter, schema: Node, ref: string): string => {
  const parts = [`typeof ${ref} === "string"`];
  const [min, max] = [numeric(schema.min), numeric(schema.max)];
  if (schema.min > 1) parts.push(`(${ref}.length >= ${String(schema.min * 2)} || ${points(emitter)}(${ref}) >= ${min})`);
  else if (schema.min > 0) parts.push(`${ref}.length >= ${min}`);
  if (schema.max < Number.MAX_VALUE) parts.push(`(${ref}.length <= ${max} || ${points(emitter)}(${ref}) <= ${max})`);
  if (schema.pattern !== null) parts.push(`${declare(emitter, 'r', pattern(schema.pattern))}.test(${ref})`);
  if (schema.rule !== null) parts.push(schema.rule.pattern === null ? `${tested(emitter, schema.rule)}(${ref}) === true` : `${declare(emitter, 'r', pattern(schema.rule.pattern))}.test(${ref})`);
  return parts.join(' && ');
};

/** `isMultiple` of check.ts, as text: written once, and only for a schema with a `multipleOf`. */
const MULTIPLE = `(v, s) => {
  const r = Math.abs(v % s);
  return r === 0 || (!Number.isInteger(s) && Math.min(r, s - r) <= Math.abs(v) * Number.EPSILON);
}`;

const multiple = (emitter: Emitter): string => {
  emitter.multiple ??= declare(emitter, 'm', MULTIPLE);
  return emitter.multiple;
};

// Both bounds are always written: the default ones are what refuse `NaN` and the infinities.
const number = (emitter: Emitter, schema: Node, ref: string): string => {
  const parts = [`typeof ${ref} === "number"`, `${ref} >= ${numeric(schema.min)}`, `${ref} <= ${numeric(schema.max)}`];
  const [above, below, step] = [numeric(schema.above), numeric(schema.below), numeric(schema.step)];
  if (schema.above > Number.NEGATIVE_INFINITY) parts.push(`${ref} > ${above}`);
  if (schema.below < Number.POSITIVE_INFINITY) parts.push(`${ref} < ${below}`);
  if (schema.int) parts.push(`Number.isInteger(${ref})`);
  if (schema.step !== 0) parts.push(`${multiple(emitter)}(${ref}, ${step})`);
  return parts.join(' && ');
};

const member = (_: Emitter, schema: Node, ref: string): string => {
  // A set holds `NaN`, which nothing is identical to: it is the one value that differs from itself.
  const tests = [...(schema.values as ReadonlySet<unknown>)].map((value) => (Number.isNaN(value) ? `${ref} !== ${ref}` : `${ref} === ${literal(value)}`));
  return tests.length === 0 ? 'false' : `(${tests.join(' || ')})`;
};

const array = (emitter: Emitter, schema: Node): string => {
  const [min, max] = [numeric(schema.min), numeric(schema.max)];
  const bounds = [schema.min > 0 ? ` || v.length < ${min}` : '', schema.max < Number.MAX_VALUE ? ` || v.length > ${max}` : ''];
  const item = test(emitter, schema.item as Node, 'v[i]');
  return `(v) => {
  if (!Array.isArray(v)${bounds.join('')}) return false;
  for (let i = 0; i < v.length; i++) if (!(${item})) return false;
  return true;
}`;
};

/**
 * The kinds whose own test can be true of `undefined`. A key that is not optional must be there
 * whatever its schema would say of `undefined` (`check` asks that first), so for these the text
 * asks it too; for every other kind the kind's test already refuses `undefined`.
 */
const UNDEFINED_MAY_PASS: ReadonlySet<Kind> = new Set(['unknown', 'nullable', 'nullish', 'union', 'intersection', 'lazy', 'custom']);

/** Whether a field's own test can be true of `undefined`: one of those kinds, or the literal `undefined`. */
const mayPassUndefined = (field: Node): boolean => UNDEFINED_MAY_PASS.has(field.kind) || (field.kind === 'literal' && field.value === undefined);

/**
 * The loop over the keys an object's shape does not name: each is refused, or its value is held to
 * the schema for them. `for … in`, as `isClosed` reads them.
 */
const extras = (emitter: Emitter, schema: Node): string => {
  const named = (schema.keys as readonly string[]).map((key) => `k === ${literal(key)}`);
  const rest = schema.item === null ? '' : ` && !(${test(emitter, schema.item, 'v[k]')})`;
  return `(v) => {
  for (const k in v) if (!(${named.length === 0 ? 'false' : named.join(' || ')})${rest}) return false;
  return true;
}`;
};

const object = (emitter: Emitter, schema: Node): string => {
  const fields = schema.fields as readonly Node[];
  const tests = (schema.keys as readonly string[]).map((key, index) => {
    const field = fields[index] as Node;
    const ref = `v[${literal(key)}]`;
    const inner = test(emitter, field, ref);
    if (field.optional === true) return `(${ref} === undefined || (${inner}))`;
    // An exact key: `undefined` only because the key is absent, as `check` asks with `in`.
    if (field.optional !== false) return `(${ref} === undefined ? !(${literal(key)} in v) : (${inner}))`;
    return mayPassUndefined(field) ? `(${ref} !== undefined && (${inner}))` : `(${inner})`;
  });
  if (schema.unknown === 'strict' || schema.item !== null) tests.push(`${declare(emitter, 'f', extras(emitter, schema))}(v)`);
  return `(v) => ${[isObject('v'), ...tests].join('\n  && ')}`;
};

const record = (emitter: Emitter, schema: Node): string => {
  const key = schema.key === null ? '' : `!(${test(emitter, schema.key, 'k')}) || `;
  return `(v) => {
  if (!(${isObject('v')})) return false;
  for (const k in v) if (${key}!(${test(emitter, schema.item as Node, 'v[k]')})) return false;
  return true;
}`;
};

const tuple = (emitter: Emitter, schema: Node): string => {
  const fields = schema.fields as readonly Node[];
  const tests = fields.map((field, index) => `(${test(emitter, field, `v[${String(index)}]`)})`);
  const count = String(fields.length);
  if (schema.item === null) return `(v) => ${[`Array.isArray(v) && v.length === ${count}`, ...tests].join('\n  && ')}`;
  return `(v) => {
  if (!(${[`Array.isArray(v) && v.length >= ${count}`, ...tests].join('\n  && ')})) return false;
  for (let i = ${count}; i < v.length; i++) if (!(${test(emitter, schema.item, 'v[i]')})) return false;
  return true;
}`;
};

const cases = (emitter: Emitter, schema: Node): string => {
  const chosen = [...(schema.cases as ReadonlyMap<unknown, Node>)].map(([tag, one]) => `    case ${literal(tag)}: return ${test(emitter, one, 'v')};`);
  return `(v) => {
  if (!(${isObject('v')})) return false;
  switch (v[${literal(schema.tag)}]) {
${chosen.join('\n')}
    default: return false;
  }
}`;
};

/** A function the schema names, by where the text will find it. What is not a function is refused, not called: `what` says what it was to be. */
const hook = (emitter: Emitter, named: unknown, what: string): string => {
  if (typeof named !== 'function') throw new TypeError(`cannot emit ${what}`);
  emitter.hooks.push(named);
  return `h[${String(emitter.hooks.length - 1)}]`;
};

/** The test of a format or of a custom type, as a hook. */
const tested = (emitter: Emitter, rule: Rule): string =>
  hook(emitter, rule.test, `the rule ${literal(String(rule.name))}: it has neither a pattern nor a test. fix: build it with \`string({ format })\` or \`custom\``);

const bigint = (_: Emitter, schema: Node, ref: string): string => {
  const [min, max] = schema.value as readonly unknown[];
  const parts = [`typeof ${ref} === "bigint"`];
  if (min !== Number.NEGATIVE_INFINITY) parts.push(`${ref} >= ${big(min)}`);
  if (max !== Number.POSITIVE_INFINITY) parts.push(`${ref} <= ${big(max)}`);
  return parts.join(' && ');
};

const instance = (emitter: Emitter, schema: Node, ref: string): string =>
  `${ref} instanceof ${hook(emitter, schema.value, 'an instance check whose class is not a function. fix: build it with `instanceOf`')}`;

/** The function for a node that needs one, written the first time it is asked for. */
const named = (emitter: Emitter, schema: Node, write: (emitter: Emitter, schema: Node) => string): string => {
  const known = emitter.named.get(schema);
  // Stryker disable next-line ConditionalExpression: equivalent, the same name is found again after the write below; this is what saves writing a shared schema's text once per use
  if (known !== undefined) return known;
  const source = write(emitter, schema);
  // A schema that names itself is met again while it is being written, and is finished by then.
  const finished = emitter.named.get(schema);
  if (finished !== undefined) return finished;
  const name = declare(emitter, 'f', source);
  emitter.named.set(schema, name);
  return name;
};

/**
 * A lazy schema is the one place a schema can come back to itself, so its function is named before
 * its body is written and the body's own mention of it is a call. The functions call each other
 * only once every one of them is declared.
 */
const later = (emitter: Emitter, schema: Node, ref: string): string => {
  const known = emitter.named.get(schema);
  if (known !== undefined) return `${known}(${ref})`;
  const name = `g${String(emitter.named.size)}`;
  emitter.named.set(schema, name);
  const body = test(emitter, (schema.get as () => Node)(), 'v');
  emitter.lines.push(`const ${name} = (v) => ${body};`);
  return `${name}(${ref})`;
};

/** The test of each member of a union or an intersection, on the same value. */
const members = (emitter: Emitter, schema: Node, ref: string): string[] =>
  (schema.fields as readonly Node[]).map((member) => `(${test(emitter, member, ref)})`);

/** Tests joined by an operator; `none` is what no test at all answers. */
const joined = (tests: readonly string[], operator: string, none: string): string =>
  tests.length === 0 ? none : `(${tests.join(operator)})`;

/** One writer per kind: a boolean expression that is true when `ref` is what the schema describes. */
const WRITERS: Readonly<Record<Kind, (emitter: Emitter, schema: Node, ref: string) => string>> = {
  string,
  number,
  boolean: (_, __, ref) => `typeof ${ref} === "boolean"`,
  literal: (_, schema, ref) => `${ref} === ${literal(schema.value)}`,
  enum: member,
  array: (emitter, schema, ref) => `${named(emitter, schema, array)}(${ref})`,
  object: (emitter, schema, ref) => `${named(emitter, schema, object)}(${ref})`,
  discriminated: (emitter, schema, ref) => `${named(emitter, schema, cases)}(${ref})`,
  unknown: () => 'true',
  never: () => 'false',
  record: (emitter, schema, ref) => `${named(emitter, schema, record)}(${ref})`,
  tuple: (emitter, schema, ref) => `${named(emitter, schema, tuple)}(${ref})`,
  nullable: (emitter, schema, ref) => `(${ref} === null || (${test(emitter, schema.item as Node, ref)}))`,
  nullish: (emitter, schema, ref) => `(${ref} === null || ${ref} === undefined || (${test(emitter, schema.item as Node, ref)}))`,
  union: (emitter, schema, ref) => joined(members(emitter, schema, ref), ' || ', 'false'),
  intersection: (emitter, schema, ref) => joined(members(emitter, schema, ref), ' && ', 'true'),
  lazy: later,
  custom: (emitter, schema, ref) => `${tested(emitter, schema.rule as Rule)}(${ref}) === true`,
  bigint,
  date: (_, __, ref) => `(${ref} instanceof Date && !Number.isNaN(${ref}.getTime()))`,
  type: (_, schema, ref) => `typeof ${ref} === ${literal(schema.value)}`,
  instance,
};

function test(emitter: Emitter, schema: Node, ref: string): string {
  return WRITERS[schema.kind](emitter, schema, ref);
}

/** The declarations and the entry of the function for a schema, and the functions that text calls. */
const write = (schema: Node): { body: string; hooks: readonly unknown[] } => {
  const emitter: Emitter = { lines: [], named: new Map(), points: null, multiple: null, hooks: [] };
  const entry = test(emitter, schema, 'v');
  return { body: `${emitter.lines.join('\n')}\nreturn (v) => ${entry};`, hooks: emitter.hooks };
};

/**
 * JavaScript for a function `(value) => boolean` that answers what `check(schema, value)` answers.
 * It is one expression, so `export const isOrder = ${emit(Order)};` is a module.
 *
 * A schema that names a function (a custom type, a class to be an instance of, or a format with a
 * test) has no such text: text cannot hold a function. `emitWith` is for those.
 */
const emit = <T>(schema: Schema<T>): string => {
  const { body, hooks } = write(schema);
  if (hooks.length > 0) {
    throw new TypeError('cannot emit a schema that names a function as text alone: a custom type, a refinement, a class, or a format with a test. fix: give the format a pattern, or use `emitWith` and hand its hooks to the text');
  }
  return `(() => {\n${body}\n})()`;
};

/**
 * The same, for any schema: JavaScript for a function that takes the schema's own functions, in
 * `hooks`, and returns the `(value) => boolean`. `./jit` is what calls it.
 */
const emitWith = <T>(schema: Schema<T>): { source: string; hooks: readonly unknown[] } => {
  const { body, hooks } = write(schema);
  return { source: `(h) => {\n${body}\n}`, hooks };
};

export { emit, emitWith };
