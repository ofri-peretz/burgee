/**
 * `apicontract extract --from openapi-from-schemas` (apicontract-extract R4): a module exporting
 * `{ [operationId]: { method, path, input, output } }` of Standard Schema values becomes an OpenAPI
 * 3.1 document. The code-first route for a team with no framework integration, and the writer the
 * framework extractors (ts-rest, NestJS) hand their routes to.
 *
 * A schema the module also exports by name is written once, under `components.schemas` with that
 * name, and referenced; any other is written in place, as zod-to-openapi does for a schema it was
 * not told the name of.
 */
import { STATUS_CODES } from 'node:http';

import { string } from 'validator';
import { standardJson } from 'validator/json-schema';

import { type ContractFinding } from './core/model.js';
import { stable } from './extract-normalise.js';
import { escape, finding, isRecord, isStandard, type Json, loadModule, type Place, placeAt, relocate, type Side, sideOf, toJsonSchema } from './extract-standard.js';
import { type Extractor, type Options, type Plugin } from './host.js';

/** Where the schemas live, as a reference spells it. */
const BASE = '#/components/schemas/';

/** The methods OpenAPI 3.1 has, in the order it lists them. */
const METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];

/** The methods whose `input` is the request body; for the others it is the query. */
const BODY: ReadonlySet<string> = new Set(['post', 'put', 'patch']);

const JSON_MEDIA = 'application/json';

/** One response: a status, and the schema of its body when it has one. */
export interface RouteResponse {
  readonly status: string;
  readonly schema?: unknown;
  readonly contentType?: string;
}

/** A route as every extractor hands it over: its schemas are still the library's values. */
export interface Route {
  readonly id: string;
  /** Where the route is in the user's module, as a JSON Pointer. */
  readonly pointer: string;
  /** Lower case, one of OpenAPI's. */
  readonly method: string;
  /** With `{name}` path parameters. */
  readonly path: string;
  /** The request in one schema: the body for POST, PUT and PATCH, the query otherwise; path parameters are taken out by name. */
  readonly input?: unknown;
  readonly params?: unknown;
  readonly query?: unknown;
  readonly headers?: unknown;
  readonly body?: unknown;
  readonly contentType?: string;
  readonly responses: readonly RouteResponse[];
  /** `summary`, `description`, `tags`, `deprecated`: copied as they are. */
  readonly docs?: Json;
}

export interface Written {
  readonly document: Json;
  readonly findings: ContractFinding[];
}

/** `/pets/:id` and `/pets/{id}` are one path; OpenAPI writes the second. */
export const openapiPath = (path: string): string => path.replaceAll(/:([A-Za-z_][\w]*)/gu, '{$1}');

const pathNames = (path: string): string[] => [...path.matchAll(/\{([^}]+)\}/gu)].map((match) => match[1] as string);

/** The operation docs that are the right type; anything else is left out. */
export const docsOf = (value: Json): Json => {
  const docs: Json = {};
  if (typeof value.summary === 'string') docs.summary = value.summary;
  if (typeof value.description === 'string') docs.description = value.description;
  if (Array.isArray(value.tags) && value.tags.every((tag) => typeof tag === 'string')) docs.tags = value.tags;
  if (typeof value.deprecated === 'boolean') docs.deprecated = value.deprecated;
  return docs;
};

interface Build {
  /** The components, under `#/components/schemas/`, and the findings. */
  readonly place: Place;
  /** The name each exported schema is written under. */
  readonly names: ReadonlyMap<unknown, string>;
}

const ref = (name: string): Json => ({ $ref: `${BASE}${escape(name)}` });

/** A schema relocated under `name`, kept in the components only when it refers to itself. */
const placed = (schema: Json, name: string, build: Build): Json => {
  const moved = relocate(schema, name, build.place);
  // A recursive schema refers to itself, so it needs a home to be referred to.
  if (stable(moved).includes(JSON.stringify(ref(name).$ref))) build.place.defs.set(name, moved);
  return moved;
};

/** One schema to write: the library's value, the side, where it is, and the name it takes if it needs one. */
interface Wanted {
  readonly value: unknown;
  readonly side: Side;
  readonly pointer: string;
  readonly fallback: string;
}

const converted = (wanted: Wanted, build: Build): Json | undefined => {
  const result = toJsonSchema(wanted.value, wanted.side, wanted.pointer);
  if ('schema' in result) return result.schema;
  build.place.findings.push(result.finding);
  return undefined;
};

/** The schema of a value: a reference when the module exports it by name, in place otherwise. */
const schemaOf = (wanted: Wanted, build: Build): Json | undefined => {
  const schema = converted(wanted, build);
  if (schema === undefined) return undefined;
  const exported = build.names.get(wanted.value);
  if (exported === undefined) {
    const moved = placed(schema, wanted.fallback, build);
    return build.place.defs.has(wanted.fallback) ? ref(wanted.fallback) : moved;
  }
  // One name, one schema: a side that writes another document is kept beside it.
  const candidate = relocate(schema, exported, placeAt(BASE));
  const first = build.place.defs.get(exported);
  const name = first === undefined || stable(first) === stable(candidate) ? exported : `${exported}.${wanted.side}`;
  // Writing an equal schema again under its own name changes nothing.
  build.place.defs.set(name, relocate(schema, name, build.place));
  return ref(name);
};

/** The properties of an object schema, as parameters; a schema that is not an object is a finding. */
const objectOf = (wanted: Wanted, build: Build): Json | undefined => {
  const schema = converted(wanted, build);
  if (schema === undefined) return undefined;
  if (!isRecord(schema.properties)) {
    build.place.findings.push(finding('not-an-object', wanted.pointer, `${wanted.pointer} is not an object schema, so it cannot be split into parameters`, 'describe the parameters with an object schema, one property each'));
    return undefined;
  }
  return placed(schema, wanted.fallback, build);
};

const parametersOf = (schema: Json, location: string, only: (name: string) => boolean): Json[] => {
  const { required } = schema;
  return Object.entries(schema.properties as Json)
    .filter(([name]) => only(name))
    .map(([name, property]) => ({ name, in: location, required: location === 'path' || (Array.isArray(required) && required.includes(name)), schema: property }));
};

/** The object schema without the properties named. */
const without = (schema: Json, names: readonly string[]): Json => {
  const properties = Object.fromEntries(Object.entries(schema.properties as Json).filter(([name]) => !names.includes(name)));
  const required = Array.isArray(schema.required) ? (schema.required as unknown[]).filter((name) => !names.includes(name as string)) : [];
  const { required: _required, ...rest } = schema;
  return { ...rest, properties, ...(required.length === 0 ? {} : { required }) };
};

interface Request {
  readonly parameters: Json[];
  readonly body?: Json | undefined;
}

/** What the shorthand `input` stands for, by method. */
const fromInput = (route: Route, names: readonly string[], build: Build): Request => {
  const wanted: Wanted = { value: route.input, side: 'input', pointer: `${route.pointer}/input`, fallback: `${route.id}.input` };
  if (BODY.has(route.method) && names.length === 0) return { parameters: [], body: schemaOf(wanted, build) };
  const schema = objectOf(wanted, build);
  if (schema === undefined) return { parameters: [] };
  const inPath = parametersOf(schema, 'path', (name) => names.includes(name));
  if (BODY.has(route.method)) return { parameters: inPath, body: without(schema, names) };
  return { parameters: [...inPath, ...parametersOf(schema, 'query', (name) => !names.includes(name))] };
};

const LOCATIONS = [
  ['params', 'path'],
  ['query', 'query'],
  ['headers', 'header'],
] as const;

const requestOf = (route: Route, build: Build): Request => {
  const names = pathNames(route.path);
  const shorthand: Request = route.input === undefined ? { parameters: [] } : fromInput(route, names, build);
  const parameters = [...shorthand.parameters];
  for (const [key, location] of LOCATIONS) {
    if (route[key] === undefined) continue;
    const schema = objectOf({ value: route[key], side: 'input', pointer: `${route.pointer}/${key}`, fallback: `${route.id}.${key}` }, build);
    if (schema !== undefined) parameters.push(...parametersOf(schema, location, () => true));
  }
  // A path parameter no schema describes is still a parameter: a string, as the router hands it over.
  for (const name of names) {
    if (!parameters.some((parameter) => parameter.in === 'path' && parameter.name === name)) parameters.push({ name, in: 'path', required: true, schema: { type: 'string' } });
  }
  const body = route.body === undefined ? shorthand.body : schemaOf({ value: route.body, side: 'input', pointer: `${route.pointer}/body`, fallback: `${route.id}.body` }, build);
  return { parameters, body };
};

const responseOf = (route: Route, response: RouteResponse, side: Side, build: Build): Json => {
  const description = STATUS_CODES[response.status] ?? 'Response';
  if (response.schema === undefined) return { description };
  const schema = schemaOf({ value: response.schema, side, pointer: `${route.pointer}/responses/${response.status}`, fallback: `${route.id}.${response.status}` }, build);
  return schema === undefined ? { description } : { description, content: { [response.contentType ?? JSON_MEDIA]: { schema } } };
};

const responsesOf = (route: Route, side: Side, build: Build): Json => Object.fromEntries(route.responses.map((response) => [response.status, responseOf(route, response, side, build)]));

const operationOf = (route: Route, side: Side, build: Build): Json => {
  const { parameters, body } = requestOf(route, build);
  return {
    operationId: route.id,
    ...route.docs,
    ...(parameters.length === 0 ? {} : { parameters }),
    ...(body === undefined ? {} : { requestBody: { required: true, content: { [route.contentType ?? JSON_MEDIA]: { schema: body } } } }),
    responses: responsesOf(route, side, build),
  };
};

export interface WriteOptions {
  readonly title?: unknown;
  readonly version?: unknown;
  /** Which side of a response schema to write; `output` by default, as a server's schema hands it out. */
  readonly responseSide?: unknown;
}

/** Routes to an OpenAPI 3.1 document. `names` is every schema the module exports, by value. */
export const toOpenApi = (routes: readonly Route[], names: ReadonlyMap<unknown, string>, options: WriteOptions): Written => {
  const side = sideOf(options.responseSide ?? 'output');
  const build: Build = { place: placeAt(BASE), names };
  const paths = new Map<string, Map<string, Json>>();
  for (const route of routes.toSorted((a, b) => a.id.localeCompare(b.id, 'en'))) {
    if (!METHODS.includes(route.method)) {
      build.place.findings.push(finding('unknown-method', route.pointer, `${route.id} has the method "${route.method}", which OpenAPI does not have`, `use one of ${METHODS.join(', ')}`));
      continue;
    }
    const item = paths.get(route.path) ?? new Map<string, Json>();
    paths.set(route.path, item);
    if (item.has(route.method)) {
      build.place.findings.push(finding('duplicate-route', route.pointer, `${route.id} is ${route.method.toUpperCase()} ${route.path} again; the first is kept`, 'give each operation a path and method of its own'));
      continue;
    }
    item.set(route.method, operationOf(route, side, build));
  }
  const ordered = Object.fromEntries(
    [...paths.keys()].toSorted().map((path) => {
      const item = paths.get(path) as Map<string, Json>;
      return [path, Object.fromEntries(METHODS.filter((method) => item.has(method)).map((method) => [method, item.get(method)]))];
    }),
  );
  const schemas = Object.fromEntries([...build.place.defs.keys()].toSorted().map((name) => [name, build.place.defs.get(name)]));
  const document: Json = {
    openapi: '3.1.0',
    info: { title: typeof options.title === 'string' ? options.title : 'API', version: typeof options.version === 'string' ? options.version : '0.0.0' },
    paths: ordered,
    ...(Object.keys(schemas).length === 0 ? {} : { components: { schemas } }),
  };
  return { document, findings: build.place.findings };
};

/** Every Standard Schema the module exports, by value, to the name it is exported under. */
export const namesOf = (namespace: Json): Map<unknown, string> => {
  const names = new Map<unknown, string>();
  for (const name of Object.keys(namespace).toSorted()) if (isStandard(namespace[name]) && !names.has(namespace[name])) names.set(namespace[name], name);
  return names;
};

/** The export named, own only: an inherited `toString` is not an export. */
export const exported = (namespace: Json, wanted: unknown): unknown => Object.entries(namespace).find(([name]) => name === wanted)?.[1];

const isOperation = (value: unknown): value is Json => isRecord(value) && typeof value.method === 'string' && typeof value.path === 'string';

/** One entry of the operation map as a route. */
const routeOf = (id: string, operation: Json, findings: ContractFinding[]): Route => {
  const pointer = `/${escape(id)}`;
  const responses: RouteResponse[] = [];
  if (operation.output !== undefined) responses.push({ status: '200', schema: operation.output });
  if (isRecord(operation.responses)) {
    for (const [status, schema] of Object.entries(operation.responses)) {
      if (schema === null) responses.push({ status });
      else if (isStandard(schema)) responses.push({ status, schema });
      else findings.push(finding('unknown-response', `${pointer}/responses/${status}`, `${id}'s ${status} response is neither a schema nor null`, 'give a Standard Schema for a body, or null for none'));
    }
  }
  if (responses.length === 0) responses.push({ status: '204' });
  return {
    id,
    pointer,
    method: (operation.method as string).toLowerCase(),
    path: openapiPath(operation.path as string),
    input: operation.input,
    params: operation.params,
    query: operation.query,
    headers: operation.headers,
    body: operation.body,
    responses,
    docs: docsOf(operation),
  };
};

/** The operation map: the module itself for `*`, or the export named. */
export const operationsOf = (namespace: Json, wanted: unknown): { routes: Route[]; findings: ContractFinding[] } => {
  const findings: ContractFinding[] = [];
  const all = wanted === undefined || wanted === '*';
  const map = all ? namespace : exported(namespace, wanted);
  if (!isRecord(map)) {
    throw new TypeError(`the module has no operation map ${JSON.stringify(wanted)}. fix: name the export that holds \`{ [operationId]: { method, path, input, output } }\`, or write "*"`);
  }
  const routes: Route[] = [];
  for (const [id, value] of Object.entries(map as Json)) {
    if (isOperation(value)) routes.push(routeOf(id, value, findings));
    // In a map of its own, everything is meant to be an operation; among a module's exports, schemas and helpers are not.
    else if (!all) findings.push(finding('not-an-operation', `/${escape(id)}`, `${id} has no method and path`, 'write `{ method, path, input, output }`'));
  }
  return { routes, findings };
};

/** Findings are kept in the document: the extractor host has no other place for them. */
export const withFindings = (written: Written, more: readonly ContractFinding[]): Json => {
  const findings = [...more, ...written.findings];
  return findings.length === 0 ? written.document : { ...written.document, 'x-findings': findings };
};

/** The options every extractor that writes OpenAPI through {@link toOpenApi} takes. */
export const WRITER_OPTIONS = {
  module: { type: 'string', description: 'the module to import, relative to the working folder; its code runs' },
  title: { type: 'string', description: 'info.title (default "API")' },
  version: { type: 'string', description: 'info.version (default "0.0.0")' },
  responseSide: { type: 'string', description: '"output" (default): responses as the schema hands them out; "input": as a client parses them' },
} as const;

export const extractOpenApi = (namespace: Json, options: Options): Json => {
  const { routes, findings } = operationsOf(namespace, options.export);
  return withFindings(toOpenApi(routes, namesOf(namespace), options), findings);
};

const extractor: Extractor = {
  description: 'An OpenAPI 3.1 document from a module exporting `{ [operationId]: { method, path, input, output } }` of Standard Schema values',
  options: { ...WRITER_OPTIONS, export: { type: 'string', description: 'the export holding the operation map, or "*" when the module\'s own exports are the operations (default)' } },
  sample: {
    options: { module: { getPet: { method: 'GET', path: '/pets/:id', output: standardJson(string()) } } },
    document: {
      openapi: '3.1.0',
      info: { title: 'API', version: '0.0.0' },
      paths: {
        '/pets/{id}': {
          get: {
            operationId: 'getPet',
            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
            responses: { '200': { description: 'OK', content: { [JSON_MEDIA]: { schema: { type: 'string' } } } } },
          },
        },
      },
    },
  },
  run: async (options) => extractOpenApi(await loadModule(options.module), options),
};

export const plugin: Plugin = { name: 'extract-openapi', extractors: { 'openapi-from-schemas': extractor } };
