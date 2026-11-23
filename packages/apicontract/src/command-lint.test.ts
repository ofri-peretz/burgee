import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ExitCode } from 'burgee';
import { runBurgee } from 'burgee/testing';
import { beforeAll, describe, expect, it } from 'vitest';

import { scratchDirs } from './__fixtures__/run/scratch-dir.js';
import { command, DEFAULT_RULESETS, levelsOf, runLint, scoreOf, toSarif, toText } from './command-lint.js';
import { rulesets } from './lint-rules.js';
import { ConfigError, validateConfig } from './run-config.js';

import { program } from './index.js';

const FIXTURES = fileURLToPath(new URL('__fixtures__/lint/', import.meta.url));
const PETS = join(FIXTURES, 'pets.openapi.yaml');
const TOOLS = join(FIXTURES, 'tools.mcp.json');
const TEXT = Symbol.for('burgee.text');
const text = (data: Record<string | symbol, unknown>): string => (data[TEXT] as () => string)();

const makeDir = scratchDirs();
const scratch = (files: Record<string, string>): string => {
  const dir = makeDir('apicontract-lint-');
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
  return dir;
};

describe('levelsOf', () => {
  it('lays the rulesets over each other in order, then the config rules, with either prefix', () => {
    expect(DEFAULT_RULESETS).toEqual(['recommended']);
    expect(levelsOf(['recommended'])).toEqual(rulesets.recommended);
    const both = levelsOf(['apicontract:recommended', 'contractdiff:agent-ready'], { 'operation-tags': 'error', 'example-valid': 'off' });
    expect(both).toEqual({ ...rulesets.recommended, ...rulesets['agent-ready'], 'operation-tags': 'error', 'example-valid': 'off' });
  });

  it('refuses a ruleset or a rule that does not exist, naming the ones that do', () => {
    expect(() => levelsOf(['strict'])).toThrow('there is no ruleset `strict`. fix: use one of recommended, agent-ready');
    expect(() => levelsOf(['other:recommended'])).toThrow('there is no ruleset `other:recommended`');
    expect(() => levelsOf(['recommendedapicontract:'])).toThrow('there is no ruleset `recommendedapicontract:`');
    expect(() => levelsOf([], { nope: 'warn' })).toThrow('`lint.rules` names `nope`, which is not a rule. fix: use one of description-length, description-overlap, example-valid,');
    expect(() => levelsOf([], { nope: 'warn', nor: 'warn' })).toThrow(ConfigError);
    expect(() => levelsOf([], { nope: 'warn', nor: 'warn' })).toThrow(/^apicontract\.config\.json cannot be used:\n {2}- `lint\.rules` names `nope`.*\n {2}- `lint\.rules` names `nor`/u);
  });
});

describe('scoreOf', () => {
  it("is the share of the ruleset's checks that passed, rounded down; a run with nothing to check scores 100", () => {
    expect(scoreOf({ a: 'warn', b: 'warn', c: 'warn' }, { a: { checked: 2, failed: 1 }, b: { checked: 1, failed: 0 }, d: { checked: 9, failed: 9 } })).toEqual({ passed: 2, checked: 3, percent: 66 });
    expect(scoreOf({ a: 'warn' }, {})).toEqual({ passed: 0, checked: 0, percent: 100 });
  });
});

describe('runLint', () => {
  it('lints each spec with the recommended rules, says what it checked, and scores the ruleset', async () => {
    const data = await runLint({ cwd: FIXTURES, specs: ['pets.openapi.yaml', 'tools.mcp.json'], config: undefined });
    expect(data.inputs).toEqual(['pets.openapi.yaml', 'tools.mcp.json']);
    expect(data.scores).toEqual({ recommended: { passed: 31, checked: 44, percent: 70 } });
    expect(data.notCarried).toEqual([]);
    expect(data.exitCode).toBeUndefined();
    expect(text(data).split('\n')).toEqual([
      'pets.openapi.yaml',
      '  warn   info-description  #  `info.description` is missing',
      '         fix: add `info.description`',
      '  warn   no-unresolved-ref  #  `#/components/schemas/Missing` points at nothing',
      '         fix: point the `$ref` at a definition that exists, or add the definition',
      '  warn   no-unused-component  #  `components.schemas.Unused` is never used',
      '         fix: remove the unused schema, or reference it where it is meant to be used',
      '  warn   operation-operation-id-unique  #  operationId `listPets` is used more than once',
      '         fix: give each operation its own `operationId`',
      '  warn   path-no-trailing-slash  #  path `/pets/{id}/` ends with a slash',
      '         fix: drop the trailing slash',
      '  warn   parameter-description  #/components/parameters/Trace  trace: `description` is missing',
      '         fix: add a `description` saying what the parameter does and what values it takes',
      '  warn   example-valid  #/components/schemas/Pet/properties/name  example 7 is not valid against its schema',
      '         fix: correct the example, or the schema if the example is right',
      '  warn   example-valid  #/components/schemas/Pet/properties/tags  example [1] is not valid against its schema',
      '         fix: correct the example, or the schema if the example is right',
      '  warn   operation-tags  #/paths/~1pets/post  `tags` is missing',
      '         fix: add `tags` naming the resource the operation belongs to',
      '  warn   operation-description  #/paths/~1pets~1{id}~1/delete  has no description or summary',
      '         fix: add a `description` saying what the operation does and when to call it',
      '  warn   operation-success-response  #/paths/~1pets~1{id}~1/get  declares no 2xx or 3xx response',
      '         fix: declare the response a successful call returns',
      '  warn   parameter-description  #/paths/~1pets~1{id}~1/get/parameters/0  id: `description` is missing',
      '         fix: add a `description` saying what the parameter does and what values it takes',
      '',
      'tools.mcp.json',
      '  warn   operation-description  #/tools/1  has no description or summary',
      '         fix: add a `description` saying what the operation does and when to call it',
      '',
      '0 error(s), 13 warning(s). Checked 11 rule(s) on 2 input(s), 44 node(s); not carried: none.',
      'recommended: 70% (31 of 44 checks passed)',
    ]);
  });

  it('scores the agent-ready ruleset: descriptions, overlap, examples', async () => {
    const data = await runLint({ cwd: FIXTURES, specs: ['pets.openapi.yaml', 'tools.mcp.json'], rulesets: ['agent-ready'], config: undefined });
    expect(data.scores).toEqual({ 'agent-ready': { passed: 38, checked: 50, percent: 76 } });
    expect(data.counts).toEqual({
      'description-length': { checked: 6, failed: 0 },
      'description-overlap': { checked: 6, failed: 1 },
      'example-valid': { checked: 17, failed: 2 },
      'operation-description': { checked: 6, failed: 2 },
      'operation-operation-id': { checked: 4, failed: 0 },
      'parameter-description': { checked: 3, failed: 2 },
      'property-description': { checked: 8, failed: 5 },
    });
    expect(text(data)).toContain('  warn   description-overlap  #/paths/~1pets~1{id}~1/get  description shares 100% of its words with `listPets`');
    expect(text(data)).toContain('  warn   property-description  #/tools/0 arguments/properties/units  units: `description` is missing');
  });

  it("fails on an error, with a fix, and reads the config's input, rulesets and levels from its folder", async () => {
    const dir = scratch({ 'api.yaml': "openapi: 3.1.0\ninfo: { title: t, version: '1', description: d }\npaths:\n  /a:\n    get: { operationId: a, description: d, tags: [t], responses: { '200': { description: ok } } }\n  /b/:\n    get: { operationId: b, description: e, tags: [t], responses: { '200': { description: ok } } }\n" });
    const config = validateConfig({ input: 'api.yaml', lint: { extends: ['recommended'], rules: { 'path-no-trailing-slash': 'error' } } }, join(dir, 'apicontract.config.json'));
    const data = await runLint({ cwd: '/elsewhere', specs: [], config });
    expect(data.exitCode).toBe(ExitCode.RUNTIME);
    expect(data.fix).toBe('correct each error as its own fix line says, or set its rule to "warn" in `lint.rules`');
    expect(data.findings).toEqual([{ rule: 'path-no-trailing-slash', level: 'error', file: 'api.yaml', pointer: '#', message: 'path `/b/` ends with a slash', fix: 'drop the trailing slash' }]);
    expect(text(data).split('\n').at(-2)).toBe('1 error(s), 0 warning(s). Checked 11 rule(s) on 1 input(s), 13 node(s); not carried: none.');
    const flagged = await runLint({ cwd: dir, specs: ['api.yaml'], rulesets: [], config: validateConfig({ lint: { rules: { 'path-no-trailing-slash': 'off' } } }, join(dir, 'apicontract.config.json')) });
    expect(flagged.findings).toEqual([]);
    expect(text(flagged).split('\n')).toEqual(['0 error(s), 0 warning(s). Checked 10 rule(s) on 1 input(s), 12 node(s); not carried: none.', 'recommended: 100% (12 of 12 checks passed)']);
  });

  it('reads the config from the folder when none is given, and refuses when there is nothing to lint', async () => {
    const dir = scratch({ 'apicontract.config.json': JSON.stringify({ lint: { extends: ['agent-ready'] } }) });
    await expect(runLint({ cwd: dir, specs: [] })).rejects.toThrow('nothing to lint. fix: pass a spec, e.g. `apicontract lint openapi.yaml`, or set `input` in apicontract.config.json');
    await expect(runLint({ cwd: makeDir('apicontract-lint-'), specs: [] })).rejects.toThrow('nothing to lint');
    const data = await runLint({ cwd: dir, specs: [TOOLS] });
    expect(Object.keys(data.scores as object)).toEqual(['agent-ready']);
    const prefixed = await runLint({ cwd: FIXTURES, specs: ['tools.mcp.json'], rulesets: ['contractdiff:agent-ready'], config: undefined });
    expect(Object.keys(prefixed.scores as object)).toEqual(['agent-ready']);
    expect('sarif' in prefixed).toBe(false);
    expect('exitCode' in prefixed).toBe(false);
    const bare = validateConfig({ input: 'tools.mcp.json' }, join(FIXTURES, 'apicontract.config.json'));
    const fromRoot = await runLint({ cwd: '/elsewhere', specs: [], config: bare });
    expect(fromRoot.inputs).toEqual(['tools.mcp.json']);
    expect(Object.keys(fromRoot.scores as object)).toEqual(['recommended']);
    const fromCwd = await runLint({ cwd: FIXTURES, specs: ['tools.mcp.json'], config: validateConfig({}, join(dir, 'apicontract.config.json')) });
    expect(fromCwd.inputs).toEqual(['tools.mcp.json']);
  });

  it('refuses a file it cannot read or a format it does not know', async () => {
    const dir = scratch({ 'bad.yaml': 'a: [', 'list.json': '[1, 2]' });
    await expect(runLint({ cwd: dir, specs: ['gone.yaml'], config: undefined })).rejects.toThrow(/^cannot read gone\.yaml: .*\. fix: pass a JSON or YAML document that exists$/u);
    await expect(runLint({ cwd: dir, specs: ['bad.yaml'], config: undefined })).rejects.toThrow('cannot read bad.yaml');
    await expect(runLint({ cwd: dir, specs: ['list.json'], config: undefined })).rejects.toThrow('no input format reads list.json. fix: pass a document one of these reads: openapi, swagger2, asyncapi, mcp, jsonschema');
  });

  it('prints SARIF when asked, with each rule described', async () => {
    const data = await runLint({ cwd: FIXTURES, specs: ['tools.mcp.json'], sarif: true, config: undefined });
    const sarif = data.sarif as { runs: [{ tool: { driver: { rules: { id: string; shortDescription: { text: string } }[] } }; results: unknown[] }] };
    expect(JSON.parse(text(data))).toEqual(sarif);
    expect(text(data).startsWith('{\n  "version": "2.1.0",\n  "$schema": "https://json.schemastore.org/sarif-2.1.0.json",\n')).toBe(true);
    expect((sarif.runs[0].tool.driver as unknown as { name: string }).name).toBe('apicontract lint');
    expect(sarif.runs[0].tool.driver.rules[0]).toEqual({ id: 'example-valid', shortDescription: { text: 'Every example is valid against the schema it sits in' } });
    expect(sarif.runs[0].results).toEqual([
      {
        ruleId: 'operation-description',
        level: 'warning',
        message: { text: 'has no description or summary. fix: add a `description` saying what the operation does and when to call it' },
        locations: [{ physicalLocation: { artifactLocation: { uri: 'tools.mcp.json' } }, logicalLocations: [{ fullyQualifiedName: '#/tools/1' }] }],
      },
    ]);
    expect(toSarif({ findings: [{ rule: 'example-valid', level: 'error', file: 'a', pointer: '#', message: 'm', fix: 'f' }], counts: {}, inputs: ['a'] })).toMatchObject({ runs: [{ results: [{ level: 'error' }] }] });
    expect(toText({ findings: [], counts: {}, inputs: [] }, {})).toBe('0 error(s), 0 warning(s). Checked 0 rule(s) on 0 input(s), 0 node(s); not carried: none.');
  });
});

describe('apicontract lint, through burgee', () => {
  beforeAll(async () => {
    await runBurgee(program, { argv: ['--version'] });
  });

  it('is described for --help and the MCP tool list, and only reads', () => {
    expect(command.description).toBe("A contract's form checked by rules: standards, and whether an agent can use it as tools");
    expect(command.effects).toBe('read_only');
    expect(command.examples).toEqual([
      { command: 'apicontract lint openapi.yaml', description: 'the recommended rules, as warnings' },
      { command: 'apicontract lint openapi.yaml --ruleset agent-ready', description: 'can an agent call this API as tools: descriptions, examples, ids' },
    ]);
    expect(command.arguments).toEqual([{ name: 'specs', variadic: true, required: false, description: "the contracts to lint (default: the config's input)" }]);
    expect(command.options).toEqual({
      ruleset: { type: 'string', multiple: true, choices: ['recommended', 'agent-ready'], description: "a ruleset to run, over the config's lint.extends (default recommended)" },
      sarif: { type: 'boolean', description: 'print SARIF 2.1.0 for code scanning instead of text' },
    });
  });

  it('runs from the command line with --ruleset and --json', async () => {
    const r = await runBurgee(program, { argv: ['lint', PETS, TOOLS, '--ruleset', 'agent-ready', '--json'] });
    expect(r.code).toBe(0);
    const { data } = r.json as { data: { scores: unknown; inputs: string[] } };
    expect(data.scores).toEqual({ 'agent-ready': { passed: 38, checked: 50, percent: 76 } });
    expect(data.inputs).toEqual([PETS, TOOLS]);
    const sarif = await runBurgee(program, { argv: ['lint', TOOLS, '--sarif'] });
    expect(JSON.parse(sarif.stdout)).toMatchObject({ version: '2.1.0' });
  });
});
