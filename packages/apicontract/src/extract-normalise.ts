/**
 * The comparison form of a contract (apicontract-extract R1): two documents that validate the same
 * values print the same bytes after `normalise`, whatever their key order, their prose, or how they
 * spell a `type` list. `inline` then resolves local `$ref`s, so a schema named in `components` and the
 * same schema written in place compare equal too.
 */

/** Annotations: they say what a value means, never whether it is valid. */
const DOCS: ReadonlySet<string> = new Set(['title', 'description', 'summary', 'examples', 'example', '$comment']);

/**
 * Keys whose value maps names to things (a property name, a path, a status code, a media type): the
 * names are kept as they are, so a property called `description` is not taken for the annotation.
 */
const NAMED: ReadonlySet<string> = new Set([
  'properties',
  'patternProperties',
  '$defs',
  'definitions',
  'dependentSchemas',
  'dependentRequired',
  'schemas',
  'paths',
  'webhooks',
  'responses',
  'content',
  'headers',
  'requestBodies',
  'securitySchemes',
  'links',
  'callbacks',
  'pathItems',
  'encoding',
  'variables',
  'mapping',
]);

/** Keys whose value is data, not schema: nothing in it is an annotation. */
const DATA: ReadonlySet<string> = new Set(['const', 'enum', 'default']);

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const sortedKeys = (value: Record<string, unknown>): string[] => Object.keys(value).toSorted();

/** Any JSON value as text with every object's keys sorted: equal data prints equal bytes. */
export const stable = (value: unknown): string =>
  JSON.stringify(value, (_key, inner: unknown) =>
    isRecord(inner) ? Object.fromEntries(sortedKeys(inner).map((key) => [key, inner[key]])) : inner,
  ) as string;

/** Data is kept whole, with its keys sorted. */
const data = (value: unknown): unknown => JSON.parse(stable(value)) as unknown;

/** `["null", "string", "string"]` and `["string", "null"]` are one type list; a list of one is that one name. */
const types = (value: unknown): unknown => {
  if (!Array.isArray(value)) return value;
  const unique = [...new Set(value)].toSorted();
  return unique.length === 1 ? unique[0] : unique;
};

export interface NormaliseOptions {
  /** Keep `title`, `description`, `summary` and the examples (`--keep-docs`). */
  readonly keepDocs?: boolean;
}

const walk = (value: unknown, keepDocs: boolean): unknown => {
  if (Array.isArray(value)) return value.map((item) => walk(item, keepDocs));
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    sortedKeys(value)
      .filter((key) => keepDocs || !DOCS.has(key))
      .map((key) => [key, member(key, value[key], keepDocs)]),
  );
};

const member = (key: string, value: unknown, keepDocs: boolean): unknown => {
  if (DATA.has(key)) return data(value);
  if (key === 'type') return types(value);
  if (key === 'required' && Array.isArray(value)) return [...new Set(value as unknown[])].toSorted();
  // A walked value has its keys sorted already, so its text parses back to itself.
  if (key === 'parameters' && Array.isArray(value)) return value.map((item) => stable(walk(item, keepDocs))).toSorted().map((text) => JSON.parse(text) as unknown);
  if (NAMED.has(key) && isRecord(value)) return Object.fromEntries(sortedKeys(value).map((name) => [name, walk(value[name], keepDocs)]));
  return walk(value, keepDocs);
};

/** The document in comparison form: keys sorted, annotations dropped, `type` lists canonical. */
export const normalise = (document: unknown, options: NormaliseOptions = {}): unknown => walk(document, options.keepDocs === true);

/** One step of a JSON Pointer: `~1` is `/`, `~0` is `~`. */
const unescape = (step: string): string => step.replaceAll('~1', '/').replaceAll('~0', '~');

const target = (root: unknown, ref: string): unknown => {
  let at: unknown = root;
  for (const step of ref.slice(2).split('/').map(unescape)) {
    if (!isRecord(at) || !Object.keys(at).includes(step)) return undefined;
    at = at[step];
  }
  return at;
};

/**
 * Every local `$ref` (`#/…`) replaced by what it points to. A reference back into a schema it is
 * already inside is kept as it is, so a recursive schema stays finite; so is one that points nowhere.
 */
export const inline = (document: unknown): unknown => {
  const resolve = (value: unknown, open: ReadonlySet<string>): unknown => {
    if (Array.isArray(value)) return value.map((item) => resolve(item, open));
    if (!isRecord(value)) return value;
    const ref = value.$ref;
    if (typeof ref === 'string' && ref.startsWith('#/') && !open.has(ref)) {
      const found = target(document, ref);
      if (found !== undefined) {
        const { $ref: _ref, ...siblings } = value;
        return resolve({ ...(found as object), ...siblings }, new Set([...open, ref]));
      }
    }
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, resolve(inner, open)]));
  };
  return resolve(document, new Set());
};
