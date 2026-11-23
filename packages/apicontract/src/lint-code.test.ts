/**
 * apicontract-lint R14 and R15 (kind 3, rules on code): a rule with `given.implementation` judges
 * the handler the user owns for each operation, found through apicontract.map.json and read with the
 * project's TypeScript; an operation the map has no handler for says so.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { scratchDirs } from './__fixtures__/run/scratch-dir.js';
import { runLint, toSarif } from './command-lint.js';
import { type Contract } from './core/model.js';
import { PluginError, validate } from './host.js';
import { codeIndexOf, findHandler, mapIn, summarize, typescriptIn } from './lint-code-read.js';
import { applyCode, type Handler, type HandlerSummary, type ReadHandler } from './lint-code.js';
import { lint, type Rule, type Then } from './lint-engine.js';
import { read } from './openapi.js';
import { UsageError, validateConfig } from './run-config.js';
import { emptyMap, updateMap } from './run-map.js';

const TEXT = Symbol.for('burgee.text');
const makeDir = scratchDirs();
/** A folder whose `typescript` cannot load, wherever the folder sits (a parent's `node_modules` would resolve otherwise). */
const withoutTypescript = (dir: string): string => {
  mkdirSync(join(dir, 'node_modules/typescript'), { recursive: true });
  writeFileSync(join(dir, 'node_modules/typescript/package.json'), JSON.stringify({ name: 'typescript', main: 'index.js' }));
  writeFileSync(join(dir, 'node_modules/typescript/index.js'), "throw new Error('not installed');\n");
  return dir;
};

const DOCUMENT = {
  openapi: '3.1.0',
  info: { title: 't', version: '1' },
  'x-nil': null,
  paths: {
    '/pets': { get: { operationId: 'getPets', responses: { 200: { description: 'ok' } } } },
    '/pets/{id}': { get: { operationId: 'getPet', responses: { 200: { description: 'ok' } } } },
  },
  components: { schemas: { Problem: { type: 'object', required: ['title', 'status'], properties: { title: { type: 'string' }, status: { type: 'integer' } } }, Loose: { type: 'object' } } },
};
const CONTRACT: Contract = read(DOCUMENT);

const summary = (over: Partial<HandlerSummary> = {}): HandlerSummary => ({ calls: [], inputCalls: [], returns: [], ...over });
const handler = (over: Partial<ReadHandler> = {}): ReadHandler => ({ file: 'h.ts', symbol: 'handlers.getPets', target: 'custom', line: 1, summary: summary(), ...over });

const shaped = (returns: HandlerSummary['returns'], ref = '#/components/schemas/Problem') => applyCode('returns-error-shape', handler({ summary: summary({ returns }) }), CONTRACT, { ref });

describe('applyCode', () => {
  it('calls: the handler calls the name, plainly or as a member', () => {
    expect(applyCode('calls', handler({ summary: summary({ calls: ['audit'] }) }), CONTRACT, { name: 'audit' })).toBeUndefined();
    expect(applyCode('calls', handler(), CONTRACT, { name: 'audit' })).toBe('does not call `audit`');
    expect([applyCode('calls', handler(), CONTRACT), applyCode('calls', handler(), CONTRACT, { name: '' })]).toStrictEqual([
      '`calls` needs `functionOptions.name`, the function to call',
      '`calls` needs `functionOptions.name`, the function to call',
    ]);
  });

  it('validates-input: a validating target holds it; otherwise the input reaches a validator', () => {
    expect(['nest', 'hono', 'fastify', 'express'].map((target) => applyCode('validates-input', handler({ target }), CONTRACT))).toStrictEqual([undefined, undefined, undefined, undefined]);
    expect(applyCode('validates-input', handler(), CONTRACT)).toBe('does not pass its input to `parse`, `safeParse`, `validate`, `assert`');
    expect(applyCode('validates-input', handler({ summary: summary({ inputCalls: ['safeParse'] }) }), CONTRACT)).toBeUndefined();
    expect(applyCode('validates-input', handler({ summary: summary({ inputCalls: ['parse'] }) }), CONTRACT, { with: ['check'] })).toBe('does not pass its input to `check`');
    expect(applyCode('validates-input', handler({ summary: summary({ inputCalls: ['check'] }) }), CONTRACT, { with: ['check'] })).toBeUndefined();
    // A `with` that is not a list of names is the default.
    expect(applyCode('validates-input', handler({ summary: summary({ inputCalls: ['parse'] }) }), CONTRACT, { with: [1] })).toBeUndefined();
    expect(applyCode('validates-input', handler({ summary: summary({ inputCalls: ['parse'] }) }), CONTRACT, { with: ['check', 1] })).toBeUndefined();
  });

  it('returns-error-shape: every error return has a literal body with what the schema requires', () => {
    expect(shaped([{ status: 200, hasBody: false }, { hasBody: true }, { status: 404, hasBody: true, bodyKeys: ['title', 'status', 'detail'] }, { status: 500, hasBody: true }])).toBeUndefined();
    expect(shaped([{ status: 400, hasBody: false }, { status: 404, hasBody: true, bodyKeys: ['title'] }, { status: 399, hasBody: false }])).toBe(
      'returns 400 with no body; returns 404 without `status` (#/components/schemas/Problem)',
    );
    expect(shaped([{ status: 404, hasBody: true, bodyKeys: [] }], '#/components/schemas/Loose')).toBeUndefined();
    expect(shaped([{ hasBody: false }, { status: 422, hasBody: true, bodyKeys: [] }])).toBe('returns 422 without `title`, `status` (#/components/schemas/Problem)');
    expect(shaped([], '#/openapi')).toBe('`#/openapi` names no schema in the document');
    expect(shaped([], '#/x-nil')).toBe('`#/x-nil` names no schema in the document');
    expect(shaped([], '#/components/schemas/Nope')).toBe('`#/components/schemas/Nope` names no schema in the document');
    expect(shaped([], '#/info/title')).toBe('`#/info/title` names no schema in the document');
    expect(shaped([], 'not-a-pointer')).toBe('`not-a-pointer` names no schema in the document');
    expect(shaped([], '')).toBe('`returns-error-shape` needs `functionOptions.ref`, a pointer to the error schema');
    expect(applyCode('returns-error-shape', handler(), CONTRACT)).toBe('`returns-error-shape` needs `functionOptions.ref`, a pointer to the error schema');
  });
});

const source = (text: string): ts.SourceFile => ts.createSourceFile('h.ts', text, ts.ScriptTarget.Latest, true);
const summaryOf = (text: string, symbol: string): HandlerSummary | undefined => {
  const found = findHandler(ts, source(text), symbol);
  return found === undefined ? undefined : summarize(ts, found);
};

const HANDLERS = `
import { audit } from './audit.js';
export const handlers = {
  getPets(input) {
    audit.log('list');
    if (!input.query.ok) return { status: 400, body: { title: 'bad' } };
    const inner = () => ({ status: 500 });
    function nested() { return { status: 503 }; }
    schema.parse(input.query);
    check(input['body']);
    return { status: 200, body: [] };
  },
  'getPet': async (input) => { await load(); return { status: 404, body: problem() }; },
  other: function (x) { return { status: 418, 'body': { 'title': 't', status: 418, ...rest } }; },
  value: 1,
  [computed]: () => 1,
};
`;

describe('reading a handler', () => {
  it('finds an object member: a method, an arrow, a function, by a name or a string', () => {
    expect(summaryOf(HANDLERS, 'handlers.getPets')).toStrictEqual({
      calls: ['log', 'parse', 'check'],
      inputCalls: ['parse', 'check'],
      returns: [
        { status: 400, hasBody: true, bodyKeys: ['title'] },
        { status: 200, hasBody: true },
      ],
    });
    expect(summaryOf(HANDLERS, 'handlers.getPet')).toStrictEqual({ calls: ['load', 'problem'], inputCalls: [], returns: [{ status: 404, hasBody: true }] });
    expect(summaryOf(HANDLERS, 'handlers.other')).toStrictEqual({ calls: [], inputCalls: [], returns: [{ status: 418, hasBody: true, bodyKeys: ['title', 'status'] }] });
    expect([summaryOf(HANDLERS, 'handlers.value'), summaryOf(HANDLERS, 'handlers.missing'), summaryOf(HANDLERS, 'other.getPets')]).toStrictEqual([undefined, undefined, undefined]);
  });

  it('finds a class method, and reads a return whose status or body is not a literal as unknown', () => {
    const text = `
      export class PetsController extends Base {
        name = 'x';
        getPets({ query }) { return { status: code, body: { a: 1 }, ...extra }; }
        getPet(input) { this.audit(input); return; }
        list(input) { return input; }
      }
      class Other { getPets() { return { status: 201 }; } }
      let handlers;
      const [a] = [];
    `;
    expect(summaryOf(text, 'PetsController.getPets')).toStrictEqual({ calls: [], inputCalls: [], returns: [{ hasBody: true, bodyKeys: ['a'] }] });
    expect(summaryOf(text, 'PetsController.getPet')).toStrictEqual({ calls: ['audit'], inputCalls: ['audit'], returns: [] });
    expect(summaryOf(text, 'PetsController.list')).toStrictEqual({ calls: [], inputCalls: [], returns: [] });
    expect(summaryOf(text, 'Other.getPets')).toStrictEqual({ calls: [], inputCalls: [], returns: [{ status: 201, hasBody: false }] });
    expect([summaryOf(text, 'PetsController.name'), summaryOf(text, 'handlers.getPets'), summaryOf('declare class A { m(): void; }', 'A.m')?.calls]).toStrictEqual([undefined, undefined, []]);
    // A name that is neither an identifier nor a string names nothing; the first of two classes by one name is the one read; a class with no name is passed over.
    expect(summaryOf('const h = { 1(i) { f(i); } };', 'h.1')).toBeUndefined();
    expect(summaryOf('class A { m() { first(); } }\nclass A { m() { second(); } }', 'A.m')?.calls).toStrictEqual(['first']);
    expect(summaryOf('export default class { m() {} }\nclass A { m() { f(); } }', 'A.m')?.calls).toStrictEqual(['f']);
    // A validator in a callback guards nothing the handler answers with: it is a call, not an input call.
    expect(summaryOf('const h = { m(input) { setTimeout(() => schema.safeParse(input.body)); return { status: 201 }; } };', 'h.m')).toStrictEqual({
      calls: ['setTimeout', 'safeParse'],
      inputCalls: [],
      returns: [{ status: 201, hasBody: false }],
    });
    // With no input, no call passes it; a return with neither status nor body has neither.
    expect(summaryOf('const h = { m() { f(1); return {}; } };', 'h.m')).toStrictEqual({ calls: ['f'], inputCalls: [], returns: [{ hasBody: false }] });
    // A call through something other than a name: `(f)()`, `a[0]()`.
    expect(summaryOf('const h = { m(i) { (f)(i); a[0](i); } };', 'h.m')).toStrictEqual({ calls: [], inputCalls: [], returns: [] });
  });

  it('typescriptIn: the project\'s compiler, or a command line to fix', () => {
    expect(typescriptIn(fileURLToPath(new URL('.', import.meta.url))).version).toBe(ts.version);
    expect(() => typescriptIn(withoutTypescript(makeDir('apicontract-no-ts-')))).toThrow(UsageError);
    expect(() => typescriptIn(withoutTypescript(makeDir('apicontract-no-ts-')))).toThrow("a rule on code reads handlers with the project's own `typescript`, and it is not installed here. fix: `npm install --save-dev typescript`, or turn the rule off");
  });
});

/** A map with `getPets` handled in `src/handlers.ts` and `getPet` in a file that is not there and a symbol that is not. */
const mapped = () =>
  updateMap(emptyMap(), [
    {
      target: 'hono',
      files: [
        { path: 'src/handlers.ts', content: '', owner: 'user', symbols: [{ operation: 'getPets', symbol: 'handlers.getPets' }, { operation: 'getPet', symbol: 'handlers.nope' }] },
        { path: 'src/routes.ts', content: '', owner: 'generated', symbols: [{ operation: 'getPets', symbol: 'Handlers' }] },
      ],
    },
    { target: 'nest', files: [{ path: 'src/gone.ts', content: '', owner: 'user', symbols: [{ operation: 'getPet', symbol: 'A.b' }] }] },
  ]);

describe('codeIndexOf', () => {
  it('reads each handler the map names once, with its line, or why it is not there, and loads the compiler only when it reads', () => {
    const root = makeDir('apicontract-code-');
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'src/handlers.ts'), 'export const handlers = {\n  getPets(input) {\n    return { status: 200 };\n  },\n};\n');
    let loads = 0;
    let maps = 0;
    const index = codeIndexOf(
      () => {
        maps += 1;
        return mapped();
      },
      root,
      () => {
        loads += 1;
        return ts;
      },
    );
    expect([maps, loads]).toStrictEqual([0, 0]);
    expect(index.handlersOf('getPets')).toStrictEqual([{ file: 'src/handlers.ts', symbol: 'handlers.getPets', target: 'hono', line: 2, summary: { calls: [], inputCalls: [], returns: [{ status: 200, hasBody: false }] } }]);
    expect(index.handlersOf('getPet')).toStrictEqual([
      { file: 'src/handlers.ts', symbol: 'handlers.nope', target: 'hono', missing: 'handlers.nope is not in src/handlers.ts' },
      { file: 'src/gone.ts', symbol: 'A.b', target: 'nest', missing: 'src/gone.ts is not there' },
    ]);
    expect(index.handlersOf('getPets')).toBe(index.handlersOf('getPets'));
    expect(index.handlersOf('nope')).toStrictEqual([]);
    expect([maps, loads]).toStrictEqual([1, 1]);
  });

  it('mapIn: the map at the root, or an empty one', () => {
    const root = makeDir('apicontract-code-');
    expect(mapIn(root)).toStrictEqual(emptyMap());
    writeFileSync(join(root, 'apicontract.map.json'), JSON.stringify(mapped()));
    expect(mapIn(root)).toStrictEqual(mapped());
  });
});

const codeRule = (then: Then | readonly Then[], over: Partial<Rule> = {}): Rule => ({
  description: 'Every pets handler audits',
  given: { select: 'operation', implementation: true },
  then,
  fix: 'call `audit`',
  ...over,
});

const index = (handlers: Record<string, readonly Handler[]>) => ({ handlersOf: (operation: string) => handlers[operation] ?? [] });

describe('the engine, on code', () => {

  it('judges each handler at its line, says when the map has none or the source does not hold it, and reads a summary with a value function', () => {
    const result = lint(
      [{ file: 'api.json', contract: CONTRACT, code: index({ getPets: [handler({ summary: summary({ calls: ['log'] }) })], getPet: [{ file: 'h.ts', symbol: 'handlers.getPet', target: 'custom', missing: 'it is gone' }] }) }],
      { audits: codeRule([{ function: 'calls', functionOptions: { name: 'audit' } }, { field: 'calls', function: 'length', functionOptions: { max: 0 } }]) },
      { audits: 'error' },
    );
    expect(result.findings).toStrictEqual([
      {
        rule: 'audits',
        level: 'error',
        file: 'api.json',
        pointer: '#/paths/~1pets/get',
        message: 'handlers.getPets: does not call `audit`',
        fix: 'call `audit`',
        code: { file: 'h.ts', line: 1 },
      },
      { rule: 'audits', level: 'error', file: 'api.json', pointer: '#/paths/~1pets/get', message: 'handlers.getPets: `calls` has 1, more than 0', fix: 'call `audit`', code: { file: 'h.ts', line: 1 } },
      {
        rule: 'audits',
        level: 'error',
        file: 'api.json',
        pointer: '#/paths/~1pets~1{id}/get',
        message: 'handlers.getPet: handler-not-found: it is gone',
        fix: 'keep the name apicontract generated for it (the generated code requires it), or run `apicontract gen` to write the map again',
      },
    ]);
    expect(result.counts).toStrictEqual({ audits: { checked: 2, failed: 2 } });
    const unmapped = lint([{ file: 'api.json', contract: CONTRACT }], { audits: codeRule({ function: 'calls', functionOptions: { name: 'audit' } }) }, { audits: 'warn' });
    expect(unmapped.findings.map((finding) => [finding.message, finding.fix])).toStrictEqual([
      [
        'map-has-no-handler: `getPets` has no handler you own in apicontract.map.json',
        'generate a server for it with `apicontract gen` (targets nest, hono, fastify or express record the handler you own in apicontract.map.json), or drop `implementation` from the rule',
      ],
      ['map-has-no-handler: `getPet` has no handler you own in apicontract.map.json', expect.any(String) as string],
    ]);
  });

  it('a handler that holds every then makes no finding; a code function on a node that is not a handler finds nothing', () => {
    const held = lint([{ file: 'api.json', contract: CONTRACT, code: index({ getPets: [handler({ summary: summary({ calls: ['audit'] }) })], getPet: [handler({ summary: summary({ calls: ['audit'] }) })] }) }], { audits: codeRule({ function: 'calls', functionOptions: { name: 'audit' } }) }, { audits: 'warn' });
    expect([held.findings, held.counts]).toStrictEqual([[], { audits: { checked: 2, failed: 0 } }]);
    // Only a rule the host refuses says this; the engine still finds nothing on it.
    expect(lint([{ file: 'api.json', contract: CONTRACT }], { odd: codeRule({ function: 'calls' }, { given: { select: 'operation' } }) }, { odd: 'warn' }).findings).toStrictEqual([]);
    // A code function with no options says what it needs.
    const bare = lint([{ file: 'api.json', contract: CONTRACT, code: index({ getPets: [handler()] }) }], { bare: codeRule({ function: 'calls' }) }, { bare: 'warn' }).findings;
    expect(bare.map((finding) => finding.message)).toStrictEqual(['handlers.getPets: `calls` needs `functionOptions.name`, the function to call', 'map-has-no-handler: `getPet` has no handler you own in apicontract.map.json']);
  });
});

const plugin = (rule: object) => ({ name: 'p', rules: { r: { description: 'd', fix: 'f', sample: { document: null, findings: [] }, ...rule } } });

const refused = (rule: object): string => {
  try {
    validate(plugin(rule));
  } catch (error) {
    if (error instanceof PluginError) return error.message;
  }
  return 'accepted';
};

describe('validate: a rule on code', () => {

  it('selects operations, names code functions only with implementation, and never a check', () => {
    expect(refused({ given: { select: 'operation', implementation: true }, then: { function: 'calls', functionOptions: { name: 'a' } } })).toBe('accepted');
    expect(refused({ given: { select: 'operation', implementation: true }, then: { field: 'calls', function: 'truthy' } })).toBe('accepted');
    expect(refused({ given: { select: 'schema', implementation: true }, then: { function: 'calls' } })).toMatch(/plugin "p": rules\.r reads code but selects schema\. fix: a rule with `given\.implementation` selects `operation`: it reads each operation's handler/u);
    expect(refused({ given: { select: 'operation' }, then: { function: 'validates-input' } })).toMatch(
      /plugin "p": rules\.r names a function on code without `given\.implementation`\. fix: add `implementation: true` to `given` to judge each operation's handler with calls, validates-input, returns-error-shape/u,
    );
    expect(refused({ given: { select: 'operation', implementation: true }, check: () => [] })).toMatch(/plugin "p": rules\.r reads code with a `check`\. fix: a rule on code says what must hold with `then`/u);
    expect(refused({ given: { select: 'operation', implementation: false }, then: [{ function: 'truthy' }] })).toBe('accepted');
  });
});

const PLUGIN = `
export default {
  name: 'code-rules',
  rules: {
    'pets-audit': {
      description: 'Every pets handler audits',
      given: { select: 'operation', implementation: true },
      then: { function: 'calls', functionOptions: { name: 'audit' } },
      fix: 'call audit(…) before answering',
      sample: { document: null, findings: [] },
    },
  },
};
`;

const project = () => {
  const dir = makeDir('apicontract-lint-code-');
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'rules.mjs'), PLUGIN);
  writeFileSync(join(dir, 'api.json'), JSON.stringify(DOCUMENT));
  writeFileSync(join(dir, 'apicontract.map.json'), JSON.stringify(mapped()));
  writeFileSync(join(dir, 'src/handlers.ts'), "export const handlers = {\n  getPets(input) {\n    return { status: 200, body: [] };\n  },\n};\n");
  return dir;
};

const configured = (dir: string, rules: object = {}) => validateConfig({ input: 'api.json', plugins: ['./rules.mjs'], lint: { extends: [], rules } }, join(dir, 'apicontract.config.json'));

describe('lint, on a project with handlers', () => {

  it('points a finding at the handler line, with the spec related, in text and SARIF', async () => {
    const dir = project();
    const data = await runLint({ cwd: dir, specs: [], config: configured(dir), typescript: () => ts });
    const lines = (data[TEXT] as () => string)();
    expect(lines).toContain('  warn   pets-audit  src/handlers.ts:2 (#/paths/~1pets/get)  handlers.getPets: does not call `audit`');
    const sarif = toSarif(data as never, { 'pets-audit': codeRule({ function: 'calls' }) }) as { runs: { results: object[] }[] };
    expect(sarif.runs[0]?.results).toContainEqual({
      ruleId: 'pets-audit',
      level: 'warning',
      message: { text: 'handlers.getPets: does not call `audit`. fix: call audit(…) before answering' },
      locations: [{ physicalLocation: { artifactLocation: { uri: 'src/handlers.ts' }, region: { startLine: 2 } } }],
      relatedLocations: [{ id: 0, physicalLocation: { artifactLocation: { uri: 'api.json' } }, logicalLocations: [{ fullyQualifiedName: '#/paths/~1pets/get' }] }],
    });
    expect(JSON.stringify(sarif)).toContain('"text":"handlers.nope: handler-not-found: handlers.nope is not in src/handlers.ts. fix: ');
  });

  it('reads no code when no rule that reads it runs, and the project\'s TypeScript when none is given', async () => {
    const dir = project();
    let loads = 0;
    const off = await runLint({
      cwd: dir,
      specs: [],
      config: configured(dir, { 'pets-audit': 'off' }),
      typescript: () => {
        loads += 1;
        return ts;
      },
    });
    expect([loads, (off.findings as unknown[]).length]).toStrictEqual([0, 0]);
    // The scratch project has no typescript installed: the run says how to fix that.
    await expect(runLint({ cwd: withoutTypescript(dir), specs: [], config: configured(dir) })).rejects.toThrow(UsageError);
  });
});
