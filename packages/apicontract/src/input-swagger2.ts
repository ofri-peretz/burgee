/**
 * The Swagger 2.0 input format (apicontract-inputs R7): a Swagger 2.0 document normalised into the
 * OpenAPI 3.1 shape, then read by the OpenAPI reader. `convert` is the normalisation on its own, so
 * `gen` can write the 3.1 document out.
 *
 * Every construct that changes shape on the way is a finding with a pointer into the 2.0 document:
 * `formData` parameters (one form request body), `collectionFormat` (a `style`), `x-nullable` (a
 * `null` type), `type: file`, a string `discriminator`, boolean `exclusiveMinimum`/`exclusiveMaximum`,
 * an assumed `consumes` or `produces`, and anything not read (`examples`, operation `schemes`,
 * references into other files). Moves that keep the meaning are not reported: `definitions` become
 * `components.schemas` with their `$ref`s rewritten, `body` becomes `requestBody` once per `consumes`
 * type, shared parameters and responses are written where they are used, `host`, `basePath` and
 * `schemes` become `servers`, and `securityDefinitions` become `components.securitySchemes`.
 */
import { type Contract, type ContractFinding } from './core/model.js';
import { pointerGet } from './core/resolve.js';
import { read as readOpenApi } from './openapi.js';

type Dict = Readonly<Record<string, unknown>>;

type Mutable = Record<string, unknown>;

const isDict = (value: unknown): value is Dict => typeof value === 'object' && value !== null && !Array.isArray(value);

const dict = (value: unknown): Dict => (isDict(value) ? value : {});

const token = (key: string): string => key.replaceAll('~', '~0').replaceAll('/', '~1');

const METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch'] as const;

/** A parameter's or header's keywords that describe its value, and so move into its `schema`. */
const VALUE_KEYWORDS = new Set([
  'type',
  'format',
  'items',
  'collectionFormat',
  'default',
  'maximum',
  'exclusiveMaximum',
  'minimum',
  'exclusiveMinimum',
  'maxLength',
  'minLength',
  'pattern',
  'maxItems',
  'minItems',
  'uniqueItems',
  'enum',
  'multipleOf',
  'x-nullable',
]);

/** Keywords whose value is one schema, or a list of them. */
const SUBSCHEMA = new Set(['items', 'additionalProperties', 'allOf', 'anyOf', 'oneOf', 'not']);

const DEFINITIONS = '#/definitions/';

/** `collectionFormat` in a query as an OpenAPI 3 `style`; a path or header is always `simple`. */
const QUERY_STYLES: ReadonlyMap<unknown, { style: string; explode: boolean }> = new Map([
  ['ssv', { style: 'spaceDelimited', explode: false }],
  ['pipes', { style: 'pipeDelimited', explode: false }],
  ['multi', { style: 'form', explode: true }],
]);

const FLOWS: Readonly<Record<string, string>> = { implicit: 'implicit', password: 'password', application: 'clientCredentials', accessCode: 'authorizationCode' };

/** Draft-04's boolean exclusive bounds, each with the bound it qualifies. */
const BOUNDS = [
  ['exclusiveMaximum', 'maximum'],
  ['exclusiveMinimum', 'minimum'],
] as const;

const FORM_TYPES = new Set(['application/x-www-form-urlencoded', 'multipart/form-data']);

/** A document this adapter does not read. The message ends in a `fix:` line. */
export class Swagger2Error extends Error {
  constructor(reason: string, fix: string) {
    super(`not a Swagger 2.0 document: ${reason}. fix: ${fix}`);
    this.name = 'Swagger2Error';
  }
}

/** Whether `document` declares itself as Swagger 2.0; YAML reads an unquoted `2.0` as the number 2 (R2). */
export const detect = (document: unknown): boolean => isDict(document) && (document.swagger === '2.0' || document.swagger === 2);

type Report = (code: string, pointer: string, message: string, fix: string) => void;

const partition = (holder: Dict): { value: Mutable; rest: Mutable } => {
  const value: Mutable = {};
  const rest: Mutable = {};
  for (const [key, entry] of Object.entries(holder)) (VALUE_KEYWORDS.has(key) ? value : rest)[key] = entry;
  return { value, rest };
};

const createConverter = (root: Dict, report: Report) => {
  /** A boolean `exclusiveMaximum` (draft-04) becomes the number it excludes (2020-12). */
  const bound = (out: Mutable, at: string, [exclusive, limit]: (typeof BOUNDS)[number]): void => {
    const { [exclusive]: flag, [limit]: value } = out;
    if (typeof flag !== 'boolean') return;
    const excluded = flag && typeof value === 'number';
    report(
      'exclusive-bound',
      `${at}/${exclusive}`,
      excluded
        ? `\`${exclusive}: true\` is written as \`${exclusive}: ${String(value)}\``
        : `\`${exclusive}: ${String(flag)}\` without a \`${limit}\` excludes nothing, and is dropped`,
      'nothing to do: OpenAPI 3.1 states the excluded bound as a number',
    );
    // eslint-disable-next-line secure-coding/detect-object-injection -- a key of a closed literal union (BOUNDS)
    delete out[excluded ? limit : exclusive];
    // eslint-disable-next-line secure-coding/detect-object-injection -- a key of a closed literal union (BOUNDS)
    if (excluded) out[exclusive] = value;
  };

  const nullable = (out: Mutable, at: string): unknown => {
    const flag = out['x-nullable'];
    delete out['x-nullable'];
    report('x-nullable', `${at}/x-nullable`, `\`x-nullable: ${String(flag)}\` is written as a \`null\` type`, 'nothing to do: OpenAPI 3.1 states nullability in `type`');
    if (flag !== true) return out;
    const withEnum = Array.isArray(out.enum) ? { ...out, enum: [...(out.enum as unknown[]), null] } : out;
    return typeof out.type === 'string' ? { ...withEnum, type: [out.type, 'null'] } : { anyOf: [withEnum, { type: 'null' }] };
  };

  /** A Swagger 2.0 schema (draft-04 with extensions) as an OpenAPI 3.1 one, `$ref`s rewritten. */
  const schema = (node: unknown, at: string): unknown => {
    if (Array.isArray(node)) return node.map((item, index) => schema(item, `${at}/${String(index)}`));
    if (!isDict(node)) return node;
    const out: Mutable = {};
    for (const [key, value] of Object.entries(node)) {
      const where = `${at}/${token(key)}`;
      if (key === 'properties') out[key] = Object.fromEntries(Object.entries(dict(value)).map(([name, child]) => [name, schema(child, `${where}/${token(name)}`)]));
      else out[key] = SUBSCHEMA.has(key) ? schema(value, where) : value;
    }
    if (typeof out.$ref === 'string' && out.$ref.startsWith(DEFINITIONS)) out.$ref = `#/components/schemas/${out.$ref.slice(DEFINITIONS.length)}`;
    // Kept as written: rewriting `./x.json#/definitions/A` to a local pointer would name a schema this document lacks.
    else if (typeof out.$ref === 'string' && !out.$ref.startsWith('#')) report('ref-external', `${at}/$ref`, `\`${out.$ref}\` is in another file and is not read`, 'bundle the document into one file first');
    return translate(out, at);
  };

  /** The 2.0 constructs a schema states another way in 3.1. */
  const translate = (out: Mutable, at: string): unknown => {
    if (out.type === 'file') {
      out.type = 'string';
      out.contentMediaType = 'application/octet-stream';
      report('file-type', `${at}/type`, '`type: file` is written as `type: string, contentMediaType: application/octet-stream`', 'nothing to do: OpenAPI 3.1 has no file type');
    }
    if (typeof out.discriminator === 'string') {
      out.discriminator = { propertyName: out.discriminator };
      report('discriminator', `${at}/discriminator`, 'a string `discriminator` is written as `{ propertyName }`', 'nothing to do: OpenAPI 3 names the property in an object');
    }
    if (out.collectionFormat !== undefined) {
      report('collection-format', `${at}/collectionFormat`, `\`collectionFormat: ${String(out.collectionFormat)}\` here has no OpenAPI 3 equivalent, and is dropped`, 'describe the nested format in `description`');
      delete out.collectionFormat;
    }
    for (const pair of BOUNDS) bound(out, at, pair);
    return 'x-nullable' in out ? nullable(out, at) : out;
  };

  /** Follow a local reference to what it names; one into another file, or to nothing, is reported and read as nothing. */
  const follow = (value: unknown, at: string): { node: Dict; at: string } | undefined => {
    if (!isDict(value) || typeof value.$ref !== 'string') return isDict(value) ? { node: value, at } : undefined;
    const ref = value.$ref;
    if (!ref.startsWith('#')) {
      report('ref-external', `${at}/$ref`, `\`${ref}\` is in another file and is not read`, 'bundle the document into one file first');
      return undefined;
    }
    try {
      return { node: dict(pointerGet(root, ref)), at: ref };
    } catch (error) {
      report('ref-broken', `${at}/$ref`, (error as Error).message.replace(/\. fix: .*/, ''), 'point the reference at a value the document defines');
      return undefined;
    }
  };

  /** A query, path or header parameter: its value keywords move into `schema`, `collectionFormat` into `style`. */
  const parameter = (declared: Dict, at: string): Dict => {
    const { value, rest } = partition(declared);
    const format = value.collectionFormat;
    delete value.collectionFormat;
    const out: Mutable = { ...rest, schema: schema(value, at) };
    if (value.type !== 'array' && format === undefined) return out;
    // csv, the default, and tsv, which has no style of its own, are both written as comma-separated.
    const style = declared.in === 'query' ? (QUERY_STYLES.get(format) ?? { style: 'form', explode: false }) : { style: 'simple', explode: false };
    report(
      'collection-format',
      `${at}/collectionFormat`,
      `\`collectionFormat: ${String(format ?? 'csv')}\` is written as \`style: ${style.style}, explode: ${String(style.explode)}\``,
      format === 'tsv' ? 'tab-separated values have no OpenAPI 3 style: use `ssv`, `pipes`, `csv` or `multi`' : 'nothing to do: OpenAPI 3 states the array format in `style`',
    );
    return { ...out, ...style };
  };

  return { schema, follow, parameter };
};

type Converter = ReturnType<typeof createConverter>;

/** What every step of a conversion reads: the 2.0 document, where findings go, and the schema converter. */
interface Context {
  readonly root: Dict;
  readonly report: Report;
  readonly converter: Converter;
}

/** A value and where it is written in the 2.0 document. */
interface Located {
  readonly node: Dict;
  readonly at: string;
}

/** The media types an operation sends or receives, falling back to the document's, then to JSON with a finding. */
const mediaTypes = (context: Context, operation: Dict, key: 'consumes' | 'produces', at: string): string[] => {
  for (const declared of [operation[key], context.root[key]]) {
    if (Array.isArray(declared) && declared.length > 0) return declared.filter((type): type is string => typeof type === 'string');
  }
  context.report(`${key}-assumed`, at, `no \`${key}\` is declared here or for the document, so \`application/json\` is assumed`, `declare \`${key}\` on the operation or the document`);
  return ['application/json'];
};

/** The form media types an operation declares, or the one its fields need. */
const formTypes = (context: Context, operation: Dict, form: readonly Located[]): string[] => {
  const declared = [operation.consumes, context.root.consumes].find((list): list is unknown[] => Array.isArray(list));
  const listed = declared?.filter((type): type is string => FORM_TYPES.has(type as string)) ?? [];
  if (listed.length > 0) return listed;
  return [form.some(({ node }) => node.type === 'file') ? 'multipart/form-data' : 'application/x-www-form-urlencoded'];
};

const formBody = (context: Context, operation: Dict, at: string, form: readonly Located[]): Dict => {
  const types = formTypes(context, operation, form);
  const properties = Object.fromEntries(
    form.map(({ node, at: where }) => {
      const { value } = partition(node);
      const described = node.description === undefined ? value : { ...value, description: node.description };
      return [String(node.name), context.converter.schema(described, where)];
    }),
  );
  const required = form.filter(({ node }) => node.required === true).map(({ node }) => String(node.name));
  context.report(
    'form-data',
    `${at}/parameters`,
    `the \`in: formData\` parameters ${form.map(({ node }) => `\`${String(node.name)}\``).join(', ')} are written as one \`${types.join('`, `')}\` request body object`,
    'nothing to do: OpenAPI 3 sends form fields as a request body',
  );
  return { required: required.length > 0, content: Object.fromEntries(types.map((type) => [type, { schema: { type: 'object', properties, required } }])) };
};

/** A `body` parameter as a request body, once per `consumes` type. */
const bodyOf = (context: Context, operation: Dict, at: string, body: Located): Dict => {
  const types = mediaTypes(context, operation, 'consumes', at);
  const description = body.node.description === undefined ? {} : { description: body.node.description };
  const content = Object.fromEntries(types.map((type) => [type, { schema: context.converter.schema(body.node.schema, `${body.at}/schema`) }]));
  return { ...description, required: body.node.required === true, content };
};

/** An operation's parameters, the path item's first and the operation's winning by name and place. */
const mergedParameters = (context: Context, shared: unknown, operation: Dict, at: string): Located[] => {
  const merged = new Map<string, Located>();
  const lists = [
    [shared, `${at.slice(0, at.lastIndexOf('/'))}/parameters`],
    [operation.parameters, `${at}/parameters`],
  ] as const;
  for (const [list, where] of lists) {
    if (!Array.isArray(list)) continue;
    for (const [index, entry] of list.entries()) {
      const followed = context.converter.follow(entry, `${where}/${String(index)}`);
      if (followed !== undefined) merged.set(`${String(followed.node.in)}:${String(followed.node.name)}`, followed);
    }
  }
  return [...merged.values()];
};

/** An operation's parameters, split into OpenAPI 3 parameters and a request body. */
const parametersOf = (context: Context, shared: unknown, operation: Dict, at: string): { parameters: Dict[]; body: Dict | undefined } => {
  const all = mergedParameters(context, shared, operation, at);
  const body = all.find(({ node }) => node.in === 'body');
  const form = all.filter(({ node }) => node.in === 'formData');
  const parameters = all.filter(({ node }) => node.in !== 'body' && node.in !== 'formData').map(({ node, at: where }) => context.converter.parameter(node, where));
  if (body === undefined) return { parameters, body: form.length > 0 ? formBody(context, operation, at, form) : undefined };
  if (form.length > 0) {
    context.report('form-data', `${at}/parameters`, 'an operation with a `body` parameter cannot also have `formData` ones; they are not read', 'send the fields in the body schema');
  }
  return { parameters, body: bodyOf(context, operation, at, body) };
};

const responseOf = (context: Context, operation: Dict, at: string, { node: response, at: where }: Located): Dict => {
  if (response.examples !== undefined) {
    context.report('examples-not-read', `${where}/examples`, 'response `examples` are not read', 'move them into the schema as `examples`');
  }
  const headers = Object.fromEntries(
    Object.entries(dict(response.headers)).map(([name, header]) => {
      const { value, rest } = partition(dict(header));
      return [name, { ...rest, schema: context.converter.schema(value, `${where}/headers/${token(name)}`) }];
    }),
  );
  const out: Mutable = { description: typeof response.description === 'string' ? response.description : '' };
  if (Object.keys(headers).length > 0) out.headers = headers;
  if (response.schema !== undefined) {
    const types = mediaTypes(context, operation, 'produces', at);
    out.content = Object.fromEntries(types.map((type) => [type, { schema: context.converter.schema(response.schema, `${where}/schema`) }]));
  }
  return out;
};

const responsesOf = (context: Context, operation: Dict, at: string): Dict =>
  Object.fromEntries(
    Object.entries(dict(operation.responses)).flatMap(([status, entry]) => {
      const where = `${at}/responses/${token(status)}`;
      const followed = context.converter.follow(entry, where);
      return followed === undefined ? [] : [[status, responseOf(context, operation, where, followed)]];
    }),
  );

const operationOf = (context: Context, operation: Dict, shared: unknown, at: string): Dict => {
  const { parameters, body } = parametersOf(context, shared, operation, at);
  if (operation.schemes !== undefined) {
    context.report('schemes-not-read', `${at}/schemes`, "an operation's own `schemes` are not read; the document's servers apply", 'declare a server per scheme on the document');
  }
  const kept = Object.fromEntries(Object.entries(operation).filter(([key]) => !['parameters', 'consumes', 'produces', 'schemes'].includes(key)));
  return {
    ...kept,
    ...(parameters.length > 0 ? { parameters } : {}),
    ...(body === undefined ? {} : { requestBody: body }),
    responses: responsesOf(context, operation, at),
  };
};

const isMethod = (key: string): boolean => (METHODS as readonly string[]).includes(key);

const pathsOf = (context: Context): Dict =>
  Object.fromEntries(
    Object.entries(dict(context.root.paths)).flatMap(([path, entry]) => {
      const at = `#/paths/${token(path)}`;
      const item = context.converter.follow(entry, at);
      if (item === undefined) return [];
      const rest = Object.entries(item.node).filter(([key]) => key !== 'parameters' && !isMethod(key));
      const operations = Object.entries(item.node)
        .filter((pair): pair is [string, Dict] => isMethod(pair[0]) && isDict(pair[1]))
        .map(([method, operation]) => [method, operationOf(context, operation, item.node.parameters, `${at}/${method}`)]);
      return [[path, Object.fromEntries([...rest, ...operations])]];
    }),
  );

const serversOf = (root: Dict): Dict[] | undefined => {
  const basePath = typeof root.basePath === 'string' ? root.basePath : '';
  if (typeof root.host !== 'string') return basePath === '' ? undefined : [{ url: basePath }];
  const schemes = Array.isArray(root.schemes) ? root.schemes.filter((scheme): scheme is string => typeof scheme === 'string') : [];
  // With no scheme declared, 2.0 means the one the document was fetched with: a scheme-relative URL.
  return schemes.length === 0 ? [{ url: `//${root.host}${basePath}` }] : schemes.map((scheme) => ({ url: `${scheme}://${String(root.host)}${basePath}` }));
};

const securitySchemeOf = (scheme: unknown): Dict => {
  const { type, flow, authorizationUrl, tokenUrl, scopes, ...rest } = dict(scheme);
  if (type === 'basic') return { ...rest, type: 'http', scheme: 'basic' };
  if (type !== 'oauth2') return { ...rest, type, ...(scopes === undefined ? {} : { scopes }) };
  const urls = { ...(authorizationUrl === undefined ? {} : { authorizationUrl }), ...(tokenUrl === undefined ? {} : { tokenUrl }) };
  return { ...rest, type, flows: { [FLOWS[String(flow)] ?? String(flow)]: { ...urls, scopes: scopes ?? {} } } };
};

/** The keys a 2.0 document has that the 3.1 one states another way (`paths` is rewritten in place). */
/** A 2.0 pointer into an operation's response schema: in 3.1 that schema sits under `content/<media type>`. */
const RESPONSE_SCHEMA_REF = /^(#\/paths\/.+\/responses\/[^/]+)\/schema(\/.*)?$/u;

/**
 * Rewrite every `$ref` into a response's 2.0 `schema` to the same schema in the converted `content`
 * (bethmardutho's `#/paths/~1word~1{id}/get/responses/200/schema/…`, 2026-11-18 corpus). One whose
 * response is not there is left as written, and resolving it reports it.
 */
const repointResponseRefs = (node: unknown, document: Dict, report: Report, at = '#'): void => {
  if (Array.isArray(node)) {
    for (const [index, item] of node.entries()) repointResponseRefs(item, document, report, `${at}/${String(index)}`);
    return;
  }
  if (!isDict(node)) return;
  const match = typeof node.$ref === 'string' ? RESPONSE_SCHEMA_REF.exec(node.$ref) : null;
  if (match !== null) {
    const [, response = '', rest = ''] = match;
    let content: unknown;
    try {
      content = pointerGet(document, `${response}/content`);
    } catch {
      content = undefined;
    }
    const [mediaType] = Object.keys(dict(content));
    if (mediaType !== undefined) {
      const moved = `${response}/content/${token(mediaType)}/schema${rest}`;
      report('ref-response-schema', `${at}/$ref`, `\`${String(node.$ref)}\` is written as \`${moved}\``, 'nothing to do: OpenAPI 3 keeps a response schema under its media type');
      (node as Mutable).$ref = moved;
    }
  }
  for (const [key, value] of Object.entries(node)) if (key !== '$ref') repointResponseRefs(value, document, report, `${at}/${token(key)}`);
};

const MOVED = new Set(['swagger', 'host', 'basePath', 'schemes', 'consumes', 'produces', 'definitions', 'parameters', 'responses', 'securityDefinitions']);

/** A Swagger 2.0 document as an OpenAPI 3.1 one, and what had to change shape on the way. */
export const convert = (document: unknown): { document: Dict; findings: ContractFinding[] } => {
  if (!detect(document)) throw new Swagger2Error('it has no `swagger: "2.0"` member', 'pass a Swagger 2.0 document, or read an OpenAPI 3 one with the `openapi` adapter');
  const root = document as Dict;
  const findings = new Map<string, ContractFinding>();
  // A shared definition read by several operations is reported once, where it is written.
  const report: Report = (code, pointer, message, fix) => {
    findings.set(`${code} ${pointer}`, { code, pointer, message, fix });
  };
  const converter = createConverter(root, report);
  const schemas = Object.fromEntries(Object.entries(dict(root.definitions)).map(([name, value]) => [name, converter.schema(value, `#/definitions/${token(name)}`)]));
  const securitySchemes = Object.fromEntries(Object.entries(dict(root.securityDefinitions)).map(([name, value]) => [name, securitySchemeOf(value)]));
  const components = {
    ...(Object.keys(schemas).length > 0 ? { schemas } : {}),
    ...(Object.keys(securitySchemes).length > 0 ? { securitySchemes } : {}),
  };
  const servers = serversOf(root);
  const converted: Dict = {
    openapi: '3.1.0',
    ...Object.fromEntries(Object.entries(root).filter(([key]) => !MOVED.has(key))),
    ...(servers === undefined ? {} : { servers }),
    paths: pathsOf({ root, report, converter }),
    ...(Object.keys(components).length > 0 ? { components } : {}),
  };
  repointResponseRefs(converted, converted, report);
  return { document: converted, findings: [...findings.values()] };
};

/**
 * Read a Swagger 2.0 document into the model, through its OpenAPI 3.1 form. `document` is that 3.1
 * form, because it is what generators read; each finding's pointer is into the 2.0 document as the
 * user wrote it, because that is the file the user edits. Operation pointers agree in both: `paths`
 * keeps its keys through the conversion.
 */
export const read = (document: unknown): Contract => {
  const converted = convert(document);
  return { format: 'swagger2', document: converted.document, operations: readOpenApi(converted.document).operations, findings: converted.findings };
};

/** The adapter as the plugin host registers it (spec.md R-PL1). */
export const adapter = Object.freeze({
  name: 'swagger2',
  description: 'Swagger 2.0 documents, read through their OpenAPI 3.1 form',
  detect,
  read,
});
