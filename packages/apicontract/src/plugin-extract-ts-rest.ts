/**
 * `apicontract extract --from ts-rest` (apicontract-extract R7): a ts-rest contract object becomes
 * OpenAPI 3.1, through the writer `openapi-from-schemas` uses. ts-rest is archived; this is the way
 * out for its users, and `gen` then writes the server and client the contract had.
 *
 * A contract is plain data after `c.router` (path prefixes and common responses already applied),
 * so it is read without ts-rest installed: `{ method, path, pathParams, query, headers, body,
 * responses }` per route, routers nested by key. The route's id is its keys joined by `.`.
 */
import { type ContractFinding } from './core/model.js';
import { escape, finding, isStandard, type Json, loadModule } from './extract-standard.js';
import { type Extractor, type ExtractorResult, type Options, type Plugin } from './host.js';
import { docsOf, exported, namesOf, openapiPath, type Route, type RouteResponse, toOpenApi, withFindings, WRITER_OPTIONS } from './plugin-extract-openapi.js';

/** `c.noBody()`: a route or response without a body. */
const NO_BODY = 'ContractNoBody';

/** A router or a module: an object literal, not a class instance or a schema. */
const isPlain = (value: unknown): value is Json => {
  if (typeof value !== 'object' || value === null || isStandard(value)) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
};

const isRoute = (value: Json): boolean => typeof value.method === 'string' && typeof value.path === 'string';

/** `c.type<T>()` is a symbol at run time: the type is gone, so there is no schema to write. */
const typeOnly = (pointer: string, what: string): ContractFinding =>
  finding('type-only', pointer, `${what} is \`c.type<T>()\`, which has no schema at run time, so OpenAPI gets no schema for it`, 'give it a Standard Schema (a Zod 4 schema, for one) in place of `c.type<T>()`');

/** A body or a response body: a schema, `c.noBody()`, or `c.type<T>()`. */
const bodyOf = (value: unknown, pointer: string, what: string, findings: ContractFinding[]): unknown => {
  if (value === undefined || isStandard(value)) return value;
  if (typeof value === 'symbol' && value.description === NO_BODY) return undefined;
  findings.push(typeof value === 'symbol' ? typeOnly(pointer, what) : finding('unknown-body', pointer, `${what} is neither a schema, \`c.noBody()\` nor \`c.type<T>()\``, 'give a Standard Schema, or `c.noBody()`'));
  return undefined;
};

const responseOf = (status: string, value: unknown, pointer: string, findings: ContractFinding[]): RouteResponse => {
  // `c.otherResponse({ contentType, body })`: a body of another media type.
  if (isPlain(value) && typeof value.contentType === 'string') {
    return { status, schema: bodyOf(value.body, `${pointer}/body`, `the ${status} response`, findings), contentType: value.contentType };
  }
  return { status, schema: bodyOf(value, pointer, `the ${status} response`, findings) };
};

const routeOf = (keys: readonly string[], route: Json, findings: ContractFinding[]): Route => {
  const id = keys.join('.');
  const pointer = keys.map((key) => `/${escape(key)}`).join('');
  const responses = Object.entries(isPlain(route.responses) ? route.responses : {}).map(([status, value]) => responseOf(status, value, `${pointer}/responses/${status}`, findings));
  return {
    id,
    pointer,
    method: (route.method as string).toLowerCase(),
    path: openapiPath(route.path as string),
    params: route.pathParams,
    query: route.query,
    headers: route.headers,
    body: bodyOf(route.body, `${pointer}/body`, `${id}'s body`, findings),
    ...(typeof route.contentType === 'string' ? { contentType: route.contentType } : {}),
    responses: responses.length === 0 ? [{ status: '204' }] : responses,
    docs: docsOf(route),
  };
};

/** Every route of a router, depth first; what is neither a route nor a router is not part of the contract. */
export const routesOf = (router: Json, keys: readonly string[] = [], findings: ContractFinding[] = []): { routes: Route[]; findings: ContractFinding[] } => {
  const routes: Route[] = [];
  for (const [key, value] of Object.entries(router)) {
    if (!isPlain(value)) continue;
    if (isRoute(value)) routes.push(routeOf([...keys, key], value, findings));
    else routes.push(...routesOf(value, [...keys, key], findings).routes);
  }
  return { routes, findings };
};

/** The contract: the export named, or the module's own exports for `*`. */
export const contractOf = (namespace: Json, wanted: unknown): Json => {
  if (wanted === undefined || wanted === '*') return namespace;
  const found = exported(namespace, wanted);
  if (!isPlain(found)) throw new TypeError(`the module has no ts-rest contract ${JSON.stringify(wanted)}. fix: name the export that \`c.router(…)\` made, or write "*"`);
  return found;
};

export const extractTsRest = (namespace: Json, options: Options): ExtractorResult => {
  const { routes, findings } = routesOf(contractOf(namespace, options.export));
  return withFindings(toOpenApi(routes, namesOf(namespace), options), findings);
};

const extractor: Extractor = {
  description: 'An OpenAPI 3.1 document from a ts-rest contract (`c.router(…)`), read as data: ts-rest need not be installed',
  options: { ...WRITER_OPTIONS, export: { type: 'string', description: 'the export holding the contract, or "*" when the module\'s own exports are its routers (default)' } },
  sample: {
    options: { module: { contract: { health: { method: 'GET', path: '/health', responses: { 200: Symbol(NO_BODY) } } } }, export: 'contract' },
    document: { openapi: '3.1.0', info: { title: 'API', version: '0.0.0' }, paths: { '/health': { get: { operationId: 'health', responses: { '200': { description: 'OK' } } } } } },
  },
  run: async (options) => extractTsRest(await loadModule(options.module), options),
};

export const plugin: Plugin = { name: 'extract-ts-rest', extractors: { 'ts-rest': extractor } };
