/**
 * The two files `gen msw` writes (apicontract-clients R5): `scenarios.ts`, one response per declared
 * status of every operation, as data; and `handlers.ts`, MSW handlers answering from it. MSW is the
 * user's dependency, never apicontract's, and `scenarios.ts` imports nothing, so any test server can
 * answer from it too.
 */
import { type ContractFinding } from './core/model.js';
import { type Response, type Route } from './plugin-fetch-routes.js';
import { lines, literal } from './plugin-fetch-text.js';
import { exampleOf, seedOf, synth } from './plugin-msw-synth.js';

/** An object or an array: a list where a map belongs reads as one, which `exampleOf` has already taken. */
const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === 'object' && value !== null;

export interface Scenario {
  readonly status: number;
  readonly contentType?: string;
  readonly body?: unknown;
}

/** Where `default` starts looking for a status, and how many codes are in a range like `4XX`. */
const DEFAULT_STATUS = 500;
const RANGE = 100;

/** The status a scenario answers with: the code itself, or the first one in its range no other response declares. */
const statusOf = (key: string, exact: readonly string[]): number => {
  // Stryker disable next-line Regex: equivalent, an OpenAPI status key is all digits, a range like 4XX, or default, so none ends in a digit without being all digits
  if (/^\d+$/u.test(key)) return Number(key);
  const first = key === 'default' ? DEFAULT_STATUS : Number(key.charAt(0)) * RANGE;
  let status = first;
  while (exact.includes(String(status))) status += 1;
  return status;
};

interface Built {
  readonly scenarios: Readonly<Record<string, Readonly<Record<string, Scenario>>>>;
  readonly findings: readonly ContractFinding[];
}

/** One scenario per declared response of every route; a body the spec gives no example for is synthesised, with a finding. */
export const scenariosOf = (routes: readonly Route[], root: unknown): Built => {
  const findings: ContractFinding[] = [];
  const scenario = (route: Route, response: Response, exact: readonly string[]): Scenario => {
    const status = statusOf(response.key, exact);
    const [media] = response.media;
    if (media === undefined) return { status };
    const examples = Object.values(isRecord(media.declared.examples) ? media.declared.examples : {});
    const given =
      exampleOf(media.declared) ?? (examples.length > 0 ? { value: (examples[0] as { value?: unknown }).value } : undefined) ?? (isRecord(media.schema) ? exampleOf(media.schema) : undefined);
    if (given !== undefined) return { status, contentType: media.type, body: given.value };
    findings.push({
      code: 'value-synthesised',
      pointer: media.pointer,
      message: `the ${response.key} response of "${route.id}" has no example, so its mock body is synthesised from the schema`,
      fix: 'add an `example` to the media type to mock it with a value you chose',
    });
    return { status, contentType: media.type, body: synth(media.schema, seedOf(`${route.id} ${response.key}`), root) };
  };
  const scenarios = Object.fromEntries(
    routes.map((route) => {
      // Only codes can equal a status written as digits, so the ranges and `default` among them never match.
      const exact = route.responses.map((response) => response.key);
      return [route.id, Object.fromEntries(route.responses.map((response) => [response.key, scenario(route, response, exact)]))];
    }),
  );
  return { scenarios, findings };
};

/** `scenarios.ts`: every scenario, by operation id and declared status. */
export const scenariosFile = (built: Built): string =>
  lines(
    '/** One response for a declared status: what a mock answers with. */',
    'export interface Scenario {',
    '  readonly status: number;',
    '  readonly contentType?: string;',
    '  readonly body?: unknown;',
    '}',
    '',
    '/** Every operation\'s scenarios, by operation id and the status as the spec writes it. */',
    'export const scenarios = {',
    ...Object.entries(built.scenarios).flatMap(([id, byStatus]) => [
      `  ${literal(id)}: {`,
      ...Object.entries(byStatus).map(([status, scenario]) => `    ${literal(status)}: ${literal(scenario)},`),
      '  },',
    ]),
    '} as const satisfies Readonly<Record<string, Readonly<Record<string, Scenario>>>>;',
  );

/** The scenario a handler answers with by default: the first 2xx, else the first declared. */
const preferred = (route: Route): string | undefined => (route.responses.find((response) => response.key.startsWith('2')) ?? route.responses[0])?.key;

/** `/pets/{petId}` → `*\/pets/:petId`: MSW's path syntax, on any origin. */
const mswPath = (path: string): string => `*${path.replaceAll(/\{([^}]+)\}/gu, ':$1')}`;

/** `handlers.ts`: one MSW handler per operation, and `handler()` to answer with another scenario. */
export const handlersFile = (routes: readonly Route[]): string =>
  lines(
    "import { http, HttpResponse } from 'msw';",
    '',
    "import { type Scenario, scenarios } from './scenarios.js';",
    '',
    'const routes = {',
    ...routes.map((route) => `  ${literal(route.id)}: [${literal(route.method)}, ${literal(mswPath(route.path))}],`),
    '} as const;',
    '',
    'type Scenarios = typeof scenarios;',
    '',
    '/** A scenario as a response. */',
    'const reply = (scenario: Scenario): Response => {',
    '  if (scenario.body === undefined) return new HttpResponse(null, { status: scenario.status });',
    '  const type = scenario.contentType ?? "application/json";',
    '  const text = /[/+]json(?:;|$)/u.test(type) ? JSON.stringify(scenario.body) : String(scenario.body);',
    '  return new HttpResponse(text, { status: scenario.status, headers: { "content-type": type } });',
    '};',
    '',
    '/** The handler answering `operation` with the scenario for `status`, e.g. `server.use(handler("getPet", "404"))`. */',
    'export const handler = <O extends keyof Scenarios>(operation: O, status: keyof Scenarios[O]) => {',
    '  const [method, path] = routes[operation];',
    '  return http[method](path, () => reply(scenarios[operation][status] as Scenario));',
    '};',
    '',
    '/** One handler per operation, answering with its first 2xx scenario. */',
    'export const handlers = [',
    ...routes.flatMap((route) => {
      const status = preferred(route);
      return status === undefined ? [] : [`  handler(${literal(route.id)}, ${literal(status)}),`];
    }),
    '];',
  );
