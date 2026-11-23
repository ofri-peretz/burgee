/**
 * A valid value with one constraint broken (contract-properties R2), and which one: the validator
 * must refuse it, and say so at the place that was broken. Only a schema the generator holds to
 * exactly is broken, and only where nothing else could make the value valid again: never inside a
 * union, a `not`, or beside a keyword the generator reports.
 */
import { pointerGet } from './core/resolve.js';
import { canonical, has, isDict } from './diff-normalise.js';
import { type Draw, freshName, GENERATED, itemsOf, rangeOf, REPORTED, token, typesOf, wholeIn } from './props-generate.js';

type Dict = Readonly<Record<string, unknown>>;

export interface Mutant {
  readonly value: unknown;
  /** The keyword broken. */
  readonly keyword: string;
  /** JSON Pointer into the value, to where it was broken. */
  readonly path: string;
}

/** One way to break the value: what to put at `tokens`, or `undefined` to remove what is there. */
interface Break {
  readonly keyword: string;
  readonly tokens: readonly string[];
  readonly replace: { readonly value: unknown } | undefined;
}

/** Where a walk is: the draw, the path into the value, and how deep. */
interface Walk {
  readonly draw: Draw;
  readonly tokens: readonly string[];
  readonly depth: number;
}

const HELD: ReadonlySet<string> = new Set(GENERATED);
const LOOSE: ReadonlySet<string> = new Set(REPORTED);
/** Keywords that let a value be valid another way, so breaking a sibling proves nothing. */
const OPEN = ['anyOf', 'allOf', ...REPORTED];
/** How many references are followed, and how deep a value is walked, before giving up on breaking it. */
const LIMIT = 8;
/** How often a rarer break is chosen over a `type` break, which every typed node offers. */
const RARER = 0.75;
/** A fraction, for a `type` break: a schema that allows numbers allows whole ones too, so no whole number is needed. */
const FRACTION = 1.5;

/** The schema a chain of `$ref`s ends at, when each is the whole of its schema and the end is typed and closed; else `undefined`. */
const plain = (draw: Draw, schema: unknown, depth = 0): Dict | undefined => {
  if (!isDict(schema) || depth > LIMIT) return undefined;
  if (has(schema, '$ref')) {
    const siblings = Object.keys(schema).some((key) => key !== '$ref' && (HELD.has(key) || LOOSE.has(key)));
    if (draw.draft === '2020-12' && siblings) return undefined;
    try {
      return plain(draw, pointerGet(draw.root, String(schema.$ref)), depth + 1);
    } catch {
      // A reference that names nothing has nothing to break.
      return undefined;
    }
  }
  return has(schema, 'type') && !OPEN.some((key) => has(schema, key)) ? schema : undefined;
};

/** A sample's JSON type: each sample number is a fraction, so a `number`, never an `integer`. */
const jsonType = (value: unknown): string => {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
};

const allows = (types: readonly string[], value: unknown): boolean => types.includes(jsonType(value));

/** Values of each JSON type, to find one a schema's types refuse. */
// Stryker disable next-line StringLiteral,ArrayDeclaration: equivalent, any string and any array stand for their type
const SAMPLES: readonly unknown[] = [null, true, 'x', FRACTION, [], {}];

const listBreaks = (schema: Dict, tokens: readonly string[]): Break[] => {
  const out: Break[] = [];
  if (has(schema, 'const')) out.push({ keyword: 'const', tokens, replace: { value: { not: schema.const } } });
  if (Array.isArray(schema.enum)) {
    // Longer than every listed string, so it is none of them; and no other value is a string.
    out.push({ keyword: 'enum', tokens, replace: { value: `${schema.enum.map((entry) => canonical(entry)).join('')}x` } });
  }
  return out;
};

/** How far past a bound a value must go to break it: none past an excluded one. */
const past = (excluded: boolean): number => (excluded ? 0 : 1);

const numberBreaks = (draw: Draw, schema: Dict, value: number, tokens: readonly string[]): Break[] => {
  const out: Break[] = [];
  const range = rangeOf(schema, draw.draft);
  const whole = !typesOf(schema, draw.draft).includes('number');
  const [low, high] = wholeIn(range);
  // Just outside: the whole number past the last one inside, or the bound itself when it is excluded, else one past it.
  const below = whole ? low - 1 : range.low - past(range.lowOut);
  const above = whole ? high + 1 : range.high + past(range.highOut);
  const lowKey = range.lowOut && has(schema, 'exclusiveMinimum') ? 'exclusiveMinimum' : 'minimum';
  const highKey = range.highOut && has(schema, 'exclusiveMaximum') ? 'exclusiveMaximum' : 'maximum';
  if (has(schema, lowKey)) out.push({ keyword: lowKey, tokens, replace: { value: below } });
  if (has(schema, highKey)) out.push({ keyword: highKey, tokens, replace: { value: above } });
  const multiple = schema.multipleOf;
  // Stryker disable next-line ConditionalExpression: equivalent, what is not a number is not a whole number either
  if (typeof multiple === 'number' && Number.isInteger(multiple) && multiple > 1 && Number.isInteger(value)) {
    const next = [value + 1, value - 1].find((candidate) => candidate >= low && candidate <= high);
    if (next !== undefined) out.push({ keyword: 'multipleOf', tokens, replace: { value: next } });
  }
  return out;
};

const stringBreaks = (schema: Dict, value: string, tokens: readonly string[]): Break[] => {
  const out: Break[] = [];
  const points = [...value];
  // Stryker disable next-line ConditionalExpression: equivalent, what is not a number is not more than 0 either
  if (typeof schema.minLength === 'number' && schema.minLength > 0) out.push({ keyword: 'minLength', tokens, replace: { value: points.slice(0, schema.minLength - 1).join('') } });
  if (typeof schema.maxLength === 'number') out.push({ keyword: 'maxLength', tokens, replace: { value: value + 'a'.repeat(schema.maxLength + 1 - points.length) } });
  return out;
};

const arrayBreaks = (walk: Walk, schema: Dict, value: readonly unknown[]): Break[] => {
  const { tokens } = walk;
  const out: Break[] = [];
  // Stryker disable next-line ConditionalExpression: equivalent, what is not a number is not more than 0 either
  if (typeof schema.minItems === 'number' && schema.minItems > 0) out.push({ keyword: 'minItems', tokens, replace: { value: value.slice(0, schema.minItems - 1) } });
  if (typeof schema.maxItems === 'number' && value.length > 0) {
    out.push({ keyword: 'maxItems', tokens, replace: { value: [...value, ...Array.from({ length: schema.maxItems + 1 - value.length }, () => structuredClone(value[0]))] } });
  }
  const { tuple, rest } = itemsOf(schema);
  for (const [index, item] of value.entries()) {
    out.push(...breaksOf({ ...walk, tokens: [...tokens, String(index)], depth: walk.depth + 1 }, index < tuple.length ? tuple[index] : rest, item));
  }
  return out;
};

const objectBreaks = (walk: Walk, schema: Dict, value: Dict): Break[] => {
  const { tokens } = walk;
  const out: Break[] = [];
  const properties = isDict(schema.properties) ? schema.properties : {};
  // Stryker disable next-line ArrayDeclaration: equivalent, a name the value does not have is never removed
  const required = Array.isArray(schema.required) ? schema.required.map(String) : [];
  const size = Object.keys(value).length;
  const roomBelow = typeof schema.minProperties !== 'number' || size > schema.minProperties;
  // Removing a required property breaks `required` only where `minProperties` would not fail too.
  if (roomBelow) for (const name of required) if (has(value, name)) out.push({ keyword: 'required', tokens: [...tokens, name], replace: undefined });
  const roomAbove = typeof schema.maxProperties !== 'number' || size < schema.maxProperties;
  if (schema.additionalProperties === false && roomAbove) {
    out.push({ keyword: 'additionalProperties', tokens: [...tokens, freshName(new Set([...Object.keys(properties), ...Object.keys(value)]))], replace: { value: null } });
  }
  for (const [name, item] of Object.entries(value)) {
    // Stryker disable next-line ConditionalExpression: equivalent, a property not listed has no schema, so nothing to break
    if (has(properties, name)) out.push(...breaksOf({ ...walk, tokens: [...tokens, name], depth: walk.depth + 1 }, properties[name], item));
  }
  return out;
};

/** Every way to break `value` under `raw`, here and below. */
function breaksOf(walk: Walk, raw: unknown, value: unknown): Break[] {
  const schema = plain(walk.draw, raw);
  if (schema === undefined || walk.depth > LIMIT) return [];
  const { tokens } = walk;
  const wrong = SAMPLES.find((sample) => !allows(typesOf(schema, walk.draw.draft), sample));
  return [
    ...(wrong === undefined ? [] : [{ keyword: 'type', tokens, replace: { value: wrong } }]),
    ...listBreaks(schema, tokens),
    ...(typeof value === 'number' ? numberBreaks(walk.draw, schema, value, tokens) : []),
    ...(typeof value === 'string' ? stringBreaks(schema, value, tokens) : []),
    ...(Array.isArray(value) ? arrayBreaks(walk, schema, value) : []),
    ...(isDict(value) ? objectBreaks(walk, schema, value) : []),
  ];
}

/** `root` with the value at `trail` replaced, or removed. */
const setAt = (root: unknown, trail: readonly string[], replace: Break['replace']): unknown => {
  if (trail.length === 0) return (replace as { value: unknown }).value;
  const [first, ...rest] = trail as [string, ...string[]];
  if (Array.isArray(root)) return root.map((item, index) => (String(index) === first ? setAt(item, rest, replace) : item));
  const entries = Object.entries(root as Dict);
  if (rest.length === 0 && replace === undefined) return Object.fromEntries(entries.filter(([name]) => name !== first));
  const changed = entries.map(([name, item]) => [name, name === first ? setAt(item, rest, replace) : item]);
  return Object.fromEntries(has(root as Dict, first) ? changed : [...changed, [first, setAt(undefined, rest, replace)]]);
};

/** Every way to break `value`, valid under `schema`: none when the schema has no constraint that can be. */
export const mutants = (draw: Draw, schema: unknown, value: unknown): Mutant[] =>
  breaksOf({ draw, tokens: [], depth: 0 }, schema, value).map((found) => ({ value: setAt(value, found.tokens, found.replace), keyword: found.keyword, path: found.tokens.map((part) => `/${token(part)}`).join('') }));

/** `value`, valid under `schema`, with one constraint broken; `undefined` when the schema has none that can be. */
export const mutate = (draw: Draw, schema: unknown, value: unknown): Mutant | undefined => {
  const all = mutants(draw, schema, value);
  if (all.length === 0) return undefined;
  const rarer = all.filter((found) => found.keyword !== 'type');
  return draw.random.pick(rarer.length > 0 && draw.random.chance(RARER) ? rarer : all);
};
