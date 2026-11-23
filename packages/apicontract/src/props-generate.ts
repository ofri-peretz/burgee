/**
 * Values from a payload's JSON Schema (contract-properties R1): the inputs no one chose. The
 * generator is written apart from the validator, so where the two disagree one of them is wrong.
 *
 * Each keyword is in one of three lists. `GENERATED` keywords are honoured: a value made from them
 * alone is valid, and the validator refusing it is a counterexample. `REPORTED` keywords are not
 * honoured: a value is made without them and kept only if the validator accepts it, and each is
 * reported where it was met, never skipped in silence. Everything else is an annotation.
 */
import { pointerGet } from './core/resolve.js';
import { canonical, has, isDict } from './diff-normalise.js';
import { type Random } from './props-random.js';

/** The dialects the validator reads, and so the ones a value is made for. */
export type Draft = '2020-12' | 'draft-07' | 'openapi-3.0';

/** Keywords a value is made to satisfy exactly. */
export const GENERATED = [
  '$ref',
  'type',
  'nullable',
  'const',
  'enum',
  'allOf',
  'anyOf',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'minLength',
  'maxLength',
  'format',
  'items',
  'prefixItems',
  'additionalItems',
  'minItems',
  'maxItems',
  'properties',
  'required',
  'additionalProperties',
  'minProperties',
  'maxProperties',
] as const;

/** Keywords that apply to a whole schema and are not held to: the validator filters, and each one met is reported. */
const REPORTED_ANYWHERE = ['oneOf', 'not', 'if', 'unevaluatedProperties', 'unevaluatedItems', '$dynamicRef', '$recursiveRef', 'contentSchema'] as const;
const REPORTED_STRING = ['pattern'] as const;
const REPORTED_ARRAY = ['uniqueItems', 'contains'] as const;
const REPORTED_OBJECT = ['propertyNames', 'patternProperties', 'dependentRequired', 'dependentSchemas', 'dependencies'] as const;

/** Keywords a value is not made to satisfy. */
export const REPORTED = [...REPORTED_ANYWHERE, ...REPORTED_STRING, ...REPORTED_ARRAY, ...REPORTED_OBJECT] as const;

/** The formats a value is made for, by the name the schema gives them. */
export const FORMATS = ['date', 'date-time', 'time', 'duration', 'email', 'hostname', 'ipv4', 'ipv6', 'uuid', 'regex', 'byte'] as const;
export type Format = (typeof FORMATS)[number];

type Dict = Readonly<Record<string, unknown>>;

export interface Draw {
  readonly random: Random;
  /** The document `$ref`s point into. */
  readonly root: unknown;
  readonly draft: Draft;
  /** False once the value was made without a keyword it should hold to: the validator then decides. */
  exact: boolean;
  /** Each reported keyword, with the schema pointers it was met at. */
  readonly reported: Map<string, Set<string>>;
}

export const drawFrom = (random: Random, root: unknown, draft: Draft): Draw => ({ random, root, draft, exact: true, reported: new Map() });

/** A value, or `undefined` when none could be made: a `false` schema, an empty range, a reference that is not there. */
export type Made = { readonly value: unknown } | undefined;

/** How deep optional properties and items still go: past it, only what is required is made. */
export const SOFT_DEPTH = 4;
/** How deep a value goes at all: a schema that requires itself has no finite value. */
export const HARD_DEPTH = 24;
/** The widest a range with no bound on one side is drawn from. */
const WINDOW = 100;
/** The most characters, items or extra properties beyond a minimum. */
const SPREAD = 4;
/** How often a number is drawn at an end of its range, where an off-by-one lives. */
const EDGE = 0.3;
/** How often an optional property is present, or a number is whole. */
const HALF = 0.5;
/** How often an object gets one more property its schema allows but does not name. */
const EXTRA = 0.2;
/** Decimal places a drawn fraction is rounded to, so it prints short and parses back the same. */
const PLACES = 1000;

export const report = (draw: Draw, keyword: string, pointer: string): void => {
  draw.exact = false;
  const at = draw.reported.get(keyword) ?? new Set<string>();
  at.add(pointer === '' ? '/' : pointer);
  draw.reported.set(keyword, at);
};

const reportPresent = (draw: Draw, schema: Dict, keywords: readonly string[], pointer: string): void => {
  for (const keyword of keywords) if (has(schema, keyword)) report(draw, keyword, pointer);
};

export const without = (schema: Dict, keys: readonly string[]): Dict => Object.fromEntries(Object.entries(schema).filter(([key]) => !keys.includes(key)));

export const token = (key: string): string => key.replaceAll('~', '~0').replaceAll('/', '~1');

/** The schema a `$ref` names, or `undefined` with the reference reported. */
const target = (draw: Draw, ref: unknown, pointer: string): unknown => {
  try {
    return pointerGet(draw.root, String(ref));
  } catch {
    // A reference that names nothing has no values: said in the report, not thrown.
    report(draw, '$ref', pointer);
    return undefined;
  }
};

/** An array schema's items: the tuple, the schema of the rest (`false` when there may be none), and the keywords each sits under. */
export interface Items {
  readonly tuple: readonly unknown[];
  readonly tupleKey: string;
  readonly rest: unknown;
  readonly restKey: string;
}

export const itemsOf = (schema: Dict): Items => {
  if (Array.isArray(schema.prefixItems)) return { tuple: schema.prefixItems, tupleKey: 'prefixItems', rest: schema.items ?? true, restKey: 'items' };
  if (Array.isArray(schema.items)) return { tuple: schema.items, tupleKey: 'items', rest: schema.additionalItems ?? true, restKey: 'additionalItems' };
  return { tuple: [], tupleKey: 'prefixItems', rest: schema.items ?? true, restKey: 'items' };
};

const LOWER_BOUNDS: ReadonlySet<string> = new Set(['minimum', 'exclusiveMinimum', 'minLength', 'minItems', 'minProperties']);
const UPPER_BOUNDS: ReadonlySet<string> = new Set(['maximum', 'exclusiveMaximum', 'maxLength', 'maxItems', 'maxProperties']);

const typeList = (type: unknown): string[] => (Array.isArray(type) ? type.map(String) : [String(type)]);

/** Two `type`s as the one both allow: `integer` is a `number`. */
export const bothTypes = (a: unknown, b: unknown): string[] => {
  const right = typeList(b);
  const left = typeList(a);
  const shared = left.filter((type) => right.includes(type));
  const whole = (left.includes('integer') && right.includes('number')) || (left.includes('number') && right.includes('integer'));
  return whole && !shared.includes('integer') ? [...shared, 'integer'] : shared;
};

const mergeProperties = (mine: Dict, theirs: Dict): Dict =>
  Object.fromEntries([...new Set([...Object.keys(mine), ...Object.keys(theirs)])].map((name) => [name, has(mine, name) && has(theirs, name) ? { allOf: [mine[name], theirs[name]] } : (mine[name] ?? theirs[name])]));

/** Both parts' value of one keyword as the value that holds both, or `false` when nothing can. */
const mergeKey = (draw: Draw, key: string, values: readonly [unknown, unknown], pointer: string): unknown => {
  const [mine, theirs] = values;
  if (key === 'type') {
    const types = bothTypes(mine, theirs);
    return types.length === 0 ? false : types;
  }
  if (key === 'required') return [...new Set([...(mine as string[]), ...(theirs as string[])])];
  if (key === 'properties') return mergeProperties(mine as Dict, theirs as Dict);
  if (typeof mine === 'number' && typeof theirs === 'number' && LOWER_BOUNDS.has(key)) return Math.max(mine, theirs);
  if (typeof mine === 'number' && typeof theirs === 'number' && UPPER_BOUNDS.has(key)) return Math.min(mine, theirs);
  if (canonical(mine) !== canonical(theirs)) report(draw, key, pointer);
  return mine;
};

/** A part of an `allOf` with its reference followed, as the schema it stands for; `false` past `HARD_DEPTH`, where a schema made of itself ends. */
const resolvePart = (draw: Draw, part: unknown, pointer: string, depth: number): Dict | false => {
  if (depth > HARD_DEPTH) return false;
  if (part === true) return {};
  if (!isDict(part)) return false;
  if (!has(part, '$ref')) return part;
  const found = target(draw, part.$ref, pointer);
  const rest = without(part, ['$ref']);
  // Before 2020-12, and in OpenAPI 3.0, a `$ref` is the whole of its schema.
  if (draw.draft !== '2020-12' || Object.keys(rest).length === 0) return resolvePart(draw, found, pointer, depth + 1);
  return merge(draw, [found, rest], pointer, depth + 1);
};

/** The parts of an `allOf` as one schema, where that is exact; a keyword they disagree on is reported, `false` when no value can satisfy them. */
export function merge(draw: Draw, parts: readonly unknown[], pointer: string, depth = 0): Dict | false {
  if (parts.length > 1 && parts.some((part) => isDict(part) && has(part, 'additionalProperties'))) report(draw, 'additionalProperties', pointer);
  let out: Dict = {};
  for (const raw of parts) {
    const part = resolvePart(draw, raw, pointer, depth);
    // Stryker disable next-line ConditionalExpression,BooleanLiteral: equivalent, a `false` part has no `allOf`, so the next line returns it
    if (part === false) return false;
    const flat = Array.isArray(part.allOf) ? merge(draw, [without(part, ['allOf']), ...part.allOf], pointer, depth + 1) : part;
    if (flat === false) return false;
    out = mergeTwo(draw, [out, flat], pointer, depth);
    // `type: false` is how a part says no value can satisfy it with the others.
    if (out.type === false) return false;
  }
  return out;
}

const mergeTwo = (draw: Draw, [mine, theirs]: readonly [Dict, Dict], pointer: string, depth: number): Dict => {
  const entries = new Map(Object.entries(mine));
  let second: readonly unknown[] | undefined;
  for (const [key, value] of Object.entries(theirs)) {
    if (key === 'anyOf' && Array.isArray(value) && entries.has('anyOf')) second = value;
    else entries.set(key, entries.has(key) ? mergeKey(draw, key, [entries.get(key), value], pointer) : value);
  }
  if (second === undefined) return Object.fromEntries(entries);
  // Picking one branch of a second list, once every other keyword is in, is exact: a value of that branch satisfies the list.
  // Stryker disable next-line ArithmeticOperator,NumericLiteral: equivalent for ending, a schema can only reach itself through a `$ref`, and resolvePart counts each
  const branch = merge(draw, [Object.fromEntries(entries), draw.random.pick(second)], pointer, depth + 1);
  return branch === false ? { type: false } : branch;
};

const TYPES = ['null', 'boolean', 'integer', 'number', 'string', 'array', 'object'] as const;
/** The types with no members, which end a value that may nest. */
const SCALARS = TYPES.filter((type) => type !== 'array' && type !== 'object');
const IMPLIED: ReadonlyMap<string, string> = new Map([
  ...['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf'].map((key) => [key, 'number'] as const),
  ...['minLength', 'maxLength', 'format'].map((key) => [key, 'string'] as const),
  ...['items', 'prefixItems', 'minItems', 'maxItems'].map((key) => [key, 'array'] as const),
  ...['properties', 'required', 'additionalProperties', 'minProperties', 'maxProperties'].map((key) => [key, 'object'] as const),
]);

/** The types a value may take: the schema's own, `null` beside them where OpenAPI 3.0 says `nullable`; else the ones its keywords bind. */
export const typesOf = (schema: Dict, draft: Draft): string[] => {
  if (has(schema, 'type')) {
    const declared = typeList(schema.type);
    return draft === 'openapi-3.0' && schema.nullable === true && !declared.includes('null') ? [...declared, 'null'] : declared;
  }
  const implied = [...new Set(Object.keys(schema).flatMap((key) => IMPLIED.get(key) ?? []))];
  // Without `type` every value is allowed and each keyword binds its own type: the bound ones are the interesting ones.
  return implied.length > 0 ? implied : [...TYPES];
};

/** The bounds of a number: low and high, each with whether it is excluded. */
export interface Range {
  readonly low: number;
  readonly lowOut: boolean;
  readonly high: number;
  readonly highOut: boolean;
}

/** One end of a range: the inclusive bound, overridden by an exclusive one that is as tight or tighter. */
const end = (schema: Dict, draft: Draft, side: 'Minimum' | 'Maximum'): { readonly at: number | undefined; readonly out: boolean } => {
  const inclusive = schema[side === 'Minimum' ? 'minimum' : 'maximum'];
  const exclusive = schema[`exclusive${side}`];
  const at = typeof inclusive === 'number' ? inclusive : undefined;
  if (typeof exclusive !== 'number') return { at, out: draft === 'openapi-3.0' && exclusive === true };
  const tighter = at === undefined || (side === 'Minimum' ? exclusive >= at : exclusive <= at);
  return tighter ? { at: exclusive, out: true } : { at, out: false };
};

export const rangeOf = (schema: Dict, draft: Draft): Range => {
  const low = end(schema, draft, 'Minimum');
  const high = end(schema, draft, 'Maximum');
  // An open end is a window from the other one; with neither, a window each side of zero.
  const from = low.at ?? (high.at === undefined ? -WINDOW : high.at - WINDOW);
  const to = high.at ?? (low.at === undefined ? WINDOW : from + WINDOW);
  return { low: from, lowOut: low.out, high: to, highOut: high.out };
};

/** The whole numbers inside a range, as their least and greatest. */
export const wholeIn = (range: Range): readonly [number, number] => [range.lowOut ? Math.floor(range.low) + 1 : Math.ceil(range.low), range.highOut ? Math.ceil(range.high) - 1 : Math.floor(range.high)];

const integer = (draw: Draw, schema: Dict, pointer: string): Made => {
  const [low, high] = wholeIn(rangeOf(schema, draw.draft));
  const step = schema.multipleOf;
  if (typeof step === 'number') {
    if (!Number.isInteger(step)) report(draw, 'multipleOf', pointer);
    const from = Math.ceil(low / step);
    const to = Math.floor(high / step);
    return from > to ? undefined : { value: draw.random.int(from, to) * step };
  }
  if (low > high) return undefined;
  return { value: draw.random.chance(EDGE) ? draw.random.pick([low, high]) : draw.random.int(low, high) };
};

export const inside = (range: Range, value: number): boolean =>
  (value > range.low || (!range.lowOut && value === range.low)) && (value < range.high || (!range.highOut && value === range.high));

const number = (draw: Draw, schema: Dict, pointer: string): Made => {
  if (typeof schema.multipleOf === 'number' || draw.random.chance(HALF)) return integer(draw, schema, pointer);
  const range = rangeOf(schema, draw.draft);
  if (range.low > range.high || (range.low === range.high && (range.lowOut || range.highOut))) return undefined;
  const drawn = Math.round((range.low + draw.random.next() * (range.high - range.low)) * PLACES) / PLACES;
  return { value: inside(range, drawn) ? drawn : (range.low + range.high) / 2 };
};

/** Characters a string is drawn from: ASCII, an accent, a CJK character and one outside the BMP, which counts as one. */
const CHARACTERS = ['a', 'b', 'z', 'A', 'Q', '0', '7', ' ', '-', '_', '.', 'é', '中', '😀'];
const WORD = ['a', 'b', 'k', 'x', 'z', '0', '9'];
const HEX = [...'0123456789abcdef'];
const VARIANT = ['8', '9', 'a', 'b'];
const PATTERNS = ['^a$', '[0-9]+', 'x|y', String.raw`\d{2,4}`];
const OFFSETS = ['Z', '+00:00', '.5Z'];
/** The parts of a date and time, as [least, greatest]. */
const YEAR = [1970, 2099] as const;
const MONTH = [1, 12] as const;
/** Every month has 28 days. */
const DAY = [1, 28] as const;
const HOUR = [0, 23] as const;
const MINUTE = [0, 59] as const;
const COUNT = [1, 9] as const;
const BYTE = [0, 255] as const;
const BYTES = [0, 9] as const;
const IPV4_PARTS = 4;
const IPV6_PARTS = 8;
const HEX_GROUP = [1, 4] as const;
/** A version 4 UUID's groups: 8, 4, then 4 starting `4`, 4 starting with the variant, 12. */
const UUID = [8, 4, 3, 3, 12] as const;

const within = (draw: Draw, [low, high]: readonly [number, number]): number => draw.random.int(low, high);
const pad = (value: number): string => String(value).padStart(2, '0');
const hex = (draw: Draw, count: number): string => Array.from({ length: count }, () => draw.random.pick(HEX)).join('');
const word = (draw: Draw): string => Array.from({ length: draw.random.int(1, SPREAD + 2) }, () => draw.random.pick(WORD)).join('');
const date = (draw: Draw): string => `${String(within(draw, YEAR))}-${pad(within(draw, MONTH))}-${pad(within(draw, DAY))}`;
const time = (draw: Draw): string => `${pad(within(draw, HOUR))}:${pad(within(draw, MINUTE))}:${pad(within(draw, MINUTE))}${draw.random.pick(OFFSETS)}`;
const count = (draw: Draw): string => String(within(draw, COUNT));

const FORMAT: Readonly<Record<Format, (draw: Draw) => string>> = {
  date,
  'date-time': (draw) => `${date(draw)}T${time(draw)}`,
  time,
  duration: (draw) => draw.random.pick([`P${count(draw)}D`, `PT${count(draw)}H`, `P${count(draw)}Y${count(draw)}M`]),
  email: (draw) => `${word(draw)}@${word(draw)}.com`,
  hostname: (draw) => `${word(draw)}.${word(draw)}.org`,
  ipv4: (draw) => Array.from({ length: IPV4_PARTS }, () => String(within(draw, BYTE))).join('.'),
  ipv6: (draw) => Array.from({ length: IPV6_PARTS }, () => hex(draw, within(draw, HEX_GROUP))).join(':'),
  uuid: (draw) => {
    const [first, second, third, fourth, fifth] = UUID;
    return `${hex(draw, first)}-${hex(draw, second)}-4${hex(draw, third)}-${draw.random.pick(VARIANT)}${hex(draw, fourth)}-${hex(draw, fifth)}`;
  },
  regex: (draw) => draw.random.pick(PATTERNS),
  byte: (draw) => Buffer.from(Array.from({ length: within(draw, BYTES) }, () => within(draw, BYTE))).toString('base64'),
};

export const isFormat = (name: unknown): name is Format => (FORMATS as readonly unknown[]).includes(name);

const string = (draw: Draw, schema: Dict, pointer: string): Made => {
  reportPresent(draw, schema, REPORTED_STRING, pointer);
  if (isFormat(schema.format)) {
    if (has(schema, 'minLength') || has(schema, 'maxLength')) report(draw, 'format-length', pointer);
    const write = new Map(Object.entries(FORMAT)).get(schema.format) as (draw: Draw) => string;
    return { value: write(draw) };
  }
  if (has(schema, 'format')) report(draw, `format:${String(schema.format)}`, pointer);
  const low = typeof schema.minLength === 'number' ? schema.minLength : 0;
  const high = Math.min(typeof schema.maxLength === 'number' ? schema.maxLength : Infinity, low + SPREAD * 2);
  if (low > high) return undefined;
  return { value: Array.from({ length: draw.random.int(low, high) }, () => draw.random.pick(CHARACTERS)).join('') };
};

/** Any JSON value, small: what `true` and `{}` allow. */
export const anyValue = (draw: Draw, depth: number): unknown => {
  const kind = draw.random.pick(depth < SOFT_DEPTH ? TYPES : SCALARS);
  if (kind === 'null') return null;
  if (kind === 'boolean') return draw.random.chance(HALF);
  if (kind === 'integer') return draw.random.int(-WINDOW, WINDOW);
  if (kind === 'number') return draw.random.int(-WINDOW * PLACES, WINDOW * PLACES) / PLACES;
  if (kind === 'string') return word(draw);
  // Stryker disable next-line EqualityOperator: equivalent, arrays and objects are drawn as often, so drawing one for the other draws the same
  if (kind === 'array') return Array.from({ length: draw.random.int(0, 2) }, () => anyValue(draw, depth + 1));
  return Object.fromEntries(Array.from({ length: draw.random.int(0, 2) }, () => [word(draw), anyValue(draw, depth + 1)]));
};

/** Where in the schema and the value a draw is. */
interface At {
  readonly pointer: string;
  readonly depth: number;
}

const array = (draw: Draw, schema: Dict, at: At): Made => {
  reportPresent(draw, schema, REPORTED_ARRAY, at.pointer);
  const { tuple, tupleKey, rest, restKey } = itemsOf(schema);
  const low = typeof schema.minItems === 'number' ? schema.minItems : 0;
  const caps = [typeof schema.maxItems === 'number' ? schema.maxItems : Infinity, rest === false ? tuple.length : Infinity, at.depth >= SOFT_DEPTH ? low : Infinity, low + SPREAD];
  const high = Math.min(...caps);
  if (low > high) return undefined;
  const items: unknown[] = [];
  for (let index = 0, length = draw.random.int(low, high); index < length; index += 1) {
    const fromTuple = index < tuple.length;
    const made = make(draw, fromTuple ? tuple[index] : rest, fromTuple ? `${at.pointer}/${tupleKey}/${String(index)}` : `${at.pointer}/${restKey}`, at.depth + 1);
    if (made === undefined) return undefined;
    items.push(made.value);
  }
  return { value: items };
};

/** A property name none of `taken` is. */
export const freshName = (taken: ReadonlySet<string>): string => {
  let name = 'extra';
  while (taken.has(name)) name = `${name}_`;
  return name;
};

/** An object being built: its entries, kept in a map so a property named `__proto__` is a property. */
interface Building {
  readonly draw: Draw;
  readonly entries: Map<string, unknown>;
  readonly at: At;
}

const add = (building: Building, name: string, schema: unknown, pointer: string): boolean => {
  const made = make(building.draw, schema, pointer, building.at.depth + 1);
  if (made !== undefined) building.entries.set(name, made.value);
  return made !== undefined;
};

/** The optional properties, each present half the time, and as many as `minProperties` needs. */
const optionalProperties = (building: Building, properties: Dict, bounds: readonly [number, number]): void => {
  const { draw, entries, at } = building;
  const [low, high] = bounds;
  for (const name of Object.keys(properties)) {
    const wanted = entries.size < low || (at.depth < SOFT_DEPTH && draw.random.chance(HALF));
    // An optional property whose schema has no value is left out, which is what the schema allows.
    if (!entries.has(name) && entries.size < high && wanted) add(building, name, properties[name], `${at.pointer}/properties/${token(name)}`);
  }
};

/** Properties the schema allows without naming, now and then, and as many as `minProperties` still needs. */
const extraProperties = (building: Building, schema: Dict, bounds: readonly [number, number]): void => {
  const { draw, entries, at } = building;
  const [low, high] = bounds;
  const extra: unknown = schema.additionalProperties ?? true;
  // Stryker disable next-line ConditionalExpression: equivalent for `false`, which makes no value, so no extra is added either way
  if (extra === false || has(schema, 'patternProperties')) return;
  const named = Object.keys(isDict(schema.properties) ? schema.properties : {});
  const more = (): boolean => entries.size < high && (entries.size < low || (at.depth < SOFT_DEPTH && draw.random.chance(EXTRA)));
  while (more() && add(building, freshName(new Set([...named, ...entries.keys()])), extra, `${at.pointer}/additionalProperties`));
};

const object = (draw: Draw, schema: Dict, at: At): Made => {
  reportPresent(draw, schema, REPORTED_OBJECT, at.pointer);
  const properties = isDict(schema.properties) ? schema.properties : {};
  const required = Array.isArray(schema.required) ? schema.required.map(String) : [];
  const building: Building = { draw, entries: new Map(), at };
  for (const name of required) {
    const [sub, pointer] = has(properties, name) ? [properties[name], `${at.pointer}/properties/${token(name)}`] : [schema.additionalProperties ?? true, `${at.pointer}/additionalProperties`];
    if (!add(building, name, sub, pointer)) return undefined;
  }
  // Stryker disable next-line ConditionalExpression: equivalent, a size compared with what is not a number is never less than it, as with 0
  const low = typeof schema.minProperties === 'number' ? schema.minProperties : 0;
  const high = typeof schema.maxProperties === 'number' ? schema.maxProperties : Infinity;
  optionalProperties(building, properties, [low, high]);
  extraProperties(building, schema, [low, high]);
  const { size } = building.entries;
  return size < low || size > high ? undefined : { value: Object.fromEntries(building.entries) };
};

const KNOWN: ReadonlySet<string> = new Set([...GENERATED, ...REPORTED]);
const constraints = (schema: Dict): string[] => Object.keys(schema).filter((key) => KNOWN.has(key));

/** A value from the keywords that combine schemas: `$ref`, `allOf`, `anyOf`, `oneOf`; `null` when there are none. */
const combined = (draw: Draw, schema: Dict, at: At): Made | null => {
  if (has(schema, '$ref')) {
    const rest = without(schema, ['$ref']);
    // A reference that names nothing gives `undefined`, which no value is made from.
    const found = target(draw, schema.$ref, at.pointer);
    // Before 2020-12, and in OpenAPI 3.0, a `$ref` is the whole of its schema.
    const whole = draw.draft !== '2020-12' || constraints(rest).length === 0;
    return whole ? make(draw, found, String(schema.$ref), at.depth + 1) : make(draw, { allOf: [found, rest] }, at.pointer, at.depth + 1);
  }
  if (Array.isArray(schema.allOf)) {
    // Stryker disable next-line ArrayDeclaration,StringLiteral: equivalent, merging the parts a second time holds to the same keywords
    return make(draw, merge(draw, [without(schema, ['allOf']), ...schema.allOf], at.pointer, at.depth), at.pointer, at.depth + 1);
  }
  const keyword = ['anyOf', 'oneOf'].find((key) => Array.isArray(schema[key]) && (schema[key] as unknown[]).length > 0);
  if (keyword === undefined) return null;
  const branches = schema[keyword] as unknown[];
  const index = draw.random.int(0, branches.length - 1);
  const pointer = `${at.pointer}/${keyword}/${String(index)}`;
  return make(draw, merge(draw, [without(schema, [keyword]), branches[index]], pointer, at.depth), pointer, at.depth + 1);
};

/** A value from `const` or `enum`; `null` when the schema has neither. */
const listed = (draw: Draw, schema: Dict, pointer: string): Made | null => {
  if (!has(schema, 'const') && !has(schema, 'enum')) return null;
  // A value list beside other constraints is drawn from without them: the validator decides.
  if (constraints(schema).some((key) => key !== 'const' && key !== 'enum')) report(draw, 'enum-with-constraints', pointer);
  if (has(schema, 'const')) return { value: structuredClone(schema.const) };
  const values = Array.isArray(schema.enum) ? schema.enum : [];
  return values.length === 0 ? undefined : { value: structuredClone(draw.random.pick(values)) };
};

const typed = (draw: Draw, schema: Dict, at: At): Made => {
  const type = draw.random.pick(typesOf(schema, draw.draft));
  if (type === 'null') return { value: null };
  if (type === 'boolean') return { value: draw.random.chance(HALF) };
  if (type === 'integer') return integer(draw, schema, at.pointer);
  if (type === 'number') return number(draw, schema, at.pointer);
  if (type === 'string') return string(draw, schema, at.pointer);
  if (type === 'array') return array(draw, schema, at);
  if (type === 'object') return object(draw, schema, at);
  report(draw, `type:${type}`, at.pointer);
  return undefined;
};

/** A value `schema` accepts, made from its keywords; `pointer` names the schema in reports. */
export function make(draw: Draw, schema: unknown, pointer = '', depth = 0): Made {
  if (schema === true) return { value: anyValue(draw, depth) };
  if (!isDict(schema) || depth > HARD_DEPTH) return undefined;
  const at = { pointer, depth };
  reportPresent(draw, schema, REPORTED_ANYWHERE, pointer);
  const viaParts = combined(draw, schema, at);
  if (viaParts !== null) return viaParts;
  const fromList = listed(draw, schema, pointer);
  return fromList === null ? typed(draw, schema, at) : fromList;
}
