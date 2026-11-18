/**
 * What the client generators need from each operation that the model does not carry: its method and
 * path, how each parameter is serialised, which media type a body is sent as, and the schema and
 * example behind each response (apicontract-clients R1, R2, R5).
 *
 * The model keeps the operation's id and where it is declared; this reads the rest from the source
 * document at that pointer, as the types target does. `fetch`, `msw` and `tanstack-query` all read
 * routes from here, so the client and the mocks cannot disagree about an operation.
 */
import { type Contract, type ContractFinding, type JsonSchema } from './core/model.js';
import { pointerGet } from './core/resolve.js';

type Dict = Readonly<Record<string, unknown>>;

const isDict = (value: unknown): value is Dict => typeof value === 'object' && value !== null && !Array.isArray(value);
const dict = (value: unknown): Dict => (isDict(value) ? value : {});

export const METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'] as const;
export type Method = (typeof METHODS)[number];

export type Place = 'path' | 'query' | 'header' | 'cookie';

export interface Parameter {
  readonly name: string;
  readonly in: Place;
  readonly style: string;
  readonly explode: boolean;
  readonly required: boolean;
}

/** One media type a response declares. */
export interface Media {
  readonly type: string;
  readonly schema: JsonSchema;
  /** JSON Pointer to the media type object. */
  readonly pointer: string;
  /** The media type object as written: where `example` and `examples` live. */
  readonly declared: Dict;
}

export interface Response {
  /** As the spec writes it: `200`, `4XX`, `default`. */
  readonly key: string;
  readonly media: readonly Media[];
}

export interface Route {
  readonly id: string;
  /** A TypeScript type name for the operation, unique in the file. */
  readonly name: string;
  readonly method: Method;
  readonly path: string;
  readonly parameters: readonly Parameter[];
  readonly body?: { readonly type: string; readonly required: boolean };
  readonly responses: readonly Response[];
}

const PLACES: readonly string[] = ['path', 'query', 'header', 'cookie'];
const STYLES: Readonly<Record<Place, readonly string[]>> = {
  path: ['simple'],
  query: ['form', 'spaceDelimited', 'pipeDelimited', 'deepObject'],
  header: ['simple'],
  cookie: ['form'],
};

/** The body media types the client knows how to send, in the order one is chosen. */
const SENDABLE = ['application/json', 'application/x-www-form-urlencoded', 'multipart/form-data'];

const decodeToken = (token: string): string => token.replaceAll('~1', '/').replaceAll('~0', '~');

/** `Get pets/{id}` → `GetPetsId`; a name that would start with a digit starts with `Op`. */
const pascal = (id: string): string => {
  const words = id.split(/[^A-Za-z0-9]+/u).filter((word) => word !== '');
  const name = words.map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`).join('');
  return /^[A-Za-z]/u.test(name) ? name : `Op${name}`;
};

interface Read {
  readonly routes: readonly Route[];
  readonly findings: readonly ContractFinding[];
}

/** The routes of every operation under `paths`, sorted by id; anything else is a finding. */
export const routesOf = (contract: Contract): Read => {
  const root = contract.document;
  const findings: ContractFinding[] = [];
  const note = (code: string, pointer: string, message: string, fix: string): void => {
    findings.push({ code, pointer, message, fix });
  };
  /** Follow Reference Objects; a target already seen ends the walk where it is. */
  const deref = (value: unknown): Dict => {
    let node = value;
    const seen = new Set<string>();
    while (isDict(node) && typeof node.$ref === 'string' && !seen.has(node.$ref)) {
      seen.add(node.$ref);
      node = pointerGet(root, node.$ref);
    }
    return dict(node);
  };

  const parameterOf = (entry: unknown, at: string): Parameter | undefined => {
    const declared = deref(entry);
    const place = String(declared.in);
    if (!PLACES.includes(place)) {
      note('parameter-skipped', at, `the parameter "${String(declared.name)}" is in "${place}", which the client does not send`, 'declare it in path, query, header or cookie');
      return undefined;
    }
    const where = place as Place;
    const [fallback] = STYLES[where] as [string];
    const asked = typeof declared.style === 'string' ? declared.style : fallback;
    const style = STYLES[where].includes(asked) ? asked : fallback;
    if (style !== asked) note('style-translated', at, `the ${where} style "${asked}" is sent as "${style}"`, `declare \`style: ${style}\`, or send the parameter yourself`);
    const explode = typeof declared.explode === 'boolean' ? declared.explode : style === 'form';
    return { name: String(declared.name), in: where, style, explode, required: where === 'path' || declared.required === true };
  };

  const routeOf = (id: string, source: string): Route | undefined => {
    const match = /^#\/paths\/([^/]+)\/([^/]+)$/u.exec(source);
    const method = match?.[2] as Method | undefined;
    if (match === null || !METHODS.includes(method as Method)) {
      note('operation-skipped', source, `"${id}" is not a request a client sends`, 'call it yourself; the client covers operations under `paths` with a standard method');
      return undefined;
    }
    const path = decodeToken(match[1] as string);
    const declared = dict(pointerGet(root, source));
    const item = dict(pointerGet(root, `#/paths/${match[1] as string}`));
    const byPlace = new Map<string, Parameter>();
    const lists = [
      [item.parameters, `#/paths/${match[1] as string}/parameters`],
      [declared.parameters, `${source}/parameters`],
    ] as const;
    for (const [list, at] of lists) {
      for (const [index, entry] of (Array.isArray(list) ? list : []).entries()) {
        const parameter = parameterOf(entry, `${at}/${String(index)}`);
        if (parameter !== undefined) byPlace.set(`${parameter.in}:${parameter.name}`, parameter);
      }
    }
    const route: { -readonly [K in keyof Route]: Route[K] } = {
      id,
      name: '',
      method: method as Method,
      path,
      parameters: [...byPlace.values()],
      responses: Object.entries(dict(declared.responses)).map(([key, response]) => ({
        key,
        media: Object.entries(dict(deref(response).content)).map(([type, media]) => ({
          type,
          schema: (dict(media).schema ?? true) as JsonSchema,
          pointer: `${source}/responses/${key}/content/${type.replaceAll('~', '~0').replaceAll('/', '~1')}`,
          declared: dict(media),
        })),
      })),
    };
    if (declared.requestBody !== undefined) {
      const body = deref(declared.requestBody);
      const types = Object.keys(dict(body.content));
      const type = SENDABLE.find((candidate) => types.includes(candidate)) ?? types[0] ?? 'application/json';
      for (const dropped of types.filter((candidate) => candidate !== type)) {
        note('media-type-skipped', `${source}/requestBody`, `the body is sent as ${type}; ${dropped} is not offered`, `call the operation with fetch yourself to send ${dropped}`);
      }
      route.body = { type, required: body.required === true };
    }
    return route;
  };

  const routes = contract.operations
    .map((operation) => routeOf(operation.id, operation.source))
    .filter((route): route is Route => route !== undefined)
    .toSorted((a, b) => (a.id < b.id ? -1 : 1));
  const taken = new Set<string>();
  const named = routes.map((route) => {
    const base = pascal(route.id);
    let name = base;
    for (let suffix = 2; taken.has(name); suffix += 1) name = `${base}${String(suffix)}`;
    taken.add(name);
    return { ...route, name };
  });
  return { routes: named, findings };
};
