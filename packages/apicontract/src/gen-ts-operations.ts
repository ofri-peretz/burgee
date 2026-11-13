/**
 * Paths, operations and what hangs off them: parameters, request bodies, responses, headers. The
 * port of openapi-typescript's `transform/*-object.ts`, member order included.
 */
import {
  type InterfaceStatement,
  type Member,
  NEVER,
  type Property,
  STRING,
  type TypeNode,
  UNKNOWN,
  object,
  property,
} from './gen-ts-ast.js';
import { jsDoc } from './gen-ts-comment.js';
import { type Context, type TransformOptions } from './gen-ts-context.js';
import { type Dict, dict, entries, isDict, list } from './gen-ts-dict.js';
import { enumStatement } from './gen-ts-enums.js';
import { childPath, createRef, refType } from './gen-ts-ref.js';
import { transformSchemaObject } from './gen-ts-schema.js';
import { newNameState, propertyName } from './gen-ts-text.js';

export const METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'] as const;

const never = (name: string, readonly: boolean): Property => property({ readonly, name, optional: true, type: NEVER });

/** A Media Type Object: its schema, or `unknown` without one. */
const mediaType = (media: unknown, options: TransformOptions): TypeNode => {
  const { schema } = dict(media);
  return schema ? transformSchemaObject(schema, options) : UNKNOWN;
};

/** One member per media type, keyed by its name. A media type may itself be a reference. */
const contentMembers = (content: unknown, options: TransformOptions, pathOf: (name: string) => string): Member[] =>
  entries(content, options.ctx).map(([name, media]) => {
    const next = { ...options, path: pathOf(name) };
    return property({
      readonly: options.ctx.immutable,
      name: propertyName(name),
      type: '$ref' in dict(media) ? transformSchemaObject(media, next) : mediaType(media, next),
      comment: jsDoc(media),
    });
  });

/** A Header Object: its schema, its content, or `unknown`. */
export const transformHeaderObject = (header: unknown, options: TransformOptions): TypeNode => {
  const { schema, content } = dict(header);
  if (schema) return transformSchemaObject(schema, options);
  return content ? object(contentMembers(content, options, (name) => childPath(options.path, name))) : UNKNOWN;
};

/** A Request Body Object: `{ content: { [mediaType]: … } }`. */
export const transformRequestBodyObject = (requestBody: unknown, options: TransformOptions): TypeNode => {
  const members = contentMembers(dict(requestBody).content, options, (name) => createRef([options.path, 'content', name]));
  const content = members.length > 0 ? members : [never('"*/*"', false)];
  return object([property({ readonly: options.ctx.immutable, name: 'content', type: object(content) })]);
};

const headerMember = (name: string, header: unknown, options: TransformOptions): Member => {
  const declared = dict(header);
  const isReference = '$ref' in declared;
  return property({
    readonly: options.ctx.immutable,
    name: propertyName(name),
    optional: !(isReference || Boolean(declared.required)),
    type: isReference
      ? refType(String(declared.$ref))
      : transformHeaderObject(header, { ...options, path: createRef([options.path, 'headers', name]) }),
    comment: jsDoc(header),
  });
};

/** A Response Object: its headers, open to any other, and its content. */
export const transformResponseObject = (response: unknown, options: TransformOptions): TypeNode => {
  const { headers, content } = dict(response);
  const { ctx } = options;
  const anyHeader: Member = { kind: 'index', readonly: ctx.immutable, parameter: 'name', parameterType: 'string', type: UNKNOWN };
  const headerMembers = entries(headers, ctx).map(([name, header]) => headerMember(name, header, options));
  const body = entries(content, ctx).map(([name, media]) =>
    property({
      readonly: ctx.immutable,
      name: propertyName(name),
      type: mediaType(media, { ...options, path: createRef([options.path, 'content', name]) }),
      comment: jsDoc(media),
    }),
  );
  return object([
    property({ name: 'headers', type: object([...headerMembers, anyHeader]) }),
    body.length > 0 ? property({ name: 'content', type: object(body) }) : never('content', false),
  ]);
};

/** A Responses Object: one member per status code, or `never` without any. */
const responsesType = (responses: unknown, options: TransformOptions): TypeNode => {
  const members = entries(responses, options.ctx).map(([code, response]) => {
    const declared = dict(response);
    return property({
      readonly: options.ctx.immutable,
      name: propertyName(code),
      type:
        '$ref' in declared
          ? refType(String(declared.$ref))
          : transformResponseObject(response, { ...options, path: createRef([options.path, 'responses', code]) }),
      comment: jsDoc(response),
    });
  });
  return members.length > 0 ? object(members) : NEVER;
};

interface Parameter {
  readonly original: Dict;
  /** The parameter itself, after following a reference. */
  readonly resolved: Dict;
}

const resolved = (value: unknown, ctx: Context): Dict => {
  const declared = dict(value);
  return dict('$ref' in declared ? ctx.resolve(String(declared.$ref)) : declared);
};

/**
 * The names a path writes in braces, in order: what `/\{([^}]+)\}/g` captures, found by index so
 * a path of nothing but `{` is read once, not once per brace.
 */
const bracedNames = (path: string): string[] => {
  const names: string[] = [];
  let open = path.indexOf('{');
  while (open !== -1) {
    const close = path.indexOf('}', open + 1);
    if (close === -1) break;
    // `{}` names nothing; the next brace may still open a name.
    const named = close > open + 1;
    if (named) names.push(path.slice(open + 1, close));
    open = path.indexOf('{', named ? close + 1 : open + 1);
  }
  return names;
};

/** The parameters a path names in braces that nothing declares, as required strings. */
const impliedPathParameters = (declared: readonly Parameter[], path: string): Parameter[] => {
  const names = bracedNames(path);
  const added: Parameter[] = [];
  for (const name of names) {
    const isDeclared = [...declared, ...added].some((known) => known.resolved.in === 'path' && known.resolved.name === name);
    // A path parameter is required wherever it is declared, so the implied one need not say so.
    const implied = { name, in: 'path', schema: { type: 'string' } };
    if (!isDeclared) added.push({ original: implied, resolved: implied });
  }
  return added;
};

const isDeprecated = ({ resolved: parameter }: Parameter): boolean =>
  Boolean(parameter.deprecated) || Boolean(dict(parameter.schema).deprecated);

const parameterMember = ({ original, resolved: parameter }: Parameter, options: TransformOptions): Property => {
  const inline = (): TypeNode => {
    const path = createRef([options.path, 'parameters', String(parameter.in), String(parameter.name)]);
    // A parameter without a schema is assumed to be a string.
    return parameter.schema ? transformSchemaObject(parameter.schema, { ...options, path }) : STRING;
  };
  return property({
    readonly: options.ctx.immutable,
    name: propertyName(parameter.name),
    optional: parameter.in !== 'path' && !parameter.required,
    type: '$ref' in original ? refType(String(original.$ref), { parameter }) : inline(),
    comment: jsDoc(parameter),
  });
};

const LOCATIONS = ['query', 'header', 'path', 'cookie'] as const;

/** `parameters: { query, header, path, cookie }`, each location optional unless something in it is required. */
export const parametersMember = (parameters: unknown, options: TransformOptions): Property => {
  const { ctx } = options;
  let all = list(parameters).map((original): Parameter => ({ original: dict(original), resolved: resolved(original, ctx) }));
  if (ctx.generatePathParams && options.path !== undefined) all.push(...impliedPathParameters(all, options.path));
  if (ctx.alphabetize) {
    all = all.toSorted((left, right) => String(left.resolved.name ?? '').localeCompare(String(right.resolved.name ?? ''), 'en'));
  }
  if (ctx.excludeDeprecated) all = all.filter((parameter) => !isDeprecated(parameter));
  const locations = LOCATIONS.map((location) => {
    const members = all.filter((parameter) => parameter.resolved.in === location).map((parameter) => parameterMember(parameter, options));
    return property({
      readonly: ctx.immutable,
      name: location,
      optional: members.every((member) => member.optional),
      type: members.length > 0 ? object(members) : NEVER,
    });
  });
  return property({ readonly: ctx.immutable, name: 'parameters', type: object(locations) });
};

const requestBodyMember = (requestBody: unknown, options: TransformOptions): Property => {
  const { ctx } = options;
  if (!requestBody) return never('requestBody', ctx.immutable);
  const declared = dict(requestBody);
  const isReference = '$ref' in declared;
  return property({
    readonly: ctx.immutable,
    name: 'requestBody',
    optional: !resolved(requestBody, ctx).required,
    type: isReference
      ? refType(String(declared.$ref))
      : transformRequestBodyObject(requestBody, { ...options, path: createRef([options.path, 'requestBody']) }),
    comment: jsDoc(requestBody),
  });
};

/** An Operation Object's members: `parameters`, `requestBody`, `responses`. */
export const transformOperationObject = (operation: unknown, options: TransformOptions): Property[] => {
  const { parameters, requestBody, responses } = dict(operation);
  return [
    parametersMember(parameters, options),
    requestBodyMember(requestBody, options),
    property({ readonly: options.ctx.immutable, name: 'responses', type: responsesType(responses, options) }),
  ];
};

/** The top-level `operations` interface, created the first time an operation is hoisted into it. */
const operationsInterface = (ctx: Context): InterfaceStatement => {
  // Only this interface is ever hoisted under the name: enums start with a capital, values arrays end in `Values`.
  const found = ctx.injectFooter.find((statement): statement is InterfaceStatement => statement.name === 'operations');
  if (found !== undefined) return found;
  const created: InterfaceStatement = { kind: 'interface', name: 'operations', members: [] };
  ctx.injectFooter.push(created);
  return created;
};

/** Path-level parameters folded into the operation's own, which win a clash of location and name. */
const foldedParameters = (pathItem: Dict, operation: Dict, ctx: Context): unknown[] => {
  const keyed = new Map<string, unknown>();
  for (const parameter of [...list(pathItem.parameters), ...list(operation.parameters)]) {
    const { in: location, name } = resolved(parameter, ctx);
    keyed.set(`${String(location)}-${String(name)}`, parameter);
  }
  return [...keyed.values()];
};

const operationType = (pathItem: Dict, method: string, options: TransformOptions): TypeNode => {
  const operation = dict(pathItem[method]);
  if ('$ref' in operation) return refType(String(operation.$ref));
  const { ctx } = options;
  const folded = { ...operation, parameters: foldedParameters(pathItem, operation, ctx) };
  const members = (): Member[] => transformOperationObject(folded, { ...options, path: createRef([options.path, method]) });
  if (!operation.operationId) return object(members());
  // A `#` in an operation id would read as the start of a pointer.
  const id = String(operation.operationId).replaceAll('#', '/');
  // The interface is found before the operation is transformed: enums it hoists come after it.
  const operations = operationsInterface(ctx);
  operations.members.push(property({ readonly: ctx.immutable, name: propertyName(id), type: object(members()) }));
  return refType(createRef(['operations', id]));
};

/** A Path Item Object: its shared parameters, then every method, absent ones as `never`. */
export const transformPathItemObject = (pathItem: unknown, options: TransformOptions): TypeNode => {
  const item = dict(pathItem);
  const { ctx } = options;
  // Shared parameters first: what they hoist to the end of the file comes before what the methods hoist.
  const shared = parametersMember(item.parameters, { ...options, path: createRef([options.path, 'parameters']) });
  const methods = METHODS.map((method) => {
    const operation = item[method];
    if (!operation || (ctx.excludeDeprecated && Boolean(resolved(operation, ctx).deprecated))) return never(method, ctx.immutable);
    return property({
      readonly: ctx.immutable,
      name: method,
      type: operationType(item, method, options),
      comment: jsDoc(operation),
    });
  });
  return object([shared, ...methods]);
};

const TEMPLATE_TYPES: ReadonlyMap<unknown, string> = new Map([
  ['number', 'number'],
  ['integer', 'number'],
  ['boolean', 'boolean'],
]);

/** Every path parameter the path item or one of its operations declares, by name; the last one wins. */
const pathParameters = (pathItem: Dict, ctx: Context): Map<unknown, Dict> => {
  // A method the path item lacks resolves to an object with no parameters.
  const operations = METHODS.map((method) => resolved(pathItem[method], ctx));
  const declared = [pathItem, ...operations].flatMap((holder) => list(holder.parameters));
  const found = new Map<unknown, Dict>();
  for (const parameter of declared.map((item) => resolved(item, ctx))) {
    if (parameter.in === 'path') found.set(parameter.name, parameter);
  }
  return found;
};

/** A path as a template literal type: `/users/{id}` becomes `/users/${string}`. */
const templateType = (url: string, pathItem: Dict, ctx: Context): string | undefined => {
  const names = bracedNames(url);
  if (names.length === 0) return undefined;
  const parameters = pathParameters(pathItem, ctx);
  let template = `\`${url}\``;
  for (const name of names) {
    const type = TEMPLATE_TYPES.get(dict(parameters.get(name)?.schema).type) ?? 'string';
    template = template.replace(`{${name}}`, () => `\${${type}}`);
  }
  return template;
};

const pathMember = (url: string, pathItem: Dict, ctx: Context): Member => {
  const { immutable: readonly } = ctx;
  if ('$ref' in pathItem) {
    return property({ readonly, name: propertyName(url), type: refType(String(pathItem.$ref)), comment: jsDoc(pathItem) });
  }
  const type = transformPathItemObject(pathItem, { path: createRef(['paths', url]), ctx });
  const template = ctx.pathParamsAsTypes ? templateType(url, pathItem, ctx) : undefined;
  if (template === undefined) return property({ readonly, name: propertyName(url), type });
  return { kind: 'index', readonly, parameter: 'path', parameterType: template, type };
};

/** The Paths Object: one member per path. */
export const transformPathsObject = (paths: unknown, ctx: Context): TypeNode =>
  object(
    entries(paths, ctx)
      .filter((entry): entry is [string, Dict] => isDict(entry[1]))
      .map(([url, pathItem]) => pathMember(url, pathItem, ctx)),
  );

/** The Webhooks Object: one path item per name. */
export const transformWebhooksObject = (webhooks: unknown, ctx: Context): TypeNode =>
  object(
    entries(webhooks, ctx).map(([name, pathItem]) =>
      property({
        readonly: ctx.immutable,
        name: propertyName(name),
        type: transformPathItemObject(pathItem, { path: createRef(['webhooks', name]), ctx }),
      }),
    ),
  );

const NOT_NAME = /\{.*\}|:.*|[^a-zA-Z\d_]+/;

/** A name for an operation without an id: its method and path, `get /users/{id}` as `GetUsers`. */
const pathName = (method: string, url: string): string =>
  `${method}${url}`
    .split('/')
    .map((part) => (part.charAt(0).toUpperCase() + part.slice(1)).replace(NOT_NAME, ''))
    .join('');

const METHOD_NAMES: ReadonlySet<string> = new Set(METHODS);

/** An `ApiPaths` enum: one member per operation, valued with its path. */
export const pathsEnum = (paths: unknown): ReturnType<typeof enumStatement> => {
  const operations = entries(paths).flatMap(([url, pathItem]) =>
    Object.entries(dict(pathItem))
      .filter(([method]) => METHOD_NAMES.has(method))
      .map(([method, operation]) => ({ value: url, name: dict(operation).operationId || pathName(method, url) })),
  );
  return enumStatement({ name: 'ApiPaths', entries: operations }, newNameState());
};
