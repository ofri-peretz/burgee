/**
 * The documents the conformance suite derives from a generator's own sample (apicontract-kit R2):
 * the same document with one operation and one property more (the `regeneration` rule), and the
 * same document with an operation whose id tries to leave the output folder (the `paths` rule).
 *
 * Both read the document as OpenAPI 3 or Swagger 2, the two formats whose operations live under
 * `paths`. Any other sample returns `undefined`, and the suite asks the author for a `mutate`.
 */

type Dict = Record<string, unknown>;

const isDict = (value: unknown): value is Dict => typeof value === 'object' && value !== null && !Array.isArray(value);

/** The operation the regeneration probe adds. */
export const PROBE_ID = 'conformanceProbe';

/** The property the regeneration probe adds to every object schema the document names. */
export const PROBE_PROPERTY = 'conformanceProbe';

/** An operation id a generator must not turn into a path as it is. */
export const HOSTILE_ID = '../conformance-probe';

/** A copy of `document` with one more operation under `paths`, or `undefined` when it has none. */
const withOperation = (document: unknown, path: string, id: string): Dict | undefined => {
  if (!isDict(document) || !isDict(document.paths)) return undefined;
  const copy = structuredClone(document);
  return { ...copy, paths: { ...(copy.paths as Dict), [path]: { get: { operationId: id, responses: { '200': { description: 'the conformance probe' } } } } } };
};

/** Every named schema: `components.schemas` in OpenAPI 3, `definitions` in Swagger 2. */
const namedSchemas = (document: Dict): unknown[] => [
  ...Object.values(isDict(document.components) && isDict(document.components.schemas) ? document.components.schemas : {}),
  ...Object.values(isDict(document.definitions) ? document.definitions : {}),
];

/** The sample document after a spec change: one operation and one property more. */
export const changed = (document: unknown): unknown => {
  const copy = withOperation(document, '/conformance-probe', PROBE_ID);
  if (copy === undefined) return undefined;
  for (const schema of namedSchemas(copy)) {
    if (isDict(schema) && isDict(schema.properties)) schema.properties[PROBE_PROPERTY] = { type: 'string' };
  }
  return copy;
};

/** The sample document with an operation whose id is a path out of the output folder. */
export const hostile = (document: unknown): unknown => withOperation(document, '/conformance-hostile', HOSTILE_ID);
