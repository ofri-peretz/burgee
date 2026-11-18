/**
 * One spelling for schemas that accept the same values (gap A-20261118-diff-false-breaking-equivalent-rewrites).
 *
 * `diff-schema.ts` compares keyword by keyword, so two schemas written differently read as a change
 * even when they validate exactly the same values: a generator writes an enum as `anyOf` of `const`,
 * a `null` type as `const: null`, a format as its pattern. Each rewrite here maps a shape to the one
 * spelling it has in common with its equivalents, and is applied only where the two provably accept
 * the same values; where that needs a judgement, the schema is left as written and the comparison
 * reports what it sees.
 *
 * - `{ not: {} }` is `false`.
 * - A value list that names every value of `null` or `boolean` is that type: `const: null` is `type: null`.
 * - `anyOf` (or `oneOf`, where no value can match two branches) of bare types is one `type` list; of
 *   bare value lists, one `enum`; of tuples of each length from m to n, one tuple of n with `minItems: m`.
 * - `allOf` and a one-branch `anyOf` or `oneOf` are merged into their parent, unless two parts set
 *   one keyword differently, a part has a `$ref`, or two parts hold keywords that read each other
 *   (`properties` and `additionalProperties`, `prefixItems` and `items`).
 * - A `pattern` that is the pattern the family's validator holds a JSON Schema format to is that format.
 */
import { date, datetime, duration, email, hostname, ipv4, ipv6, time, uuid } from 'validator/formats';

type Dict = Readonly<Record<string, unknown>>;

export const isDict = (value: unknown): value is Dict => typeof value === 'object' && value !== null && !Array.isArray(value);

// eslint-disable-next-line conventions/consistent-existence-index-check -- Own members only: a property named `toString` is not one every object declares
export const has = (value: Dict, key: string): boolean => Object.hasOwn(value, key);

/** A value's text with object keys sorted, so two equal values compare equal however they were written. */
export const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, node: unknown) => (isDict(node) ? Object.fromEntries(Object.keys(node).sort().map((key) => [key, node[key]])) : node));

const arrayOf = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const without = (schema: Dict, keys: readonly string[]): Dict => Object.fromEntries(Object.entries(schema).filter(([key]) => !keys.includes(key)));

/** Whether `schema` has exactly these keywords. */
const only = (schema: unknown, ...keys: string[]): schema is Dict => isDict(schema) && canonical(Object.keys(schema).sort()) === canonical(keys.sort());

/** The JSON type of a value, `integer` for a whole number. */
export const typeOfValue = (value: unknown): string => {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number' && Number.isInteger(value)) return 'integer';
  return typeof value;
};

/** The types whose every value can be listed, and their values. */
const FINITE: Readonly<Record<string, readonly unknown[]>> = { null: [null], boolean: [false, true] };

/** Every value of `types`, when each is a type whose values can be listed; `undefined` otherwise. */
export const valuesOfTypes = (types: readonly string[]): unknown[] | undefined =>
  types.every((type) => has(FINITE, type)) ? types.flatMap((type) => FINITE[type] as unknown[]) : undefined;

const typeList = (type: unknown): string[] => (Array.isArray(type) ? type.map(String) : [String(type)]);

/** A value list that is every value of some finite types, as those types; `undefined` otherwise. */
const asTypes = (values: readonly unknown[]): string[] | undefined => {
  const types = [...new Set(values.map((value) => typeOfValue(value)))];
  const listed = valuesOfTypes(types);
  if (values.length === 0 || listed === undefined) return undefined;
  const had = new Set(values.map((value) => canonical(value)));
  return listed.every((value) => had.has(canonical(value))) ? types : undefined;
};

const spell = (types: readonly string[]): unknown => (types.length === 1 ? types[0] : types);

/** `const: null` as `type: null`, `enum: [true, false]` as `type: boolean`, when the declared type admits them. */
const valuesAsType = (schema: Dict): Dict => {
  if (has(schema, 'const') && has(schema, 'enum')) return schema;
  const values = has(schema, 'const') ? [schema.const] : schema.enum;
  const types = Array.isArray(values) ? asTypes(values) : undefined;
  if (types === undefined) return schema;
  if (schema.type !== undefined && !types.every((type) => typeList(schema.type).includes(type))) return schema;
  return { ...without(schema, ['const', 'enum']), type: spell(types) };
};

/** The JSON Schema formats the validator holds to a pattern, by that pattern's text. */
const FORMATS: ReadonlyMap<string, string> = new Map([date, datetime, duration, email, hostname, ipv4, ipv6, time, uuid].map((format) => [format.pattern.source, format.name]));

const patternAsFormat = (schema: Dict): Dict => {
  const name = FORMATS.get(String(schema.pattern));
  if (name === undefined || (schema.format !== undefined && schema.format !== name)) return schema;
  return { ...without(schema, ['pattern']), format: name };
};

/** The values a bare value list allows, or a bare finite type; `undefined` for any other branch. */
const branchValues = (branch: unknown): unknown[] | undefined => {
  if (only(branch, 'const')) return [branch.const];
  if (only(branch, 'enum')) return arrayOf(branch.enum);
  return only(branch, 'type') ? valuesOfTypes(typeList(branch.type)) : undefined;
};

const distinct = (texts: readonly string[]): boolean => new Set(texts).size === texts.length;

/** Bare types as one type list; under `oneOf`, only when no value has two of them. */
const unionOfTypes = (branches: readonly unknown[], exclusive: boolean): Dict | undefined => {
  if (!branches.every((branch) => only(branch, 'type'))) return undefined;
  const types = branches.flatMap((branch) => typeList((branch as Dict).type));
  if (exclusive && (!distinct(types) || (types.includes('integer') && types.includes('number')))) return undefined;
  return { type: spell([...new Set(types)]) };
};

/** Bare value lists as one `enum`; under `oneOf`, only when no value is in two. */
const unionOfValues = (branches: readonly unknown[], exclusive: boolean): Dict | undefined => {
  const lists = branches.map((branch) => branchValues(branch));
  if (lists.includes(undefined)) return undefined;
  const values = (lists as unknown[][]).flat();
  if (exclusive && !distinct(values.map((value) => canonical(value)))) return undefined;
  return valuesAsType({ enum: values });
};

const TUPLE: ReadonlySet<string> = new Set(['type', 'prefixItems', 'items', 'minItems', 'maxItems']);

/** An array schema that accepts arrays of one length only, as that length and the schemas of its items. */
const exactTuple = (branch: unknown): { readonly length: number; readonly items: unknown[] } | undefined => {
  if (!isDict(branch) || !Object.keys(branch).every((key) => TUPLE.has(key)) || canonical(typeList(branch.type)) !== '["array"]') return undefined;
  const prefix = arrayOf(branch.prefixItems);
  if (branch.items !== undefined && branch.items !== false) return undefined;
  const min = branch.minItems ?? 0;
  const max = branch.maxItems ?? (branch.items === false ? prefix.length : undefined);
  if (typeof min !== 'number' || min !== max || min > prefix.length) return undefined;
  return { length: min, items: prefix.slice(0, min) };
};

/** Tuples of every length from m to n, each the first items of the longest, as that tuple with `minItems: m`. */
const unionOfTuples = (branches: readonly unknown[]): Dict | undefined => {
  const tuples = branches.map((branch) => exactTuple(branch));
  if (tuples.includes(undefined)) return undefined;
  const sorted = (tuples as { length: number; items: unknown[] }[]).toSorted((x, y) => x.length - y.length);
  const lowest = (sorted[0] as { length: number }).length;
  const longest = (sorted.at(-1) as { items: unknown[] }).items;
  const contiguous = sorted.every(({ length, items }, index) => length === lowest + index && canonical(items) === canonical(longest.slice(0, length)));
  if (!contiguous) return undefined;
  return { type: 'array', prefixItems: longest, items: false, ...(lowest > 0 && { minItems: lowest }) };
};

/** `anyOf` and `oneOf` of two or more branches written as one schema, where one exists. */
const collapse = (schema: Dict): Dict =>
  (['anyOf', 'oneOf'] as const).reduce((node, keyword) => {
    const branches = arrayOf(node[keyword]);
    if (branches.length < 2) return node;
    const exclusive = keyword === 'oneOf';
    const union = unionOfTypes(branches, exclusive) ?? unionOfValues(branches, exclusive) ?? unionOfTuples(branches);
    const rest = without(node, [keyword]);
    if (union === undefined || Object.keys(union).some((key) => has(rest, key))) return node;
    return { ...rest, ...union };
  }, schema);

/** Keywords that read others in the same schema object, so are not moved apart from them. */
const GROUPS: readonly (readonly string[])[] = [
  ['properties', 'patternProperties', 'additionalProperties', 'unevaluatedProperties'],
  ['prefixItems', 'items', 'unevaluatedItems'],
  ['contains', 'minContains', 'maxContains'],
  ['if', 'then', 'else'],
];

/** Keywords that describe values without constraining them; two parts may differ on them. */
const ANNOTATIONS: ReadonlySet<string> = new Set(['title', 'description', 'examples', 'example', 'default', 'deprecated', '$comment']);

/** Whether `parts` can be one schema object: no keyword set two ways, no `$ref`, no group split. */
const mergeable = (parts: readonly Dict[]): boolean => {
  const keys = parts.flatMap((part) => Object.keys(part));
  if (keys.includes('$ref')) return false;
  const clash = keys.some((key) => !ANNOTATIONS.has(key) && new Set(parts.filter((part) => has(part, key)).map((part) => canonical(part[key]))).size > 1);
  const split = GROUPS.some((group) => parts.filter((part) => group.some((key) => has(part, key))).length > 1);
  return !clash && !split;
};

/** `allOf`, and a one-branch `anyOf` or `oneOf`, merged into the schema that holds it. */
const merge = (schema: Dict): Dict => {
  const keywords = ['allOf', ...(['anyOf', 'oneOf'] as const).filter((keyword) => arrayOf(schema[keyword]).length === 1)];
  const branches = keywords.flatMap((keyword) => arrayOf(schema[keyword]));
  if (branches.length === 0 || !branches.every((branch) => branch === true || isDict(branch))) return schema;
  const parts = [without(schema, keywords), ...branches.map((branch) => (isDict(branch) ? branch : {}))];
  return mergeable(parts) ? Object.assign({}, ...parts) : schema;
};

const SINGLE = ['items', 'additionalProperties'] as const;
const LISTS = ['prefixItems', 'allOf', 'anyOf', 'oneOf'] as const;

/** The subschemas `diff-schema.ts` walks, each normalised. */
const children = (schema: Dict): Dict => ({
  ...schema,
  ...(isDict(schema.properties) && { properties: Object.fromEntries(Object.entries(schema.properties).map(([name, child]) => [name, normalise(child)])) }),
  ...Object.fromEntries(SINGLE.filter((keyword) => schema[keyword] !== undefined).map((keyword) => [keyword, normalise(schema[keyword])])),
  ...Object.fromEntries(LISTS.filter((keyword) => Array.isArray(schema[keyword])).map((keyword) => [keyword, arrayOf(schema[keyword]).map((child) => normalise(child))])),
});

/** `schema` in the one spelling it shares with every schema that accepts the same values. */
export function normalise(schema: unknown): unknown {
  if (!isDict(schema)) return schema;
  if (only(schema, 'not') && (schema.not === true || only(schema.not))) return false;
  return patternAsFormat(valuesAsType(merge(collapse(children(schema)))));
}
