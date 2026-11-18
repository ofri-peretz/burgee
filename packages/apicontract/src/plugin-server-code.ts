/**
 * The text every server target writes the same way (apicontract-servers R2, R5): spec strings as
 * safe literals, the typed `input` and response union of each route, the route as a router reads
 * it, and the answer a stub gives.
 *
 * Every spec-derived string goes through {@link literal}; the `types` and `validator` targets'
 * output is imported by path ({@link Imports}), never by apicontract.
 */
import { type Response, type Route, stubStatus } from './plugin-server-routes.js';

/**
 * A value as a TypeScript literal, safe to place in generated source: JSON, with the characters a
 * page or an older parser could misread escaped as well (`<`, `>`, U+2028, U+2029).
 */
const UNSAFE: Readonly<Record<string, string>> = { '<': '\\u003C', '>': '\\u003E', '\u2028': '\\u2028', '\u2029': '\\u2029' };
export const literal = (value: unknown): string =>
  // `undefined` has no JSON: it is written as itself.
  (JSON.stringify(value) ?? 'undefined').replaceAll(/[<>\u2028\u2029]/gu, (character) => UNSAFE[character] as string);

/** Spec text inside a comment, with nothing in it that would end the comment. */
export const commented = (text: string): string => text.replaceAll('*/', '*\\/');

export const lines = (...text: readonly string[]): string => `${text.join('\n')}\n`;

/** Where the generated files find the other targets' output. */
export interface Imports {
  readonly validators: string;
  readonly types: string;
}

/** Upper-case first letter: the type names an operation's method name gives. */
export const pascal = (name: string): string => `${name.charAt(0).toUpperCase()}${name.slice(1)}`;

/** A path parameter's name as a route segment can carry it. */
export const segmentName = (name: string): string => name.replaceAll(/\W/gu, '_');

/** The route as path-to-regexp 8 (NestJS and Express 5) reads it: `{petId}` is `:petId`, and its reserved characters, the escape itself first among them, escaped. */
export const routePath = (path: string): string =>
  path
    .split(/(\{[^}]*\})/u)
    .map((piece, index) => (index % 2 === 1 ? `:${segmentName(piece.slice(1, -1))}` : piece.replaceAll(/[\\()[\]?+!*:]/gu, '\\$&')))
    .join('');

/**
 * The route as Hono and Fastify read it, `{petId}` as `:petId`, or `undefined` when it cannot be
 * written there: neither escapes `:`, `*` or `?`, and a parameter must be a whole segment.
 */
export const colonPath = (path: string): string | undefined => {
  const segments = path.split('/').map((segment) => {
    if (/^\{[^{}]+\}$/u.test(segment)) return `:${segmentName(segment.slice(1, -1))}`;
    return /[{}:*?]/u.test(segment) ? undefined : segment;
  });
  return segments.includes(undefined) ? undefined : segments.join('/');
};

/** Where a parameter is read: Node and the Fetch API lower-case header names, and a path parameter is under the name its route segment carries. */
export const readAs = (part: string, name: string): string => {
  if (part === 'header') return name.toLowerCase();
  return part === 'path' ? segmentName(name) : name;
};

/** Whether a response key is a status code, not a range (`4XX`) or `default`. */
export const isCode = (status: string): boolean => !Number.isNaN(Number(status));

/** The status as the union member's type: a code is itself, a range or `default` is any number. */
const statusType = (status: string): string => (isCode(status) ? status : 'number');
/** The status as the `types` target indexes it. */
const statusKey = (status: string): string => (isCode(status) ? status : literal(status));

/** `GET /pets/{petId}`, safe inside a comment. */
export const where = (route: Route): string => `${route.method.toUpperCase()} ${commented(route.path)}`;

/** The parts of the request a route reads, in the order its `input` lists them. */
export const partsOf = (route: Route): ('path' | 'query' | 'header')[] => (['path', 'query', 'header'] as const).filter((part) => route.params.some((param) => param.part === part));

/** The input and output types of one route: `<Op>Input`, the request as the contract types it, and `<Op>Output`, one member per declared response. */
export const operationTypes = (route: Route): string[] => {
  const type = `${pascal(route.name)}Operation`;
  const { body } = route;
  const member = (response: Response): string => {
    const content = response.content === undefined ? 'readonly body?: undefined' : `readonly body: ${type}["responses"][${statusKey(response.status)}]["content"][${literal(response.content.media)}]`;
    return `  | { readonly status: ${statusType(response.status)}; ${content}; readonly headers?: Readonly<Record<string, string>> }`;
  };
  const outputs = route.responses.map((response) => member(response));
  const optional = body?.required === true ? '' : '?';
  return [
    `type ${type} = paths[${literal(route.path)}][${literal(route.method)}];`,
    '',
    `/** What \`${route.name}\` receives: ${where(route)}. */`,
    `export interface ${pascal(route.name)}Input {`,
    ...partsOf(route).map((part) => `  readonly ${part}: NonNullable<${type}["parameters"][${literal(part)}]>;`),
    ...(body === undefined ? [] : [`  readonly body${optional}: NonNullable<${type}["requestBody"]>["content"][${literal(body.media)}];`]),
    '}',
    '',
    `/** What \`${route.name}\` answers: one member per response the spec declares. */`,
    `export type ${pascal(route.name)}Output =`,
    `${outputs.length === 0 ? '  never' : outputs.join('\n')};`,
  ];
};

/** The response a stub answers with: the first 2xx the spec declares, else the first; a range or `default` as its first code. */
export const stubResponse = (route: Route): string => {
  const wanted = stubStatus(route.responses.map((candidate) => candidate.status));
  const response = route.responses.find((candidate) => candidate.status === wanted);
  if (response === undefined) return 'throw new Error("not implemented");';
  const first = response.status === 'default' ? '2' : response.status.charAt(0);
  const status = isCode(response.status) ? response.status : `${first}00`;
  return `return { status: ${status}${response.content === undefined ? '' : `, body: ${literal(response.content.example)}`} };`;
};
