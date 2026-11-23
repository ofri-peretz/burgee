/**
 * contractdiff-compat-depth R1: `diff --transitive`, the new contract against every past release.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { ExitCode } from 'burgee';
import { runBurgee } from 'burgee/testing';
import { parse as parseYaml } from 'seniority/yaml';
import { beforeAll, describe, expect, it } from 'vitest';

import { scratchDirs } from './__fixtures__/run/scratch-dir.js';
import { diff, toSarif, toText } from './command-diff.js';
import { type Contract, type Operation, type Payload } from './core/model.js';
import { compareTransitive } from './diff-transitive.js';

import { program } from './index.js';

const TEXT = Symbol.for('burgee.text');
const text = (data: Record<string | symbol, unknown>): string => (data[TEXT] as () => string)();
const makeDir = scratchDirs();

const body = (schema: Payload['schema']): Payload => ({ name: 'body:application/json', direction: 'request', schema, required: true });
const param = (required: boolean): Payload => ({ name: 'param:query:p', direction: 'request', schema: { type: 'string' }, required });
const op = (payloads: Payload[]): Operation => ({ id: 'o', source: '#/paths/~1a/post', payloads });
const release = (label: string, payloads: Payload[]): { label: string; contract: Contract } => ({ label, contract: { format: 'openapi', document: {}, operations: [op(payloads)] } });
const nameOf = (maxLength?: number) => body({ type: 'object', properties: { name: { type: 'string', ...(maxLength === undefined ? {} : { maxLength }) } } });
const rows = (findings: readonly { verdict: string; id: string; pointer: string; against?: string }[]) => findings.map((f) => [f.verdict, f.id, f.pointer, f.against]);

describe('compareTransitive', () => {
  it('finds a change that breaks an older release though not the last, and names the oldest it breaks', () => {
    const result = compareTransitive([release('v1', [nameOf()]), release('v2', [nameOf(20)])], release('v3', [nameOf(20)]).contract);
    expect(rows(result.findings)).toStrictEqual([['breaking', 'ac-maxLength-set', '/properties/name/maxLength', 'v1']]);
    expect(result).toMatchObject({ mode: 'backward', side: 'caller', verdict: 'breaking', summary: { breaking: 1, unknown: 0, dangerous: 0, 'non-breaking': 0 } });
    expect(result.transitive).toStrictEqual({ against: ['v1', 'v2'], oldestBroken: 'v1' });
  });

  it('keeps one finding per change, the worst, against the oldest release where it is worst', () => {
    const nu = release('v3', []).contract;
    const breakingFirst = compareTransitive([release('v1', [param(true)]), release('v2', [param(false)])], nu, { mode: 'full' });
    expect(rows(breakingFirst.findings)).toStrictEqual([['breaking', 'request-parameter-removed', '', 'v1']]);
    const breakingLast = compareTransitive([release('v1', [param(false)]), release('v2', [param(true)])], nu, { mode: 'full' });
    expect(rows(breakingLast.findings)).toStrictEqual([['breaking', 'request-parameter-removed', '', 'v2']]);
    expect(breakingLast.transitive).toStrictEqual({ against: ['v1', 'v2'], oldestBroken: 'v2' });
    const same = compareTransitive([release('v1', [param(true)]), release('v2', [param(true)])], nu, { mode: 'full', side: 'server' });
    expect(rows(same.findings)).toStrictEqual([['breaking', 'request-parameter-removed', '', 'v1']]);
    expect(same).toMatchObject({ mode: 'full', side: 'server' });
  });

  it('reports an operation removed once, against the oldest release that had it, in its file', () => {
    const result = compareTransitive([release('v1', []), release('v2', [])], { format: 'openapi', document: {}, operations: [] });
    expect(rows(result.findings)).toStrictEqual([['breaking', 'api-removed-without-deprecation', '', 'v1']]);
    const sarif = toSarif(result, { file: 'v2.yaml' }, { file: 'v3.yaml' }, new Map([['v1', 'v1.yaml'], ['v2', 'v2.yaml']]));
    expect(JSON.stringify(sarif)).toContain('"uri":"v1.yaml"');
    expect(JSON.stringify(toSarif(result, { file: 'v2.yaml' }, { file: 'v3.yaml' }))).toContain('"uri":"v2.yaml"');
  });

  it('keeps different changes apart', () => {
    const result = compareTransitive([release('v1', [nameOf()]), release('v2', [nameOf()])], release('v3', [nameOf(20), param(true)]).contract);
    expect(rows(result.findings)).toStrictEqual([
      ['breaking', 'ac-maxLength-set', '/properties/name/maxLength', 'v1'],
      ['breaking', 'new-required-request-parameter', '', 'v1'],
    ]);
    const two = compareTransitive([release('v1', [param(false), { ...param(false), name: 'param:query:q' }])], release('v2', []).contract);
    expect(two.findings.map((finding) => finding.payload)).toStrictEqual(['param:query:p', 'param:query:q']);
  });

  it('names no broken release when nothing breaks', () => {
    const result = compareTransitive([release('v1', [nameOf(5)])], release('v2', [nameOf(10)]).contract);
    expect(result.verdict).toBe('non-breaking');
    expect(result.transitive).toStrictEqual({ against: ['v1'] });
  });
});

const spec = (name: string): string =>
  `openapi: 3.1.0\ninfo: { title: t, version: '1' }\npaths:\n  /a:\n    post:\n      operationId: a\n      requestBody:\n        required: true\n        content:\n          application/json:\n            schema: { type: object, properties: { name: ${name} } }\n      responses:\n        '204': { description: none }\n`;

const releases = (): string => {
  const dir = makeDir('apicontract-transitive-');
  mkdirSync(join(dir, 'releases'));
  writeFileSync(join(dir, 'releases', 'v10.yaml'), spec('{ type: string, maxLength: 20 }'));
  writeFileSync(join(dir, 'releases', 'v9.yaml'), spec('{ type: string }'));
  writeFileSync(join(dir, 'releases', 'notes.md'), '# not a contract\n');
  writeFileSync(join(dir, 'releases', 'v1.yaml.orig'), 'not: a contract\n');
  mkdirSync(join(dir, 'empty'));
  writeFileSync(join(dir, 'new.yaml'), spec('{ type: string, maxLength: 20 }'));
  writeFileSync(join(dir, 'v9.yaml'), spec('{ type: string }'));
  return dir;
};

describe('apicontract diff --transitive', () => {
  beforeAll(async () => {
    await runBurgee(program, { argv: ['--version'] });
  });

  it('reads a directory of releases in version order, and fails on the oldest one broken', () => {
    const dir = releases();
    const data = diff({ cwd: dir, old: 'releases', new: 'new.yaml', transitive: true });
    expect(data).toMatchObject({ verdict: 'breaking', exitCode: ExitCode.RUNTIME, transitive: { against: [join('releases', 'v9.yaml'), join('releases', 'v10.yaml')], oldestBroken: join('releases', 'v9.yaml') } });
    expect(text(data).split('\n').slice(0, 2)).toStrictEqual([
      'breaking: 1 breaking, 0 unknown, 0 non-breaking (--mode backward --side caller)',
      `against 2 release(s), oldest first: ${join('releases', 'v9.yaml')}, ${join('releases', 'v10.yaml')}; oldest broken: ${join('releases', 'v9.yaml')}`,
    ]);
    expect(text(data)).toContain(`- -> 20  (against ${join('releases', 'v9.yaml')})`);
  });

  it('reads .json and .yml releases too, and holds decisions against the last release only', () => {
    const dir = releases();
    mkdirSync(join(dir, 'more'));
    writeFileSync(join(dir, 'more', 'v1.yml'), spec('{ type: string }'));
    writeFileSync(join(dir, 'more', 'v2.json'), JSON.stringify(parseYaml(spec('{ type: string, maxLength: 20 }'))));
    const data = diff({ cwd: dir, old: 'more', new: 'new.yaml', transitive: true, decisions: 'error' });
    expect(data).toMatchObject({ verdict: 'breaking', decisions: [], transitive: { against: [join('more', 'v1.yml'), join('more', 'v2.json')] } });
  });

  it('takes files as positionals, oldest first, the last one new; and names no broken release when none is', () => {
    const dir = releases();
    const data = diff({ cwd: dir, old: 'v9.yaml', new: 'v9.yaml', more: ['v9.yaml'], transitive: true });
    expect(data).toMatchObject({ verdict: 'non-breaking', transitive: { against: ['v9.yaml', 'v9.yaml'] } });
    expect(text(data)).toBe('no changes between v9.yaml and v9.yaml');
    const changed = diff({ cwd: dir, old: 'new.yaml', new: 'v9.yaml', transitive: true });
    expect(text(changed).split('\n')[1]).toBe('against 1 release(s), oldest first: new.yaml; oldest broken: none');
  });

  it('puts each SARIF result in the file of the release it breaks', () => {
    const dir = releases();
    const data = diff({ cwd: dir, old: 'releases', new: 'new.yaml', transitive: true, sarif: true });
    expect(JSON.stringify(data.sarif)).toContain('"uri":"new.yaml"');
    mkdirSync(join(dir, 'gone'));
    writeFileSync(join(dir, 'gone', 'v1.yaml'), spec('{ type: string }').replace('paths:', "paths:\n  /b:\n    get:\n      operationId: b\n      responses:\n        '204': { description: none }"));
    writeFileSync(join(dir, 'gone', 'v2.yaml'), spec('{ type: string }'));
    const gone = diff({ cwd: dir, old: 'gone', new: 'v9.yaml', transitive: true, sarif: true });
    expect(JSON.stringify(gone.sarif)).toContain(`"uri":"${join('gone', 'v1.yaml').replaceAll('\\', '/')}"`);
    const comparison = { ...compareTransitive([release('v1', [param(true)])], release('v2', []).contract), findings: [] };
    expect(toSarif(comparison, { file: 'a' }, { file: 'b' })).toMatchObject({ runs: [{ results: [] }] });
    expect(toText(comparison, 'a', 'b')).toBe('no changes between a and b');
  });

  it('refuses more than two contracts without the flag, and a directory with no contract in it, each with its fix', async () => {
    const dir = releases();
    expect(() => diff({ cwd: dir, old: 'v9.yaml', new: 'v9.yaml', more: ['new.yaml'] })).toThrow(
      'diff compares two contracts, and was given 3. fix: pass --transitive to compare the last one with each before it, oldest first',
    );
    expect(() => diff({ cwd: dir, old: 'empty', new: 'empty', more: ['new.yaml'], transitive: true })).toThrow(
      "no contract to compare with: empty, empty holds no .json, .yaml or .yml file. fix: pass the past releases' files, oldest first",
    );
    const r = await runBurgee(program, { argv: ['diff', join(dir, 'v9.yaml'), join(dir, 'v9.yaml'), join(dir, 'new.yaml'), '--transitive', '--json'] });
    expect(r.code).toBe(ExitCode.RUNTIME);
    expect((r.json as { data: { transitive: unknown } }).data.transitive).toStrictEqual({ against: [join(dir, 'v9.yaml'), join(dir, 'v9.yaml')], oldestBroken: join(dir, 'v9.yaml') });
  });
});
