/**
 * The JSON Schema input format (apicontract-inputs R1, R2): a schema document (2020-12, 2019-09,
 * draft-07, draft-06 or draft-04) read into the model. The root schema is one operation and every
 * `$defs` or `definitions` entry is another, each with one `request` payload: the value being
 * validated. It imports only `apicontract/core`.
 *
 * Schemas are handed over as written, `$ref`s intact, and resolution stays in `core/resolve.ts`,
 * which follows local JSON Pointers from the document root. A reference it cannot follow that way
 * (another document, an anchor, a dynamic reference, a pointer inside an embedded `$id` resource)
 * is still passed through, with a finding that names it, so nothing is lost silently.
 *
 * A folder of schemas is the caller's to walk: each file is one document here.
 */
import { type Contract, type ContractFinding, type JsonSchema, type Operation } from './core/model.js';

type Dict = Readonly<Record<string, unknown>>;

const isDict = (value: unknown): value is Dict => typeof value === 'object' && value !== null && !Array.isArray(value);

const token = (key: string): string => key.replaceAll('~', '~0').replaceAll('/', '~1');

const TYPES: ReadonlySet<unknown> = new Set(['null', 'boolean', 'object', 'array', 'number', 'string', 'integer']);

/** The dialects read, without scheme or trailing `#`, as `$schema` writes them. */
const DIALECTS: ReadonlySet<string> = new Set([
  'json-schema.org/draft/2020-12/schema',
  'json-schema.org/draft/2019-09/schema',
  'json-schema.org/draft-07/schema',
  'json-schema.org/draft-06/schema',
  'json-schema.org/draft-04/schema',
]);

/** Keywords whose values are data, not schemas: a `$ref` written there is not a reference. */
const DATA = new Set(['const', 'default', 'enum', 'examples']);

/** Keywords that reference another schema, and are resolved by `core/resolve.ts` only as `$ref`. */
const DYNAMIC = new Set(['$dynamicRef', '$recursiveRef']);

/** A document this adapter does not read. The message ends in a `fix:` line. */
export class JsonSchemaError extends Error {
  constructor(reason: string, fix: string) {
    super(`not a JSON Schema: ${reason}. fix: ${fix}`);
    this.name = 'JsonSchemaError';
  }
}

const isType = (value: unknown): boolean => TYPES.has(value) || (Array.isArray(value) && value.length > 0 && value.every((item) => TYPES.has(item)));

/** Whether `document` looks like a schema, by its top-level keywords only (R2). */
export const detect = (document: unknown): boolean =>
  isDict(document) &&
  (typeof document.$schema === 'string' ||
    typeof document.$id === 'string' ||
    typeof document.$ref === 'string' ||
    isDict(document.$defs) ||
    isDict(document.definitions) ||
    isDict(document.properties) ||
    isType(document.type));

const isSchema = (value: unknown): value is JsonSchema => typeof value === 'boolean' || isDict(value);

/** Whether a subschema starts a resource of its own: an `$id` (draft-04: `id`) that is not a bare fragment. */
const embedded = (node: unknown): boolean => {
  if (!isDict(node)) return false;
  const id = typeof node.$id === 'string' ? node.$id : node.id;
  return typeof id === 'string' && !id.startsWith('#');
};

/** The finding for one reference `core/resolve.ts` cannot follow from the root, if it cannot. */
const referenceFinding = (keyword: string, ref: string, pointer: string, resource: string | undefined): ContractFinding | undefined => {
  if (DYNAMIC.has(keyword)) {
    return {
      code: 'ref-dynamic',
      pointer,
      message: `\`${keyword}: ${ref}\` is passed as written; references are resolved only through \`$ref\``,
      fix: 'use a `$ref` to a `#/$defs/…` pointer where the dynamic scope is not needed',
    };
  }
  if (!ref.startsWith('#')) {
    return {
      code: 'ref-external',
      pointer,
      message: `\`$ref: ${ref}\` is a URI, not a fragment of this document, and is passed as written`,
      fix: 'bundle the schemas into one document first, or use a `#/…` reference',
    };
  }
  if (ref !== '#' && !ref.startsWith('#/')) {
    return {
      code: 'ref-anchor',
      pointer,
      message: `\`$ref: ${ref}\` names an anchor, which is passed as written; only JSON Pointers are resolved`,
      fix: 'reference the subschema by JSON Pointer, e.g. `#/$defs/…`',
    };
  }
  if (resource === undefined) return undefined;
  return {
    code: 'ref-in-embedded-resource',
    pointer,
    message: `\`$ref: ${ref}\` is relative to the embedded resource at \`${resource}\`, and is resolved from the document root`,
    fix: "move the subschema under the root's `$defs` and drop its `$id`",
  };
};

/** A node's children, each with its key and its pointer. A scalar has none. */
const childrenOf = (node: unknown, pointer: string): (readonly [string, unknown, string])[] => {
  if (Array.isArray(node)) return node.map((item, index) => [String(index), item, `${pointer}/${String(index)}`] as const);
  if (!isDict(node)) return [];
  return Object.entries(node).map(([key, child]) => [key, child, `${pointer}/${token(key)}`] as const);
};

const isReference = (keyword: string, value: unknown): value is string => (keyword === '$ref' || DYNAMIC.has(keyword)) && typeof value === 'string';

/** Every reference under `root` that `core/resolve.ts` cannot follow from the root. */
const references = (root: unknown): ContractFinding[] => {
  const findings: ContractFinding[] = [];
  const walk = (node: unknown, pointer: string, resource: string | undefined): void => {
    const inside = resource ?? (pointer !== '#' && embedded(node) ? pointer : undefined);
    for (const [keyword, child, at] of childrenOf(node, pointer)) {
      if (DATA.has(keyword)) continue;
      if (!isReference(keyword, child)) {
        walk(child, at, inside);
        continue;
      }
      const finding = referenceFinding(keyword, child, at, inside);
      if (finding !== undefined) findings.push(finding);
    }
  };
  walk(root, '#', undefined);
  return findings;
};

const known = (dialect: string): boolean => DIALECTS.has(dialect.replace(/^https?:\/\//, '').replace(/#$/, ''));

/** The root's own name: its `$id` (draft-04: `id`), else its `title`, else `schema`. */
const rootId = (root: Dict): string => {
  for (const key of ['$id', 'id', 'title']) {
    if (typeof root[key] === 'string') return root[key];
  }
  return 'schema';
};

const operationOf = (id: string, source: string, schema: JsonSchema): Operation => ({
  id,
  source,
  payloads: [{ name: 'value', direction: 'request', schema, required: true }],
});

/** Read a JSON Schema document into the model. */
export const read = (document: unknown): Contract => {
  if (typeof document === 'boolean') {
    return { format: 'jsonschema', document, operations: [operationOf('schema', '#', document)], findings: [] };
  }
  if (!isDict(document)) {
    throw new JsonSchemaError('a schema is an object or a boolean', 'pass the parsed schema document, not a list or a value');
  }
  const findings: ContractFinding[] = [];
  if (typeof document.$schema === 'string' && !known(document.$schema)) {
    findings.push({
      code: 'dialect-unknown',
      pointer: '#/$schema',
      message: `\`$schema: ${document.$schema}\` is not a dialect this reader knows; it is read as 2020-12`,
      fix: 'use the 2020-12, 2019-09, draft-07, draft-06 or draft-04 meta-schema URI',
    });
  }

  const root = rootId(document);
  const operations = [operationOf(root, '#', document)];
  const taken = new Set([root]);
  for (const keyword of ['$defs', 'definitions']) {
    const group = document[keyword];
    if (!isDict(group)) continue;
    for (const [name, schema] of Object.entries(group)) {
      const source = `#/${keyword}/${token(name)}`;
      if (!isSchema(schema)) {
        findings.push({
          code: 'not-a-schema',
          pointer: source,
          message: `\`${keyword}.${name}\` is neither an object nor a boolean, so it is not read as an operation`,
          fix: `make it a schema, or move it out of \`${keyword}\``,
        });
        continue;
      }
      let id = name;
      if (taken.has(name)) {
        id = `${keyword}/${name}`;
        findings.push({
          code: 'id-collision',
          pointer: source,
          message: `another operation is already named \`${name}\`, so this one is \`${id}\``,
          fix: 'give the definitions, and the root `$id` or `title`, distinct names',
        });
      }
      taken.add(id);
      operations.push(operationOf(id, source, schema));
    }
  }
  findings.push(...references(document));
  return { format: 'jsonschema', document, operations, findings };
};

/** The adapter as the plugin host registers it (spec.md R-PL1). */
export const adapter = Object.freeze({
  name: 'jsonschema',
  description: 'JSON Schema documents (2020-12, 2019-09, draft-07, draft-06, draft-04): the root and each `$defs` entry',
  detect,
  read,
});
