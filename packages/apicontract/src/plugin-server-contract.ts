/**
 * What every server target shares about its options and its contract tests (apicontract-servers
 * R2, R6): the `validators`, `types` and `testRunner` options, checked; and one
 * `<operation>.contract.test.ts` per operation, which starts the server the target's way, calls the
 * route with the spec's example and asserts the answer is one the spec declares.
 */
import { type Options } from './host.js';
import { type Imports, lines, literal } from './plugin-server-code.js';
import { type Route } from './plugin-server-routes.js';
import { UsageError } from './run-config.js';

/** The test runners a contract test can be written for. */
export const RUNNERS = ['vitest', 'node', 'jest'] as const;
export type Runner = (typeof RUNNERS)[number];

/** Every server target's options, checked. */
export interface ServerOptions extends Imports {
  readonly testRunner: Runner;
}

/** The options every server target declares for --help. */
export const SERVER_OPTIONS = {
  validators: { type: 'string', description: 'import path of the `validator` target\'s output; default "./validators.js"' },
  types: { type: 'string', description: 'import path of the `types` target\'s output; default "./types.js"' },
  testRunner: { type: 'string', choices: [...RUNNERS], description: 'the runner the contract tests import: vitest (default), node or jest' },
};

/** `target`'s options, checked, each defaulted; a refusal names the target and carries a fix line. */
export const serverOptions = (target: string, options: Options): ServerOptions => {
  const path = (name: 'validators' | 'types', fallback: string): string => {
    const value = options[name] ?? fallback;
    if (typeof value !== 'string' || value === '') throw new UsageError(`${target}: \`${name}\` is not an import path. fix: set it to where the ${name === 'types' ? 'types' : 'validator'} target writes, e.g. "${fallback}"`);
    return value;
  };
  const { testRunner = 'vitest' } = options;
  if (!(RUNNERS as readonly unknown[]).includes(testRunner)) throw new UsageError(`${target}: testRunner is "${String(testRunner)}". fix: set \`testRunner\` to one of ${RUNNERS.join(', ')}`);
  return { validators: path('validators', './validators.js'), types: path('types', './types.js'), testRunner: testRunner as Runner };
};

/** The hooks a contract test can use. */
export type Hook = 'afterAll' | 'beforeAll';

const RUNNER_MODULES: Readonly<Record<Runner, string>> = { vitest: 'vitest', node: 'node:test', jest: '@jest/globals' };

/** The runner's import of `describe`, `it` and the hooks used; `node:test` names its hooks `after` and `before`. */
const NODE_HOOKS: Readonly<Record<Hook, string>> = { afterAll: 'after as afterAll', beforeAll: 'before as beforeAll' };
export const runnerImport = (runner: Runner, hooks: readonly Hook[]): string => {
  const names = hooks.map((hook) => (runner === 'node' ? NODE_HOOKS[hook] : hook));
  return `import { ${[...names, 'describe', 'it'].join(', ')} } from '${RUNNER_MODULES[runner]}';`;
};

/** The example request as a URL relative to the server: path parameters filled in, query parameters appended. */
export const exampleUrl = (route: Route): string => {
  let path = route.path;
  for (const param of route.params.filter((candidate) => candidate.part === 'path')) path = path.replaceAll(`{${param.name}}`, encodeURIComponent(String(param.example)));
  const query = new URLSearchParams();
  for (const param of route.params.filter((candidate) => candidate.part === 'query')) {
    for (const value of Array.isArray(param.example) ? (param.example as unknown[]) : [param.example]) query.append(param.name, typeof value === 'string' ? value : JSON.stringify(value));
  }
  const search = query.toString();
  return search === '' ? path : `${path}?${search}`;
};

const json = (media: string): boolean => media === 'application/json' || media.endsWith('+json');

/** How one target's contract test starts its server and calls it. */
export interface Harness {
  /** The framework's imports, before the runner's. */
  readonly framework: readonly string[];
  /** The hooks `setup` uses. */
  readonly hooks: readonly Hook[];
  /** The generated files' imports, after the runner's; the validators follow. */
  readonly local: readonly string[];
  /** Lines inside `describe`, before the test: what starts and stops the server. */
  readonly setup: readonly string[];
  /** The expression that sends the request: `url` and `init` are written already. */
  readonly call: (url: string, init: string) => string;
}

/** `<operation>.contract.test.ts`: the route, called with the spec's example, answers a response the spec declares. */
export const contractTest = (route: Route, imports: Imports, runner: Runner, harness: Harness): string => {
  const headers = Object.fromEntries(route.params.filter((param) => param.part === 'header').map((param) => [param.name, typeof param.example === 'string' ? param.example : JSON.stringify(param.example)]));
  if (route.body !== undefined) headers['content-type'] = route.body.media;
  const init = [`method: ${literal(route.method.toUpperCase())}`, `headers: ${literal(headers)}`, ...(route.body === undefined ? [] : [`body: ${literal(JSON.stringify(route.body.example))}`])];
  return lines(
    "import assert from 'node:assert/strict';",
    '',
    ...harness.framework,
    runnerImport(runner, harness.hooks),
    '',
    ...harness.local,
    ...(route.responses.some((response) => response.content !== undefined) ? [`import { operations as validators } from ${literal(imports.validators)};`] : []),
    '',
    '/** Each declared response: its validator, and whether its body is JSON. Absent for a response with no content. */',
    'const responses: Readonly<Record<string, { readonly check: (value: unknown) => boolean; readonly json: boolean } | undefined>> = {',
    ...route.responses.map(({ status, content }) =>
      content === undefined
        ? `  ${literal(status)}: undefined,`
        : `  ${literal(status)}: { check: validators[${literal(route.id)}][${literal(content.payload)}], json: ${String(json(content.media))} },`,
    ),
    '};',
    '',
    `describe(${literal(`${route.name}: ${route.method.toUpperCase()} ${route.path}`)}, () => {`,
    ...harness.setup,
    "  it('answers the example request with a response the spec declares', async () => {",
    `    const response = await ${harness.call(literal(exampleUrl(route)), `{ ${init.join(', ')} }`)};`,
    '    const status = String(response.status);',
    "    const key = [status, `${status.charAt(0)}XX`, 'default'].find((candidate) => candidate in responses);",
    '    assert.ok(key !== undefined, `the route answered ${status}, which the spec does not declare`);',
    '    const declared = responses[key];',
    '    const text = await response.text();',
    '    if (declared === undefined) return;',
    '    // Malformed JSON is a body the spec does not declare: it fails the assertion below, with its text.',
    '    const body: unknown = declared.json ? (() => { try { return JSON.parse(text) as unknown; } catch { return text; } })() : text;',
    '    assert.ok(declared.check(body), `the route answered ${status} with a body the spec does not declare: ${text}`);',
    '  });',
    '});',
  );
};
