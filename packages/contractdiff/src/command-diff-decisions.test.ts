/* eslint-disable maintainability/consistent-function-scoping -- a test's helpers sit beside the case they serve */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ExitCode } from 'burgee';
import { runBurgee } from 'burgee/testing';
import { parse } from 'seniority/yaml';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { scratchDirs } from './__fixtures__/run/scratch-dir.js';
import { diff, type GitReader, toSarif, toText, uriOf } from './command-diff.js';
import { type Contract } from './core/model.js';
import { type Comparison, compareContracts, type Finding } from './diff-contract.js';
import { read } from './openapi.js';
import { configSchema, ConfigError, decisionSettingOf, validateConfig } from './run-config.js';

import { program } from './index.js';

const DECISIONS = fileURLToPath(new URL('__fixtures__/diff-decisions/', import.meta.url));
const PETS = fileURLToPath(new URL('__fixtures__/diff/', import.meta.url));
const at = (name: string): string => join(DECISIONS, `${name}.yaml`);
const TEXT = Symbol.for('burgee.text');
const text = (data: Record<string | symbol, unknown>): string => (data[TEXT] as () => string)();

const makeDir = scratchDirs();

/** A reader that serves the decision fixtures by name, and `config` as the config at the ref (absent: the ref has none). */
const reader =
  (config?: string): GitReader =>
  (_ref, path) => {
    if (path === 'contractdiff.config.json') {
      if (config === undefined) throw new Error('no such file at that ref');
      return config;
    }
    return readFileSync(join(DECISIONS, path), 'utf8');
  };

const setting = (decisions: string): string => JSON.stringify({ diff: { decisions } });

const decisionsOf = (data: Record<string | symbol, unknown>): Finding[] => data.decisions as Finding[];

describe('contractdiff diff --decisions, through burgee', () => {
  beforeAll(async () => {
    await runBurgee(program, { argv: ['--version'] });
  });

  it('has nothing to say about a contract compared with itself', () => {
    const r = diff({ cwd: DECISIONS, old: at('base'), new: at('base'), today: '2027-01-01' });
    expect(r).toMatchObject({ decisions: [], findings: [] });
  });

  it("warns by default: a breaking change with no decision prints, and the exit code and the verdict are the change's own", async () => {
    const r = await runBurgee(program, { argv: ['diff', at('base'), at('overdue'), '--today', '2027-01-01', '--json'] });
    const { data } = r.json as { data: Record<string, unknown> };
    expect(r.code).toBe(ExitCode.OK);
    expect(data).toMatchObject({ verdict: 'non-breaking', summary: { breaking: 0, unknown: 0, 'non-breaking': 0 }, findings: [] });
    expect((data.decisions as Finding[]).map((finding) => [finding.id, finding.verdict])).toEqual([['ac-decision-overdue', 'unknown']]);
    expect(data).not.toHaveProperty('exitCode');
  });

  it('prints the decision findings after the changes, each with its fix', async () => {
    const r = await runBurgee(program, { argv: ['diff', at('base'), at('overdue'), '--today', '2027-01-01'] });
    expect(r.stdout).toBe(
      `${[
        `no changes between ${at('base')} and ${at('overdue')}`,
        '',
        'decisions: 1 (--decisions warn)',
        '  warn          ac-decision-overdue  getBalance  response:200:application/json /properties/amount  "2026-06-01" -> "2027-01-01"',
        '                fix: getBalance response:200:application/json /properties/amount was to go after 2026-06-01 and is still here. fix: remove it as decided, or move `x-sunset` to a date that still holds',
      ].join('\n')}
`,
    );
  });

  it('puts them in SARIF at warning, with the location on the new side', async () => {
    const r = await runBurgee(program, { argv: ['diff', at('base'), at('overdue'), '--today', '2027-01-01', '--sarif'] });
    const sarif = JSON.parse(r.stdout) as {
      runs: {
        tool: { driver: { rules: { id: string }[] } };
        results: {
          ruleId: string;
          level: string;
          message: { text: string };
          locations: { physicalLocation: { artifactLocation: { uri: string } }; logicalLocations: { fullyQualifiedName: string }[] }[];
        }[];
      }[];
    };
    const [run] = sarif.runs;
    expect(run?.tool.driver.rules).toEqual([{ id: 'ac-decision-overdue' }]);
    expect(run?.results).toHaveLength(1);
    expect(run?.results[0]).toMatchObject({ ruleId: 'ac-decision-overdue', level: 'warning' });
    expect(run?.results[0]?.message.text).toMatch(/^decision: getBalance response:200:application\/json \/properties\/amount "2026-06-01" -> "2027-01-01"\. fix: /);
    expect(run?.results[0]?.locations[0]?.physicalLocation.artifactLocation.uri).toBe(uriOf(at('overdue')));
    expect(run?.results[0]?.locations[0]?.logicalLocations[0]?.fullyQualifiedName).toBe('#/paths/~1v3~1wallet/get response:200:application/json/properties/amount');
  });

  it("fails the run at error: exit 1, a breaking verdict, the changes' own summary, and a fix that says what to do", async () => {
    const r = await runBurgee(program, { argv: ['diff', at('base'), at('overdue'), '--decisions', 'error', '--today', '2027-01-01', '--json'] });
    const { data } = r.json as { data: Record<string, unknown> };
    expect(r.code).toBe(ExitCode.RUNTIME);
    expect(data).toMatchObject({
      verdict: 'breaking',
      summary: { breaking: 0, unknown: 0, 'non-breaking': 0 },
      exitCode: ExitCode.RUNTIME,
      fix: 'resolve each decision finding as its own fix line says, or run with `--decisions warn` while the contract catches up',
    });
    expect((data.decisions as Finding[]).map((finding) => finding.verdict)).toEqual(['breaking']);
    const sarif = await runBurgee(program, { argv: ['diff', at('base'), at('overdue'), '--decisions', 'error', '--today', '2027-01-01', '--sarif'] });
    expect((JSON.parse(sarif.stdout) as { runs: { results: { level: string }[] }[] }).runs[0]?.results.map((result) => result.level)).toEqual(['error']);
  });

  it('says nothing at off', async () => {
    const r = await runBurgee(program, { argv: ['diff', at('base'), at('overdue'), '--decisions', 'off', '--today', '2027-01-01', '--json'] });
    const { data } = r.json as { data: Record<string, unknown> };
    expect(r.code).toBe(ExitCode.OK);
    expect(data.decisions).toEqual([]);
    expect(text(diff({ cwd: DECISIONS, old: at('base'), new: at('overdue'), decisions: 'off', today: '2027-01-01' }))).toBe(
      `no changes between ${at('base')} and ${at('overdue')}`,
    );
  });

  it('refuses a --today that is not a date, with the fix', async () => {
    const r = await runBurgee(program, { argv: ['diff', at('base'), at('overdue'), '--today', '2027-02-30'] });
    expect(r.code).toBe(ExitCode.USAGE);
    expect(r.stderr).toContain('--today takes a real date as YYYY-MM-DD, not 2027-02-30. fix: pass a date such as --today 2027-01-01');
  });

  describe('without --today', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('judges a sunset against the UTC date of the clock, which the test sets', () => {
      vi.useFakeTimers({ now: new Date('2027-01-01T23:59:00Z'), toFake: ['Date'] });
      expect(decisionsOf(diff({ cwd: DECISIONS, old: at('base'), new: at('overdue') })).map((finding) => finding.id)).toEqual(['ac-decision-overdue']);
      vi.setSystemTime(new Date('2026-06-01T23:59:00Z'));
      expect(decisionsOf(diff({ cwd: DECISIONS, old: at('base'), new: at('overdue') }))).toEqual([]);
    });
  });
});

describe('no regression on a contract that carries no markers (R5, R11)', () => {
  const [old, nu] = ['pets-old.yaml', 'pets-new.yaml'].map((name): Contract => read(parse(readFileSync(join(PETS, name), 'utf8'))));
  const base = compareContracts(old as Contract, nu as Contract);

  it('at warn: the verdict, the summary and every change are what compareContracts says, and the exit code is unchanged', () => {
    const data = diff({ cwd: PETS, old: join(PETS, 'pets-old.yaml'), new: join(PETS, 'pets-new.yaml'), decisions: 'warn', today: '2027-01-01' }) as unknown as Comparison & {
      exitCode: number;
    };
    expect(data.verdict).toBe(base.verdict);
    expect(data.summary).toEqual(base.summary);
    expect(data.findings).toEqual(base.findings);
    expect(data.exitCode).toBe(ExitCode.RUNTIME);
  });

  it('at error: each breaking change is a decision-missing and nothing else is new', () => {
    const data = diff({ cwd: PETS, old: join(PETS, 'pets-old.yaml'), new: join(PETS, 'pets-new.yaml'), decisions: 'error', today: '2027-01-01' }) as unknown as Comparison;
    expect(data.findings).toEqual(base.findings);
    expect(data.summary).toEqual(base.summary);
    expect((data.decisions as readonly Finding[]).map((finding) => [finding.id, finding.operation, finding.payload ?? '', finding.pointer])).toEqual([
      ['ac-decision-missing', 'addPet', 'body:application/json', '/properties/name/maxLength'],
      ['ac-decision-missing', 'addPet', 'response:201:application/json', '/properties/kind'],
      ['ac-decision-missing', 'deletePet', '', ''],
      ['ac-decision-missing', 'fetchPet', 'response:200:application/json', '/properties/kind'],
    ]);
    expect(base.findings.filter((finding) => finding.verdict === 'breaking')).toHaveLength(4);
  });

  it('a contract compared with itself has no decision finding', () => {
    expect(decisionsOf(diff({ cwd: PETS, old: join(PETS, 'pets-old.yaml'), new: join(PETS, 'pets-old.yaml'), decisions: 'error', today: '2027-01-01' }))).toEqual([]);
  });
});

const verdictsWith = (options: { old?: string; config?: string; flag?: 'warn' | 'error' | 'off'; working?: string; git?: GitReader }) => {
  const cwd = makeDir('apicontract-diff-decisions-');
  if (options.working !== undefined) writeFileSync(join(cwd, 'contractdiff.config.json'), options.working);
  const data = diff({
    cwd,
    old: options.old ?? 'git:main:base.yaml',
    new: at('undecided'),
    today: '2027-01-01',
    git: options.git ?? reader(options.config),
    ...(options.flag === undefined ? {} : { decisions: options.flag }),
  });
  return decisionsOf(data).map((finding) => finding.verdict);
};

describe('the setting comes from the base ref (R12)', () => {
  it('is warn with no flag and no config', () => {
    expect(verdictsWith({})).toEqual(['unknown']);
  });

  it("is the working tree's config when the base ref has none", () => {
    expect(verdictsWith({ working: setting('error') })).toEqual(['breaking']);
    expect(verdictsWith({ working: setting('off') })).toEqual([]);
  });

  it("is the base ref's config over the working tree's: a change cannot turn off the check it is judged by", () => {
    expect(verdictsWith({ config: setting('error'), working: setting('off') })).toEqual(['breaking']);
    expect(verdictsWith({ config: setting('off'), working: setting('error') })).toEqual([]);
  });

  it('is the flag over both', () => {
    expect(verdictsWith({ flag: 'warn', config: setting('error'), working: setting('error') })).toEqual(['unknown']);
    expect(verdictsWith({ flag: 'error', config: setting('off') })).toEqual(['breaking']);
  });

  it('reads the config only from a git side, and from nowhere else', () => {
    const calls: string[] = [];
    const git: GitReader = (ref, path) => {
      calls.push(`${ref}:${path}`);
      return reader(setting('error'))(ref, path, '.');
    };
    // A plain old side is a file: there is no base ref to read a config from.
    expect(verdictsWith({ old: at('base'), git })).toEqual(['unknown']);
    expect(calls).toEqual([]);
    expect(verdictsWith({ git })).toEqual(['breaking']);
    expect(calls).toEqual(['main:base.yaml', 'main:contractdiff.config.json']);
  });

  it('ignores a config at the ref that is not JSON or sets a value that is not a setting, and asks the working tree', () => {
    expect(verdictsWith({ config: 'diff: [', working: setting('error') })).toEqual(['breaking']);
    expect(verdictsWith({ config: setting('strict'), working: setting('error') })).toEqual(['breaking']);
  });

  it('refuses a working tree config that is not JSON, or sets a value that is not a setting', () => {
    expect(() => verdictsWith({ working: '{' })).toThrow(ConfigError);
    expect(() => verdictsWith({ working: setting('strict') })).toThrow('`diff.decisions` must be one of warn, error, off. fix: write `"decisions": "warn"`');
  });
});

describe('diff.decisions in contractdiff.config.json', () => {
  it('is a documented setting of the schema, and validated with the rest of the config', () => {
    expect(configSchema.properties.diff).toStrictEqual({
      type: 'object',
      additionalProperties: false,
      properties: {
        decisions: {
          enum: ['warn', 'error', 'off'],
          description:
            "How `contractdiff diff` holds a change to the decision written in the contract. The base ref's value wins over the working tree's; `--decisions` wins over both",
        },
      },
    });
    expect(validateConfig({ diff: { decisions: 'error' } }, '/p/contractdiff.config.json').diff).toEqual({ decisions: 'error' });
    expect(validateConfig({}, '/p/contractdiff.config.json')).not.toHaveProperty('diff');
    expect(validateConfig({ diff: {} }, '/p/contractdiff.config.json').diff).toStrictEqual({});
  });

  it('reports every problem with it, with its fix', () => {
    expect(() => validateConfig({ diff: { decisions: 'strict', mode: 'full' } }, '/p/contractdiff.config.json')).toThrow(
      [
        '/p/contractdiff.config.json cannot be used:',
        '  - `diff.mode` is not a diff setting. fix: remove it; diff takes decisions',
        '  - `diff.decisions` must be one of warn, error, off. fix: write `"decisions": "warn"`',
      ].join('\n'),
    );
    expect(() => validateConfig({ diff: 'warn' }, '/p/contractdiff.config.json')).toThrow('`diff` must be an object. fix: write `{ "decisions": "warn" }`');
  });

  it('refuses a config that is not JSON, naming the file', () => {
    expect(() => decisionSettingOf('{', 'c.json')).toThrow(/^c\.json cannot be used:\n {2}- it is not JSON \(.+\)\. fix: correct the JSON, or validate it against `configSchema`$/);
  });

  it('is read on its own from a config this build may not otherwise know', () => {
    expect(decisionSettingOf('{ "diff": { "decisions": "error" }, "somethingNew": 1 }', 'c')).toBe('error');
    expect(decisionSettingOf('{ "input": "a.yaml" }', 'c')).toBeUndefined();
    expect(decisionSettingOf('[]', 'c')).toBeUndefined();
  });
});

describe('every decision finding has a pointer, a fix and a location (R13)', () => {
  const pairs = [
    ['base', 'misspelled'],
    ['base', 'invalid'],
    ['base', 'misplaced'],
    ['base', 'undecided'],
    ['base', 'removed'],
    ['base', 'stale'],
    ['base', 'overdue'],
    ['base', 'replacement-missing'],
    ['base', 'decided'],
  ] as const;

  it('on the new side, at an operation that is in it', () => {
    const findings = pairs.flatMap(([before, after]) => decisionsOf(diff({ cwd: DECISIONS, old: at(before), new: at(after), today: '2027-01-01' })));
    expect(new Set(findings.map((finding) => finding.id))).toEqual(
      new Set([
        'ac-decision-misspelled',
        'ac-decision-invalid',
        'ac-decision-misplaced',
        'ac-decision-missing',
        'ac-decision-stale',
        'ac-decision-overdue',
        'ac-decision-replacement-missing',
        'ac-decision-unversioned',
      ]),
    );
    for (const finding of findings) {
      expect(finding.fix).toMatch(/fix: .{10,}/);
      expect(finding.source).toMatch(/^#\//);
      expect(finding.document).toBe('new');
      expect(typeof finding.pointer).toBe('string');
    }
  });

  it('on the old side for a removed operation, where the SARIF location names the old file', () => {
    const dir = makeDir('apicontract-diff-decisions-');
    writeFileSync(join(dir, 'empty.yaml'), 'openapi: 3.1.0\ninfo: { title: Wallet, version: 3.0.0 }\npaths: {}\n');
    const data = diff({ cwd: dir, old: at('base'), new: 'empty.yaml', today: '2027-01-01', sarif: true });
    const [finding] = decisionsOf(data);
    expect(finding).toMatchObject({ id: 'ac-decision-missing', document: 'old', operation: 'getBalance', source: '#/paths/~1v3~1wallet/get', pointer: '' });
    expect(finding?.fix).toContain('with no decision. fix: add `x-change: <the decision>`');
    const sarif = data.sarif as { runs: { results: { locations: { physicalLocation: { artifactLocation: { uri: string } } }[] }[] }[] };
    expect(sarif.runs[0]?.results.map((result) => result.locations[0]?.physicalLocation.artifactLocation.uri)).toEqual([uriOf(at('base')), uriOf(at('base'))]);
  });
});

describe('the text and SARIF of a comparison that has no decisions field', () => {
  it('are what they were: a Comparison from compareContracts has none', () => {
    const comparison = compareContracts(read(parse(readFileSync(at('base'), 'utf8'))), read(parse(readFileSync(at('base'), 'utf8'))));
    expect(toText(comparison, 'a', 'b')).toBe('no changes between a and b');
    expect(toSarif(comparison, { file: 'a' }, { file: 'b' })).toMatchObject({ runs: [{ results: [] }] });
  });
});

describe('the text of a comparison with decisions', () => {
  const finding = (verdict: 'unknown' | 'breaking'): Finding => ({
    id: 'ac-decision-stale',
    scheme: 'contractdiff',
    verdict,
    effect: 'neutral',
    operation: 'getBalance',
    source: '#/paths/~1v3~1wallet/get',
    document: 'new',
    direction: 'response',
    pointer: '/properties/note',
    before: undefined,
    after: 'ADR-7',
    fix: 'remove it',
  });
  const empty = compareContracts(read(parse(readFileSync(at('base'), 'utf8'))), read(parse(readFileSync(at('base'), 'utf8'))));

  it('lists them after the changes, at the level they were graded', () => {
    expect(toText({ ...empty, decisions: [finding('unknown')] }, 'a', 'b')).toBe(
      [
        'no changes between a and b',
        '',
        'decisions: 1 (--decisions warn)',
        '  warn          ac-decision-stale  getBalance  /properties/note  - -> "ADR-7"',
        '                fix: remove it',
      ].join('\n'),
    );
    expect(toText({ ...empty, decisions: [finding('breaking'), finding('breaking')] }, 'a', 'b')).toContain('decisions: 2 (--decisions error)\n  error         ac-decision-stale');
  });

  it('follows the changes when there are some', () => {
    const [old, nu] = ['base', 'undecided'].map((name) => read(parse(readFileSync(at(name), 'utf8'))));
    const comparison = { ...compareContracts(old as Contract, nu as Contract), decisions: [finding('unknown')] };
    const lines = toText(comparison, 'a', 'b').split('\n');
    expect(lines.slice(-4)).toEqual([
      '',
      'decisions: 1 (--decisions warn)',
      '  warn          ac-decision-stale  getBalance  /properties/note  - -> "ADR-7"',
      '                fix: remove it',
    ]);
    expect(lines[0]).toMatch(/^breaking: 1 breaking/);
  });
});

describe('--changeset moves the version for a decided breaking change (R10)', () => {
  it('is no decision-unversioned with a changeset, and is one without', () => {
    const dir = makeDir('apicontract-diff-decisions-');
    const without = diff({ cwd: dir, old: at('base'), new: at('decided'), today: '2027-01-01' });
    expect(decisionsOf(without).map((finding) => finding.id)).toEqual(['ac-decision-unversioned']);
    const withSet = diff({ cwd: dir, old: at('base'), new: at('decided'), today: '2027-01-01', changeset: 'contractdiff' });
    expect(decisionsOf(withSet)).toEqual([]);
  });
});
