/**
 * contractdiff-bench R1: the catalogue of planted changes. Each edit is a pure function from an
 * OpenAPI 3.x document to a changed copy, or `undefined` when the document has nowhere to apply it.
 * The label answers one question for callers of the old document: does their call still work?
 *
 * Edits reach into a schema only through a copy inlined at the operation they change, so a planted
 * request change never also changes a response that shares the same `$ref` (which would flip the
 * label). Every choice is the first candidate in path, method and property order: deterministic.
 */

export type Label = 'breaking' | 'non-breaking';

type Json = Record<string, unknown>;

export interface Edit {
  readonly id: string;
  readonly label: Label;
  readonly why: string;
  readonly apply: (document: Readonly<Json>) => Json | undefined;
}

const METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'] as const;
const MEDIA = 'application/json';
const REF_DEPTH = 16;
const PRIMITIVES = ['string', 'integer', 'number', 'boolean'];
/** The name every planted parameter or property carries, so it never collides with a real one. */
const PLANTED = 'bench_planted';

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Whether a document is one this catalogue edits: OpenAPI 3.x with a `paths` object. */
export const isOpenApi3 = (document: unknown): document is Json =>
  isObject(document) && typeof document.openapi === 'string' && document.openapi.startsWith('3.') && isObject(document.paths);

/** Follows local `$ref`s (`#/a/b`) to the value they name; `undefined` for an external or broken one. */
export function resolve(document: Readonly<Json>, value: unknown): unknown {
  let current = value;
  for (let depth = 0; depth < REF_DEPTH; depth += 1) {
    if (!isObject(current) || typeof current.$ref !== 'string') return current;
    if (!current.$ref.startsWith('#/')) return undefined;
    let target: unknown = document;
    for (const raw of current.$ref.slice(2).split('/')) {
      const key = decodeURIComponent(raw).replaceAll('~1', '/').replaceAll('~0', '~');
      target = isObject(target) ? target[key] : undefined;
    }
    current = target;
  }
  return undefined;
}

interface Operation {
  readonly path: string;
  readonly method: string;
  readonly op: Json;
}

/** Every operation of a (cloned) document, in path then method order. */
function operations(document: Json): Operation[] {
  const paths = document.paths as Json;
  return Object.keys(paths)
    .toSorted()
    .flatMap((path) => {
      const item = paths[path];
      return isObject(item) ? METHODS.filter((m) => isObject(item[m])).map((method) => ({ path, method, op: item[method] as Json })) : [];
    });
}

/**
 * Writes and deletes go through `Reflect`: every key here is one the catalogue chose from the
 * document being edited (a path, a method, a property, a status), in a clone it owns.
 */
const put = (holder: object, key: string, value: unknown): void => {
  Reflect.set(holder, key, value);
};
const drop = (holder: object, key: string): void => {
  Reflect.deleteProperty(holder, key);
};

/** A deep copy of what `holder[key]` resolves to, put in its place; the copy, or `undefined`. */
function inline(document: Json, holder: object, key: string): Json | undefined {
  const resolved = resolve(document, Reflect.get(holder, key));
  if (!isObject(resolved)) return undefined;
  const copy = structuredClone(resolved);
  put(holder, key, copy);
  return copy;
}

/** The JSON request body schema of an operation, inlined, when it is an object with properties. */
function requestSchema(document: Json, op: Json): Json | undefined {
  if (op.requestBody === undefined) return undefined;
  const body = inline(document, op, 'requestBody');
  const media = isObject(body?.content) ? body.content[MEDIA] : undefined;
  if (!isObject(media)) return undefined;
  const schema = inline(document, media, 'schema');
  return isObject(schema?.properties) ? schema : undefined;
}

/** The first success status's JSON schema of an operation, inlined, when it is an object with properties. */
function responseSchema(document: Json, op: Json): Json | undefined {
  const responses = op.responses;
  if (!isObject(responses)) return undefined;
  const status = Object.keys(responses)
    .toSorted()
    .find((code) => /^2\d\d$/.test(code));
  if (status === undefined) return undefined;
  const response = inline(document, responses, status);
  const media = isObject(response?.content) ? response.content[MEDIA] : undefined;
  if (!isObject(media)) return undefined;
  const schema = inline(document, media, 'schema');
  return isObject(schema?.properties) ? schema : undefined;
}

const requiredOf = (schema: Json): string[] => (Array.isArray(schema.required) ? (schema.required as unknown[]).filter((r): r is string => typeof r === 'string') : []);

/** The first property of a schema that `test` accepts, inlined, with its name. */
function property(document: Json, schema: Json, test: (name: string, property: Json) => boolean): { name: string; value: Json } | undefined {
  const properties = schema.properties as Json;
  for (const name of Object.keys(properties).toSorted()) {
    const resolved = resolve(document, properties[name]);
    if (isObject(resolved) && test(name, resolved)) return { name, value: inline(document, properties, name) as Json };
  }
  return undefined;
}

/**
 * Runs `change` on a clone, operation by operation, until one applies; the changed clone, or
 * `undefined`. `change` returns whether it changed anything; a refused operation's partial inlining
 * is thrown away with its clone.
 */
function firstOperation(document: Readonly<Json>, change: (clone: Json, operation: Operation) => boolean): Json | undefined {
  const count = operations(structuredClone(document) as Json).length;
  for (let index = 0; index < count; index += 1) {
    const clone = structuredClone(document) as Json;
    if (change(clone, operations(clone)[index] as Operation)) return clone;
  }
  return undefined;
}

/** Whether the document applies to callers at all: an operation the edit can see. */
const guard =
  (edit: (document: Readonly<Json>) => Json | undefined) =>
  (document: Readonly<Json>): Json | undefined =>
    isOpenApi3(document) ? edit(document) : undefined;

const parameters = (op: Json): unknown[] => {
  op.parameters = Array.isArray(op.parameters) ? op.parameters : [];
  return op.parameters as unknown[];
};

const addQuery =
  (required: boolean) =>
  (clone: Json, { op }: Operation): boolean => {
    parameters(op).push({ name: PLANTED, in: 'query', required, schema: { type: 'string' } });
    return true;
  };

const writable = (property: Json): boolean => property.readOnly !== true;
const readable = (property: Json): boolean => property.writeOnly !== true;
const swapped = (type: string): string => (type === 'string' ? 'integer' : 'string');

/** Swaps the type of the first primitive, non-enum property `test` accepts in the schema `schemaOf` finds. */
const typeChange =
  (schemaOf: (document: Json, op: Json) => Json | undefined, test: (name: string, property: Json, schema: Json) => boolean) =>
  (clone: Json, { op }: Operation): boolean => {
    const schema = schemaOf(clone, op);
    const found = schema && property(clone, schema, (name, p) => isPrimitive(p) && p.enum === undefined && test(name, p, schema));
    if (found === undefined) return false;
    found.value.type = swapped(found.value.type as string);
    drop(found.value, 'format');
    return true;
  };
const isPrimitive = (property: Json): boolean => typeof property.type === 'string' && PRIMITIVES.includes(property.type);

/** The first enum among an operation's parameters and request body properties, inlined. */
function requestEnum(document: Json, op: Json, test: (values: unknown[], schema: Json) => boolean): Json | undefined {
  const list = parameters(op);
  for (let index = 0; index < list.length; index += 1) {
    const parameter = inline(document, list, String(index));
    if (parameter === undefined || parameter.in === 'header' || parameter.in === 'cookie' || !isObject(parameter.schema)) continue;
    const schema = inline(document, parameter, 'schema');
    if (Array.isArray(schema?.enum) && test(schema.enum as unknown[], schema)) return schema;
  }
  const body = requestSchema(document, op);
  return body === undefined ? undefined : property(document, body, (_, p) => writable(p) && Array.isArray(p.enum) && test(p.enum as unknown[], p))?.value;
}

const isSuccess = (code: string): boolean => /^2\d\d$/.test(code);

/** Every path parameter's name that the path template holds, in order. */
const templateNames = (path: string): string[] => [...path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1] as string);

/** Renames path parameter `from` to `to` in one parameter list (inlining each one it touches). */
function renameIn(document: Json, list: unknown, from: string, to: string): void {
  if (!Array.isArray(list)) return;
  for (let index = 0; index < list.length; index += 1) {
    const parameter = resolve(document, list[index]);
    if (isObject(parameter) && parameter.in === 'path' && parameter.name === from) {
      const copy = inline(document, list, String(index));
      if (copy !== undefined) copy.name = to;
    }
  }
}

export const EDITS: readonly Edit[] = [
  // ── breaking ──────────────────────────────────────────────────────────────────────────────
  {
    id: 'operation-removed',
    label: 'breaking',
    why: 'a caller of the removed operation gets a 404 or 405',
    apply: guard((document) =>
      firstOperation(document, (clone, { path, method }) => {
        const item = (clone.paths as Json)[path] as Json;
        drop(item, method);
        if (!METHODS.some((m) => isObject(item[m]))) drop(clone.paths as Json, path);
        return true;
      }),
    ),
  },
  {
    id: 'required-request-parameter-added',
    label: 'breaking',
    why: 'an old caller does not send the new required query parameter',
    apply: guard((document) => firstOperation(document, addQuery(true))),
  },
  {
    id: 'request-body-made-required',
    label: 'breaking',
    why: 'an old caller that sent no body is now refused',
    apply: guard((document) =>
      firstOperation(document, (clone, { op }) => {
        if (op.requestBody === undefined) return false;
        const body = inline(clone, op, 'requestBody');
        if (body === undefined || body.required === true) return false;
        body.required = true;
        return true;
      }),
    ),
  },
  {
    id: 'request-property-made-required',
    label: 'breaking',
    why: 'an old caller that left the property out is now refused',
    apply: guard((document) =>
      firstOperation(document, (clone, { op }) => {
        const schema = requestSchema(clone, op);
        const found = schema && property(clone, schema, (name, p) => writable(p) && !requiredOf(schema).includes(name));
        if (schema === undefined || found === undefined) return false;
        schema.required = [...requiredOf(schema), found.name];
        return true;
      }),
    ),
  },
  {
    id: 'request-property-type-changed',
    label: 'breaking',
    why: 'the value an old caller sends no longer has the accepted type',
    apply: guard((document) => firstOperation(document, typeChange(requestSchema, (_, p) => writable(p)))),
  },
  {
    id: 'request-enum-value-removed',
    label: 'breaking',
    why: 'an old caller that sends the removed value is now refused',
    apply: guard((document) =>
      firstOperation(document, (clone, { op }) => {
        const schema = requestEnum(clone, op, (values) => values.length >= 2);
        if (schema === undefined) return false;
        schema.enum = (schema.enum as unknown[]).slice(0, -1);
        return true;
      }),
    ),
  },
  {
    id: 'response-property-removed',
    label: 'breaking',
    why: 'an old caller reads a required property the response no longer has',
    apply: guard((document) =>
      firstOperation(document, (clone, { op }) => {
        const schema = responseSchema(clone, op);
        const found = schema && property(clone, schema, (name, p) => readable(p) && requiredOf(schema).includes(name));
        if (schema === undefined || found === undefined) return false;
        drop(schema.properties as Json, found.name);
        schema.required = requiredOf(schema).filter((name) => name !== found.name);
        return true;
      }),
    ),
  },
  {
    id: 'response-property-type-changed',
    label: 'breaking',
    why: 'an old caller reads a required property whose type changed',
    apply: guard((document) => firstOperation(document, typeChange(responseSchema, (name, p, schema) => readable(p) && requiredOf(schema).includes(name)))),
  },
  {
    id: 'path-parameter-renamed',
    label: 'breaking',
    why: 'a generated client passes path parameters by name, and the old name is gone',
    apply: guard((document) =>
      firstOperation(document, (clone, { path }) => {
        const [from] = templateNames(path);
        if (from === undefined) return false;
        const to = `${from}_${PLANTED}`;
        const paths = clone.paths as Json;
        const item = paths[path] as Json;
        renameIn(clone, item.parameters, from, to);
        for (const method of METHODS) if (isObject(item[method])) renameIn(clone, item[method].parameters, from, to);
        // The renamed path keeps its place in key order, so nothing else about the document moves.
        clone.paths = Object.fromEntries(Object.entries(paths).map(([key, value]) => [key === path ? path.replace(`{${from}}`, `{${to}}`) : key, value]));
        return true;
      }),
    ),
  },
  {
    id: 'success-status-removed',
    label: 'breaking',
    why: 'an old caller handles a success status the operation no longer documents',
    apply: guard((document) =>
      firstOperation(document, (_, { op }) => {
        const responses = op.responses;
        if (!isObject(responses) || Object.keys(responses).length < 2) return false;
        const status = Object.keys(responses).toSorted().find(isSuccess);
        if (status === undefined) return false;
        drop(responses, status);
        return true;
      }),
    ),
  },
  {
    id: 'security-requirement-added',
    label: 'breaking',
    why: 'an old caller sends no credentials, and the operation now demands them',
    apply: guard((document) =>
      firstOperation(document, (clone, { op }) => {
        const root = Array.isArray(clone.security) ? clone.security : [];
        const effective = Array.isArray(op.security) ? (op.security as unknown[]) : root;
        if (effective.length > 0) return false;
        const components = isObject(clone.components) ? clone.components : {};
        const schemes = isObject(components.securitySchemes) ? components.securitySchemes : {};
        clone.components = { ...components, securitySchemes: { ...schemes, [PLANTED]: { type: 'http', scheme: 'bearer' } } };
        op.security = [{ [PLANTED]: [] }];
        return true;
      }),
    ),
  },
  // ── non-breaking ──────────────────────────────────────────────────────────────────────────
  {
    id: 'operation-added',
    label: 'non-breaking',
    why: 'no old caller calls an operation that did not exist',
    apply: guard((document) => {
      const clone = structuredClone(document) as Json;
      const path = `/${PLANTED}`;
      if ((clone.paths as Json)[path] !== undefined) return undefined;
      (clone.paths as Json)[path] = { get: { operationId: PLANTED, responses: { 200: { description: 'planted' } } } };
      return clone;
    }),
  },
  {
    id: 'optional-request-parameter-added',
    label: 'non-breaking',
    why: 'an old caller leaves the new optional query parameter out, which is allowed',
    apply: guard((document) => firstOperation(document, addQuery(false))),
  },
  {
    id: 'optional-request-property-added',
    label: 'non-breaking',
    why: 'an old caller leaves the new optional property out, which is allowed',
    apply: guard((document) =>
      firstOperation(document, (clone, { op }) => {
        const schema = requestSchema(clone, op);
        if (schema === undefined) return false;
        (schema.properties as Json)[PLANTED] = { type: 'string' };
        return true;
      }),
    ),
  },
  {
    id: 'request-property-made-optional',
    label: 'non-breaking',
    why: 'an old caller sends the property anyway, which is still allowed',
    apply: guard((document) =>
      firstOperation(document, (clone, { op }) => {
        const schema = requestSchema(clone, op);
        const found = schema && property(clone, schema, (name, p) => writable(p) && requiredOf(schema).includes(name));
        if (schema === undefined || found === undefined) return false;
        const rest = requiredOf(schema).filter((name) => name !== found.name);
        if (rest.length > 0) schema.required = rest;
        else drop(schema, 'required');
        return true;
      }),
    ),
  },
  {
    id: 'request-enum-value-added',
    label: 'non-breaking',
    why: 'every value an old caller sends is still accepted',
    apply: guard((document) =>
      firstOperation(document, (clone, { op }) => {
        const schema = requestEnum(clone, op, (values, s) => s.type === 'string' && values.every((v) => typeof v === 'string'));
        if (schema === undefined) return false;
        schema.enum = [...(schema.enum as unknown[]), PLANTED];
        return true;
      }),
    ),
  },
  {
    id: 'response-property-added',
    label: 'non-breaking',
    why: 'an old caller ignores a property it does not read',
    apply: guard((document) =>
      firstOperation(document, (clone, { op }) => {
        const schema = responseSchema(clone, op);
        if (schema === undefined || schema.additionalProperties === false) return false;
        (schema.properties as Json)[PLANTED] = { type: 'string' };
        return true;
      }),
    ),
  },
  {
    id: 'description-changed',
    label: 'non-breaking',
    why: 'a description is documentation; no request or response changes',
    apply: guard((document) =>
      firstOperation(document, (_, { op }) => {
        op.description = `${typeof op.description === 'string' ? op.description : ''} (edited)`.trim();
        return true;
      }),
    ),
  },
  {
    id: 'example-changed',
    label: 'non-breaking',
    why: 'an example is documentation; no request or response changes',
    apply: guard((document) =>
      firstOperation(document, (clone, { op }) => {
        const schema = responseSchema(clone, op);
        const found = schema && property(clone, schema, (_, p) => p.type === 'string' && p.enum === undefined);
        if (found === undefined) return false;
        found.value.example = PLANTED;
        return true;
      }),
    ),
  },
  {
    id: 'operation-deprecated',
    label: 'non-breaking',
    why: 'a deprecated operation still answers every old call',
    apply: guard((document) =>
      firstOperation(document, (_, { op }) => {
        if (op.deprecated === true) return false;
        op.deprecated = true;
        return true;
      }),
    ),
  },
];
