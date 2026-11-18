/**
 * The text of `client.ts` (apicontract-clients R1–R3): a typed client over the platform `fetch`, with
 * no runtime dependency. Its types come from the `types` target's `paths`, so the client takes and
 * returns exactly what the types target says an operation takes and returns.
 *
 * The file is a fixed runtime (`RUNTIME`) and, per operation, a route (data), two types and a method.
 */
import { type Route } from './plugin-fetch-routes.js';
import { key, lines, literal } from './plugin-fetch-text.js';

/** How a response body is read: from its first declared media type. */
const kindOf = (type: string | undefined): string => {
  if (type === undefined) return 'none';
  if (/[/+]json(?:;|$)/u.test(type)) return 'json';
  return type.startsWith('text/') ? 'text' : 'blob';
};

const RUNTIME = [
  '/** A declared response: the status as the spec writes it, the status received, the body and the headers. */',
  'export interface Answer<S, B> {',
  '  readonly status: S;',
  '  readonly code: number;',
  '  readonly body: B;',
  '  readonly headers: Headers;',
  '}',
  '',
  '/** A status the operation does not declare, or a body `validate` refused. Never thrown. */',
  "export interface Unexpected extends Answer<'unexpected', unknown> {",
  '  /** What `validate` reported. */',
  '  readonly errors?: readonly unknown[];',
  '}',
  '',
  'type BodyOf<R> = R extends { content: infer C } ? C[keyof C] : undefined;',
  '',
  'export interface ClientOptions {',
  '  /** Where the API is, e.g. `https://api.example.com/v1`. */',
  '  readonly baseUrl: string;',
  '  /** Defaults to the platform `fetch`. */',
  '  readonly fetch?: (url: string, init: RequestInit) => Promise<Response>;',
  '  /** Sent with every request. */',
  '  readonly headers?: Readonly<Record<string, string>>;',
  '  /** Checks a declared response body; any error turns the result into `unexpected`. */',
  '  readonly validate?: (check: { readonly operation: string; readonly status: string; readonly body: unknown }) => readonly unknown[] | undefined;',
  '}',
  '',
  "type Place = 'path' | 'query' | 'header' | 'cookie';",
  '',
  'interface Param {',
  '  readonly name: string;',
  '  readonly in: Place;',
  '  readonly style: string;',
  '  readonly explode: boolean;',
  '}',
  '',
  'interface Route {',
  '  readonly id: string;',
  '  readonly method: string;',
  '  readonly path: string;',
  '  readonly params: readonly Param[];',
  '  readonly body?: string;',
  "  readonly responses: Readonly<Record<string, 'json' | 'text' | 'blob' | 'none'>>;",
  '}',
  '',
  'type Bag = Readonly<Record<string, unknown>>;',
  '',
  'const isBag = (value: unknown): value is Bag => typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Blob);',
  'const atom = (value: unknown): string => (typeof value === "object" && value !== null ? JSON.stringify(value) : String(value));',
  'const present = (value: Bag): [string, unknown][] => Object.entries(value).filter((entry) => entry[1] !== undefined);',
  '',
  '/** The `simple` style (path and header), each piece through `encode`. */',
  'const simple = (value: unknown, explode: boolean, encode: (text: string) => string): string => {',
  '  if (Array.isArray(value)) return value.map((item) => encode(atom(item))).join(",");',
  '  if (!isBag(value)) return encode(atom(value));',
  '  return present(value).map(([name, item]) => `${encode(name)}${explode ? "=" : ","}${encode(atom(item))}`).join(",");',
  '};',
  '',
  'const DELIMITERS: Readonly<Record<string, string>> = { spaceDelimited: "%20", pipeDelimited: "|" };',
  '',
  '/** One query parameter as `name=value` pairs, already encoded. */',
  'const query = (param: Param, value: unknown): string[] => {',
  '  const name = encodeURIComponent(param.name);',
  '  const one = (item: unknown): string => encodeURIComponent(atom(item));',
  '  if (Array.isArray(value)) {',
  '    if (param.explode) return value.map((item) => `${name}=${one(item)}`);',
  '    return [`${name}=${value.map(one).join(DELIMITERS[param.style] ?? ",")}`];',
  '  }',
  '  if (!isBag(value)) return [`${name}=${one(value)}`];',
  '  const entries = present(value);',
  '  if (param.style === "deepObject") return entries.map(([inner, item]) => `${name}%5B${encodeURIComponent(inner)}%5D=${one(item)}`);',
  '  if (param.explode) return entries.map(([inner, item]) => `${encodeURIComponent(inner)}=${one(item)}`);',
  '  return [`${name}=${entries.map(([inner, item]) => `${encodeURIComponent(inner)},${one(item)}`).join(",")}`];',
  '};',
  '',
  '/** A body as the media type the operation sends. */',
  'const encodeBody = (type: string, body: unknown): BodyInit => {',
  '  if (/[/+]json(?:;|$)/u.test(type)) return JSON.stringify(body);',
  '  const fields = isBag(body) ? present(body).flatMap(([name, value]) => (Array.isArray(value) ? value : [value]).map((item): [string, unknown] => [name, item])) : [];',
  '  if (type === "application/x-www-form-urlencoded") return new URLSearchParams(fields.map(([name, item]) => [name, atom(item)]));',
  '  if (type !== "multipart/form-data") return body as BodyInit;',
  '  const form = new FormData();',
  '  for (const [name, item] of fields) {',
  '    if (item instanceof Blob) form.append(name, item);',
  '    else form.append(name, atom(item));',
  '  }',
  '  return form;',
  '};',
  '',
  '/** The body of a response; an undeclared one is JSON when it parses and text when it does not. */',
  "const read = async (response: Response, kind: 'json' | 'text' | 'blob' | 'none' | undefined): Promise<unknown> => {",
  '  if (kind === "none") return undefined;',
  '  if (kind === "blob") return response.blob();',
  '  const text = await response.text();',
  '  if (kind === "text" || text === "") return kind === "text" ? text : undefined;',
  '  try {',
  '    return JSON.parse(text) as unknown;',
  '  } catch {',
  '    return text;',
  '  }',
  '};',
  '',
  'const call = async (options: ClientOptions, route: Route, input: object): Promise<unknown> => {',
  '  const sent = input as Partial<Record<Place, Bag>> & { readonly body?: unknown };',
  '  const headers = new Headers(options.headers);',
  '  const pairs: string[] = [];',
  '  const cookies: string[] = [];',
  '  let path = route.path;',
  '  for (const param of route.params) {',
  '    const value = sent[param.in]?.[param.name];',
  '    if (value === undefined) continue;',
  '    if (param.in === "path") path = path.replaceAll(`{${param.name}}`, simple(value, param.explode, encodeURIComponent));',
  '    else if (param.in === "query") pairs.push(...query(param, value));',
  '    else if (param.in === "header") headers.set(param.name, simple(value, param.explode, String));',
  '    else cookies.push(`${param.name}=${simple(value, false, encodeURIComponent)}`);',
  '  }',
  '  if (cookies.length > 0) headers.set("cookie", cookies.join("; "));',
  '  const init: RequestInit = { method: route.method, headers };',
  '  if (route.body !== undefined && sent.body !== undefined) {',
  '    if (route.body !== "multipart/form-data") headers.set("content-type", route.body);',
  '    init.body = encodeBody(route.body, sent.body);',
  '  }',
  '  const search = pairs.length === 0 ? "" : `?${pairs.join("&")}`;',
  '  const response = await (options.fetch ?? fetch)(`${options.baseUrl.replace(/\\/+$/u, "")}${path}${search}`, init);',
  '  const code = String(response.status);',
  '  const status = [code, `${code.charAt(0)}XX`, "default"].find((candidate) => Object.hasOwn(route.responses, candidate));',
  '  const body = await read(response, status === undefined ? undefined : route.responses[status]);',
  '  const answer = { code: response.status, body, headers: response.headers };',
  '  if (status === undefined) return { status: "unexpected", ...answer };',
  '  const errors = options.validate?.({ operation: route.id, status, body }) ?? [];',
  '  if (errors.length > 0) return { status: "unexpected", ...answer, errors };',
  '  return { status: /^\\d+$/u.test(status) ? Number(status) : status, ...answer };',
  '};',
];

/** The status as a type: `200` for a code, `"4XX"` or `"default"` as written. */
const statusType = (status: string): string => (/^\d+$/u.test(status) ? status : literal(status));

const routeData = (route: Route): string => {
  const data = {
    id: route.id,
    method: route.method.toUpperCase(),
    path: route.path,
    params: route.parameters.map((parameter) => ({ name: parameter.name, in: parameter.in, style: parameter.style, explode: parameter.explode })),
    ...(route.body === undefined ? {} : { body: route.body.type }),
    responses: Object.fromEntries(route.responses.map((response) => [response.key, kindOf(response.media[0]?.type)])),
  };
  return `  ${literal(route.id)}: ${literal(data)},`;
};

/** Whether every part of an operation's input may be left out. */
const optional = (route: Route): boolean => !route.parameters.some((parameter) => parameter.required) && route.body?.required !== true;

const bodyType = (route: Route): string => {
  if (route.body === undefined) return '{ readonly body?: never }';
  const type = `NonNullable<${route.name}["requestBody"]>["content"][${literal(route.body.type)}]`;
  return route.body.required ? `{ readonly body: ${type} }` : `{ readonly body?: ${type} }`;
};

const operationTypes = (route: Route): string[] => [
  `type ${route.name} = paths[${literal(route.path)}][${literal(route.method)}];`,
  `export type ${route.name}Input = ${route.name}["parameters"] & ${bodyType(route)};`,
  `export type ${route.name}Result =`,
  ...route.responses.map((response) => `  | Answer<${statusType(response.key)}, BodyOf<${route.name}["responses"][${statusType(response.key)}]>>`),
  '  | Unexpected;',
  '',
];

const method = (route: Route): string =>
  `  ${key(route.id)}: async (input: ${route.name}Input${optional(route) ? ' = {}' : ''}): Promise<${route.name}Result> => (await call(options, routes[${literal(route.id)}], input)) as ${route.name}Result,`;

/** `client.ts` for these routes, typed from the `types` target's module at `types`. */
export const clientFile = (routes: readonly Route[], types: string): string =>
  lines(
    `import type { paths } from ${literal(types)};`,
    '',
    ...RUNTIME,
    '',
    'const routes = {',
    ...routes.map((route) => routeData(route)),
    '} as const satisfies Readonly<Record<string, Route>>;',
    '',
    ...routes.flatMap((route) => operationTypes(route)),
    '/** One method per operation. A method resolves to the response whatever its status; only a failed request rejects. */',
    'export const createClient = (options: ClientOptions) => ({',
    ...routes.map((route) => method(route)),
    '});',
    '',
    'export type Client = ReturnType<typeof createClient>;',
  );
