/**
 * The `msw` target's sample (R-PL5): a small document and exactly what it produces, written out
 * so it can be read without running anything. `checkPlugin` proves the generator still writes it.
 */

/** The sample document. */
export const document = {"openapi":"3.1.0","paths":{"/pets/{petId}":{"get":{"operationId":"getPet","responses":{"200":{"content":{"application/json":{"example":{"id":"p1","name":"Rex"}}}},"404":{"content":{"application/json":{"schema":{"properties":{"message":{"type":"string"}}}}}}}}}}};

/** `handlers.ts` for it. */
export const SAMPLE_HANDLERS = `import { http, HttpResponse } from 'msw';

import { type Scenario, scenarios } from './scenarios.js';

const routes = {
  "getPet": ["get", "*/pets/:petId"],
} as const;

type Scenarios = typeof scenarios;

/** A scenario as a response. */
const reply = (scenario: Scenario): Response => {
  if (scenario.body === undefined) return new HttpResponse(null, { status: scenario.status });
  const type = scenario.contentType ?? "application/json";
  const text = /[/+]json(?:;|$)/u.test(type) ? JSON.stringify(scenario.body) : String(scenario.body);
  return new HttpResponse(text, { status: scenario.status, headers: { "content-type": type } });
};

/** The handler answering \`operation\` with the scenario for \`status\`, e.g. \`server.use(handler("getPet", "404"))\`. */
export const handler = <O extends keyof Scenarios>(operation: O, status: keyof Scenarios[O]) => {
  const [method, path] = routes[operation];
  return http[method](path, () => reply(scenarios[operation][status] as Scenario));
};

/** One handler per operation, answering with its first 2xx scenario. */
export const handlers = [
  handler("getPet", "200"),
];
`;

/** `scenarios.ts` for it. */
export const SAMPLE_SCENARIOS = `/** One response for a declared status: what a mock answers with. */
export interface Scenario {
  readonly status: number;
  readonly contentType?: string;
  readonly body?: unknown;
}

/** Every operation's scenarios, by operation id and the status as the spec writes it. */
export const scenarios = {
  "getPet": {
    "200": {"status":200,"contentType":"application/json","body":{"id":"p1","name":"Rex"}},
    "404": {"status":404,"contentType":"application/json","body":{"message":"hotel"}},
  },
} as const satisfies Readonly<Record<string, Readonly<Record<string, Scenario>>>>;
`;
