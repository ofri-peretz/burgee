/**
 * `diff`'s schema comparison (apicontract-diff spec.md R1): two JSON Schemas, keyword by keyword,
 * each difference reported as what it does to the set of values the schema accepts.
 *
 * `widens` means the new schema accepts a value the old one rejected, `narrows` the reverse; a
 * keyword this file cannot decide containment for is `unknown`, never silence (intent.md,
 * Constraints). `neutral` is a declaration the value set does not see under the convention every
 * OpenAPI diff takes: a property an open object declares or stops declaring is one no old peer
 * sent. Whether a change breaks anyone is not decided here; that is `diff-classify.ts`.
 */
import { type Direction, type JsonSchema } from './core/model.js';
import { pointerGet } from './core/resolve.js';

export type Effect = 'widens' | 'narrows' | 'unknown' | 'neutral';

export interface Change {
  /** What changed, kebab-case: `enum-value-removed`, `maxLength-decreased`. Public ids are `diff-rules.ts`'s. */
  readonly rule: string;
  /** JSON Pointer into the payload's schema. */
  readonly pointer: string;
  readonly before: unknown;
  readonly after: unknown;
  readonly effect: Effect;
}

/** The documents `$ref`s point into, old and new. */
export interface Documents {
  readonly old?: unknown;
  readonly new?: unknown;
}

type Dict = Readonly<Record<string, unknown>>;

const isDict = (value: unknown): value is Dict => typeof value === 'object' && value !== null && !Array.isArray(value);

// eslint-disable-next-line conventions/consistent-existence-index-check -- Own members only: a property named `toString` is not one every object declares
const has = (value: Dict, key: string): boolean => Object.hasOwn(value, key);

/** Directions whose receiver is the server: there a `readOnly` property is never sent. */
const SERVER_RECEIVES: ReadonlySet<Direction> = new Set(['request', 'subscribe', 'tool-call', 'argv']);

/** Whether the server is the receiver of a payload travelling in `direction`. */
export const serverReceives = (direction: Direction): boolean => SERVER_RECEIVES.has(direction);

/** Keywords that describe values without constraining them. */
const ANNOTATIONS: ReadonlySet<string> = new Set([
  'title',
  'description',
  'examples',
  'example',
  'default',
  'deprecated',
  'readOnly',
  'writeOnly',
  '$comment',
  '$schema',
  '$id',
  '$anchor',
  '$defs',
  'definitions',
  'externalDocs',
  'xml',
]);

/** Lower bounds, raising one narrows; upper bounds, raising one widens. */
const BOUNDS = [
  ...(['minimum', 'exclusiveMinimum', 'minLength', 'minItems', 'minProperties'] as const).map((keyword) => [keyword, 'narrows'] as const),
  ...(['maximum', 'exclusiveMaximum', 'maxLength', 'maxItems', 'maxProperties'] as const).map((keyword) => [keyword, 'widens'] as const),
];
/** Keywords whose containment is decidable only for presence: adding one narrows, a new value is unknown. */
const PREDICATES = ['pattern', 'format'] as const;
/** Composition keywords, the rule name they report under, and what adding a branch does. */
const COMPOSITIONS = [
  ['oneOf', 'one-of', 'widens'],
  ['anyOf', 'any-of', 'widens'],
  ['allOf', 'all-of', 'narrows'],
] as const;

const HANDLED: ReadonlySet<string> = new Set([
  ...BOUNDS.map(([keyword]) => keyword),
  ...PREDICATES,
  ...COMPOSITIONS.map(([keyword]) => keyword),
  'type',
  'nullable',
  'enum',
  'const',
  'required',
  'properties',
  'additionalProperties',
  'items',
  'prefixItems',
]);

/** A value's text with object keys sorted, so two equal values compare equal however they were written. */
export const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, node: unknown) => (isDict(node) ? Object.fromEntries(Object.keys(node).sort().map((key) => [key, node[key]])) : node));

const token = (key: string): string => key.replaceAll('~', '~0').replaceAll('/', '~1');

/** `true` is the empty schema; `false` stays `false`. */
const asDict = (schema: unknown): Dict | false => {
  if (schema === false) return false;
  return isDict(schema) ? schema : {};
};

/** A change at `pointer` from `before` to `after`, once its rule and effect are known. */
const at =
  (pointer: string, before: unknown, after: unknown) =>
  (rule: string, effect: Effect): Change => ({ rule, pointer, before, after, effect });

/** Presence first: a keyword set narrows, unset widens; `undefined` when both sides have it. */
const presence = (name: string, pointer: string, before: unknown, after: unknown): Change[] | undefined => {
  const change = at(pointer, before, after);
  if (before === undefined && after === undefined) return [];
  if (before === undefined) return [change(`${name}-set`, 'narrows')];
  if (after === undefined) return [change(`${name}-unset`, 'widens')];
  return undefined;
};

/** The schema's types, `null` included when OpenAPI 3.0's `nullable` says so; `undefined` is any type. */
const typesOf = (schema: Dict): string[] | undefined => {
  const { type } = schema;
  if (type === undefined) return undefined;
  const types = Array.isArray(type) ? type.map(String) : [String(type)];
  return schema.nullable === true ? [...types, 'null'] : types;
};

/** Whether `types` admits `type`: `number` admits every integer. */
const admits = (types: readonly string[], type: string): boolean => types.includes(type) || (type === 'integer' && types.includes('number'));

const compareTypes = (pointer: string, a: Dict, b: Dict): Change[] => {
  const before = typesOf(a);
  const after = typesOf(b);
  const set = presence('type', pointer, before, after);
  if (set !== undefined) return set;
  const change = at(pointer, before, after);
  const lost = (before as string[]).filter((type) => !admits(after as string[], type));
  const gained = (after as string[]).filter((type) => !admits(before as string[], type));
  return [
    ...(lost.includes('null') ? [change('became-not-nullable', 'narrows')] : []),
    ...(gained.includes('null') ? [change('became-nullable', 'widens')] : []),
    ...(lost.some((type) => type !== 'null') ? [change('type-narrowed', 'narrows')] : []),
    ...(gained.some((type) => type !== 'null') ? [change('type-widened', 'widens')] : []),
  ];
};

/** The values an `enum` or `const` allows; `undefined` is any value. */
const valuesOf = (schema: Dict): unknown[] | undefined => {
  if (has(schema, 'const')) return [schema.const];
  return Array.isArray(schema.enum) ? schema.enum : undefined;
};

const compareValues = (pointer: string, a: Dict, b: Dict): Change[] => {
  const before = valuesOf(a);
  const after = valuesOf(b);
  const set = presence('enum', pointer, before, after);
  if (set !== undefined) return set;
  const kept = (after as unknown[]).map((value) => canonical(value));
  const had = (before as unknown[]).map((value) => canonical(value));
  return [
    ...(before as unknown[]).filter((value) => !kept.includes(canonical(value))).map((value) => at(pointer, value, undefined)('enum-value-removed', 'narrows')),
    ...(after as unknown[]).filter((value) => !had.includes(canonical(value))).map((value) => at(pointer, undefined, value)('enum-value-added', 'widens')),
  ];
};

const compareBounds = (pointer: string, a: Dict, b: Dict): Change[] =>
  BOUNDS.flatMap(([keyword, raising]) => {
    const before = a[keyword];
    const after = b[keyword];
    if (before === after) return [];
    const where = `${pointer}/${keyword}`;
    const set = presence(keyword, where, before, after);
    if (set !== undefined) return set;
    // OpenAPI 3.0 spells `exclusiveMinimum` as a boolean; containment across the two is not decided here.
    if (typeof before !== 'number' || typeof after !== 'number') return [at(where, before, after)(`${keyword}-changed`, 'unknown')];
    // Stryker disable next-line EqualityOperator: equivalent, equal bounds returned above
    const up = after > before;
    return [at(where, before, after)(`${keyword}-${up ? 'increased' : 'decreased'}`, up === (raising === 'widens') ? 'widens' : 'narrows')];
  });

const comparePredicates = (pointer: string, a: Dict, b: Dict): Change[] =>
  PREDICATES.flatMap((keyword) => {
    const before = a[keyword];
    const after = b[keyword];
    if (before === after) return [];
    const where = `${pointer}/${keyword}`;
    return presence(keyword, where, before, after) ?? [at(where, before, after)(`${keyword}-changed`, 'unknown')];
  });

/** Any keyword not compared elsewhere that differs: reported as unknown, never as compatible. */
const compareRest = (pointer: string, a: Dict, b: Dict): Change[] =>
  [...new Set([...Object.keys(a), ...Object.keys(b)])]
    .sort()
    .filter((keyword) => !HANDLED.has(keyword) && !ANNOTATIONS.has(keyword) && !keyword.startsWith('x-') && canonical(a[keyword]) !== canonical(b[keyword]))
    .map((keyword) => at(`${pointer}/${token(keyword)}`, a[keyword], b[keyword])('keyword-changed', 'unknown'));

interface Walk {
  readonly direction: Direction;
  readonly documents: Documents;
  /** The `$ref` pairs open on the current path: a pair seen again is a cycle, and adds nothing new. */
  readonly open: Set<string>;
}

/** Whether undeclared properties are allowed anything, so declaring one changes nothing an old peer sent. */
const isOpen = (schema: Dict): boolean => schema.additionalProperties === undefined || schema.additionalProperties === true;

const requiredOf = (schema: Dict): ReadonlySet<string> => new Set(Array.isArray(schema.required) ? schema.required.map(String) : []);

const propertiesOf = (schema: Dict): Dict => (isDict(schema.properties) ? schema.properties : {});

interface Sides {
  readonly a: Dict;
  readonly b: Dict;
}

/** The required-ness of one property, which reads the same whether it is declared or not. */
const compareRequired = (pointer: string, name: string, { a, b }: Sides): Change[] => {
  const was = requiredOf(a).has(name);
  const is = requiredOf(b).has(name);
  if (was === is) return [];
  const change = at(pointer, was, is);
  if (is) return [change(has(propertiesOf(a), name) ? 'property-became-required' : 'required-property-added', 'narrows')];
  return [change(has(propertiesOf(b), name) ? 'property-became-optional' : 'required-property-removed', 'widens')];
};

/**
 * One property's schema. Declared on one side only, it is compared with what the other side allowed
 * in its place, unless that side is open, where it is neutral; a required-ness change already says it.
 */
const compareProperty = (walk: Walk, pointer: string, name: string, { a, b }: Sides): Change[] => {
  const before = propertiesOf(a);
  const after = propertiesOf(b);
  if (has(before, name) && has(after, name)) return compare(walk, pointer, before[name], after[name]);
  const required = requiredOf(a).has(name) || requiredOf(b).has(name);
  if (has(after, name)) {
    if (!isOpen(a)) return compare(walk, pointer, a.additionalProperties, after[name]);
    return required ? [] : [at(pointer, undefined, after[name])('property-added', 'neutral')];
  }
  if (!has(before, name)) return [];
  if (!isOpen(b)) return compare(walk, pointer, before[name], b.additionalProperties);
  return required ? [] : [at(pointer, before[name], undefined)('property-removed', 'neutral')];
};

const compareObjects = (walk: Walk, pointer: string, sides: Sides): Change[] => {
  const { a, b } = sides;
  // A property the receiver of this direction never sees is no part of its contract.
  const hidden = serverReceives(walk.direction) ? 'readOnly' : 'writeOnly';
  const unseen = (name: string): boolean => [propertiesOf(a)[name], propertiesOf(b)[name]].some((schema) => isDict(schema) && schema[hidden] === true);
  const names = [...new Set([...Object.keys(propertiesOf(a)), ...Object.keys(propertiesOf(b)), ...requiredOf(a), ...requiredOf(b)])].sort();
  const changes = names
    .filter((name) => !unseen(name))
    .flatMap((name) => {
      const where = `${pointer}/properties/${token(name)}`;
      return [...compareRequired(where, name, sides), ...compareProperty(walk, where, name, sides)];
    });
  if (a.additionalProperties === undefined && b.additionalProperties === undefined) return changes;
  return [...changes, ...compare(walk, `${pointer}/additionalProperties`, a.additionalProperties ?? true, b.additionalProperties ?? true)];
};

const arrayOf = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const compareArrays = (walk: Walk, pointer: string, { a, b }: Sides): Change[] => {
  const items = a.items === undefined && b.items === undefined ? [] : compare(walk, `${pointer}/items`, a.items ?? true, b.items ?? true);
  const before = arrayOf(a.prefixItems);
  const after = arrayOf(b.prefixItems);
  if (before.length !== after.length) return [...items, at(`${pointer}/prefixItems`, before.length, after.length)('prefixItems-changed', 'unknown')];
  return [...items, ...before.flatMap((item, index) => compare(walk, `${pointer}/prefixItems/${String(index)}`, item, after[index]))];
};

/**
 * `oneOf`, `anyOf` and `allOf`: the same number of branches is compared branch by branch; otherwise
 * each branch with no equal on the other side is added or removed. A union branch added widens, an
 * `allOf` one narrows. ponytail: a branch added to `oneOf` can also narrow, where a value now matches
 * two; deciding that needs the branches' intersection.
 */
const compareCompositions = (walk: Walk, pointer: string, { a, b }: Sides): Change[] =>
  COMPOSITIONS.flatMap(([keyword, name, adding]) => {
    const before = arrayOf(a[keyword]);
    const after = arrayOf(b[keyword]);
    const where = `${pointer}/${keyword}`;
    if (before.length === after.length) return before.flatMap((branch, index) => compare(walk, `${where}/${String(index)}`, branch, after[index]));
    const kept = after.map((branch) => canonical(branch));
    const had = before.map((branch) => canonical(branch));
    const removing = adding === 'widens' ? 'narrows' : 'widens';
    return [
      ...before.flatMap((branch, index) => (kept.includes(canonical(branch)) ? [] : [at(`${where}/${String(index)}`, branch, undefined)(`${name}-removed`, removing)])),
      ...after.flatMap((branch, index) => (had.includes(canonical(branch)) ? [] : [at(`${where}/${String(index)}`, undefined, branch)(`${name}-added`, adding)])),
    ];
  });

/**
 * A `$ref` replaced by its target. Keywords beside it apply too: merged in when none is also the
 * target's, which is the same intersection, else with the target moved under `allOf`.
 */
const follow = (schema: Dict, document: unknown): Dict | false => {
  const { $ref: ref, ...siblings } = schema;
  const target = asDict(pointerGet(document, String(ref)));
  if (target === false) return false;
  if (Object.keys(siblings).every((key) => !has(target, key))) return { ...target, ...siblings };
  return { ...siblings, allOf: [target, ...arrayOf(siblings.allOf)] };
};

const local = (schema: unknown): schema is Dict => isDict(schema) && typeof schema.$ref === 'string' && schema.$ref.startsWith('#');

/** Both sides with their local references followed, once per pair on the path. */
const compareRefs = (walk: Walk, pointer: string, a: unknown, b: unknown): Change[] => {
  // The pair open on this path; an inline side is keyed by where it is, since it ends by itself.
  const key = `${local(a) ? String(a.$ref) : pointer}\n${local(b) ? String(b.$ref) : pointer}`;
  if (walk.open.has(key)) return [];
  walk.open.add(key);
  const changes = compare(walk, pointer, local(a) ? follow(a, walk.documents.old) : a, local(b) ? follow(b, walk.documents.new) : b);
  walk.open.delete(key);
  return changes;
};

function compare(walk: Walk, pointer: string, a: unknown, b: unknown): Change[] {
  if (local(a) || local(b)) return compareRefs(walk, pointer, a, b);
  const before = asDict(a);
  const after = asDict(b);
  if (before === false && after === false) return [];
  if (after === false) return [at(pointer, a, b)('accepts-nothing', 'narrows')];
  if (before === false) return [at(pointer, a, b)('accepts-something', 'widens')];
  if (before.$ref !== after.$ref) return [at(`${pointer}/$ref`, before.$ref, after.$ref)('external-ref-changed', 'unknown')];
  const sides = { a: before, b: after };
  return [
    ...compareTypes(pointer, before, after),
    ...compareValues(pointer, before, after),
    ...compareBounds(pointer, before, after),
    ...comparePredicates(pointer, before, after),
    ...compareObjects(walk, pointer, sides),
    ...compareArrays(walk, pointer, sides),
    ...compareCompositions(walk, pointer, sides),
    ...compareRest(pointer, before, after),
  ];
}

/**
 * Every difference between `a` (old) and `b` (new) for a payload travelling in `direction`.
 * Pure: the same pair gives the same list, in keyword order.
 */
export const compareSchemas = (a: JsonSchema, b: JsonSchema, direction: Direction, documents: Documents = {}): Change[] =>
  compare({ direction, documents, open: new Set() }, '', a, b);
