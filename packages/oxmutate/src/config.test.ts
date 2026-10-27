import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it, vi } from 'vitest';

import { disables, loadOptions, type Options } from './config.js';

const cores = vi.hoisted(() => ({ n: 4 }));
vi.mock('node:os', async (original) => ({ ...(await original<typeof import('node:os')>()), availableParallelism: () => cores.n }));

const base = mkdtempSync(path.join(tmpdir(), 'oxmutate-config-'));
afterAll(() => rmSync(base, { recursive: true, force: true }));
let n = 0;
/** A fresh project directory holding the given files. */
const project = (files: Record<string, unknown> = {}): string => {
  const root = path.join(base, String(n++));
  mkdirSync(root, { recursive: true });
  for (const [name, body] of Object.entries(files)) writeFileSync(path.join(root, name), typeof body === 'string' ? body : JSON.stringify(body));
  return root;
};

const defaults = (root: string): Options => ({
  root,
  mutate: ['src/**/*.{ts,tsx,js,jsx,mts,cts,mjs,cjs}', '!src/**/*.{test,spec}.*', '!src/**/*.d.ts'],
  vitestConfig: undefined,
  concurrency: 3,
  timeoutMS: 500,
  timeoutFactor: 1.5,
  thresholds: { high: 80, low: 60, break: null },
  excludedMutations: [],
  ignoreStatic: false,
  strykerCompat: false,
  reporters: ['clear-text', 'json'],
  jsonReport: path.join(root, 'reports/mutation/mutation.json'),
  sarifReport: path.join(root, 'reports/mutation/mutation.sarif'),
  htmlReport: path.join(root, 'reports/mutation/mutation.html'),
  incremental: false,
  incrementalFile: path.join(root, 'reports/oxmutate-incremental.json'),
  flakyReruns: 2,
  unused: [],
  configFile: undefined,
  dryRunOnly: false,
  dryRunTimeoutMinutes: 5,
  buildCommand: undefined,
  testRunnerNodeArgs: [],
  allowEmpty: false,
  specOracles: [],
  ignore: [],
  typeCheck: false,
  tsconfigFile: 'tsconfig.json',
  typeChecker: undefined,
  commandRunner: undefined,
  warnUnused: true,
});

describe('options with no config file', () => {
  it('are the defaults', async () => {
    const root = project();
    expect(await loadOptions(root)).toEqual(defaults(root));
  });
  it('use every core but one, at least one and at most eight', async () => {
    const root = project();
    const at = async (c: number): Promise<number> => {
      cores.n = c;
      return (await loadOptions(root)).concurrency;
    };
    expect([await at(1), await at(2), await at(9), await at(10), await at(64)]).toEqual([1, 1, 8, 8, 8]);
    cores.n = 4;
  });
  it('take overrides over everything', async () => {
    const root = project({ 'oxmutate.config.json': { concurrency: 2 } });
    expect((await loadOptions(root, { concurrency: 7, since: 'main' })).concurrency).toBe(7);
    expect((await loadOptions(root, { since: 'main' })).since).toBe('main');
  });
});

describe('options from a config file', () => {
  it('read every key oxmutate uses', async () => {
    const config = {
      mutate: ['lib/**/*.js'],
      vitest: { configFile: 'vitest.unit.ts' },
      concurrency: 6,
      timeoutMS: 900,
      timeoutFactor: 2,
      thresholds: { high: 90, low: 70, break: 50 },
      mutator: { excludedMutations: ['Regex'] },
      ignoreStatic: true,
      strykerCompat: true,
      reporters: ['html'],
      jsonReporter: { fileName: 'out/m.json' },
      sarifReport: 'out/m.sarif',
      htmlReporter: { fileName: 'out/m.html' },
      incremental: true,
      incrementalFile: 'out/inc.json',
      flakyReruns: 0,
      dryRunOnly: true,
      dryRunTimeoutMinutes: 1,
      buildCommand: 'npm run build',
      testRunnerNodeArgs: ['--no-warnings'],
      allowEmpty: true,
      specOracles: [{ name: 'c', backend: 'itf', dir: 't', replay: [], files: [] }],
      ignore: [{ call: 'console.*', reason: 'log text is not behaviour' }],
      checkers: ['typescript'],
      tsconfigFile: 'tsconfig.build.json',
      typeChecker: 'npx tsgo',
      testRunner: 'command',
      commandRunner: { command: 'npm run unit' },
      warnings: true,
    };
    const root = project({ 'oxmutate.config.json': config });
    expect(await loadOptions(root)).toEqual({
      ...defaults(root),
      mutate: ['lib/**/*.js'],
      vitestConfig: path.join(root, 'vitest.unit.ts'),
      concurrency: 6,
      timeoutMS: 900,
      timeoutFactor: 2,
      thresholds: { high: 90, low: 70, break: 50 },
      excludedMutations: ['Regex'],
      ignoreStatic: true,
      strykerCompat: true,
      reporters: ['html'],
      jsonReport: path.join(root, 'out/m.json'),
      sarifReport: path.join(root, 'out/m.sarif'),
      htmlReport: path.join(root, 'out/m.html'),
      incremental: true,
      incrementalFile: path.join(root, 'out/inc.json'),
      flakyReruns: 0,
      configFile: path.join(root, 'oxmutate.config.json'),
      dryRunOnly: true,
      dryRunTimeoutMinutes: 1,
      buildCommand: 'npm run build',
      testRunnerNodeArgs: ['--no-warnings'],
      allowEmpty: true,
      specOracles: config.specOracles,
      ignore: config.ignore,
      typeCheck: true,
      tsconfigFile: 'tsconfig.build.json',
      typeChecker: 'npx tsgo',
      commandRunner: 'npm run unit',
    });
  });

  it('booleans are on only when literally true, and strings only when strings', async () => {
    const root = project({ 'oxmutate.config.json': { ignoreStatic: 'yes', strykerCompat: 1, incremental: 'true', dryRunOnly: 1, allowEmpty: 'y', buildCommand: ['npm'], typeChecker: 5, checkers: ['eslint'] } });
    expect(await loadOptions(root)).toEqual({ ...defaults(root), configFile: path.join(root, 'oxmutate.config.json') });
  });

  it('a partial thresholds block keeps the other defaults', async () => {
    const root = project({ 'oxmutate.config.json': { thresholds: { break: 0 } } });
    expect((await loadOptions(root)).thresholds).toEqual({ high: 80, low: 60, break: 0 });
  });

  it('the command runner defaults to npm test, and is off for any other runner', async () => {
    expect((await loadOptions(project({ 'oxmutate.config.json': { testRunner: 'command' } }))).commandRunner).toBe('npm test');
    expect((await loadOptions(project({ 'oxmutate.config.json': { testRunner: 'command', commandRunner: {} } }))).commandRunner).toBe('npm test');
    expect((await loadOptions(project({ 'oxmutate.config.json': { testRunner: 'vitest', commandRunner: { command: 'x' } } }))).commandRunner).toBeUndefined();
  });

  it('warnings: false, or unknownOptions: false, hides the unused-keys line', async () => {
    const shown = await Promise.all([false, { unknownOptions: false }, { unknownOptions: true }, {}, true].map(async (warnings) => (await loadOptions(project({ 'oxmutate.config.json': { warnings } }))).warnUnused));
    expect(shown).toEqual([false, false, true, true, true]);
  });

  it('oxmutate.config wins where both set a key; the Stryker file still counts', async () => {
    const root = project({ 'stryker.config.json': { concurrency: 2, timeoutMS: 800 }, 'oxmutate.config.json': { concurrency: 5 } });
    const o = await loadOptions(root);
    expect([o.concurrency, o.timeoutMS, o.configFile]).toEqual([5, 800, path.join(root, 'oxmutate.config.json')]);
  });

  it('with only a Stryker file, that file is the config', async () => {
    const root = project({ 'stryker.config.json': { timeoutMS: 800 } });
    expect((await loadOptions(root)).configFile).toBe(path.join(root, 'stryker.config.json'));
  });

  it('an explicit config file is read from the root instead of oxmutate.config.*', async () => {
    const root = project({ 'oxmutate.config.json': { concurrency: 5 }, 'other.json': { concurrency: 6 } });
    const o = await loadOptions(root, {}, 'other.json');
    expect([o.concurrency, o.configFile]).toEqual([6, path.join(root, 'other.json')]);
  });
});

describe('config file formats', () => {
  it('are found in the order .mjs, .js, .cjs, .json, .mts, .ts', async () => {
    const all = {
      'oxmutate.config.mjs': 'export default { timeoutMS: 1 };',
      'oxmutate.config.js': 'export default { timeoutMS: 2 };',
      'oxmutate.config.cjs': 'module.exports = { timeoutMS: 3 };',
      'oxmutate.config.json': { timeoutMS: 4 },
      'oxmutate.config.mts': 'export default { timeoutMS: 5 as number };',
      'oxmutate.config.ts': 'export default { timeoutMS: 6 as number };',
    };
    const names = Object.keys(all);
    // Project i holds the formats from i on, so the one found first is format i.
    const found = await Promise.all(names.map(async (_, i) => (await loadOptions(project(Object.fromEntries(names.slice(i).map((k) => [k, all[k as keyof typeof all]]))))).timeoutMS));
    expect(found).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it('a JSON config is read from disk each time, never from the module cache', async () => {
    const root = project({ 'oxmutate.config.json': { timeoutMS: 1 } });
    expect((await loadOptions(root)).timeoutMS).toBe(1);
    writeFileSync(path.join(root, 'oxmutate.config.json'), JSON.stringify({ timeoutMS: 2 }));
    expect((await loadOptions(root)).timeoutMS).toBe(2);
  });
  it('a module may export a function, sync or async, or named keys', async () => {
    expect((await loadOptions(project({ 'oxmutate.config.mjs': 'export default () => ({ timeoutMS: 7 });' }))).timeoutMS).toBe(7);
    expect((await loadOptions(project({ 'oxmutate.config.mjs': 'export default async () => ({ timeoutMS: 8 });' }))).timeoutMS).toBe(8);
    expect((await loadOptions(project({ 'oxmutate.config.mjs': 'export const timeoutMS = 9;' }))).timeoutMS).toBe(9);
  });
});

describe('Stryker keys oxmutate does not use', () => {
  it('are each reported with the reason', async () => {
    const reasons = {
      inPlace: 'oxmutate never copies or rewrites the project; instrumented sources are served from memory',
      tempDirName: 'no sandbox directory exists',
      cleanTempDir: 'no sandbox directory exists',
      symlinkNodeModules: 'no sandbox directory exists',
      plugins: 'no runtime plugin loading; operators and ignorers are data',
      appendPlugins: 'no runtime plugin loading',
      packageManager: 'oxmutate never installs anything',
      coverageAnalysis: 'always perTest',
      maxTestRunnerReuse: 'workers are replaced on pollution and runaways, automatically',
      dashboard: 'the Stryker Dashboard reporter is M4 work',
      clearTextReporter: 'the summary is always printed',
      eventReporter: 'not implemented',
      logLevel: 'not implemented',
      fileLogLevel: 'not implemented',
      allowConsoleColors: 'colour follows the terminal (roundel policy)',
      disableTypeChecks: 'always on: instrumented files carry // @ts-nocheck, and the checker reads the original sources',
      ignorers: 'ignorer plugins are code; oxmutate takes the same rules as data in `ignore` (see the README)',
      disableBail: 'oxmutate always stops at the first killing test',
      testFiles: 'test files come from the Vitest config',
      ignorePatterns: 'oxmutate never copies the project, so there is nothing to ignore',
      force: 'use --no-incremental',
      checkerNodeArgs: 'not implemented',
      somethingNew: 'not a Stryker 10.0.0 option oxmutate knows',
    };
    const root = project({ 'stryker.config.json': Object.fromEntries(Object.keys(reasons).map((k) => [k, true])) });
    expect((await loadOptions(root)).unused).toEqual(Object.entries(reasons).map(([key, why]) => ({ key, why })));
  });
  it('the keys it reads are not reported, and neither is anything in oxmutate.config', async () => {
    const used = ['mutate', 'vitest', 'concurrency', 'timeoutMS', 'timeoutFactor', 'thresholds', 'ignoreStatic', 'reporters', 'jsonReporter', 'htmlReporter', 'incremental', 'incrementalFile', '$schema', 'mutator', 'dryRunOnly', 'dryRunTimeoutMinutes', 'buildCommand', 'testRunnerNodeArgs', 'allowEmpty', 'warnings', 'testRunner', 'commandRunner', 'checkers', 'tsconfigFile'];
    const root = project({ 'stryker.config.json': Object.fromEntries(used.map((k) => [k, null])), 'oxmutate.config.json': { inPlace: true } });
    expect((await loadOptions(root)).unused).toEqual([]);
  });
});

describe('disable comments, Stryker syntax', () => {
  it('apply to the next line, for the named mutators, with the reason kept', () => {
    const src = 'a\n// Stryker disable next-line EqualityOperator,ConditionalExpression: boundary is checked by the caller\nif (x < 1) {}\n';
    expect(disables(src, 'f.ts')).toEqual({ disables: [{ line: 3, mutators: ['EqualityOperator', 'ConditionalExpression'], reason: 'boundary is checked by the caller' }], errors: [] });
  });
  it('tolerate spacing, any case, and trim the list and the reason', () => {
    const src = 'x();\n  //   stryker   DISABLE   next-line  Regex , StringLiteral ,  :   the reason here   \n';
    expect(disables(src, 'f.ts').disables).toEqual([{ line: 3, mutators: ['Regex', 'StringLiteral'], reason: 'the reason here' }]);
  });
  it('the reason may follow the colon with no space', () => {
    expect(disables('// Stryker disable next-line Regex:the anchor is implied by split\nx();\n', 'f.ts').disables).toEqual([{ line: 2, mutators: ['Regex'], reason: 'the anchor is implied by split' }]);
  });
  it('all, in any case, disables every mutator', () => {
    expect(disables('// Stryker disable next-line ALL: a generated table of values\nx();\n', 'f.ts').disables).toEqual([{ line: 2, mutators: 'all', reason: 'a generated table of values' }]);
    expect(disables('// Stryker disable next-line   all  : a generated table of values\n', 'f.ts').disables[0]?.mutators).toBe('all');
  });
  it('a directive without a reason is an error naming the line, as burgee already requires', () => {
    // Split, so the repository's reason lock does not read this fixture as a real directive.
    const d = 'disable';
    const lines = ['x();', `// Stryker ${d} next-line all`, `// oxmutate ${d} next-line Regex  `, `//Stryker ${d} next-line all`, `//   Stryker   ${d}   next-line   Regex, StringLiteral`];
    const { disables: found, errors } = disables(lines.join('\n'), 'f.ts');
    expect(found).toEqual([]);
    expect(errors).toEqual([2, 3, 4, 5].map((n) => `f.ts:${String(n)}: disable comment without a reason. fix: add ": <why this mutant cannot be killed>"`));
  });
  it('oxmutate spells the same directive', () => {
    expect(disables('// oxmutate disable next-line all: generated code\nx();\n', 'f.ts').disables).toEqual([{ line: 2, mutators: 'all', reason: 'generated code' }]);
  });
  it('other comments are not directives', () => {
    expect(disables('// Stryker restore all\n// disable next-line all: x\n/* Stryker disable next-line all: x */\n', 'f.ts')).toEqual({ disables: [], errors: [] });
    // Prose that mentions the directive is neither a directive nor an error.
    expect(disables(`// Stryker ${'disable'} next-line comments need a reason, see the README.\n`, 'f.ts')).toEqual({ disables: [], errors: [] });
  });
});
