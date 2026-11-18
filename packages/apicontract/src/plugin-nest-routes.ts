/**
 * The `nest` target's model (apicontract-servers R4, R5, R6): which operations become routes, what
 * each is named, which controller holds it, and the parts of the request and the responses it
 * declares. No code is written here; `plugin-nest-code.ts` prints it.
 *
 * - **Routes.** Every operation under `paths` with a method NestJS routes. A webhook, `trace`,
 *   `query` and a method under `additionalOperations` are left out with a finding.
 * - **Names.** The `operationId` in camelCase; without one, `<method><Path>` with each path
 *   parameter as `By<Param>`. A collision, ignoring case (the contract test's file name is the
 *   method's name), is suffixed `2`, `3`, … in operation-id order.
 * - **Controllers.** One per first tag, in kebab-case; an untagged operation is in `default`.
 * - **Media types.** One per body and per response: JSON (`application/json`, `…+json`) when one is
 *   declared, else the first. Each other one is a finding.
 */
import { type Contract, type ContractFinding, type JsonSchema, type Operation, type Payload } from './core/model.js';
import { pointerGet } from './core/resolve.js';
import { exampleOf, type Picked } from './plugin-nest-example.js';

/** The methods NestJS has a route decorator for. */
const METHODS = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch']);

/** The responses a 400 Problem Details answer is declared under. */
const PROBLEM_STATUSES = new Set(['400', '4XX', 'default']);

/** The response a stub answers with: the first 2xx the spec declares, else the first. */
export const stubStatus = (statuses: readonly string[]): string | undefined => statuses.find((status) => status.startsWith('2')) ?? statuses[0];

export type Part = 'path' | 'query' | 'header';

/** How a path, query or header string becomes the value the contract types: `number`, `boolean`, `string`, or a list of one, `number[]`. */
export type Kind = string;

export interface Param {
  /** The name the spec gives it. */
  readonly name: string;
  readonly part: Part;
  /** The validator's payload name, e.g. `param:path:petId`. */
  readonly payload: string;
  readonly required: boolean;
  readonly kind: Kind;
  readonly example: unknown;
}

export interface Body {
  readonly payload: string;
  readonly media: string;
  readonly required: boolean;
  readonly example: unknown;
}

export interface Response {
  /** As the spec writes it: `200`, `4XX` or `default`. */
  readonly status: string;
  /** The media type and the validator's payload name; absent for a response with no content. */
  readonly content?: { readonly media: string; readonly payload: string; readonly example: unknown };
}

export interface Route {
  readonly id: string;
  /** Lower case, as OpenAPI writes it. */
  readonly method: string;
  /** As the spec writes it, e.g. `/pets/{petId}`. */
  readonly path: string;
  /** The JSON Pointer to the operation. */
  readonly source: string;
  /** The abstract method the user implements, e.g. `getPet`. */
  readonly name: string;
  /** The decorated method that receives the request, e.g. `handleGetPet`. */
  readonly handler: string;
  readonly params: readonly Param[];
  readonly body?: Body;
  readonly responses: readonly Response[];
}

export interface Controller {
  /** The file name before `.controller.ts`, e.g. `pets`. */
  readonly file: string;
  /** The class name before `Controller`, e.g. `Pets`. */
  readonly name: string;
  readonly routes: readonly Route[];
}

type Dict = Readonly<Record<string, unknown>>;

// An array read as a record has no member this file reads, so it needs no separate case.
const isDict = (value: unknown): value is Dict => typeof value === 'object' && value !== null;
const dict = (value: unknown): Dict => (isDict(value) ? value : {});

const finding = (code: string, pointer: string, message: string, fix: string): ContractFinding => ({ code, pointer, message, fix });

/** Words of letters and digits. */
// Stryker disable next-line Regex: equivalent, splitting on each character instead of each run only adds empty words, which are filtered
const words = (text: string): string[] => text.split(/[^A-Za-z0-9]+/u).filter((word) => word !== '');
const upper = (word: string): string => `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
const lower = (word: string): string => `${word.charAt(0).toLowerCase()}${word.slice(1)}`;

/** `ListPets`, `list-pets` and `list_pets` are all `listPets`; a name that would start with a digit starts with `_`. */
export const camel = (text: string): string => {
  const name = lower(words(text).map(upper).join(''));
  if (name === '') return 'operation';
  return /^\d/u.test(name) ? `_${name}` : name;
};

/** `Pet Store` is `pet-store`; a tag with no letters or digits is `default`. */
export const kebab = (text: string): string => words(text).join('-').toLowerCase() || 'default';

/** A controller's class name before `Controller`: `pet-store` is `PetStore`, `2fa` is `_2fa`. */
export const classOf = (file: string): string => {
  const name = words(file).map(upper).join('');
  return /^\d/u.test(name) ? `_${name}` : name;
};

/** The name an operation without an `operationId` gets: `get /pets/{petId}` is `getPetsByPetId`. */
export const fallbackName = (method: string, path: string): string =>
  camel([method, ...path.split('/').map((segment) => (/^\{.+\}$/u.test(segment) ? `by ${segment}` : segment))].join(' '));

/** `base`, or `base2`, `base3`, …: the first not taken, ignoring case, which is then taken. */
export const unique = (base: string, taken: Set<string>): string => {
  let name = base;
  for (let suffix = 2; taken.has(name.toLowerCase()); suffix += 1) name = `${base}${String(suffix)}`;
  taken.add(name.toLowerCase());
  return name;
};

/** Whether a media type is JSON. */
const isJson = (media: string): boolean => media === 'application/json' || media.endsWith('+json');

/** A Reference Object followed to what it names, once per reference. */
const derefIn =
  (document: unknown) =>
  (value: unknown): Dict => {
    let node = value;
    const seen = new Set<string>();
    while (isDict(node) && typeof node.$ref === 'string' && !seen.has(node.$ref)) {
      seen.add(node.$ref);
      node = pointerGet(document, node.$ref);
    }
    return dict(node);
  };

/** A JSON Schema's first non-null `type`. */
const typeOf = (schema: Dict): unknown => (Array.isArray(schema.type) ? schema.type.find((type) => type !== 'null') : schema.type);

/** How a string from the URL or a header becomes the value its schema types. */
export const kindOf = (schema: JsonSchema, deref: (value: unknown) => Dict): Kind => {
  const resolved = deref(schema);
  const type = typeOf(resolved);
  if (type === 'array') return `${kindOf(resolved.items as JsonSchema, deref)}[]`;
  if (type === 'integer' || type === 'number') return 'number';
  return type === 'boolean' ? 'boolean' : 'string';
};

/** A payload name's parts after its kind: `response:200:application/json` is `200`, `application/json`. Every payload name has a kind and a second part. */
const partsOf = (name: string): [string, string] => {
  const parts = name.split(':');
  return [parts[1] as string, parts.slice(2).join(':')];
};

/** The payloads one body or one response carries, one per media type, with `:item` streams left out. */
const media = (payloads: readonly Payload[]): Payload[] => payloads.filter((payload) => !payload.name.endsWith(':item'));

/** A body's or a response's media type: what follows `body:` or `response:<status>:`. */
const mediaOf = (name: string): string => (name.startsWith('body:') ? name.slice('body:'.length) : partsOf(name)[1]);

/** JSON when it is there, else the first; and the ones left out. */
const pick = (payloads: readonly Payload[]): { chosen: Payload; dropped: Payload[] } => {
  const chosen = payloads.find((payload) => isJson(mediaOf(payload.name))) ?? (payloads[0] as Payload);
  return { chosen, dropped: payloads.filter((payload) => payload !== chosen) };
};

interface Built {
  readonly route: Omit<Route, 'handler'>;
  readonly tag: string;
}

/** Every route the target generates, grouped into controllers, and what it reports. */
export const routesOf = (contract: Contract): { controllers: Controller[]; findings: ContractFinding[] } => {
  const { document } = contract;
  const deref = derefIn(document);
  const findings: ContractFinding[] = [];
  const taken = new Set<string>();
  const examples = (picked: Picked, label: string, source: string): unknown => {
    if (picked.synthesised) {
      findings.push(
        finding('server-example-synthesised', source, `${label} has no example: the contract test sends one made from its schema`, 'add an `example` to the spec, so the contract test sends a value you chose'),
      );
    }
    return picked.value;
  };

  /** Each other media type a body or a response declares, reported. */
  const dropped = (operation: Operation, payloads: readonly Payload[], what: string): void => {
    for (const payload of payloads) {
      findings.push(
        finding('server-media-type-skipped', operation.source, `\`${operation.id}\` ${what} in ${mediaOf(payload.name)} is not served: the route serves one media type, JSON first`, 'serve the other media type outside the generated controller'),
      );
    }
  };

  /** The path, query and header parameters; a cookie is reported, not passed on. */
  const paramsOf = (operation: Operation, declared: Dict, shared: unknown): Param[] => {
    const declaredParams = new Map<string, Dict>();
    // A missing list is `undefined` in the flattened list, which reads as an empty parameter.
    for (const entry of [shared, declared.parameters].flat()) {
      const parameter = deref(entry);
      declaredParams.set(`param:${String(parameter.in)}:${String(parameter.name)}`, parameter);
    }
    return operation.payloads
      .filter((candidate) => candidate.name.startsWith('param:'))
      .flatMap((payload): Param[] => {
        const [part, paramName] = partsOf(payload.name);
        if (part !== 'path' && part !== 'query' && part !== 'header') {
          findings.push(finding('server-parameter-skipped', operation.source, `\`${operation.id}\` reads ${part} parameter "${paramName}", which the generated route does not pass on`, 'read it from the request in your controller'));
          return [];
        }
        const parameter = dict(declaredParams.get(payload.name));
        const example = examples(exampleOf(parameter, payload.schema, deref), `\`${operation.id}\` ${part} parameter "${paramName}"`, operation.source);
        return [{ name: paramName, part, payload: payload.name, required: payload.required, kind: kindOf(payload.schema, deref), example }];
      });
  };

  /** The body, in one media type. */
  const bodyOf = (operation: Operation, declared: Dict): Body | undefined => {
    const bodies = media(operation.payloads.filter((payload) => payload.name.startsWith('body:')));
    if (bodies.length === 0) return undefined;
    const { chosen, dropped: others } = pick(bodies);
    dropped(operation, others, 'accepts a body');
    const type = mediaOf(chosen.name);
    const holder = deref(dict(deref(declared.requestBody).content)[type]);
    return { payload: chosen.name, media: type, required: chosen.required, example: examples(exampleOf(holder, chosen.schema, deref), `\`${operation.id}\` body`, operation.source) };
  };

  /** The responses, each in one media type; only the stub's carries an example. */
  const responsesOf = (operation: Operation, declared: Dict, statuses: readonly string[]): Response[] => {
    const stub = stubStatus(statuses);
    return statuses.map((status): Response => {
      const all = media(operation.payloads.filter((payload) => payload.name.startsWith(`response:${status}:`)));
      if (all.length === 0) return { status };
      const { chosen, dropped: others } = pick(all);
      dropped(operation, others, `answers ${status}`);
      const type = mediaOf(chosen.name);
      if (status !== stub) return { status, content: { media: type, payload: chosen.name, example: undefined } };
      const holder = deref(dict(deref(dict(declared.responses)[status]).content)[type]);
      return { status, content: { media: type, payload: chosen.name, example: examples(exampleOf(holder, chosen.schema, deref), `\`${operation.id}\` response ${status}`, operation.source) } };
    });
  };

  const build = (operation: Operation): Built | undefined => {
    // The OpenAPI reader writes a route's source as `#/paths/<token>/<method>`, and anything else longer or elsewhere.
    // Stryker disable next-line Regex: equivalent, a source without `#/paths/` at its start or with more after the method has no method NestJS routes
    const match = /^#\/paths\/([^/]+)\/([a-z]+)$/u.exec(operation.source);
    if (match === null || !METHODS.has(match[2] as string)) {
      findings.push(
        finding('server-operation-skipped', operation.source, `\`${operation.id}\` is not a route NestJS declares (a webhook, or a method it has no decorator for)`, 'serve it outside the generated controllers'),
      );
      return undefined;
    }
    const token = match[1] as string;
    const method = match[2] as string;
    const path = token.replaceAll('~1', '/').replaceAll('~0', '~');
    const declared = deref(pointerGet(document, operation.source));
    const name = unique(typeof declared.operationId === 'string' ? camel(declared.operationId) : fallbackName(method, path), taken);
    const params = paramsOf(operation, declared, deref(pointerGet(document, `#/paths/${token}`)).parameters);
    for (const payload of operation.payloads.filter((candidate) => candidate.name.endsWith(':item'))) {
      findings.push(
        finding('server-stream-skipped', operation.source, `\`${operation.id}\` streams ${payload.name.slice(0, -':item'.length)} item by item, which the generated route does not`, 'stream it from your controller, outside the generated route'),
      );
    }
    const body = bodyOf(operation, declared);
    const statuses = [...new Set(operation.payloads.filter((payload) => payload.name.startsWith('response:')).map((payload) => partsOf(payload.name)[0]))];
    const responses = responsesOf(operation, declared, statuses);
    if ((params.length > 0 || body !== undefined) && !statuses.some((status) => PROBLEM_STATUSES.has(status))) {
      findings.push(
        finding('server-problem-undeclared', operation.source, `\`${operation.id}\` answers a request the contract refuses with 400 Problem Details, which its responses do not declare`, 'declare a `400` response with `application/problem+json` content'),
      );
    }
    const tags = Array.isArray(declared.tags) ? declared.tags : [];
    const route = { id: operation.id, method, path, source: operation.source, name, params, ...(body === undefined ? {} : { body }), responses };
    return { route, tag: kebab(typeof tags[0] === 'string' ? tags[0] : '') };
  };

  const ids = [...new Set(contract.operations.map((operation) => operation.id))].toSorted();
  const built = ids
    .flatMap((id) => contract.operations.filter((operation) => operation.id === id))
    .map((operation) => build(operation))
    .filter((entry): entry is Built => entry !== undefined);
  // The decorated handlers are named after every method is, so a handler never takes an operation's name.
  const routes = built.map(({ route, tag }) => ({ tag, route: { ...route, handler: unique(`handle${upper(route.name)}`, taken) } }));
  const files = [...new Set(routes.map(({ tag }) => tag))].toSorted();
  const controllers = files.map((file) => ({ file, name: classOf(file), routes: routes.filter(({ tag }) => tag === file).map(({ route }) => route) }));
  return { controllers, findings };
};
