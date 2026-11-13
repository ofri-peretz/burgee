/**
 * The OpenAPI input format (spec.md R1, R2): an OpenAPI 3.0, 3.1 or 3.2 document read into the
 * model. It imports only `apicontract/core`, and the core never imports it.
 *
 * Schemas are handed over as written, references and all: whether to inline them is the reader's
 * choice (`explain` inlines, `gen` keeps named types), so it is not made here.
 */
import { type Contract, type Direction, type JsonSchema, type Operation, type Payload } from './core/model.js';
import { pointerGet } from './core/resolve.js';

const METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace', 'query'] as const;

type Dict = Readonly<Record<string, unknown>>;

const isDict = (value: unknown): value is Dict => typeof value === 'object' && value !== null && !Array.isArray(value);

const dict = (value: unknown): Dict => (isDict(value) ? value : {});

const token = (key: string): string => key.replaceAll('~', '~0').replaceAll('/', '~1');

/** No schema means any value. */
const schemaOf = (holder: Dict): JsonSchema => (holder.schema === undefined ? true : (holder.schema as JsonSchema));

interface Declared {
  readonly id: string;
  readonly source: string;
  readonly declared: Dict;
  /** The path item's own parameters. */
  readonly shared: unknown;
}

/** A document this adapter does not read. The message ends in a `fix:` line. */
export class OpenApiError extends Error {
  constructor(reason: string, fix: string) {
    super(`not an OpenAPI 3 document: ${reason}. fix: ${fix}`);
    this.name = 'OpenApiError';
  }
}

/** Whether `document` declares itself as OpenAPI 3.x. */
export const detect = (document: unknown): boolean =>
  isDict(document) && typeof document.openapi === 'string' && document.openapi.startsWith('3.');

/** Read an OpenAPI 3.x document into the model. */
export const read = (document: unknown): Contract => {
  if (isDict(document) && typeof document.swagger === 'string') {
    throw new OpenApiError(`it is Swagger ${document.swagger}`, 'convert it to OpenAPI 3.1 first');
  }
  if (!detect(document)) {
    throw new OpenApiError('it has no `openapi: 3.x` member', 'pass an OpenAPI 3.0, 3.1 or 3.2 document');
  }
  const root = document as Dict;

  /** Follow a Reference Object to the thing it names; anything else is returned as it is. */
  const deref = (value: unknown): Dict => {
    let node = value;
    const seen = new Set<string>();
    while (isDict(node) && typeof node.$ref === 'string' && !seen.has(node.$ref)) {
      seen.add(node.$ref);
      node = pointerGet(root, node.$ref);
    }
    return dict(node);
  };

  const content = (holder: Dict, prefix: string, direction: Direction, required: boolean): Payload[] => {
    const types = Object.entries(dict(holder.content));
    // A response or a body with no content still says something: nothing is sent.
    if (types.length === 0) return [{ name: prefix, direction, schema: false, required }];
    return types.map(([type, media]) => ({ name: `${prefix}:${type}`, direction, schema: schemaOf(dict(media)), required }));
  };

  const operation = ({ id, source, declared, shared }: Declared, sends: Direction, receives: Direction): Operation => {
    // A parameter on the operation replaces the path's one with the same name and place.
    const parameters = new Map<string, Payload>();
    for (const entry of [...(Array.isArray(shared) ? shared : []), ...(Array.isArray(declared.parameters) ? declared.parameters : [])]) {
      const parameter = deref(entry);
      const name = `param:${String(parameter.in)}:${String(parameter.name)}`;
      // A path parameter is always required, whatever the document says.
      const required = parameter.in === 'path' || parameter.required === true;
      parameters.set(name, { name, direction: sends, schema: schemaOf(parameter), required });
    }
    const payloads = [...parameters.values()];
    if (declared.requestBody !== undefined) {
      const body = deref(declared.requestBody);
      payloads.push(...content(body, 'body', sends, body.required === true));
    }
    for (const [status, response] of Object.entries(dict(declared.responses))) {
      payloads.push(...content(deref(response), `response:${status}`, receives, true));
    }
    return { id, source, payloads };
  };

  const operations: Operation[] = [];
  const section = (name: 'paths' | 'webhooks', sends: Direction, receives: Direction): void => {
    for (const [key, entry] of Object.entries(dict(root[name]))) {
      const item = deref(entry);
      for (const method of METHODS) {
        if (!isDict(item[method])) continue;
        const declared = item[method];
        const fallback = name === 'paths' ? `${method} ${key}` : `webhook ${method} ${key}`;
        const id = typeof declared.operationId === 'string' ? declared.operationId : fallback;
        const source = `#/${name}/${token(key)}/${method}`;
        operations.push(operation({ id, source, declared, shared: item.parameters }, sends, receives));
      }
    }
  };
  section('paths', 'request', 'response');
  // A webhook is the API calling out: it publishes the request and subscribes to the answer.
  section('webhooks', 'publish', 'subscribe');

  return { format: 'openapi', document, operations };
};

/** The adapter as the plugin host will register it (spec.md R-PL1). */
export const openapi = Object.freeze({
  name: 'openapi',
  description: 'OpenAPI 3.0, 3.1 and 3.2 documents, including webhooks',
  detect,
  read,
});
