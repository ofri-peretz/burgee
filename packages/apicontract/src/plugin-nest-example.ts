/**
 * The value a contract test sends and a stub answers with (apicontract-servers R6): the spec's own
 * example where it gives one, else one made from the schema, which the caller reports.
 *
 * A made value is the same on every run: no randomness, the first of every choice. It satisfies
 * `type`, `enum`, `const`, `minimum`, `required` and the common formats; a `pattern` or a length it
 * may not, which is why it is reported.
 */
import { type JsonSchema } from './core/model.js';

type Dict = Readonly<Record<string, unknown>>;

/** What was picked, and whether it was made rather than read. */
export interface Picked {
  readonly value: unknown;
  readonly synthesised: boolean;
}

/** References nested deeper than this are not followed: a recursive schema ends in `null`. */
const DEPTH = 8;

const isDict = (value: unknown): value is Dict => typeof value === 'object' && value !== null && !Array.isArray(value);

const FORMATS: Readonly<Record<string, string>> = {
  date: '2026-01-01',
  'date-time': '2026-01-01T00:00:00Z',
  email: 'user@example.com',
  uri: 'https://example.com/',
  uuid: '00000000-0000-4000-8000-000000000000',
};

const typeOf = (schema: Dict): unknown => (Array.isArray(schema.type) ? schema.type.find((type) => type !== 'null') : schema.type);

/** A value the schema names itself: `const`, the first `enum`, `example`, the first `examples`, `default`. */
const named = (schema: Dict): { readonly value: unknown } | undefined => {
  if ('const' in schema) return { value: schema.const };
  if (Array.isArray(schema.enum)) return { value: schema.enum[0] };
  if ('example' in schema) return { value: schema.example };
  if (Array.isArray(schema.examples) && schema.examples.length > 0) return { value: schema.examples[0] };
  return 'default' in schema ? { value: schema.default } : undefined;
};

/** A value of the schema's type; `next` makes the value of a schema inside it. */
const ofType = (schema: Dict, next: (inner: unknown) => unknown): unknown => {
  const type = typeOf(schema) ?? (isDict(schema.properties) ? 'object' : undefined);
  if (type === 'string') return FORMATS[String(schema.format)] ?? 'example';
  if (type === 'integer' || type === 'number') return typeof schema.minimum === 'number' ? schema.minimum : 1;
  if (type === 'boolean') return true;
  if (type === 'array') return [next(schema.items)];
  if (type !== 'object') return null;
  const properties = isDict(schema.properties) ? schema.properties : {};
  const required = Array.isArray(schema.required) ? (schema.required as unknown[]) : [];
  return Object.fromEntries(Object.entries(properties).filter(([name]) => required.includes(name)).map(([name, inner]) => [name, next(inner)]));
};

/** A value the schema accepts, made from its keywords. */
export const synthesise = (schema: JsonSchema, deref: (value: unknown) => Dict, depth = 0): unknown => {
  if (!isDict(schema) || depth > DEPTH) return null;
  const resolved = deref(schema);
  const given = named(resolved);
  if (given !== undefined) return given.value;
  const next = (inner: unknown): unknown => synthesise(inner as JsonSchema, deref, depth + 1);
  if (Array.isArray(resolved.allOf)) return Object.assign({}, ...resolved.allOf.map((inner) => next(inner)).filter((value) => isDict(value))) as unknown;
  const [first] = [resolved.oneOf, resolved.anyOf].find((list) => Array.isArray(list)) ?? [];
  return first === undefined ? ofType(resolved, next) : next(first);
};

/**
 * The example of a parameter or a media type: its `example`, else the value of its first
 * `examples` entry, else its schema's example, else one made from the schema.
 */
export const exampleOf = (holder: Dict, schema: JsonSchema, deref: (value: unknown) => Dict): Picked => {
  if ('example' in holder) return { value: holder.example, synthesised: false };
  const [entry] = Object.values(isDict(holder.examples) ? holder.examples : {});
  const named = deref(entry);
  if ('value' in named) return { value: named.value, synthesised: false };
  const resolved = isDict(schema) ? deref(schema) : {};
  if ('example' in resolved) return { value: resolved.example, synthesised: false };
  return { value: synthesise(schema, deref), synthesised: true };
};
